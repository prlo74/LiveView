import { expect, test } from 'claude-code/testing'
import { DOWN, UP } from '../hooks/charts'

import { laneCells } from '../hooks/dashboard'

const pane = (bodyColumns: number) =>
  ({
    plugin: 'live-view',
    component: 'Pane',
    requestId: 'live-view',
    props: { title: 'Live View', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

test('every dashboard page draws on terminal and desktop, wide and narrow', async ($, on) => {
  on('command.register', () => ({ value: { command: 'live-view' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('fs.read', () => ({ value: 'one\nb\nc\nfour' }))
  on('tool.call', (_, e) => ({ result: {}, text: e.tool === 'Bash' ? 'Tests: 4 passed, 4 total' : '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/src/app.ts', old_string: 'a', new_string: 'b\nc' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Read', file_path: '/src/util.ts' })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const cols of [120, 80]) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      const has = async (text: RegExp) => expect(await ui.find({ type: 'Text', text })).toBeDefined()
      await ui.press({ key: 'nav-overview' })
      await has(/Agent Control Center/)
      await has(/Cost by agent/)
      await has(/Tool mix/)
      await has(/Tokens by model/)
      expect(await ui.find({ type: 'Button', key: 'range-15m' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'director' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'open-main' })).toBeDefined()
      await ui.press({ key: 'range-1h' })
      await has(/Agent Control Center/)

      await ui.press({ key: 'nav-activity' })
      await has(/Activity timeline/)
      await has(/Main agent/)

      await ui.press({ key: 'nav-files' })
      await has(/Files touched/)
      await has(/app\.ts/)

      await ui.press({ key: 'nav-agents' })
      expect(await ui.find({ type: 'Button', key: 'open-main' })).toBeDefined()
      await ui.press({ key: 'open-main' })
      expect(await ui.find({ type: 'Button', key: 'back' })).toBeDefined()
      // Nav away clears the focus, so Overview shows again.
      await ui.press({ key: 'nav-overview' })
      expect(await ui.find({ type: 'Button', key: 'back' })).toBeUndefined()
      await ui.press({ key: 'range-session' })
      await ui.unmount()
    }
  }
})

test('a lane strip colours the cells its blocks cover', () => {
  const lane = {
    id: 'x',
    label: 'x',
    status: 'working' as const,
    blocks: [
      { start: 0, end: 10, kind: 'edit' as const, isError: false, tool: 'Edit', target: '' },
      { start: 50, end: 60, kind: 'run' as const, isError: true, tool: 'Bash', target: '' },
    ],
  }
  const cells = laneCells(lane, 0, 100, 10)
  expect(cells[0]).toBe(UP)
  expect(cells[3]).toBe('')
  expect(cells[5]).toBe(DOWN)
})

test('end to end: tool calls and a turn with usage show in Overview KPIs and an Activity lane', async ($, on) => {
  on('command.register', () => ({ value: { command: 'live-view' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('fs.read', () => ({ value: 'x' }))
  on('tool.call', () => ({ result: {}, text: '' }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const p of ['/a.ts', '/b.ts', '/c.ts']) await $.tool.call({ tool: 'Read', file_path: p })
  await $.turn.complete({
    answer: '',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { model: 'claude-sonnet-4', input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as Parameters<typeof $.turn.complete>[0])

  const ui = await $.ui.mount({ ...pane(120), surface: 'desktop' })
  await ui.press({ key: 'nav-overview' })
  expect(await ui.find({ type: 'Text', text: /^TOOL CALLS$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^3$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^1\.5K$/ })).toBeDefined()
  await ui.press({ key: 'nav-activity' })
  expect(await ui.find({ type: 'Text', text: /Main agent/ })).toBeDefined()
  await ui.unmount()
})
