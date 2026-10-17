import { predicates } from './predicates.js'
import { canonicalKey } from './json-schema.js'
import { loadPackages } from './repository.js'

const copy = value => structuredClone(value)
const draftFields = new Set(['id', 'entities', 'entityUpdates', 'entityMerges', 'assertions', 'relationTypes', 'schoolSubjects', 'categories', 'categoryAssignments', 'requiredPackageIds'])
const listFields = [...draftFields].filter(field => field !== 'id')
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function checkDraft(draft) {
  if (!isObject(draft)) throw new Error('Entwurf muss ein Objekt sein')
  for (const key of Object.keys(draft)) if (!draftFields.has(key)) throw new Error(`Unbekanntes Entwurfsfeld: ${key}`)
  if (typeof draft.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.id)) throw new Error('Entwurf braucht eine kurze ID aus Kleinbuchstaben, Ziffern und Bindestrichen')
  for (const field of listFields) if (draft[field] !== undefined && !Array.isArray(draft[field])) throw new Error(`${field} muss eine Liste sein`)
  if (!listFields.some(field => draft[field]?.length)) throw new Error('Entwurf enthält keine Änderungen')
  for (const [index, assignment] of (draft.categoryAssignments ?? []).entries()) {
    if (!isObject(assignment) || typeof assignment.categoryId !== 'string') throw new Error(`categoryAssignments[${index}] braucht categoryId`)
    for (const key of Object.keys(assignment)) if (!['categoryId', 'entityIds', 'assertionIds'].includes(key)) throw new Error(`Unbekanntes Feld in categoryAssignments[${index}]: ${key}`)
    for (const key of ['entityIds', 'assertionIds']) if (assignment[key] !== undefined && !Array.isArray(assignment[key])) throw new Error(`categoryAssignments[${index}].${key} muss eine Liste sein`)
  }
}

export function inspectKnowledge(packages, { term = '', entityType, limit = 20 } = {}) {
  const db = loadPackages(packages)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit muss zwischen 1 und 100 liegen')
  const needle = term.trim().toLocaleLowerCase()
  const contains = value => value?.toLocaleLowerCase().includes(needle)
  const entities = db.queryEntities({ entityType }).filter(entity => contains(entity.id) || contains(entity.name) || entity.alternativeNames?.some(contains))
    .slice(0, limit).map(({ id, entityType, name, alternativeNames, languageCode }) => ({ id, entityType, name, ...(alternativeNames?.length ? { alternativeNames } : {}), ...(languageCode ? { languageCode } : {}) }))
  const categories = packages.flatMap(pkg => pkg.curriculum.categories)
    .filter(category => contains(category.id) || contains(category.name)).slice(0, limit)
    .map(({ id, name, schoolSubjectId }) => ({ id, name, schoolSubjectId }))
  const definitions = new Map(Object.entries(predicates).map(([id, definition]) => [id, { id, ...definition }]))
  for (const pkg of packages) for (const definition of pkg.relationTypes ?? []) definitions.set(definition.id, definition)
  const relationTypes = [...definitions.values()].filter(definition => !entityType || definition.subjectEntityTypes.includes('*') || definition.subjectEntityTypes.includes(entityType))
  return { entities, categories, relationTypes: copy(relationTypes) }
}

