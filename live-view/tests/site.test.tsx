import { expect, mock, test } from 'claude-code/testing'

import { CHROME, findLocalUrl, thumbSvg } from '../hooks/site'

const PANE = {
  plugin: 'live-view',
  component: 'Pane',
  requestId: 'live-view',
  props: { title: 'Live View', isFocused: false, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('only local dev servers are found', () => {
  expect(findLocalUrl('  ➜  Local:   http://localhost:5173/')).toBe('http://localhost:5173/')
  expect(findLocalUrl('ready on http://0.0.0.0:3000')).toBe('http://localhost:3000/')
  expect(findLocalUrl('docs at http://127.0.0.1:8000/docs.')).toBe('http://localhost:8000/')
  expect(findLocalUrl('see https://example.com:8080/x')).toBeUndefined()
  expect(findLocalUrl('nothing here')).toBeUndefined()
})

test('a snapshot is an SVG holding the JPEG', () => {
  const svg = thumbSvg('QUJD', 300, 188)
  expect(svg).toContain('data:image/jpeg;base64,QUJD')
  expect(svg).not.toContain('<script')
})

test('a dev server is found, snapshotted after an edit and shown in the tile; the toggle switches to the browser pane', async ($, on) => {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  const runs: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', (_, e) => ({ value: e.as === 'bytes' ? { base64: 'QUJD' } : 'one\ntwo\nb\nc' }))
  on('process.run', (_, e) => {
    runs.push(e.argv[0]!)
    return { value: { exitCode: 0, stdout: '/tmp/live-view-snaps\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', (_, e) => ({ result: {}, text: e.tool === 'Bash' ? '  ➜  Local:   http://localhost:5173/' : '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev' })
  await $.tool.call({ tool: 'Edit', file_path: '/web/app.tsx', old_string: 'a', new_string: 'b\nc' })
  await clock.advance(4000)

  expect(runs).toContain(CHROME)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /localhost:5173 · updated/ })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'open-site' })).toBeDefined()

  await ui.press({ key: 'site-pane' })
  expect(await ui.find({ type: 'Text', text: /localhost:5173 · / })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'open-site' })).toBeDefined()
  await ui.unmount()
})
