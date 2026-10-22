import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const lbug = require('@ladybugdb/core')
const DATABASE_PATH = resolve(process.cwd(), 'data/ladybug/question-os.lbdb')
const MAX_PAGE_SIZE = 40
const DEFAULT_PAGE_SIZE = 20

let databasePromise
let queryQueue = Promise.resolve()

async function getConnection () {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = new lbug.Database(DATABASE_PATH, 0, true, true)
      await database.init()
      const connection = new lbug.Connection(database, 2)
      await connection.init()
      return { database, connection }
    })().catch(error => {
      databasePromise = undefined
      throw error
    })
  }
  return databasePromise
}

async function rows (statement, params = {}) {
  const previous = queryQueue
  let release
  queryQueue = new Promise(resolve => { release = resolve })
  await previous
  try {
    const { connection } = await getConnection()
    const prepared = await connection.prepare(statement)
    if (!prepared.isSuccess() || !prepared.isReadOnly()) {
      throw new Error('Graph query is invalid or not read-only')
    }
    const result = await connection.execute(prepared, params)
    return result.getAll()
  } finally {
    release()
  }
}

const field = (row, name, index) => row?.[name] ?? row?.[index]
const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value
const recordFromRow = row => ({
  kind: field(row, 'kind', 0),
  json: parseJson(field(row, 'json', 1))
})

function pageOptions (url) {
  const requested = Number(url.searchParams.get('limit') || DEFAULT_PAGE_SIZE)
  if (!Number.isInteger(requested) || requested < 1) throw httpError(400, 'limit muss eine positive ganze Zahl sein.')
  const cursor = url.searchParams.get('cursor') || '0'
  if (!/^\d{1,9}$/.test(cursor)) throw httpError(400, 'cursor ist ungültig.')
  const offset = Number(cursor)
  if (offset > 100_000) throw httpError(400, 'cursor überschreitet die zulässige Seitengrenze.')
  return { limit: Math.min(requested, MAX_PAGE_SIZE), offset }
}

function requiredParam (url, key, maxLength = 500) {
  const value = url.searchParams.get(key)?.trim()
  if (!value) throw httpError(400, `Parameter ${key} fehlt.`)
  if (value.length > maxLength) throw httpError(400, `Parameter ${key} ist zu lang.`)
  return value
}

function httpError (status, message) {
  return Object.assign(new Error(message), { status })
}

async function getCurriculum () {
  const result = await rows("MATCH (n:KnowledgeRecord) WHERE n.kind = 'curriculum' RETURN n.json AS json LIMIT 1")
  return result.length ? parseJson(field(result[0], 'json', 0)) : null
}

async function getRecord (id) {
  const result = await rows(
    'MATCH (n:KnowledgeRecord) WHERE n.id = $id RETURN n.kind AS kind, n.json AS json LIMIT 1',
    { id }
  )
  return result.length ? recordFromRow(result[0]) : null
}

