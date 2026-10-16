import { resolve } from 'node:path'
import { defaultDatabasePath, readPackagesFromLadybug, buildLadybugDatabase } from './ladybug-database.js'

const databasePath = resolve(process.env.QUESTION_OS_LADYBUG_DB ?? defaultDatabasePath)
const packages = readPackagesFromLadybug(databasePath)
const result = await buildLadybugDatabase(packages, databasePath)
console.log(JSON.stringify(result, null, 2))
