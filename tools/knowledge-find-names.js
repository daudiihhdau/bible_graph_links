import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defaultDatabasePath, queryLadybug } from './ladybug-database.js'

const input = process.argv[2]
if (!input) throw new Error('Aufruf: npm run knowledge:names -- <Name-oder-Datei.txt>')
const databasePath = resolve(process.env.QUESTION_OS_LADYBUG_DB ?? defaultDatabasePath)
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
const levenshtein = (a, b) => {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i]
    for (let j = 1; j <= b.length; j += 1) next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = next
  }
  return prev[b.length]
}

let terms
try {
  const content = await readFile(resolve(input), 'utf8')
  terms = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  terms = [input]
}
const rows = queryLadybug(databasePath, "MATCH (n:KnowledgeRecord) WHERE n.kind = 'entity' RETURN n.json")
const entities = rows.slice(1).map(([json]) => JSON.parse(json)).map(entity => ({
  ...entity,
  names: [...new Set([entity.name, ...(entity.alternativeNames ?? [])])].map(name => ({ name, normalized: normalize(name) }))
}))
const output = terms.map(term => {
  const query = normalize(term)
  if (!query) return { input: term, matches: [] }
  const matches = []
  const queryWords = query.split(' ')
  for (const entity of entities) for (const name of entity.names) {
    if (!name.normalized) continue
    const distance = levenshtein(query, name.normalized)
    const exact = query === name.normalized
    const nameWords = name.normalized.split(' ')
    const partial = queryWords.length === 1 && query.length >= 4 && nameWords.some(word => word.includes(query))
      || queryWords.length > 1 && queryWords.every(word => nameWords.includes(word))
    const distanceMatch = query.length >= 6 && distance <= 2
    if (exact || partial || distanceMatch) matches.push({ id: entity.id, entityType: entity.entityType, name: entity.name, matchedName: name.name, match: exact ? 'exact' : partial ? 'partial' : `spelling-distance-${distance}` })
  }
  const unique = [...new Map(matches.map(match => [`${match.id}\0${match.matchedName}`, match])).values()]
  unique.sort((a, b) => ({ exact: 0, partial: 1 }[a.match] ?? 2) - ({ exact: 0, partial: 1 }[b.match] ?? 2) || a.name.localeCompare(b.name))
  return { input: term, matches: unique.slice(0, 12) }
})
if (process.argv.includes('--json')) console.log(JSON.stringify(output, null, 2))
else for (const result of output) {
  console.log(`\n${result.input}`)
  if (!result.matches.length) console.log('  Kein genauer, teilweiser oder schreibähnlicher Name vorhanden. Einen fehlenden Sprachalias erst recherchieren und dann gezielt ergänzen.')
  for (const match of result.matches) console.log(`  [${match.match}] ${match.name} — ${match.entityType} — ${match.id}${match.matchedName === match.name ? '' : ` (Name: ${match.matchedName})`}`)
}
