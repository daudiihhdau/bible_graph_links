import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { inspectKnowledge, prepareKnowledgeDraft } from '../src/index.js'
import { buildLadybugDatabase, defaultDatabasePath, readPackagesFromLadybug } from './ladybug-database.js'

const usage = 'Aufruf: node tools/knowledge-author.js inspect <Suchtext> [Entitätstyp] | check <Entwurf.json> | apply <Entwurf.json>'
const databasePath = resolve(process.env.QUESTION_OS_LADYBUG_DB ?? defaultDatabasePath)

async function main() {
  const [command, first, second] = process.argv.slice(2)
  const packages = readPackagesFromLadybug(databasePath)
  if (packages.length !== 1) throw new Error('Für die Pflege wird genau ein Bibel-Wissenspaket erwartet')
  const target = packages[0]

  if (command === 'inspect') {
    if (first === undefined) throw new Error(usage)
    console.log(JSON.stringify(inspectKnowledge(packages, { term: first, entityType: second }), null, 2))
    return
  }
  if (!['check', 'apply'].includes(command) || !first || second) throw new Error(usage)
  const draft = JSON.parse(await readFile(resolve(first), 'utf8'))
  const prepared = prepareKnowledgeDraft(packages, target.manifest.id, draft)
  if (command === 'check') {
    console.log(`Gültig: ${draft.id} – ${draft.entities?.length ?? 0} Entitäten, ${draft.assertions?.length ?? 0} Aussagen, ${draft.categories?.length ?? 0} neue Kategorien; Datenbank unverändert.`)
    return
  }
  const result = await buildLadybugDatabase(prepared.packages, databasePath)
  console.log(`Übernommen: ${draft.id}`)
  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
