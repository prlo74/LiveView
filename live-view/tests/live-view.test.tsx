import { expect, test } from 'claude-code/testing'

import { editScreen, fxFor, testCounts, toCode, viewLines } from '../hooks/register'
import { particles } from '../hooks/lib'
import { effectFor } from '../hooks/screen'

const PANE = {
  plugin: 'live-view',
  component: 'Pane',
  requestId: 'live-view',
  props: {
    title: 'Live View',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const FILE = ['one', 'two', 'b', 'c', 'five'].join('\n')

test('each tile shows the agent screen, and a test run flashes a pass banner that fades', async ($, on) => {
  on('command.register', () => ({ value: { command: 'live-view' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('fs.read', () => ({ value: FILE }))
  on('tool.call', (_, e) => ({ result: {}, text: e.tool === 'Bash' ? 'PASS src/a.test.ts\nTests: 4 passed, 4 total' : '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/src/app.ts', old_string: 'a', new_string: 'b\nc' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ in: 'tile-main', type: 'Text', text: /Editor · app\.ts/ })).toBeDefined()
    await ui.press({ key: 'open-main' })
    expect(await ui.find({ in: 'focus-main', type: 'Text', text: /Editor · app\.ts · line 3/ })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await ui.advance(100)
  expect(await ui.find({ in: 'tile-main', type: 'Text', text: /✓ 4 passed/ })).toBeDefined()
  await ui.advance(3000)
  expect(await ui.find({ in: 'tile-main', type: 'Text', text: /✓ 4 passed/ })).toBeUndefined()
  expect(await ui.find({ in: 'tile-main', type: 'Text', text: /Terminal · npm test/ })).toBeDefined()
  await ui.unmount()
})

test('director mode cuts to the agent that just edited', async ($, on) => {
  on('command.register', () => ({ value: { command: 'live-view' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('tool.call', () => ({ result: {}, text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/x.ts' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'director' })
  await $.tool.call({ tool: 'Edit', file_path: '/x.ts', old_string: 'a', new_string: 'b', agentId: 'a1' })
  expect(await ui.find({ type: 'Button', key: 'back' })).toBeDefined()
  await ui.unmount()
})

test('events map to the right reaction', () => {
  expect(fxFor('edit', '/x', '', false, 30, 2)?.kind).toBe('add')
  expect(fxFor('edit', '/x', '', false, 1, 25)?.kind).toBe('cut')
  expect(fxFor('run', 'npx vitest', 'Tests  2 failed | 5 passed', true, 0, 0)).toMatchObject({ kind: 'fail', label: '2 failed · 5 passed' })
  expect(fxFor('run', 'ls', 'boom', true, 0, 0)?.kind).toBe('error')
  expect(testCounts('ls -la', '3 passed')).toBeUndefined()
  expect(testCounts('go test ./...', 'ok  \tpkg\t0.2s')).toEqual({ passed: 1, failed: 0 })
  expect(effectFor({ id: '1', kind: 'add', size: 40, at: 0, label: '' })).toBe('sparks')
  expect(effectFor({ id: '1', kind: 'add', size: 3, at: 0, label: '' })).toBeUndefined()
  expect(effectFor({ id: '1', kind: 'pass', size: 4, at: 0, label: '' })).toBe('confetti')
  expect(effectFor({ id: '1', kind: 'fail', size: 1, at: 0, label: '' })).toBe('lightning')
})

test('particles stay inside the tile and end', () => {
  for (const effect of ['sparks', 'confetti', 'lightning'] as const) {
    for (const t of [0, 140, 400, 900]) {
      for (const p of particles(effect, 'seed', t, 30, 10, 3)) {
        expect(p.x >= 0 && p.x < 30 && p.y >= 0 && p.y < 10).toBe(true)
      }
    }
    expect(particles(effect, 'seed', 5000, 30, 10, 3)).toEqual([])
  }
  expect(particles('confetti', 's', 300, 30, 10, 3)).toEqual(particles('confetti', 's', 300, 30, 10, 3))
})

test('an edit screen numbers lines from the file and marks the change', () => {
  const s = editScreen('/x.ts', FILE, 'a', 'b\nc')
  expect(s.lines.map(l => `${l.no}${l.mark}${l.text}`)).toEqual(['1 one', '2 two', '3-a', '3+b', '4+c', '5 five'])
  const code = toCode(viewLines(s, 10), true)
  expect(code.format).toBe('diff')
  expect(code.source.split('\n')[0]).toBe('@@ -1,4 +1,5 @@')
})

test('empty pane says so', async ($, on) => {
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toMatch(/No agent activity yet/)
  await ui.unmount()
})
