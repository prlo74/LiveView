import { expect, test } from 'claude-code/testing'
import type { AgentView } from '../types'
import { siteFiles, taskText } from '../hooks/register'
import { parseListeners, pickPreview, webSnapshot } from '../hooks/web'

const agent = (over: Partial<AgentView>): AgentView => ({
  id: 'main', label: 'Main agent', status: 'working', steps: [], files: [], edits: [], linesChanged: 0, startedAt: 0,
  usage: { input: 0, output: 0, cacheRead: 0 }, costUsd: 0, turns: 0, turnMs: 0, calls: 0, errors: 0, stepMs: 0, toolMix: {}, updates: [], ...over,
})

test('webSnapshot keeps the tree and trims what the page draws', () => {
  const steps = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, at: i, tool: 'Bash', kind: 'run' as const, target: `echo ${'x'.repeat(200)}\nsecond line`, isDone: true }))
  const lines = Array.from({ length: 100 }, (_, i) => ({ no: i + 1, mark: ' ' as const, text: `line ${i}` }))
  const snap = webSnapshot(
    {
      main: agent({ steps, screen: { kind: 'file', title: 'a.ts', lines, focus: 50 } }),
      w1: agent({ id: 'w1', label: 'fix:retro', parentId: 'main', status: 'done' }),
    },
    {},
    [],
    1000,
  )
  expect(snap.agents.length).toBe(2)
  expect(snap.agents[1]!.parentId).toBe('main')
  const main = snap.agents[0]!
  expect(main.steps.length).toBe(14)
  expect(main.steps[0]!.target.includes('second line')).toBe(false)
  expect(main.steps[0]!.target.length <= 90).toBe(true)
  // the screen keeps a window round the focus line, and the focus points into it
  expect(main.screen!.lines.length).toBe(30)
  expect(main.screen!.lines[main.screen!.focus]!.no).toBe(51)
})

test('the task brief reaches the page as one tidy paragraph', () => {
  expect(taskText('  Fix the\n\n  retro   screen ')).toBe('Fix the retro screen')
  expect(taskText('')).toBeUndefined()
  expect(taskText('x'.repeat(900))!.length).toBe(600)
  const snap = webSnapshot({ w1: agent({ id: 'w1', parentId: 'main', task: 'Fix the retro screen' }) }, {}, [], 0)
  expect(snap.agents[0]!.task).toBe('Fix the retro screen')
})

test('the site preview follows the HTML an agent edits, and reloads on edits beside it', () => {
  let a = agent({ id: 'w1', label: 'build:web' })
  a = { ...a, ...siteFiles(a, 'edit', '/p/site/index.html', false, 10) }
  expect(a.htmlFile).toBe('/p/site/index.html')
  a = { ...a, ...siteFiles(a, 'edit', '/p/site/css/app.css', false, 20) }
  expect(a.siteRev).toBe(20)
  a = { ...a, ...siteFiles(a, 'edit', '/p/other/x.css', false, 30) }
  expect(a.siteRev).toBe(20)
  expect(siteFiles(a, 'edit', '/p/site/b.html', true, 40).htmlFile).toBe('/p/site/index.html')

  const p = pickPreview({ w1: { ...a, steps: [{ id: 's', at: 5, tool: 'Edit', kind: 'edit', target: 'x', isDone: true }] } })!
  expect(p.kind).toBe('file')
  expect(p.kind === 'file' && p.root).toBe('/p/site')
  // a dev server wins over plain files
  expect(pickPreview({ w1: { ...a, siteUrl: 'http://localhost:3000/' } })!.kind).toBe('server')
  expect(pickPreview({ main: agent({}) })).toBeUndefined()
})

test('running dev servers are found from lsof, dev ports first, our own port left out', () => {
  const out = ['p1', 'cControlCe', 'n*:7000', 'p2', 'cnode', 'n*:5173', 'n127.0.0.1:9229', 'p3', 'cPython', 'n127.0.0.1:47390', 'p4', 'cnext-server (v15)', 'n*:3000', 'p5', 'cnode', 'n*:80'].join('\n')
  const found = parseListeners(out, [47390])
  expect(found.map(s => s.port)).toEqual([3000, 5173])
  expect(found[0]!.url).toBe('http://localhost:3000/')
  // with no agent site, the first one found is previewed
  expect(pickPreview({ main: agent({}) }, found)!.kind === 'server' && pickPreview({ main: agent({}) }, found)!.url).toBe('http://localhost:3000/')
})
