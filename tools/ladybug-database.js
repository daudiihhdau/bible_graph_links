import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPackages } from '../src/index.js'
import { exportPackages } from '../src/ladybug-export.js'

const root = fileURLToPath(new URL('../', import.meta.url))
export const defaultDatabasePath = resolve(root, 'data/ladybug/question-os.lbdb')
const executable = process.env.LBUG_EXECUTABLE || 'lbug'

function parseCsvLine(line) {
  const fields = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { field += '"'; i += 1 }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { fields.push(field); field = '' }
    else field += char
  }
  fields.push(field)
  return fields
}

export function queryLadybug(databasePath, query) {
  const temporaryRoot = join(tmpdir(), `question-os-ladybug-query-${randomUUID()}`)
  const historyPath = join(temporaryRoot, 'history')
  mkdirSync(historyPath, { recursive: true })
  try {
    const result = spawnSync(executable, [resolve(databasePath), '--read_only', '--path_history', historyPath, '--no_progress_bar', '--mode', 'csv'], {
      encoding: 'utf8', input: `${query.trim().replace(/;?$/, ';')}\n:quit\n`, timeout: 180_000, maxBuffer: 128 * 1024 * 1024
    })
    if (result.error) throw result.error
    if (result.status !== 0 || /^Error:/m.test(result.stdout)) throw new Error(result.stderr || result.stdout || `lbug завершился с кодом ${result.status}`)
    const lines = result.stdout.split(/\r?\n/)
    const marker = lines.findIndex(line => line.includes('Enter ":help" for usage hints.'))
    if (marker < 0) throw new Error(`LadybugDB returned no shell result: ${result.stdout}`)
    return lines.slice(marker + 1)
      .filter(line => line && !/^\(\d+ (?:tuples?|columns?)\)$/.test(line) && !/^Time:/.test(line))
      .map(parseCsvLine)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

export function readPackagesFromLadybug(databasePath = defaultDatabasePath) {
  const manifestRows = queryLadybug(databasePath, "MATCH (n:KnowledgeRecord) WHERE n.kind = 'manifest' RETURN n.packageId, n.json ORDER BY n.packageId")
  if (manifestRows.length < 2) throw new Error(`LadybugDB enthält kein Wissenspaket: ${JSON.stringify(manifestRows)}`)
  const packages = []
  for (const [packageId] of manifestRows.slice(1)) {
    const rows = queryLadybug(databasePath, `MATCH (n:KnowledgeRecord) WHERE n.packageId = '${packageId.replaceAll("'", "\\'")}' AND n.kind IN ['manifest', 'curriculum', 'entity', 'assertion', 'relationType'] RETURN n.kind, n.json ORDER BY n.kind, n.id`)
    const data = { manifest: undefined, curriculum: undefined, entities: [], assertions: [], relationTypes: [] }
    for (const [kind, serialized] of rows.slice(1)) {
      const payload = JSON.parse(serialized)
      if (kind === 'manifest') data.manifest = payload
      else if (kind === 'curriculum') data.curriculum = payload
      else if (kind === 'entity') data.entities.push(payload)
      else if (kind === 'assertion') data.assertions.push(payload)
      else if (kind === 'relationType') data.relationTypes.push(payload)
    }
    if (data.manifest?.id !== packageId || !data.curriculum) throw new Error(`Unvollständiges Paket in LadybugDB: ${packageId}`)
    packages.push(data)
  }
  loadPackages(packages)
  return packages
}

export async function buildLadybugDatabase(packages, databasePath = defaultDatabasePath) {
  loadPackages(packages)
  const target = resolve(databasePath)
  await mkdir(dirname(target), { recursive: true })
  const temporaryRoot = join(tmpdir(), `question-os-ladybug-build-${randomUUID()}`)
  const exportPath = join(temporaryRoot, 'export')
  const historyPath = join(temporaryRoot, 'history')
  const buildPath = join(dirname(target), `.${randomUUID()}.lbdb`)
  await mkdir(historyPath, { recursive: true })
  try {
    const manifest = await exportPackages(packages, exportPath)
    const imported = spawnSync(executable, [buildPath, '--init', join(exportPath, 'import.cypher'), '--path_history', historyPath, '--no_progress_bar'], {
      cwd: root, encoding: 'utf8', input: ':quit\n', maxBuffer: 16 * 1024 * 1024, timeout: 300_000
    })
    if (imported.stdout) process.stdout.write(imported.stdout)
    if (imported.stderr) process.stderr.write(imported.stderr)
    if (imported.status !== 0) throw new Error(`Ladybug-Import fehlgeschlagen (Exit ${imported.status ?? imported.signal}); aktive Datenbank blieb unverändert.`)
    const info = await stat(buildPath)
    if (!info.isFile() || info.size === 0) throw new Error('Ladybug hat keine Datenbankdatei erzeugt.')
    await rename(buildPath, target)
    return { databasePath: target, bytes: (await stat(target)).size, counts: manifest.counts }
  } finally {
    await rm(buildPath, { force: true })
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}
