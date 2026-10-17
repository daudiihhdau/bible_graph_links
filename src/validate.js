import { createRequire } from 'node:module'
import { predicates } from './predicates.js'
import { validateJsonSchema, canonicalKey } from './json-schema.js'
import { checkTime } from './time.js'
import { checkSourceReference } from './sources.js'

const require = createRequire(import.meta.url)
const contentSchema = require('../schemas/content.schema.json')
const manifestSchema = require('../schemas/package.schema.json')
const idPattern = /^[a-z0-9.-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)+$/
const typePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const issue = (path, message) => ({ path, message })
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const allows = (allowed, type) => allowed?.includes('*') || allowed?.includes(type)

export function validatePackage(data, { externalEntities = [], allowEmptyEntities = false } = {}) {
  const issues = []
  if (!isObject(data)) return [issue('$', 'muss ein Paketobjekt sein')]
  const allowed = ['manifest', 'entities', 'assertions', 'relationTypes', 'curriculum']
  for (const key of Object.keys(data)) if (!allowed.includes(key)) issues.push(issue(key, 'kein Wissensdatenfeld; Aufgaben, Decks und Spielinformationen sind hier unzulässig'))
  const { manifest, curriculum } = data
  issues.push(...validateJsonSchema(manifest, manifestSchema, 'manifest'))
  if (curriculum === undefined) issues.push(issue('curriculum', 'Pflichtdokument fehlt'))
  const arrays = {}
  for (const key of ['entities', 'assertions', 'relationTypes']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) issues.push(issue(key, 'muss eine Liste sein'))
    arrays[key] = Array.isArray(data[key]) ? data[key] : []
  }
  const { entities, assertions, relationTypes } = arrays
  if (!entities.length && !allowEmptyEntities) issues.push(issue('entities', 'mindestens eine Entität erforderlich'))
  for (const [key, items, definition] of [['entities', entities, 'entity'], ['assertions', assertions, 'assertion'], ['relationTypes', relationTypes, 'relationType']]) {
    const schema = { $defs: contentSchema.$defs, $ref: `#/$defs/${definition}` }
    items.forEach((item, index) => issues.push(...validateJsonSchema(item, schema, `${key}[${index}]`)))
  }
  if (curriculum !== undefined) issues.push(...validateJsonSchema(curriculum, { $defs: contentSchema.$defs, $ref: '#/$defs/curriculumDocument' }, 'curriculum'))

  const entityMap = new Map(externalEntities.filter(isObject).map(entity => [entity.id, entity]))
  for (const [index, entity] of entities.entries()) {
    const path = `entities[${index}]`
    if (!isObject(entity)) continue
    if (entityMap.has(entity.id)) issues.push(issue(`${path}.id`, 'doppelte Entitäts-ID'))
    entityMap.set(entity.id, entity)
    if (!idPattern.test(entity.id ?? '')) issues.push(issue(`${path}.id`, 'muss global namensgebunden sein'))
    if (entity.entityType === 'word' || entity.entityType === 'phrase') {
      if (typeof entity.languageCode !== 'string') issues.push(issue(`${path}.languageCode`, 'Wort oder Wortgruppe braucht eine Sprachkennung'))
    }
    if (entity.languageCode !== undefined) {
      try { new Intl.Locale(entity.languageCode) } catch { issues.push(issue(`${path}.languageCode`, 'ungültige BCP-47-Sprachkennung')) }
    }
    if (entity.time !== undefined) checkTime(entity.time, `${path}.time`, issues, { point: entity.entityType === 'timepoint' })
    if (entity.entityType === 'timepoint' && entity.time === undefined) issues.push(issue(`${path}.time`, 'Zeitpunkt braucht eine Zeitangabe'))
  }

  const definitions = { ...predicates }
  for (const [index, relation] of relationTypes.entries()) {
    const path = `relationTypes[${index}]`
    if (!isObject(relation)) continue
    if (definitions[relation.id] || !typePattern.test(relation.id ?? '')) issues.push(issue(`${path}.id`, 'muss eine neue, eindeutige Beziehungs-ID sein'))
    if (!Array.isArray(relation.subjectEntityTypes) || !relation.subjectEntityTypes.length) issues.push(issue(`${path}.subjectEntityTypes`, 'braucht mindestens einen Subjekttyp'))
    if (relation.targetType === 'entity' && (!Array.isArray(relation.targetEntityTypes) || !relation.targetEntityTypes.length)) issues.push(issue(`${path}.targetEntityTypes`, 'Entitätsbeziehung braucht Zieltypen'))
    if (relation.targetType !== 'entity' && relation.targetEntityTypes !== undefined) issues.push(issue(`${path}.targetEntityTypes`, 'nur für Entitätsbeziehungen zulässig'))
    if (relation.id) definitions[relation.id] = relation
  }
  for (const [index, relation] of relationTypes.entries()) {
    if (!isObject(relation) || !Array.isArray(relation.exclusiveWithRelationTypeIds)) continue
    for (const other of relation.exclusiveWithRelationTypeIds) {
      if (other === relation.id || !definitions[other]) issues.push(issue(`relationTypes[${index}].exclusiveWithRelationTypeIds`, `unbekannter oder eigener Beziehungstyp ${other}`))
      else if (!definitions[other].exclusiveWithRelationTypeIds?.includes(relation.id)) issues.push(issue(`relationTypes[${index}].exclusiveWithRelationTypeIds`, `Gegenseitigkeit fehlt bei ${other}`))
    }
  }

  const assertionMap = new Map()
  const tripleMap = new Map(), functionalMap = new Map(), pairMap = new Map()
  for (const [index, assertion] of assertions.entries()) {
    const path = `assertions[${index}]`
    if (!isObject(assertion)) continue
    if (assertionMap.has(assertion.id)) issues.push(issue(`${path}.id`, 'doppelte Aussagen-ID'))
    assertionMap.set(assertion.id, assertion)
    if (!idPattern.test(assertion.id ?? '')) issues.push(issue(`${path}.id`, 'muss global namensgebunden sein'))
    const subject = entityMap.get(assertion.subjectEntityId)
    if (!subject) issues.push(issue(`${path}.subjectEntityId`, 'verweist auf keine Entität'))
    const definition = definitions[assertion.relationTypeId]
    if (!definition) issues.push(issue(`${path}.relationTypeId`, 'unbekanntes Prädikat'))
    else if (subject && !allows(definition.subjectEntityTypes, subject.entityType)) issues.push(issue(`${path}.relationTypeId`, 'passt nicht zum Subjekttyp'))
    if (!isObject(assertion.target) || (definition && assertion.target.targetType !== definition.targetType)) issues.push(issue(`${path}.target`, 'hat nicht den erwarteten Werttyp'))
    else if (assertion.target.targetType === 'entity') {
      const target = entityMap.get(assertion.target.entityId)
      if (!target) issues.push(issue(`${path}.target.entityId`, 'verweist auf keine Entität'))
      else if (definition?.targetEntityTypes && !allows(definition.targetEntityTypes, target.entityType)) issues.push(issue(`${path}.target.entityId`, 'hat einen unzulässigen Zieltyp'))
    }
    if (assertion.time !== undefined) checkTime(assertion.time, `${path}.time`, issues)
    if (Array.isArray(assertion.sources)) assertion.sources.forEach((source, sourceIndex) => checkSourceReference(source, `${path}.sources[${sourceIndex}]`, issues))
    if (assertion.target?.targetType === 'source') {
      checkSourceReference(assertion.target.sourceReference, `${path}.target.sourceReference`, issues)
      if (Array.isArray(assertion.sources) && assertion.sources.some(source => canonicalKey(source) === canonicalKey(assertion.target.sourceReference))) issues.push(issue(`${path}.sources`, 'Quelle steht bereits im Aussagenziel'))
    }
    if (typeof assertion.subjectEntityId === 'string' && typeof assertion.relationTypeId === 'string' && isObject(assertion.target)) {
      const triple = canonicalKey([assertion.subjectEntityId, assertion.relationTypeId, assertion.target, assertion.time ?? null])
      if (tripleMap.has(triple)) issues.push(issue(path, `doppelte Aussage wie ${tripleMap.get(triple)}`))
      else tripleMap.set(triple, path)
      const functional = canonicalKey([assertion.subjectEntityId, assertion.relationTypeId])
      if (definition?.singleTargetPerSubject && functionalMap.has(functional) && functionalMap.get(functional).object !== canonicalKey(assertion.target)) issues.push(issue(path, `funktionaler Beziehungstyp widerspricht ${functionalMap.get(functional).path}`))
      else if (definition?.singleTargetPerSubject) functionalMap.set(functional, { path, object: canonicalKey(assertion.target) })
      const pair = canonicalKey([assertion.subjectEntityId, assertion.target])
      const previous = pairMap.get(pair) ?? []
      for (const other of previous) if (definition?.exclusiveWithRelationTypeIds?.includes(other.predicate)) issues.push(issue(path, `widerspricht ${other.path} (${other.predicate})`))
      previous.push({ predicate: assertion.relationTypeId, path })
      pairMap.set(pair, previous)
    }
  }

  const datedEvents = new Set(assertions.filter(fact => fact?.relationTypeId === 'happened-on').map(fact => fact.subjectEntityId))
  for (const [index, entity] of entities.entries()) {
    if (entity?.entityType === 'event' && entity.time !== undefined && datedEvents.has(entity.id)) {
      issues.push(issue(`entities[${index}].time`, 'Ereignis darf nicht zugleich direkt und über happened-on datiert sein'))
    }
  }

  if (curriculum !== undefined) {
    const subjects = new Map(), categories = new Map()
    const subjectItems = Array.isArray(curriculum?.schoolSubjects) ? curriculum.schoolSubjects : []
    const categoryItems = Array.isArray(curriculum?.categories) ? curriculum.categories : []
    for (const [index, subject] of subjectItems.entries()) {
      if (!isObject(subject)) continue
      if (subjects.has(subject.id)) issues.push(issue(`curriculum.schoolSubjects[${index}].id`, 'doppelte Fach-ID'))
      subjects.set(subject.id, subject)
    }
    for (const [index, category] of categoryItems.entries()) {
      const path = `curriculum.categories[${index}]`
      if (!isObject(category)) continue
      if (categories.has(category.id)) issues.push(issue(`${path}.id`, 'doppelte Kategorie-ID'))
      categories.set(category.id, category)
      if (!subjects.has(category.schoolSubjectId)) issues.push(issue(`${path}.schoolSubjectId`, 'unbekanntes Fach'))
      for (const id of Array.isArray(category.entityIds) ? category.entityIds : []) if (!entityMap.has(id)) issues.push(issue(`${path}.entityIds`, `unbekannte Entität ${id}`))
      for (const id of Array.isArray(category.assertionIds) ? category.assertionIds : []) if (!assertionMap.has(id)) issues.push(issue(`${path}.assertionIds`, `unbekannte Aussage ${id}`))
    }
    for (const [id, category] of categories) {
      if (category.parentCategoryId && (!categories.has(category.parentCategoryId) || categories.get(category.parentCategoryId).schoolSubjectId !== category.schoolSubjectId)) issues.push(issue(`curriculum.categories.${id}.parentCategoryId`, 'Elternkategorie fehlt oder gehört zu einem anderen Fach'))
      const seen = new Set([id]); let parent = category.parentCategoryId
      while (parent && categories.has(parent)) {
        if (seen.has(parent)) { issues.push(issue(`curriculum.categories.${id}.parentCategoryId`, 'Kategoriezyklus')); break }
        seen.add(parent); parent = categories.get(parent).parentCategoryId
      }
    }
    const assignedAssertions = new Set(categoryItems.flatMap(category => Array.isArray(category?.assertionIds) ? category.assertionIds : []))
    const assignedEntities = new Set(categoryItems.flatMap(category => Array.isArray(category?.entityIds) ? category.entityIds : []))
    for (const assertion of assertions) if (assignedAssertions.has(assertion?.id)) {
      assignedEntities.add(assertion.subjectEntityId)
      if (assertion.target?.targetType === 'entity') assignedEntities.add(assertion.target.entityId)
    }
    for (const [index, assertion] of assertions.entries()) if (isObject(assertion) && !assignedAssertions.has(assertion.id)) issues.push(issue(`assertions[${index}].id`, 'Aussage ist keiner Kategorie zugeordnet'))
    for (const [index, entity] of entities.entries()) if (isObject(entity) && !assignedEntities.has(entity.id)) issues.push(issue(`entities[${index}].id`, 'Entität ist durch keine Kategorie erreichbar'))
  }
  return issues
}

export function assertValidPackage(data, options) {
  const issues = validatePackage(data, options)
  if (issues.length) throw new Error(`Ungültiges Question-OS-Paket:\n${issues.map(({ path, message }) => `- ${path}: ${message}`).join('\n')}`)
  return data
}
