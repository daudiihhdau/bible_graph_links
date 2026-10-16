import { assertValidPackage } from './validate.js'
import { compareDates, compareTime } from './time.js'

const copy = value => value === undefined ? undefined : structuredClone(value)
const matches = (actual, expected) => expected === undefined || (Array.isArray(expected) ? expected.includes(actual) : actual === expected)

export function loadPackage(data) {
  assertValidPackage(data)
  const snapshot = copy(data)
  const entities = new Map((snapshot.entities ?? []).map(entity => [entity.id, entity]))
  const assertions = new Map((snapshot.assertions ?? []).map(assertion => [assertion.id, assertion]))
  const allAssertions = [...assertions.values()]
  const bySubject = new Map(), byTarget = new Map(), byRelationType = new Map(), byEntity = new Map(), bySourceType = new Map()
  const sourceEntries = []
  const add = (index, key, value) => {
    const entries = index.get(key) ?? []
    entries.push(value)
    index.set(key, entries)
  }
  for (const assertion of allAssertions) {
    add(bySubject, assertion.subjectEntityId, assertion)
    add(byRelationType, assertion.relationTypeId, assertion)
    add(byEntity, assertion.subjectEntityId, assertion)
    if (assertion.target.targetType === 'entity') {
      add(byTarget, assertion.target.entityId, assertion)
      if (assertion.target.entityId !== assertion.subjectEntityId) add(byEntity, assertion.target.entityId, assertion)
    }
    for (const source of [...(assertion.sources ?? []), ...(assertion.target.targetType === 'source' ? [assertion.target.sourceReference] : [])]) {
      const entry = { assertion, source }
      sourceEntries.push(entry)
      add(bySourceType, source.sourceType, entry)
    }
  }
  const schoolSubjects = snapshot.curriculum?.schoolSubjects ?? []
  const categories = new Map((snapshot.curriculum?.categories ?? []).map(category => [category.id, category]))
  const children = (subjectId, parentId) => [...categories.values()]
    .filter(category => category.schoolSubjectId === subjectId && (category.parentCategoryId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const node = category => ({ ...copy(category), children: children(category.schoolSubjectId, category.id).map(node) })
  const branch = category => [category, ...children(category.schoolSubjectId, category.id).flatMap(branch)]

  function queryRelations(filter = {}) {
    const candidates = [
      filter.entityId !== undefined ? byEntity.get(filter.entityId) ?? [] : null,
      typeof filter.subjectEntityId === 'string' ? bySubject.get(filter.subjectEntityId) ?? [] : null,
      typeof filter.targetEntityId === 'string' ? byTarget.get(filter.targetEntityId) ?? [] : null,
      typeof filter.relationTypeId === 'string' ? byRelationType.get(filter.relationTypeId) ?? [] : null
    ].filter(entries => entries !== null)
    const selected = candidates.length ? candidates.reduce((shortest, entries) => entries.length < shortest.length ? entries : shortest) : allAssertions
    return copy(selected.filter(relation => matches(relation.subjectEntityId, filter.subjectEntityId) && matches(relation.relationTypeId, filter.relationTypeId) && matches(relation.target?.entityId, filter.targetEntityId) && (!filter.entityId || relation.subjectEntityId === filter.entityId || relation.target?.entityId === filter.entityId)))
  }
  function querySources({ sourceType, entityId } = {}) {
    const entries = sourceType ? bySourceType.get(sourceType) ?? [] : sourceEntries
    return copy(entries.filter(({ assertion }) => !entityId || assertion.subjectEntityId === entityId || assertion.target?.entityId === entityId)
      .map(({ assertion, source }) => ({ assertionId: assertion.id, source })))
  }
  function getCategoryKnowledge(id, { includeDescendants = false } = {}) {
    const category = categories.get(id)
    if (!category) return null
    const selected = includeDescendants ? branch(category) : [category]
    const entityIds = new Set(selected.flatMap(item => item.entityIds ?? []))
    const assertionIds = new Set(selected.flatMap(item => item.assertionIds ?? []))
    const facts = [...assertionIds].map(assertionId => assertions.get(assertionId))
    const relatedIds = new Set(facts.flatMap(fact => [fact.subjectEntityId, fact.target?.entityId]).filter(relatedId => relatedId && !entityIds.has(relatedId)))
    return { category: copy(category), entities: copy([...entityIds].map(entityId => entities.get(entityId))), assertions: copy(facts), relatedEntities: copy([...relatedIds].map(entityId => entities.get(entityId)).filter(Boolean)) }
  }
  const timeOf = entity => entity.time ?? (bySubject.get(entity.id) ?? [])
    .filter(fact => fact.relationTypeId === 'happened-on' && fact.target.targetType === 'entity')
    .map(fact => entities.get(fact.target.entityId)?.time).find(Boolean)
  function queryChronology(filter = {}) {
    const knowledge = filter.categoryId ? getCategoryKnowledge(filter.categoryId, { includeDescendants: filter.includeDescendants }) : null
    if (filter.categoryId && !knowledge) return []
    const allowed = knowledge ? new Set([...knowledge.entities, ...knowledge.relatedEntities].map(entity => entity.id)) : null
    return [...entities.values()].filter(entity => timeOf(entity) && (!allowed || allowed.has(entity.id)) && matches(entity.entityType, filter.entityType))
      .map(entity => {
        const relations = queryRelations({ entityId: entity.id })
        const relatedIds = new Set(relations.flatMap(relation => [relation.subjectEntityId, relation.target?.entityId]).filter(id => id && id !== entity.id))
        return { entity: copy(entity), time: copy(timeOf(entity)), relations, relatedEntities: copy([...relatedIds].map(id => entities.get(id)).filter(Boolean)) }
      })
      .filter(entry => (!filter.fromDate || compareTime(entry.time, { start: filter.fromDate }) !== 'before') && (!filter.toDate || compareTime(entry.time, { start: filter.toDate }) !== 'after'))
      .sort((a, b) => compareDates(a.time.start, b.time.start) || a.entity.name.localeCompare(b.entity.name))
  }
  function compareEntitiesInTime(firstId, secondId) {
    const first = entities.get(firstId), second = entities.get(secondId)
    if (!first || !second || !timeOf(first) || !timeOf(second)) return null
    const firstTime = timeOf(first), secondTime = timeOf(second)
    return copy({ first, second, relation: compareTime(firstTime, secondTime), earlierStartingEntityId: compareDates(firstTime.start, secondTime.start) < 0 ? first.id : compareDates(firstTime.start, secondTime.start) > 0 ? second.id : null, isApproximate: Boolean(firstTime.isApproximate || secondTime.isApproximate) })
  }
  function queryBiography(personId) {
    const person = entities.get(personId)
    if (person?.entityType !== 'person') return null
    const eventIds = new Set((bySubject.get(personId) ?? []).filter(fact => fact.target.targetType === 'entity' && entities.get(fact.target.entityId)?.entityType === 'event').map(fact => fact.target.entityId))
    const events = queryChronology({ entityType: 'event' }).filter(entry => eventIds.has(entry.entity.id))
    const datedFacts = queryRelations({ subjectEntityId: personId }).filter(fact => fact.time).sort((a, b) => compareDates(a.time.start, b.time.start))
    return { person: copy(person), time: copy(timeOf(person) ?? null), events, datedFacts }
  }
  function findConnectionPath(firstEntityId, secondEntityId, { maxDepth = 4 } = {}) {
    if (!entities.has(firstEntityId) || !entities.has(secondEntityId)) return null
    if (!Number.isInteger(maxDepth) || maxDepth < 0) throw new Error('maxDepth muss eine nichtnegative ganze Zahl sein')
    const queue = [{ entityId: firstEntityId, entityIds: [firstEntityId], relations: [] }]
    const visited = new Set([firstEntityId])
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]
      if (current.entityId === secondEntityId) return copy({ entities: current.entityIds.map(id => entities.get(id)), relations: current.relations })
      if (current.relations.length >= maxDepth) continue
      for (const relation of byEntity.get(current.entityId) ?? []) {
        if (relation.target.targetType !== 'entity') continue
        const nextId = relation.subjectEntityId === current.entityId ? relation.target.entityId : relation.subjectEntityId
        if (visited.has(nextId)) continue
        visited.add(nextId)
        queue.push({ entityId: nextId, entityIds: [...current.entityIds, nextId], relations: [...current.relations, relation] })
      }
    }
    return null
  }
  return {
    manifest: copy(snapshot.manifest),
    getEntity(id) { return copy(entities.get(id) ?? null) },
    getAssertion(id) { return copy(assertions.get(id) ?? null) },
    queryEntities(filter = {}) { return copy([...entities.values()].filter(entity => matches(entity.entityType, filter.entityType))) },
    queryRelations,
    querySources,
    getRelatedEntities(id) {
      return queryRelations({ entityId: id }).map(relation => ({ relation, entity: copy(entities.get(relation.subjectEntityId === id ? relation.target?.entityId : relation.subjectEntityId) ?? null) })).filter(result => result.entity)
    },
    getSchoolSubjects() { return copy(schoolSubjects) },
    getCategory(id) { return copy(categories.get(id) ?? null) },
    getCategoryTree(subjectId) {
      if (!schoolSubjects.some(subject => subject.id === subjectId)) return null
      return children(subjectId, null).map(node)
    },
    getCategoryKnowledge,
    queryChronology,
    compareEntitiesInTime,
    queryBiography,
    findConnectionPath
  }
}

