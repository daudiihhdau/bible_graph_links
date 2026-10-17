import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validatePackage } from '../src/validate.js'
import { predicates } from '../src/predicates.js'
import { canonicalKey } from '../src/json-schema.js'
import { defaultDatabasePath, queryLadybug, readPackagesFromLadybug, buildLadybugDatabase } from './ladybug-database.js'

const usage = 'Aufruf: node tools/knowledge-author.js inspect <Suchtext> [Entitätstyp] | check <Entwurf.json> | apply <Entwurf.json>'
const databasePath = resolve(process.env.QUESTION_OS_LADYBUG_DB ?? defaultDatabasePath)
const quote = value => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

function readMetadata() {
  const rows = queryLadybug(databasePath, "MATCH (n:KnowledgeRecord) WHERE n.kind IN ['manifest', 'curriculum'] RETURN n.kind, n.json")
  const found = Object.fromEntries(rows.slice(1).map(([kind, json]) => [kind, JSON.parse(json)]))
  if (!found.manifest || !found.curriculum) throw new Error('LadybugDB enthält kein vollständiges Paketmanifest und Curriculum')
  if (found.manifest.id !== 'org.ichlerne.bible/package/bible-history') throw new Error('LadybugDB enthält nicht das erwartete Bibel-Wissenspaket')
  return found
}

function readRecords(ids) {
  if (!ids.length) return []
  const list = [...new Set(ids)].map(quote).join(', ')
  const rows = queryLadybug(databasePath, `MATCH (n:KnowledgeRecord) WHERE n.id IN [${list}] RETURN n.id, n.kind, n.json`)
  return rows.slice(1).map(([id, kind, json]) => ({ id, kind, record: JSON.parse(json) }))
}

function idsOf(draft) {
  return [
    ...(draft.entities ?? []).map(record => [record.id, 'entity']),
    ...(draft.assertions ?? []).map(record => [record.id, 'assertion']),
    ...(draft.relationTypes ?? []).map(record => [record.id, 'relationType'])
  ]
}

function checkDraftEnvelope(draft) {
  const allowed = new Set(['id', 'entities', 'entityUpdates', 'entityMerges', 'assertions', 'relationTypes', 'schoolSubjects', 'categories', 'categoryAssignments', 'requiredPackageIds'])
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('Entwurf muss ein Objekt sein')
  for (const key of Object.keys(draft)) if (!allowed.has(key)) throw new Error(`Unbekanntes Entwurfsfeld: ${key}`)
  if (typeof draft.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.id)) throw new Error('Entwurf braucht eine kurze ID aus Kleinbuchstaben, Ziffern und Bindestrichen')
  for (const field of [...allowed].filter(key => key !== 'id')) if (draft[field] !== undefined && !Array.isArray(draft[field])) throw new Error(`${field} muss eine Liste sein`)
  if (![...allowed].some(field => field !== 'id' && draft[field]?.length)) throw new Error('Entwurf enthält keine Änderungen')
}