export function prepareKnowledgeDraft(packages, targetPackageId, draft) {
  checkDraft(draft)
  const targetIndex = packages.findIndex(pkg => pkg.manifest.id === targetPackageId)
  if (targetIndex < 0) throw new Error(`Unbekanntes Zielpaket: ${targetPackageId}`)
  const original = packages[targetIndex]
  const newCategories = copy(draft.categories ?? [])
  const allCategories = [...original.curriculum.categories, ...newCategories]
  const categoryIds = new Set(allCategories.map(category => category.id))
  const assignments = new Map()
  for (const assignment of draft.categoryAssignments ?? []) {
    if (assignments.has(assignment.categoryId)) throw new Error(`Kategorie mehrfach zugewiesen: ${assignment.categoryId}`)
    if (!categoryIds.has(assignment.categoryId)) throw new Error(`Unbekannte Kategorie: ${assignment.categoryId}`)
    assignments.set(assignment.categoryId, assignment)
  }
  const categories = allCategories.map(category => {
    const assignment = assignments.get(category.id)
    if (!assignment) return category
    const updated = { ...category }
    for (const field of ['entityIds', 'assertionIds']) {
      if (assignment[field]?.length) updated[field] = [...new Set([...(category[field] ?? []), ...assignment[field]])]
    }
    return updated
  })
  const version = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-.+)?$/.exec(original.manifest.packageVersion)
  if (!version) throw new Error('Zielpaket braucht eine gültige packageVersion')
  const updatedEntities = copy(original.entities)
  for (const update of draft.entityUpdates ?? []) {
    const entity = updatedEntities.find(candidate => candidate.id === update.entityId)
    if (!entity) throw new Error(`Unbekannte zu ändernde Entität: ${update.entityId}`)
    entity.alternativeNames = [...new Set([...(entity.alternativeNames ?? []), ...update.alternativeNames])]
  }
  const mergeMap = new Map((draft.entityMerges ?? []).map(merge => [merge.entityId, merge.intoEntityId]))
  for (const merge of draft.entityMerges ?? []) {
    const source = updatedEntities.find(candidate => candidate.id === merge.entityId)
    const targetEntity = updatedEntities.find(candidate => candidate.id === merge.intoEntityId)
    if (!source || !targetEntity || source.id === targetEntity.id || source.entityType !== targetEntity.entityType) throw new Error(`Ungültige Entitätszusammenführung: ${merge.entityId} → ${merge.intoEntityId}`)
    targetEntity.alternativeNames = [...new Set([...(targetEntity.alternativeNames ?? []), ...(source.name === targetEntity.name ? [] : [source.name]), ...(source.alternativeNames ?? [])])]
    if (source.description && source.description !== targetEntity.description) targetEntity.description = [targetEntity.description, source.description].filter(Boolean).join('\n')
    if (source.time && targetEntity.time && canonicalKey(source.time) !== canonicalKey(targetEntity.time)) throw new Error(`Widersprüchliche Zeitangaben bei Zusammenführung: ${merge.entityId}`)
    if (!targetEntity.time && source.time) targetEntity.time = source.time
  }
  for (const [from, to] of mergeMap) {
    if (mergeMap.has(to)) throw new Error(`Ketten von Entitätszusammenführungen müssen im Entwurf direkt auf das Ziel zeigen: ${from}`)
  }
  const resolveEntityId = id => mergeMap.get(id) ?? id
  const rewrittenAssertions = [...original.assertions, ...copy(draft.assertions ?? [])].map(assertion => ({
    ...assertion,
    subjectEntityId: resolveEntityId(assertion.subjectEntityId),
    ...(assertion.target?.targetType === 'entity' ? { target: { ...assertion.target, entityId: resolveEntityId(assertion.target.entityId) } } : {})
  }))
  const assertionMap = new Map()
  const assertionIdMap = new Map()
  const assertions = []
  for (const assertion of rewrittenAssertions) {
    const key = canonicalKey([assertion.subjectEntityId, assertion.relationTypeId, assertion.target, assertion.time ?? null])
    const existing = assertionMap.get(key)
    if (!existing) {
      assertionMap.set(key, assertion)
      assertions.push(assertion)
      assertionIdMap.set(assertion.id, assertion.id)
      continue
    }
    assertionIdMap.set(assertion.id, existing.id)
    const sources = [...new Map([...(existing.sources ?? []), ...(assertion.sources ?? [])].map(source => [canonicalKey(source), source])).values()]
    if (sources.length) existing.sources = sources
    else delete existing.sources
    if (assertion.context && assertion.context !== existing.context) existing.context = [existing.context, assertion.context].filter(Boolean).join('\n')
  }
  const mergedEntities = updatedEntities.filter(entity => !mergeMap.has(entity.id))
  const mergedCategories = categories.map(category => ({
    ...category,
    entityIds: category.entityIds ? [...new Set(category.entityIds.map(resolveEntityId))] : undefined,
    assertionIds: category.assertionIds ? [...new Set(category.assertionIds.map(id => assertionIdMap.get(id) ?? id))] : undefined
  }))
  const target = {
    ...original,
    manifest: {
      ...original.manifest,
      packageVersion: `${version[1]}.${version[2]}.${Number(version[3]) + 1}`,
      ...(draft.requiredPackageIds?.length ? {
        requiredPackageIds: [...new Set([...(original.manifest.requiredPackageIds ?? []), ...draft.requiredPackageIds])]
      } : {})
    },
    entities: [...mergedEntities, ...copy(draft.entities ?? [])],
    assertions,
    relationTypes: [...original.relationTypes, ...copy(draft.relationTypes ?? [])],
    curriculum: {
      ...original.curriculum,
      schoolSubjects: [...original.curriculum.schoolSubjects, ...copy(draft.schoolSubjects ?? [])],
      categories: mergedCategories
    }
  }
  const updated = packages.slice()
  updated[targetIndex] = target
  loadPackages(updated)
  return { packages: updated, target, draftId: draft.id }
}
