import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultDatabasePath, readPackagesFromLadybug } from './ladybug-database.js'
import { exportPackages } from '../src/ladybug-export.js'

const outputPath = resolve(process.argv[2] ?? join(tmpdir(), 'question-os-ladybug-export'))
const databasePath = resolve(process.env.QUESTION_OS_LADYBUG_DB ?? defaultDatabasePath)
const packages = readPackagesFromLadybug(databasePath)
const manifest = await exportPackages(packages, outputPath)
console.log(JSON.stringify({ outputPath, ...manifest }, null, 2))