function validateNewDraft(original, draft) {
  checkDraftEnvelope(draft)
  const records = idsOf(draft)
  if (!records.length && !(draft.entityUpdates?.length) && !(draft.entityMerges?.length)) throw new Error('Der Entwurf enthält keine Entitäten, Entitätsaktualisierungen, Zusammenführungen, Aussagen oder Beziehungstypen')
  const collisions = readRecords(records.map(([id]) => id))
  if (collisions.length) throw new Error(`IDs sind bereits in LadybugDB vergeben: ${collisions.map(({ id, kind }) => `${id} (${kind})`).join(', ')}`)

  const updateIds = (draft.entityUpdates ?? []).map(update => update.entityId)
  if (new Set(updateIds).size !== updateIds.length) throw new Error('Eine Entität wird im Entwurf mehrfach geändert')
  for (const [index, update] of (draft.entityUpdates ?? []).entries()) {
    if (!update || typeof update.entityId !== 'string' || !Array.isArray(update.alternativeNames) || !update.alternativeNames.length || Object.keys(update).some(key => !['entityId', 'alternativeNames'].includes(key))) throw new Error(`entityUpdates[${index}] darf nur entityId und nichtleere alternativeNames enthalten`)
    if (update.alternativeNames.some(name => typeof name !== 'string' || !name.trim()) || new Set(update.alternativeNames).size !== update.alternativeNames.length) throw new Error(`entityUpdates[${index}].alternativeNames muss eindeutige, nichtleere Namen enthalten`)
  }
  const updateRecords = readRecords(updateIds)
  const updateById = new Map(updateRecords.filter(record => record.kind === 'entity').map(record => [record.id, record.record]))
  for (const id of updateIds) if (!updateById.has(id)) throw new Error(`Zu ändernde Entität ist nicht in LadybugDB vorhanden: ${id}`)
  const proposedNames = [...new Set((draft.entityUpdates ?? []).flatMap(update => update.alternativeNames.map(name => name.toLocaleLowerCase()))) ]
  const nameFilter = proposedNames.map(name => `lower(n.json) CONTAINS ${quote(name)}`).join(' OR ')
  const possibleNameRows = nameFilter ? queryLadybug(databasePath, `MATCH (n:KnowledgeRecord) WHERE n.kind = 'entity' AND (${nameFilter}) RETURN n.id, n.json`) : []
  const possibleNameRecords = possibleNameRows.slice(1).map(([id, json]) => ({ id, record: JSON.parse(json) }))
  for (const update of draft.entityUpdates ?? []) {
    const current = updateById.get(update.entityId)
    for (const name of update.alternativeNames) {
      const normalized = name.toLocaleLowerCase()
      if ([current.name, ...(current.alternativeNames ?? [])].some(existing => existing.toLocaleLowerCase() === normalized)) throw new Error(`Alternativname ist bereits hinterlegt: ${name}`)
      const collisions = possibleNameRecords.filter(({ id, record }) => id !== update.entityId && [record.name, ...(record.alternativeNames ?? [])].some(existing => existing.toLocaleLowerCase() === normalized))
      if (collisions.length) throw new Error(`Alternativname ist bereits einer anderen Entität zugeordnet: ${name} (${collisions.map(({ id }) => id).join(', ')})`)
    }
  }
  const merges = draft.entityMerges ?? []
  const sourceIds = merges.map(merge => merge.entityId)
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error('Eine Entität wird im Entwurf mehrfach zusammengeführt')
  const mergeIds = merges.flatMap(merge => [merge.entityId, merge.intoEntityId])
  for (const [index, merge] of merges.entries()) {
    if (!merge || typeof merge.entityId !== 'string' || typeof merge.intoEntityId !== 'string' || merge.entityId === merge.intoEntityId || Object.keys(merge).some(key => !['entityId', 'intoEntityId'].includes(key))) throw new Error(`entityMerges[${index}] braucht verschiedene entityId- und intoEntityId-Werte`)
  }
  const mergeRecords = readRecords(mergeIds)
  const mergeById = new Map(mergeRecords.filter(record => record.kind === 'entity').map(record => [record.id, record.record]))
  for (const id of mergeIds) if (!mergeById.has(id)) throw new Error(`Zusammenzuführende Entität ist nicht in LadybugDB vorhanden: ${id}`)
  const nameKey = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
  for (const merge of merges) {
    const source = mergeById.get(merge.entityId)
    const target = mergeById.get(merge.intoEntityId)
    if (source.entityType !== target.entityType) throw new Error(`Entitätstypen stimmen bei Zusammenführung nicht überein: ${merge.entityId}`)
    const sourceNames = [source.name, ...(source.alternativeNames ?? [])].map(nameKey)
    const targetNames = [target.name, ...(target.alternativeNames ?? [])].map(nameKey)
    if (!sourceNames.some(name => targetNames.includes(name))) throw new Error(`Zusammenführung braucht mindestens einen übereinstimmenden Namen: ${merge.entityId}`)
    if (sourceIds.includes(merge.intoEntityId)) throw new Error(`Zusammenführungsketten sind nicht erlaubt: ${merge.intoEntityId}`)
  }
  if (merges.some(merge => updateIds.includes(merge.entityId))) throw new Error('Eine Entität kann nicht zugleich aktualisiert und zusammengeführt werden')
  if (!records.length) return

  const referencedIds = (draft.assertions ?? []).flatMap(assertion => [
    assertion.subjectEntityId,
    ...(assertion.target?.targetType === 'entity' ? [assertion.target.entityId] : [])
  ])
  const existingRecords = readRecords(referencedIds)
  const existingEntities = existingRecords.filter(record => record.kind === 'entity').map(record => record.record)
  const relationIds = [
    ...(draft.assertions ?? []).map(assertion => assertion.relationTypeId),
    ...(draft.relationTypes ?? []).flatMap(relation => relation.exclusiveWithRelationTypeIds ?? [])
  ]
  const existingRelations = readRecords(relationIds).filter(record => record.kind === 'relationType' && !predicates[record.id]).map(record => record.record)

  const currentAssertions = []
  const subjects = [...new Set((draft.assertions ?? []).map(assertion => assertion.subjectEntityId))]
  if (subjects.length) {
    const list = subjects.map(quote).join(', ')
    const rows = queryLadybug(databasePath, `MATCH (a:KnowledgeRecord)-[:KnowledgeLink {kind: 'SUBJECT'}]->(s:KnowledgeRecord) WHERE a.kind = 'assertion' AND s.id IN [${list}] RETURN a.json`)
    currentAssertions.push(...rows.slice(1).map(([json]) => JSON.parse(json)))
  }

  const allNewRelationTypes = draft.relationTypes ?? []
  const relationMap = new Map([...Object.entries(predicates).map(([id, definition]) => [id, { id, ...definition }]), ...existingRelations.map(definition => [definition.id, definition]), ...allNewRelationTypes.map(definition => [definition.id, definition])])
  const existingById = new Map(original.curriculum.categories.map(category => [category.id, category]))
  const newById = new Map((draft.categories ?? []).map(category => [category.id, category]))
  for (const id of newById.keys()) if (existingById.has(id)) throw new Error(`Kategorie-ID ist bereits vergeben: ${id}`)
  const existingSubjectIds = new Set(original.curriculum.schoolSubjects.map(subject => subject.id))
  for (const subject of draft.schoolSubjects ?? []) if (existingSubjectIds.has(subject.id)) throw new Error(`Fach-ID ist bereits vergeben: ${subject.id}`)
  const assignments = new Map()
  for (const assignment of draft.categoryAssignments ?? []) {
    if (assignments.has(assignment.categoryId)) throw new Error(`Kategorie mehrfach zugewiesen: ${assignment.categoryId}`)
    assignments.set(assignment.categoryId, assignment)
  }

  const selectedIds = new Set(newById.keys())
  for (const id of assignments.keys()) selectedIds.add(id)
  for (const id of [...selectedIds]) {
    let category = newById.get(id) ?? existingById.get(id)
    if (!category) throw new Error(`Unbekannte Kategorie: ${id}`)
    while (category.parentCategoryId) {
      const parentId = category.parentCategoryId
      if (selectedIds.has(parentId)) break
      selectedIds.add(parentId)
      category = newById.get(parentId) ?? existingById.get(parentId)
      if (!category) throw new Error(`Unbekannte Elternkategorie: ${parentId}`)
    }
  }
  const categories = [...selectedIds].map(id => {
    const base = newById.get(id) ?? existingById.get(id)
    const assignment = assignments.get(id)
    return {
      ...base,
      entityIds: [...new Set([...(newById.has(id) ? base.entityIds ?? [] : []), ...(assignment?.entityIds ?? [])])],
      assertionIds: [...new Set([...(newById.has(id) ? base.assertionIds ?? [] : []), ...(assignment?.assertionIds ?? [])])]
    }
  })

  const packageCandidate = {
    manifest: original.manifest,
    entities: draft.entities ?? [],
    assertions: draft.assertions ?? [],
    relationTypes: [...existingRelations, ...allNewRelationTypes],
    curriculum: {
      $schema: original.curriculum.$schema,
      documentType: 'curriculum',
      schoolSubjects: [...original.curriculum.schoolSubjects, ...(draft.schoolSubjects ?? [])],
      categories
    }
  }
  const issues = validatePackage(packageCandidate, { externalEntities: existingEntities, allowEmptyEntities: true })
  if (issues.length) throw new Error(`Ungültiger Entwurf:\n${issues.map(({ path, message }) => `- ${path}: ${message}`).join('\n')}`)

  for (const [index, assertion] of (draft.assertions ?? []).entries()) {
    const path = `assertions[${index}]`
    const definition = relationMap.get(assertion.relationTypeId)
    const key = canonicalKey([assertion.subjectEntityId, assertion.relationTypeId, assertion.target, assertion.time ?? null])
    if (currentAssertions.some(existing => canonicalKey([existing.subjectEntityId, existing.relationTypeId, existing.target, existing.time ?? null]) === key)) {
      throw new Error(`${path}: doppelte Aussage ist bereits in LadybugDB enthalten`)
    }
    if (definition?.singleTargetPerSubject && currentAssertions.some(existing => existing.subjectEntityId === assertion.subjectEntityId && existing.relationTypeId === assertion.relationTypeId && canonicalKey(existing.target) !== canonicalKey(assertion.target))) {
      throw new Error(`${path}: widerspricht einem bestehenden Ziel eines funktionalen Beziehungstyps`)
    }
    if (definition?.exclusiveWithRelationTypeIds && currentAssertions.some(existing => existing.subjectEntityId === assertion.subjectEntityId && canonicalKey(existing.target) === canonicalKey(assertion.target) && definition.exclusiveWithRelationTypeIds.includes(existing.relationTypeId))) {
      throw new Error(`${path}: widerspricht einer bestehenden exklusiven Beziehung`)
    }
  }
}