export function loadPackages(packages) {
  if (!Array.isArray(packages) || !packages.length) throw new Error('Mindestens ein Wissenspaket erforderlich')
  const byId = new Map()
  for (const data of packages) {
    const id = data?.manifest?.id
    if (typeof id !== 'string') throw new Error('Paket ohne gültige Manifest-ID')
    if (byId.has(id)) throw new Error(`Doppelte Paket-ID: ${id}`)
    byId.set(id, data)
  }
  const state = new Map()
  function visit(id) {
    if (state.get(id) === 'active') throw new Error(`Zyklische Paketabhängigkeit bei ${id}`)
    if (state.get(id) === 'done') return
    state.set(id, 'active')
    const dependencies = byId.get(id).manifest.requiredPackageIds ?? []
    if (!Array.isArray(dependencies)) throw new Error(`Ungültige Abhängigkeiten in ${id}`)
    for (const dependency of dependencies) {
      if (!byId.has(dependency)) throw new Error(`Fehlende Paketabhängigkeit: ${id} → ${dependency}`)
      visit(dependency)
    }
    state.set(id, 'done')
  }
  for (const id of byId.keys()) visit(id)
  for (const data of packages) {
    const externalEntities = (data.manifest.requiredPackageIds ?? []).flatMap(id => byId.get(id).entities ?? [])
    assertValidPackage(data, { externalEntities })
  }
  const collect = key => packages.flatMap(data => data[key] ?? [])
  return loadPackage({
    manifest: { $schema: 'https://question-os.dev/schemas/7.0/package.schema.json', schemaVersion: '7.0', id: 'org.question-os/package/combined', packageVersion: '0.7.0', title: 'Kombiniertes Wissensnetz' },
    entities: collect('entities'), assertions: collect('assertions'), relationTypes: collect('relationTypes'),
    curriculum: { $schema: 'https://question-os.dev/schemas/7.0/content.schema.json', documentType: 'curriculum', schoolSubjects: packages.flatMap(data => data.curriculum?.schoolSubjects ?? []), categories: packages.flatMap(data => data.curriculum?.categories ?? []) }
  })
}
