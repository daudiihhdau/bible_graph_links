import { readdir, readFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { validateJsonSchema } from './json-schema.js'

const require = createRequire(import.meta.url)
const contentSchema = require('../schemas/content.schema.json')
const manifestSchema = require('../schemas/package.schema.json')
const schemaDirectory = fileURLToPath(new URL('../schemas/', import.meta.url))
const readJson = async file => {
  try { return JSON.parse(await readFile(file, 'utf8')) }
  catch (error) { throw new Error(`${file}: ${error.message}`, { cause: error }) }
}

export async function readPackage(directory) {
  const files = await readdir(directory, { recursive: true })
  const entries = await Promise.all(files.filter(file => file.endsWith('.json')).map(async file => {
    const fullPath = join(directory, file)
    const document = await readJson(fullPath)
    const schemaName = file === 'manifest.json' ? 'package.schema.json' : 'content.schema.json'
    if (typeof document?.$schema !== 'string' || resolve(dirname(fullPath), document.$schema) !== resolve(schemaDirectory, schemaName)) throw new Error(`${file}: $schema muss auf schemas/${schemaName} zeigen`)
    const errors = validateJsonSchema(document, file === 'manifest.json' ? manifestSchema : contentSchema, file)
    if (errors.length) throw new Error(`Ungültiges Wissensdokument:\n${errors.map(({ path, message }) => `- ${path}: ${message}`).join('\n')}`)
    return { file, document }
  }))
  if (!entries.some(entry => entry.file === 'manifest.json')) throw new Error(`${directory}: manifest.json fehlt`)
  if (!entries.some(entry => entry.file === 'curriculum.json')) throw new Error(`${directory}: curriculum.json fehlt`)
  const manifest = entries.find(entry => entry.file === 'manifest.json')?.document
  const data = { manifest, entities: [], assertions: [], relationTypes: [] }
  for (const { file, document } of entries) {
    if (file === 'manifest.json') continue
    if (file === 'curriculum.json' && document.documentType === 'curriculum') { data.curriculum = document; continue }
    if (document.documentType === 'curriculum') throw new Error(`${file}: curriculum ist nur in curriculum.json erlaubt`)
    const key = { entities: 'entities', assertions: 'assertions', relationTypes: 'relationTypes' }[document.documentType]
    if (!key || !Array.isArray(document[key])) throw new Error(`Unbekanntes Wissensdokument: ${file}`)
    data[key].push(...document[key])
  }
  return data
}
