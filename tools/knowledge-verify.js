import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultDatabasePath, queryLadybug } from './ladybug-database.js'

const [draftPath] = process.argv.slice(2)
const databasePath = resolve(process.env.QUESTION_OS_LADYBUG_DB ?? defaultDatabasePath)

function fail(message) {
  console.error(`Fehler: ${message}`)
  process.exitCode = 1
}

function idsOf(draft) {
  return [
    ...(draft.entities ?? []).map(record => [record.id, 'entity', record]),
    ...(draft.assertions ?? []).map(record => [record.id, 'assertion', record]),
    ...(draft.relationTypes ?? []).map(record => [record.id, 'relationType', record])
  ]
}

function queryIds(databasePath, ids, projection) {
  const list = ids.map(id => `'${id}'`).join(', ')
  return queryLadybug(databasePath, `MATCH (n:KnowledgeRecord) WHERE n.id IN [${list}] RETURN ${projection}`)
}

export async function verifyDraft(databasePath, draft) {
  const records = idsOf(draft)
  const entityUpdates = draft.entityUpdates ?? []
  const entityMerges = draft.entityMerges ?? []
  if (records.length === 0 && entityUpdates.length === 0 && entityMerges.length === 0) throw new Error('Der Entwurf enthält keine Entitäten, Entitätsaktualisierungen, Zusammenführungen, Aussagen oder Beziehungstypen')
  for (const [id, kind] of records) {
    const validId = kind === 'relationType'
      ? /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)
      : /^[a-z0-9.-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)+$/.test(id)
    if (!validId) throw new Error(`Ungültige ID im Entwurf: ${id}`)
  }

  const allIds = [...records.map(([id]) => id), ...entityUpdates.map(update => update.entityId), ...entityMerges.flatMap(merge => [merge.entityId, merge.intoEntityId])]
  for (const id of entityUpdates.map(update => update.entityId)) if (!/^[a-z0-9.-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)+$/.test(id)) throw new Error(`Ungültige aktualisierte Entitäts-ID: ${id}`)
  const rows = queryIds(databasePath, allIds, 'n.id, n.kind, n.json')
  const actual = new Map(rows.slice(1).map(([id, kind, json]) => [id, { kind, record: JSON.parse(json) }]))
  for (const [id, kind, expected] of records) {
    const stored = actual.get(id)
    if (!stored) throw new Error(`Neuer Datensatz fehlt in LadybugDB: ${id}`)
    if (stored.kind !== kind || !isDeepStrictEqual(stored.record, expected)) throw new Error(`Gespeicherter Datensatz weicht vom Entwurf ab: ${id}`)
  }
  for (const update of entityUpdates) {
    const stored = actual.get(update.entityId)
    if (!stored || stored.kind !== 'entity') throw new Error(`Aktualisierte Entität fehlt in LadybugDB: ${update.entityId}`)
    if (update.alternativeNames.some(name => !(stored.record.alternativeNames ?? []).includes(name))) throw new Error(`Alternativnamen fehlen in LadybugDB: ${update.entityId}`)
  }
  for (const merge of entityMerges) {
    if (actual.has(merge.entityId)) throw new Error(`Zusammengeführte Entität ist noch in LadybugDB vorhanden: ${merge.entityId}`)
    if (!actual.has(merge.intoEntityId)) throw new Error(`Ziel der Entitätszusammenführung fehlt in LadybugDB: ${merge.intoEntityId}`)
  }
  if (entityMerges.length) {
    const mergedIds = [...new Set(entityMerges.map(merge => merge.entityId))]
    const list = mergedIds.map(id => `'${id}'`).join(', ')
    const linked = queryLadybug(databasePath, `MATCH (a:KnowledgeRecord)-[r:KnowledgeLink]->(n:KnowledgeRecord) WHERE n.id IN [${list}] RETURN n.id`)
    if (linked.length > 1) throw new Error(`Graphkanten verweisen weiterhin auf entfernte Entitäten: ${[...new Set(linked.slice(1).map(([id]) => id))].join(', ')}`)
  }

  const assertions = draft.assertions ?? []
  if (assertions.length) {
    const assertionIds = assertions.map(assertion => assertion.id)
    const list = assertionIds.map(id => `'${id}'`).join(', ')
    const edgeRows = queryLadybug(databasePath, `MATCH (a:KnowledgeRecord)-[r:KnowledgeLink]->(n:KnowledgeRecord) WHERE a.id IN [${list}] RETURN a.id, r.kind, r.assertionId, n.id`)
    const edges = new Map()
    for (const [assertionId, edgeKind, linkedAssertionId, targetId] of edgeRows.slice(1)) {
      if (assertionId !== linkedAssertionId) throw new Error(`Graphkante hat eine falsche Aussage-ID: ${assertionId}`)
      if (!edges.has(assertionId)) edges.set(assertionId, new Map())
      edges.get(assertionId).set(edgeKind, targetId)
    }
    for (const assertion of assertions) {
      const expected = new Map([
        ['SUBJECT', assertion.subjectEntityId],
        ['RELATION_TYPE', assertion.relationTypeId]
      ])
      if (assertion.target?.targetType === 'entity') expected.set('TARGET', assertion.target.entityId)
      const actualEdges = edges.get(assertion.id) ?? new Map()
      if (expected.size !== actualEdges.size || [...expected].some(([kind, id]) => actualEdges.get(kind) !== id)) {
        throw new Error(`Graphkanten fehlen oder verweisen falsch für: ${assertion.id}`)
      }
    }
  }
  return { records: records.length, assertions: assertions.length, entityUpdates: entityUpdates.length, entityMerges: entityMerges.length }
}

async function main() {
  if (!draftPath) {
    const rows = queryLadybug(databasePath, "MATCH (n:KnowledgeRecord) WHERE n.kind = 'manifest' RETURN n.packageId, n.kind")
    if (rows.length !== 2 || rows[1][1] !== 'manifest') throw new Error('LadybugDB enthält nicht genau ein lesbares Paketmanifest')
    console.log(`OK: LadybugDB erreichbar – ${rows[1][0]}`)
    console.log('Für die gezielte Prüfung eines neuen Entwurfs: npm test -- <entwurf.json>')
    return
  }

  const draft = JSON.parse(await readFile(resolve(draftPath), 'utf8'))
  const result = await verifyDraft(databasePath, draft)
  console.log(`OK: ${result.records} neue LadybugDB-Datensätze stimmen mit dem Entwurf überein; ${result.entityUpdates} Entitätsaktualisierungen, ${result.entityMerges} Zusammenführungen und ${result.assertions} Aussagenkanten geprüft.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => fail(error.message))
}
