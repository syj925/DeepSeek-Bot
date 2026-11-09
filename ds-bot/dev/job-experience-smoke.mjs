// A real isolated Host, using only the local mock model and fixture memories.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
process.env.DS_BOT_TEST_BENCH ??= '.dsh-test-job-experience-20261109'
const { WorkTaskBench, HOME } = await import('./work-tasks-smoke.mjs')
const bench = new WorkTaskBench()
let chief, writer, view
try {
  await bench.prepare()
  await bench.start()
  await bench.step('load the plugin with its real memory API and a local mock model', async () => {
    const initial = await bench.api('state')
    chief = initial.bots[0]
    await bench.api('update-bot', { id: chief.id, model: initial.models.at(-1).ref })
    writer = await bench.api('create-bot', { name: 'Experience Writer', role: 'Fixture reviewer', instructions: 'Use only the supplied mock fixture.' })
    await bench.settle()
    view = await bench.api('job-experience-view', { botId: writer.id })
    assert.equal(view.entries.length, 0)
    return { empty: true }
  })
  await bench.step('add and edit real employee experience without generating a model answer', async () => {
    const calls = bench.calls().length
    view = await bench.api('job-experience-save', { botId: writer.id, action: 'add', revision: view.revision, text: 'Always verify the fixture source before delivery.' })
    assert.deepEqual(view.entries[0].provenance, { kind: 'manual' })
    const before = view
    view = await bench.api('job-experience-save', { botId: writer.id, action: 'edit', revision: view.revision, entryId: view.entries[0].id, text: 'Read back every fixture CSV and check its source links before delivery.' })
    assert.equal(bench.calls().length, calls)
    await assert.rejects(bench.api('job-experience-save', { botId: writer.id, action: 'edit', revision: before.revision, entryId: before.entries[0].id, text: 'Stale content must not replace the saved experience.' }), /changed elsewhere/)
    assert.equal((await bench.api('job-experience-view', { botId: chief.id })).entries.length, 0)
    return { editsUseModel: false, staleWriteRejected: true, isolatedByEmployee: true }
  })
  await bench.step('an actual employee recall reads the edited experience', async () => {
    const before = bench.calls().length
    await bench.api('send', { sessionId: writer.id, text: '回忆 fixture' })
    await bench.settle()
    const calls = bench.calls().slice(before)
    assert(calls.some(call => (call.out ?? []).some(block => block.type === 'tool_use' && block.name === 'recall')))
    assert(JSON.stringify(calls).includes('Read back every fixture CSV'))
    return { realRecallTool: true, editedTextRecalled: true }
  })
  await bench.step('experience survives a Host restart with its revision and provenance', async () => {
    const before = view
    await bench.restart()
    view = await bench.api('job-experience-view', { botId: writer.id })
    assert.deepEqual(view, before)
    return { persisted: true }
  })
  await bench.step('remove experience while preserving its change record', async () => {
    const removed = await bench.api('job-experience-save', { botId: writer.id, action: 'remove', revision: view.revision, entryId: view.entries[0].id })
    assert.equal(removed.entries.length, 0)
    const journal = readFileSync(join(HOME, 'bot/memory/journal.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert(journal.some(entry => entry.op === 'remove' && entry.before.includes('Read back every fixture CSV')))
    return { removed: true, journalRetained: true }
  })
  await bench.step('task provenance is read from durable metadata and survives user edits', async () => {
    const topic = join(HOME, 'bot/memory/bots', writer.id, 'task-lessons.md')
    writeFileSync(topic, '# task-lessons\n- Verify public sources. [source: completed task fixture:1; by: Experience Writer; task-title: Fixture verification; task-author: Experience Writer; task-summary: Five fixture rows checked.]\n')
    await bench.restart()
    const source = await bench.api('job-experience-view', { botId: writer.id })
    assert.equal(source.entries[0].provenance.title, 'Fixture verification')
    assert.equal(source.entries[0].provenance.summary, 'Five fixture rows checked.')
    const edited = await bench.api('job-experience-save', { botId: writer.id, action: 'edit', revision: source.revision, entryId: source.entries[0].id, text: 'Verify every source before publishing.' })
    assert.equal(edited.entries[0].provenance.author, 'Experience Writer')
    assert.equal(edited.entries[0].provenance.edited, true)
    return { sourceSnapshotRead: true, sourceRetainedOnEdit: true }
  })
  writeFileSync(join(HOME, 'job-experience-report.json'), JSON.stringify({ mockOnly: true, passed: true, results: bench.results }, null, 2))
  console.log(`Passed ${bench.results.length} real-Host experience checks.`)
} catch (error) { console.error(error.message); process.exitCode = 1 }
finally { await bench.stop() }