function inspect(term, entityType) {
  const needle = quote(term.trim().toLocaleLowerCase())
  const typeClause = entityType ? ` AND n.recordType = ${quote(entityType)}` : ''
  const rows = queryLadybug(databasePath, `MATCH (n:KnowledgeRecord) WHERE n.kind = 'entity' AND (lower(n.id) CONTAINS ${needle} OR lower(n.name) CONTAINS ${needle} OR lower(n.json) CONTAINS ${needle})${typeClause} RETURN n.json LIMIT 20`)
  const entities = rows.slice(1).map(([json]) => JSON.parse(json)).map(({ id, entityType, name, alternativeNames, languageCode }) => ({ id, entityType, name, ...(alternativeNames?.length ? { alternativeNames } : {}), ...(languageCode ? { languageCode } : {}) }))
  const { curriculum } = readMetadata()
  const categories = curriculum.categories.filter(category => category.id.toLocaleLowerCase().includes(term.toLocaleLowerCase()) || category.name.toLocaleLowerCase().includes(term.toLocaleLowerCase())).slice(0, 20)
    .map(({ id, name, schoolSubjectId }) => ({ id, name, schoolSubjectId }))
  const relationRows = queryLadybug(databasePath, "MATCH (n:KnowledgeRecord) WHERE n.kind = 'relationType' RETURN n.json")
  const definitions = new Map(Object.entries(predicates).map(([id, definition]) => [id, { id, ...definition }]))
  for (const [json] of relationRows.slice(1)) { const relation = JSON.parse(json); definitions.set(relation.id, relation) }
  const entityTypes = new Set(entities.map(entity => entity.entityType))
  if (entityType) entityTypes.add(entityType)
  const relationTypes = [...definitions.values()].filter(definition => !entityTypes.size || definition.subjectEntityTypes.includes('*') || definition.subjectEntityTypes.some(type => entityTypes.has(type)))
  console.log(JSON.stringify({ entities, categories, relationTypes }, null, 2))
}

