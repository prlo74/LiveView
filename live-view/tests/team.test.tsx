import { expect, test } from 'claude-code/testing'

import { branchLine, teamTree } from '../hooks/dashboard'
import { narrate, pushUpdate } from '../hooks/narrate'
import type { AgentView } from '../types'

const PANE = (requestId: string, bodyColumns: number) =>
  ({
    plugin: 'live-view',
    component: 'Pane',
    requestId,
    props: { title: 'x', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
const setup = (on: Parameters<Body>[1]) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('fs.read', () => ({ value: 'one\ntwo\nb\nc' }))
  on('tool.call', (_, e) => ({ result: {}, text: e.tool === 'Bash' ? 'Tests: 4 passed' : '' }))
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5', agentId: e.description === 'Map web' ? 'w1' : 'w2' }))
}

test('the Team page draws the main agent over its workers, each with plain-language updates', async ($, on) => {
  setup(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/src/a.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/src/b.ts' })
  // The kit fills the engine's own fields of a spawn; the test states what the Agent call says.
  type Spawn = Parameters<typeof $.agent.spawn>[0]
  await $.agent.spawn({ prompt: 'map', description: 'Map web', subagentType: 'Explore' } as unknown as Spawn)
  await $.agent.spawn({ prompt: 'map', description: 'Map api', subagentType: 'Explore' } as unknown as Spawn)
  await $.tool.call({ tool: 'Edit', file_path: '/web/app.ts', old_string: 'a', new_string: 'b\nc', agentId: 'w1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'w2' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE('live-view', 120), surface })
    await ui.press({ key: 'nav-team' })
    expect(await ui.find({ type: 'Text', text: /Main agent/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Read 2 files: a\.ts, b\.ts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Changed app\.ts \(\+2 −1\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Ran the tests: 4 passed/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /┌.*┴.*┐/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /workers · 2/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'team-expand' })).toBeDefined()
    await ui.press({ key: 'team-open-w1' })
    expect(await ui.find({ type: 'Button', key: 'back' })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.unmount()
  }

  const wide = await $.ui.mount({ ...PANE('agent-team', 200), surface: 'desktop' })
  expect(await wide.find({ type: 'Text', text: /Agent team/ })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: /Map web/ })).toBeDefined()
  expect(await wide.find({ type: 'Button', key: 'team-expand' })).toBeUndefined()
  await wide.unmount()
})

test('narrate says what happened in plain words', () => {
  expect(narrate('Edit', 'edit', '/a/x.ts', { kind: 'add', label: '+3', size: 3 }, false, 3, 0).text).toBe('Added 3 lines to x.ts')
  expect(narrate('Edit', 'edit', '/a/x.ts', { kind: 'cut', label: '−9', size: 9 }, false, 0, 9).text).toBe('Removed 9 lines from x.ts')
  expect(narrate('Write', 'edit', '/a/n.md', { kind: 'add', label: '+1', size: 1 }, false, 1, 0).text).toBe('Wrote n.md (1 line)')
  expect(narrate('Bash', 'run', 'npm install', undefined, false, 0, 0).text).toBe('Installed packages')
  expect(narrate('Bash', 'run', 'rm -x', undefined, true, 0, 0)).toMatchObject({ text: 'A command failed: rm -x', tone: 'error' })
  expect(narrate('WebFetch', 'browse', 'https://www.docs.stripe.com/x', undefined, false, 0, 0).text).toBe('Read a page on docs.stripe.com')
  expect(narrate('Grep', 'search', 'redirect', undefined, false, 0, 0).text).toBe('Searched the code for "redirect"')
})

test('pushUpdate merges reads within a minute and keeps 30', () => {
  let list = pushUpdate([], { at: 0, ...narrate('Read', 'read', '/a.ts', undefined, false, 0, 0) })
  list = pushUpdate(list, { at: 10_000, ...narrate('Read', 'read', '/b.ts', undefined, false, 0, 0) })
  expect(list).toHaveLength(1)
  expect(list[0]!.text).toBe('Read 2 files: a.ts, b.ts')
  list = pushUpdate(list, { at: 200_000, ...narrate('Read', 'read', '/c.ts', undefined, false, 0, 0) })
  expect(list).toHaveLength(2)
  for (let i = 0; i < 40; i++) list = pushUpdate(list, { at: i, text: `x${i}`, tone: 'info' })
  expect(list).toHaveLength(30)
})

test('the tree puts orphans under main and draws branch lines', () => {
  const a = (id: string, parentId?: string) => ({ id, label: id, parentId, status: 'idle', steps: [], updates: [] }) as unknown as AgentView
  const { roots, kids } = teamTree({ main: a('main'), w1: a('w1', 'main'), w2: a('w2', 'gone'), w3: a('w3', 'w1') })
  expect(roots.map(r => r.id)).toEqual(['main'])
  expect(kids.get('main')!.map(k => k.id)).toEqual(['w1', 'w2'])
  expect(kids.get('w1')!.map(k => k.id)).toEqual(['w3'])
  expect(branchLine(11, [1, 5, 9], 5).replace(/ /g, ' ')).toBe(' ┌───┼───┐ ')
  expect(branchLine(11, [2, 8], 5).replace(/ /g, ' ')).toBe('  ┌──┴──┐  ')
  expect(branchLine(5, [2], 2).replace(/ /g, ' ')).toBe('  │  ')
})
