import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadPackages, predicates } from './index.js'

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`
const csv = rows => `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`

export async function exportPackages(packages, outputPath) {
  loadPackages(packages)
  const records = []
  for (const data of packages) {
    const packageId = data.manifest.id
    records.push(
      { id: `${packageId}/metadata/manifest`, packageId, kind: 'manifest', payload: data.manifest },
      { id: `${packageId}/metadata/curriculum`, packageId, kind: 'curriculum', payload: data.curriculum },
      ...data.entities.map(payload => ({ id: payload.id, packageId, kind: 'entity', payload })),
      ...data.assertions.map(payload => ({ id: payload.id, packageId, kind: 'assertion', payload })),
      ...data.relationTypes.map(payload => ({ id: payload.id, packageId, kind: 'relationType', payload })),
    )
  }
  const ids = new Set()
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`Doppelte Graph-ID: ${record.id}`)
    ids.add(record.id)
  }

  const relationTypeIds = new Set(records.filter(record => record.kind === 'relationType').map(record => record.id))
  for (const id of [...new Set(packages.flatMap(data => data.assertions.map(assertion => assertion.relationTypeId)))]) {
    if (!relationTypeIds.has(id) && predicates[id]) {
      records.push({ id, packageId: 'question-os/builtin', kind: 'relationType', payload: { id, ...predicates[id], builtin: true } })
      ids.add(id)
    }
  }

  const nodeRows = [['id', 'packageId', 'kind', 'recordType', 'name', 'json']]
  const linkRows = [['FROM', 'TO', 'kind', 'assertionId']]
  for (const { id, packageId, kind, payload } of records) {
    nodeRows.push([id, packageId, kind, payload.entityType ?? payload.documentType ?? (kind === 'relationType' ? 'relationType' : kind), payload.name ?? payload.title ?? '', JSON.stringify(payload)])
  }
  const recordIds = new Set(records.map(record => record.id))
  for (const data of packages) for (const assertion of data.assertions) {
    if (!recordIds.has(assertion.subjectEntityId)) throw new Error(`Subjekt fehlt im Gesamtexport: ${assertion.subjectEntityId}`)
    if (!recordIds.has(assertion.relationTypeId)) throw new Error(`Beziehungstyp fehlt im Gesamtexport: ${assertion.relationTypeId}`)
    linkRows.push([assertion.id, assertion.subjectEntityId, 'SUBJECT', assertion.id])
    linkRows.push([assertion.id, assertion.relationTypeId, 'RELATION_TYPE', assertion.id])
    if (assertion.target?.targetType === 'entity') {
      if (!recordIds.has(assertion.target.entityId)) throw new Error(`Aussageziel fehlt im Gesamtexport: ${assertion.target.entityId}`)
      linkRows.push([assertion.id, assertion.target.entityId, 'TARGET', assertion.id])
    }
  }

  await mkdir(outputPath, { recursive: true })
  const nodePath = resolve(outputPath, 'records.csv')
  const linkPath = resolve(outputPath, 'links.csv')
  const files = new Map([
    ['records.csv', csv(nodeRows)],
    ['links.csv', csv(linkRows)],
    ['import.cypher', [
      'CREATE NODE TABLE KnowledgeRecord(id STRING PRIMARY KEY, packageId STRING, kind STRING, recordType STRING, name STRING, json STRING);',
      'CREATE REL TABLE KnowledgeLink(FROM KnowledgeRecord TO KnowledgeRecord, kind STRING, assertionId STRING);',
      `COPY KnowledgeRecord FROM "${nodePath.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}" (HEADER=true, auto_detect=false);`,
      `COPY KnowledgeLink FROM "${linkPath.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}" (HEADER=true, auto_detect=false);`,
      'MATCH (n:KnowledgeRecord) RETURN n.kind AS kind, COUNT(*) AS records ORDER BY kind;',
      'MATCH ()-[r:KnowledgeLink]->() RETURN r.kind AS kind, COUNT(*) AS links ORDER BY kind;',
    ].join('\n') + '\n'],
  ])
  const hashes = {}
  for (const [name, contents] of files) {
    await writeFile(join(outputPath, name), contents)
    hashes[name] = createHash('sha256').update(contents).digest('hex')
  }
  const manifest = {
    format: 'question-os-ladybug-export-v1',
    database: { engine: 'LadybugDB', version: '0.21.2', model: 'embedded single-file graph database' },
    sourcePackages: packages.map(({ manifest }) => ({ id: manifest.id, packageVersion: manifest.packageVersion, schemaVersion: manifest.schemaVersion, license: manifest.license })),
    counts: {
      packages: packages.length,
      entities: packages.reduce((sum, item) => sum + item.entities.length, 0),
      assertions: packages.reduce((sum, item) => sum + item.assertions.length, 0),
      packageRelationTypes: packages.reduce((sum, item) => sum + item.relationTypes.length, 0),
      builtinRelationTypes: records.filter(record => record.packageId === 'question-os/builtin').length,
      metadataRecords: packages.length * 2,
      nodes: records.length,
      links: linkRows.length - 1,
    },
    files: hashes,
  }
  await writeFile(join(outputPath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(outputPath, 'SHA256SUMS'), `${Object.entries(hashes).map(([name, hash]) => `${hash}  ${name}`).join('\n')}\n`)
  return manifest
}