async function main() {
  const [command, first, second] = process.argv.slice(2)
  if (command === 'inspect') {
    if (first === undefined) throw new Error(usage)
    inspect(first, second)
    return
  }
  if (!['check', 'apply'].includes(command) || !first || second) throw new Error(usage)
  const draft = JSON.parse(await readFile(resolve(first), 'utf8'))
  const original = readMetadata()
  validateNewDraft(original, draft)
  if (command === 'check') {
    console.log(`Gültig: ${draft.id} – ${draft.entities?.length ?? 0} Entitäten, ${draft.entityUpdates?.length ?? 0} Entitätsaktualisierungen, ${draft.entityMerges?.length ?? 0} Zusammenführungen, ${draft.assertions?.length ?? 0} Aussagen, ${draft.categories?.length ?? 0} neue Kategorien; gezielt gegen LadybugDB geprüft, Datenbank unverändert.`)
    return
  }
  const packages = readPackagesFromLadybug(databasePath, { validate: false })
  const target = packages.find(pkg => pkg.manifest.id === original.manifest.id)
  if (!target) throw new Error('Zielpaket ist im Graph nicht vorhanden')
  const { prepareKnowledgeDraft } = await import('../src/authoring.js')
  const prepared = prepareKnowledgeDraft(packages, target.manifest.id, draft)
  const result = await buildLadybugDatabase(prepared.packages, databasePath, { validated: true })
  console.log(`Übernommen: ${draft.id}`)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
