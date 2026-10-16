import { predicates } from './predicates.js'
import { loadPackages } from './repository.js'

const copy = value => structuredClone(value)
const draftFields = new Set(['id', 'entities', 'assertions', 'relationTypes', 'schoolSubjects', 'categories', 'categoryAssignments', 'requiredPackageIds'])
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
    .slice(0, limit).map(({ id, entityType, name, languageCode }) => ({ id, entityType, name, ...(languageCode ? { languageCode } : {}) }))
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
  const updated = packages.map(copy)
  const target = updated[targetIndex]
  for (const field of ['entities', 'assertions', 'relationTypes']) target[field].push(...copy(draft[field] ?? []))
  target.curriculum.schoolSubjects.push(...copy(draft.schoolSubjects ?? []))
  target.curriculum.categories.push(...copy(draft.categories ?? []))
  const categories = new Map(target.curriculum.categories.map(category => [category.id, category]))
  const assigned = new Set()
  for (const assignment of draft.categoryAssignments ?? []) {
    if (assigned.has(assignment.categoryId)) throw new Error(`Kategorie mehrfach zugewiesen: ${assignment.categoryId}`)
    assigned.add(assignment.categoryId)
    const category = categories.get(assignment.categoryId)
    if (!category) throw new Error(`Unbekannte Kategorie: ${assignment.categoryId}`)
    for (const field of ['entityIds', 'assertionIds']) {
      if (assignment[field]?.length) category[field] = [...new Set([...(category[field] ?? []), ...assignment[field]])]
    }
  }
  if (draft.requiredPackageIds?.length) target.manifest.requiredPackageIds = [...new Set([...(target.manifest.requiredPackageIds ?? []), ...draft.requiredPackageIds])]
  const version = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-.+)?$/.exec(target.manifest.packageVersion)
  if (!version) throw new Error('Zielpaket braucht eine gültige packageVersion')
  target.manifest.packageVersion = `${version[1]}.${version[2]}.${Number(version[3]) + 1}`
  loadPackages(updated)
  return { packages: updated, target, draftId: draft.id }
}
