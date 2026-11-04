import { expect, test } from 'claude-code/testing'

const PANE = (requestId: string, bodyColumns: number) =>
  ({ plugin: 'live-view', component: 'Pane', requestId, props: { title: 'x', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } }) as const

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
const setup = (on: Parameters<Body>[1]) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('fs.read', () => ({ value: 'one\ntwo' }))
}

test('an approval clears when its call ends, and a check query asks no one', async ($, on) => {
  setup(on)
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: {}, text: '' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
  const asked = await $.ui.mount({ ...PANE('live-view', 120), surface: 'desktop' })
  await asked.press({ key: 'nav-team' })
  expect(await asked.find({ type: 'Text', text: /Waiting for your approval/ })).toBeUndefined()
  await asked.unmount()
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const ui = await $.ui.mount({ ...PANE('live-view', 120), surface: 'desktop' })
  await ui.press({ key: 'nav-team' })
  expect(await ui.find({ type: 'Text', text: /Needs you/ })).toBeUndefined()
  await ui.unmount()
})

test('a refused Edit says so and counts no lines', async ($, on) => {
  setup(on)
  on('tool.call', () => ({ deny: 'no' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a\nb\nc', new_string: 'x\ny\nz\nw' })
  const ui = await $.ui.mount({ ...PANE('live-view', 120), surface: 'desktop' })
  await ui.press({ key: 'nav-team' })
  expect(await ui.find({ type: 'Text', text: /Edit was refused on a\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\b0 lines/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\b7 lines/ })).toBeUndefined()
  await ui.unmount()
})
