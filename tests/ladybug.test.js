import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyDraft } from '../tools/knowledge-verify.js'
import { buildLadybugDatabase } from '../tools/ladybug-database.js'

test('new records match the draft and their Ladybug edges point to the intended records', async () => {
  const fixtureId = 'org.example/package/ladybug-fixture'
  const subjectId = 'org.example/person/test-person'
  const targetId = 'org.example/place/test-place'
  const assertionId = 'org.example/assertion/test-person-born-in-place'
  const fixture = {
    manifest: {
      $schema: 'https://question-os.dev/schemas/7.0/package.schema.json', schemaVersion: '7.0',
      id: fixtureId, packageVersion: '1.0.0', title: 'Ladybug test fixture', license: 'CC BY 4.0'
    },
    curriculum: {
      $schema: 'https://question-os.dev/schemas/7.0/content.schema.json', documentType: 'curriculum',
      schoolSubjects: [{ id: 'org.example/subject/religion', name: 'Religion' }],
      categories: [{ id: 'org.example/category/bible', schoolSubjectId: 'org.example/subject/religion', name: 'Bible', entityIds: [subjectId, targetId], assertionIds: [assertionId] }]
    },
    entities: [
      { id: subjectId, entityType: 'person', name: 'Test person' },
      { id: targetId, entityType: 'place', name: 'Test place' }
    ],
    assertions: [{ id: assertionId, subjectEntityId: subjectId, relationTypeId: 'born-in', target: { targetType: 'entity', entityId: targetId } }],
    relationTypes: []
  }
  const temporary = mkdtempSync(join(tmpdir(), 'question-os-ladybug-incremental-test-'))
  const databasePath = join(temporary, 'fixture.lbdb')
  try {
    await buildLadybugDatabase([fixture], databasePath)
    const result = await verifyDraft(databasePath, {
      entities: fixture.entities,
      assertions: fixture.assertions
    })
    assert.deepEqual(result, { records: 3, assertions: 1, entityUpdates: 0, entityMerges: 0 })

    await assert.rejects(
      verifyDraft(databasePath, { assertions: [{ ...fixture.assertions[0], subjectEntityId: targetId }] }),
      /Gespeicherter Datensatz weicht vom Entwurf ab/
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