function slugify (value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function categoryRecords (curriculum) {
  return Array.isArray(curriculum?.categories) ? curriculum.categories : []
}

function categoryById (curriculum, id) {
  return categoryRecords(curriculum).find(category => category.id === id)
}

async function getManifest () {
  const [manifestRows, countRows] = await Promise.all([
    rows("MATCH (n:KnowledgeRecord) WHERE n.kind = 'manifest' RETURN n.json AS json ORDER BY n.packageId"),
    rows('MATCH (n:KnowledgeRecord) RETURN n.kind AS kind, COUNT(*) AS count ORDER BY kind')
  ])
  const manifest = manifestRows.map(row => parseJson(field(row, 'json', 0)))
  const counts = Object.fromEntries(countRows.map(row => [field(row, 'kind', 0), Number(field(row, 'count', 1))]))
  return {
    apiVersion: '1',
    database: 'LadybugDB',
    databaseVersion: lbug.Database.getVersion(),
    packages: manifest,
    counts,
    license: manifest.map(item => ({ packageId: item.id, title: item.title, license: item.license }))
  }
}

async function search (url) {
  const q = requiredParam(url, 'q', 120)
  const { limit, offset } = pageOptions(url)
  const type = url.searchParams.get('type')?.trim() || ''
  if (type.length > 80) throw httpError(400, 'type ist zu lang.')
  const pattern = `
    MATCH (n:KnowledgeRecord)
    WHERE n.kind = 'entity'
      AND (lower(n.name) CONTAINS lower($query) OR lower(n.json) CONTAINS lower($query))
      AND ($type = '' OR n.recordType = $type)
    RETURN n.kind AS kind, n.json AS json
    ORDER BY n.name, n.id
    SKIP $offset LIMIT $limit
  `
  const result = await rows(pattern, { query: q, type, offset, limit: limit + 1 })
  const items = result.slice(0, limit).map(recordFromRow).map(item => ({ ...item, slug: slugify(item.json.name) }))
  return { items, nextCursor: result.length > limit ? String(offset + limit) : null, limit }
}

async function getCategories (url) {
  const curriculum = await getCurriculum()
  const subjectId = url.searchParams.get('subjectId')?.trim()
  const categories = categoryRecords(curriculum)
    .filter(category => !subjectId || category.schoolSubjectId === subjectId)
    .map(category => ({
      id: category.id,
      name: category.name,
      schoolSubjectId: category.schoolSubjectId,
      parentCategoryId: category.parentCategoryId ?? null,
      entityCount: category.entityIds?.length ?? 0,
      assertionCount: category.assertionIds?.length ?? 0
    }))
  return { schoolSubjects: curriculum?.schoolSubjects ?? [], categories }
}

async function getCategory (url) {
  const id = requiredParam(url, 'id')
  const includeDescendants = url.searchParams.get('includeDescendants') === 'true'
  const { limit, offset } = pageOptions(url)
  const curriculum = await getCurriculum()
  const category = categoryById(curriculum, id)
  if (!category) throw httpError(404, 'Kategorie nicht gefunden.')

  const descendants = includeDescendants
    ? categoryRecords(curriculum).filter(candidate => {
      let parent = candidate.parentCategoryId
      while (parent) {
        if (parent === id) return true
        parent = categoryById(curriculum, parent)?.parentCategoryId
      }
      return false
    })
    : []
  const categories = [category, ...descendants]
  const directEntityIds = new Set(categories.flatMap(item => item.entityIds ?? []))
  const assertionIds = new Set(categories.flatMap(item => item.assertionIds ?? []))
  const assignedIds = [...new Set([...directEntityIds, ...assertionIds])].sort()
  const selected = assignedIds.slice(offset, offset + limit + 1)
  const pageIds = selected.slice(0, limit)
  const entityIds = new Set(pageIds.filter(recordId => directEntityIds.has(recordId)))
  const selectedAssertionIds = pageIds.filter(recordId => assertionIds.has(recordId))
  if (selectedAssertionIds.length) {
    const assertionRows = await rows('MATCH (n:KnowledgeRecord) WHERE n.id IN $ids RETURN n.json AS json', { ids: selectedAssertionIds })
    for (const row of assertionRows) {
      const assertion = parseJson(field(row, 'json', 0))
      if (assertion?.subjectEntityId) entityIds.add(assertion.subjectEntityId)
      if (assertion?.target?.targetType === 'entity') entityIds.add(assertion.target.entityId)
    }
  }
  const entityPage = [...entityIds].sort()
  const result = entityPage.length
    ? await rows('MATCH (n:KnowledgeRecord) WHERE n.id IN $ids AND n.kind = \'entity\' RETURN n.kind AS kind, n.json AS json', { ids: entityPage })
    : []
  const byId = new Map(result.map(row => {
    const record = recordFromRow(row)
    return [record.json.id, record]
  }))
  const records = entityPage.map(recordId => byId.get(recordId)).filter(Boolean)
  return {
    category: { id: category.id, name: category.name, schoolSubjectId: category.schoolSubjectId },
    items: records,
    nextCursor: selected.length > limit ? String(offset + limit) : null,
    limit
  }
}

async function nodeRelations (url) {
  const id = requiredParam(url, 'id')
  const direction = url.searchParams.get('direction') || 'both'
  if (!['both', 'in', 'out'].includes(direction)) throw httpError(400, 'direction muss both, in oder out sein.')
  const { limit, offset } = pageOptions(url)
  const node = await getRecord(id)
  if (!node) throw httpError(404, 'Knoten nicht gefunden.')
  if (node.kind !== 'entity') throw httpError(400, 'Beziehungen können nur für Entitäten geladen werden.')

  const result = await rows(`
    MATCH (a:KnowledgeRecord)-[l:KnowledgeLink]->(n:KnowledgeRecord)
    WHERE n.id = $id AND l.kind IN ['SUBJECT', 'TARGET']
      AND ($direction = 'both' OR ($direction = 'out' AND l.kind = 'SUBJECT') OR ($direction = 'in' AND l.kind = 'TARGET'))
    WITH a, l
    MATCH (a)-[:KnowledgeLink {kind: 'SUBJECT'}]->(s:KnowledgeRecord)
    MATCH (a)-[:KnowledgeLink {kind: 'RELATION_TYPE'}]->(p:KnowledgeRecord)
    OPTIONAL MATCH (a)-[:KnowledgeLink {kind: 'TARGET'}]->(t:KnowledgeRecord)
    RETURN a.json AS assertion, s.json AS subject, p.json AS relationType, t.json AS target, l.kind AS side
    ORDER BY a.id, l.kind
    SKIP $offset LIMIT $limit
  `, { id, direction, offset, limit: limit + 1 })

  const items = result.slice(0, limit).map(row => ({
    assertion: parseJson(field(row, 'assertion', 0)),
    subject: parseJson(field(row, 'subject', 1)),
    relationType: parseJson(field(row, 'relationType', 2)),
    target: parseJson(field(row, 'target', 3)),
    direction: field(row, 'side', 4) === 'SUBJECT' ? 'out' : 'in'
  }))
  return { node: node.json, items, nextCursor: result.length > limit ? String(offset + limit) : null, limit }
}

function chronologyYear (date) {
  if (!date) return null
  if (date.era === 'BCE') return -Number(date.year)
  if (date.era === 'ZERO') return -1
  return Number(date.year)
}

async function timeline (url) {
  const categoryId = requiredParam(url, 'categoryId')
  const fromYear = Number(requiredParam(url, 'fromYear'))
  const toYear = Number(requiredParam(url, 'toYear'))
  if (!Number.isSafeInteger(fromYear) || !Number.isSafeInteger(toYear) || fromYear >= toYear) {
    throw httpError(400, 'fromYear und toYear müssen ganze Jahre sein; toYear muss nach fromYear liegen.')
  }
  const includeDescendants = url.searchParams.get('includeDescendants') === 'true'
  const { limit, offset } = pageOptions(url)
  const curriculum = await getCurriculum()
  const categories = categoryRecords(curriculum)
  const root = categoryById(curriculum, categoryId)
  if (!root) throw httpError(404, 'Kategorie nicht gefunden.')
  const selectedCategories = includeDescendants
    ? categories.filter(candidate => {
      if (candidate.id === categoryId) return true
      let parent = candidate.parentCategoryId
      while (parent) {
        if (parent === categoryId) return true
        parent = categoryById(curriculum, parent)?.parentCategoryId
      }
      return false
    })
    : [root]

  const entityIdsByCategory = selectedCategories.map(category => {
    const ids = new Set(category.entityIds ?? [])
    return { category, entityIds: ids, assertionIds: category.assertionIds ?? [] }
  })
  const assertionIds = [...new Set(entityIdsByCategory.flatMap(entry => entry.assertionIds))]
  if (assertionIds.length) {
    const assertionRows = await rows(
      "MATCH (n:KnowledgeRecord) WHERE n.id IN $ids AND n.kind = 'assertion' RETURN n.json AS json",
      { ids: assertionIds }
    )
    const assertions = assertionRows.map(row => parseJson(field(row, 'json', 0)))
    for (const entry of entityIdsByCategory) {
      const categoryAssertions = assertions.filter(assertion => entry.assertionIds.includes(assertion.id))
      for (const assertion of categoryAssertions) {
        if (assertion.subjectEntityId) entry.entityIds.add(assertion.subjectEntityId)
        if (assertion.target?.targetType === 'entity') entry.entityIds.add(assertion.target.entityId)
      }
    }
  }

  const allEntityIds = [...new Set(entityIdsByCategory.flatMap(entry => [...entry.entityIds]))]
  const entityRows = allEntityIds.length
    ? await rows("MATCH (n:KnowledgeRecord) WHERE n.id IN $ids AND n.kind = 'entity' RETURN n.json AS json", { ids: allEntityIds })
    : []
  const entities = new Map(entityRows.map(row => {
    const entity = parseJson(field(row, 'json', 0))
    return [entity.id, entity]
  }))

  const eventIds = [...entities.values()].filter(entity => entity.entityType === 'event' && !entity.time).map(entity => entity.id)
  const timepointByEvent = new Map()
  if (eventIds.length) {
    const relationRows = await rows(`
      MATCH (a:KnowledgeRecord)-[:KnowledgeLink {kind: 'SUBJECT'}]->(s:KnowledgeRecord)
      WHERE a.kind = 'assertion' AND s.id IN $ids
      RETURN a.json AS json
    `, { ids: eventIds })
    for (const row of relationRows) {
      const assertion = parseJson(field(row, 'json', 0))
      if (assertion.relationTypeId === 'happened-on' && assertion.target?.targetType === 'entity') {
        timepointByEvent.set(assertion.subjectEntityId, assertion.target.entityId)
      }
    }
  }
  const missingTimepointIds = [...new Set([...timepointByEvent.values()].filter(id => !entities.has(id)))]
  if (missingTimepointIds.length) {
    const timepointRows = await rows("MATCH (n:KnowledgeRecord) WHERE n.id IN $ids AND n.kind = 'entity' RETURN n.json AS json", { ids: missingTimepointIds })
    for (const row of timepointRows) {
      const entity = parseJson(field(row, 'json', 0))
      entities.set(entity.id, entity)
    }
  }

  const all = []
  for (const { category, entityIds } of entityIdsByCategory) {
    for (const id of entityIds) {
      const entity = entities.get(id)
      if (!entity) continue
      const time = entity.time ?? entities.get(timepointByEvent.get(entity.id))?.time ?? null
      if (!time?.start) continue
      const start = chronologyYear(time.start)
      const end = chronologyYear(time.end ?? time.start)
      if (start == null || end < fromYear || start > toYear) continue
      all.push({
        id: entity.id,
        entityType: entity.entityType,
        name: entity.name,
        ...(entity.description ? { description: entity.description } : {}),
        time,
        categoryId: category.id,
        categoryName: category.name
      })
    }
  }
  all.sort((a, b) => chronologyYear(a.time.start) - chronologyYear(b.time.start) || a.name.localeCompare(b.name) || a.categoryId.localeCompare(b.categoryId))
  const items = all.slice(offset, offset + limit)
  return {
    category: { id: root.id, name: root.name },
    items,
    nextCursor: all.length > offset + limit ? String(offset + limit) : null,
    limit
  }
}

export async function handleKnowledgeRequest (pathname, url) {
  if (pathname === '/api/v1/manifest') return getManifest()
  if (pathname === '/api/v1/categories') return getCategories(url)
  if (pathname === '/api/v1/category') return getCategory(url)
  if (pathname === '/api/v1/search') return search(url)
  if (pathname === '/api/v1/node') {
    const id = requiredParam(url, 'id')
    const record = await getRecord(id)
    if (!record) throw httpError(404, 'Knoten nicht gefunden.')
    return record
  }
  if (pathname === '/api/v1/node-relations') return nodeRelations(url)
  if (pathname === '/api/v1/timeline') return timeline(url)
  throw httpError(404, 'API-Endpunkt nicht gefunden.')
}

export { httpError }
