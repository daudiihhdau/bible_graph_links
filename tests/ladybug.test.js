import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareKnowledgeDraft } from '../src/index.js'
import { buildLadybugDatabase, defaultDatabasePath, queryLadybug, readPackagesFromLadybug } from '../tools/ladybug-database.js'

const databasePath = fileURLToPath(new URL('../data/ladybug/question-os.lbdb', import.meta.url))
const executable = process.env.LBUG_EXECUTABLE || 'lbug'
const packageId = 'org.ichlerne.bible/package/bible-history'

function query(cypher) {
  const temporary = mkdtempSync(join(tmpdir(), 'question-os-ladybug-test-'))
  const historyPath = join(temporary, 'history')
  mkdirSync(historyPath)
  try {
    const result = spawnSync(executable, [databasePath, '--read_only', '--path_history', historyPath, '--no_progress_bar', '--mode', 'csv'], {
      encoding: 'utf8',
      input: `${cypher.trim().replace(/;?$/, ';')}\n:quit\n`,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024
    })
    if (result.error) throw result.error
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.doesNotMatch(result.stdout, /^Error:/m, result.stdout)

    const lines = result.stdout.split(/\r?\n/)
    const shellMessage = lines.findIndex(line => line.includes('Enter ":help" for usage hints.'))
    const table = lines.slice(shellMessage + 1).filter(line => line && !/^\(\d+ (?:tuples?|columns?)\)$/.test(line) && !/^Time:/.test(line))
    return table.map(line => line.split(',')).filter(row => row.length)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

test('the checked-in LadybugDB exists and contains a single Bible package', () => {
  assert.ok(statSync(databasePath).size > 0)
  const rows = query("MATCH (n:KnowledgeRecord) WHERE n.kind = 'manifest' RETURN n.packageId, COUNT(*) ORDER BY n.packageId")
  assert.deepEqual(rows, [['n.packageId', 'COUNT_STAR()'], [packageId, '1']])
})

test('LadybugDB contains the Bible knowledge graph', () => {
  const rows = query("MATCH (n:KnowledgeRecord) RETURN n.kind AS kind, COUNT(*) AS records ORDER BY kind")
  const counts = Object.fromEntries(rows.slice(1).map(([kind, count]) => [kind, Number(count)]))
  assert.ok(counts.entity >= 4000)
  assert.ok(counts.assertion >= 29000)
  assert.equal(counts.manifest, 1)
  assert.equal(counts.curriculum, 1)
  assert.ok(counts.relationType > 0)
})

test('Bible relationships are stored as connected Ladybug graph edges', () => {
  const rows = query(`MATCH (a:KnowledgeRecord)-[:KnowledgeLink {kind: 'SUBJECT'}]->(s:KnowledgeRecord)
MATCH (a)-[:KnowledgeLink {kind: 'RELATION_TYPE'}]->(p:KnowledgeRecord)
MATCH (a)-[:KnowledgeLink {kind: 'TARGET'}]->(t:KnowledgeRecord)
WHERE a.kind = 'assertion' AND s.id = 'org.ichlerne.bible/person/jesus' AND p.id = 'has-mother'
RETURN a.id, t.id`)
  assert.equal(rows.length, 2)
  assert.equal(rows[0][0], 'a.id')
  assert.equal(rows[1][1], 'org.ichlerne.bible/person/maria-mutter-jesu')
})

test('every stored assertion has one subject and relationship edge', () => {
  const rows = query(`MATCH (a:KnowledgeRecord)
WHERE a.kind = 'assertion'
OPTIONAL MATCH (a)-[r:KnowledgeLink]->()
WITH a,
  SUM(CASE WHEN r.kind = 'SUBJECT' THEN 1 ELSE 0 END) AS subjects,
  SUM(CASE WHEN r.kind = 'RELATION_TYPE' THEN 1 ELSE 0 END) AS relationTypes,
  SUM(CASE WHEN r.kind = 'TARGET' THEN 1 ELSE 0 END) AS targets
WHERE subjects <> 1 OR relationTypes <> 1 OR targets > 1
RETURN COUNT(*) AS invalidAssertions`)
  assert.deepEqual(rows, [['invalidAssertions'], ['0']])
})

test('every graph edge originates at its assertion and carries the matching assertion ID', () => {
  const rows = query(`MATCH (a:KnowledgeRecord)-[r:KnowledgeLink]->()
WHERE a.kind <> 'assertion' OR r.assertionId <> a.id
RETURN COUNT(*) AS invalidLinks`)
  assert.deepEqual(rows, [['invalidLinks'], ['0']])
})

test('a validated draft builds and checks against a temporary LadybugDB', async () => {
  const [current] = readPackagesFromLadybug(defaultDatabasePath)
  const entityId = 'org.example/test/ladybug-draft-probe'
  const draft = {
    id: 'ladybug-draft-probe',
    entities: [{ id: entityId, entityType: 'concept', name: 'Ladybug-Prüfdatensatz' }],
    categoryAssignments: [{ categoryId: 'org.ichlerne/category/religion-bibel', entityIds: [entityId] }]
  }
  const prepared = prepareKnowledgeDraft([current], packageId, draft)
  const temporary = mkdtempSync(join(tmpdir(), 'question-os-ladybug-draft-'))
  const testDatabase = join(temporary, 'draft.lbdb')
  try {
    const result = await buildLadybugDatabase(prepared.packages, testDatabase)
    assert.ok(result.bytes > 0)
    const rows = queryLadybug(testDatabase, `MATCH (n:KnowledgeRecord) WHERE n.id = '${entityId}' RETURN n.name, n.kind`)
    assert.deepEqual(rows, [['n.name', 'n.kind'], ['Ladybug-Prüfdatensatz', 'entity']])
    assert.equal(readPackagesFromLadybug(defaultDatabasePath)[0].entities.some(entity => entity.id === entityId), false)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
