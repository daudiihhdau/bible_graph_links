import { loadPackages } from '../src/index.js'
import { defaultDatabasePath, queryLadybug, readPackagesFromLadybug } from './ladybug-database.js'

const packages = readPackagesFromLadybug(defaultDatabasePath)
if (packages.length !== 1 || packages[0].manifest.id !== 'org.ichlerne.bible/package/bible-history') {
  throw new Error('Die LadybugDB muss genau das Wissenspaket Bibel und Geschichte enthalten')
}
loadPackages(packages)
const [data] = packages

const assertionRows = queryLadybug(defaultDatabasePath, "MATCH (n:KnowledgeRecord) WHERE n.kind = 'assertion' RETURN COUNT(*) AS count")
const storedAssertions = Number(assertionRows[1]?.[0])
if (storedAssertions !== data.assertions.length) throw new Error(`Aussagenzahl in LadybugDB stimmt nicht: ${storedAssertions} ≠ ${data.assertions.length}`)

const invalidAssertionEdges = queryLadybug(defaultDatabasePath, `MATCH (a:KnowledgeRecord)
WHERE a.kind = 'assertion'
OPTIONAL MATCH (a)-[r:KnowledgeLink]->()
WITH a,
  SUM(CASE WHEN r.kind = 'SUBJECT' THEN 1 ELSE 0 END) AS subjects,
  SUM(CASE WHEN r.kind = 'RELATION_TYPE' THEN 1 ELSE 0 END) AS relationTypes,
  SUM(CASE WHEN r.kind = 'TARGET' THEN 1 ELSE 0 END) AS targets
WHERE subjects <> 1 OR relationTypes <> 1 OR targets > 1
RETURN COUNT(*) AS invalid`)
if (Number(invalidAssertionEdges[1]?.[0]) !== 0) throw new Error(`Ungültige Aussagekanten: ${invalidAssertionEdges[1]?.[0]}`)

const invalidLinks = queryLadybug(defaultDatabasePath, `MATCH (a:KnowledgeRecord)-[r:KnowledgeLink]->()
WHERE a.kind <> 'assertion' OR r.assertionId <> a.id
RETURN COUNT(*) AS invalid`)
if (Number(invalidLinks[1]?.[0]) !== 0) throw new Error(`Ungültige Graphkanten: ${invalidLinks[1]?.[0]}`)

const graphLinkRows = queryLadybug(defaultDatabasePath, 'MATCH ()-[r:KnowledgeLink]->() RETURN COUNT(*) AS count')
const expectedLinks = data.assertions.length * 2 + data.assertions.filter(assertion => assertion.target?.targetType === 'entity').length
if (Number(graphLinkRows[1]?.[0]) !== expectedLinks) throw new Error(`Kantenzahl in LadybugDB stimmt nicht: ${graphLinkRows[1]?.[0]} ≠ ${expectedLinks}`)

console.log(`OK: LadybugDB – ${data.entities.length} Entitäten, ${data.assertions.length} Aussagen, ${expectedLinks} geprüfte Graphkanten`)
