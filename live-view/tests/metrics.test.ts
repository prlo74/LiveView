import { expect, test } from 'claude-code/testing'

import { bump, costOf, filesTable, kpis, lanes } from '../hooks/metrics'
import type { AgentView, Step } from '../types'

const MIN = 60_000
const T0 = 1_700_000_000_000 - (1_700_000_000_000 % MIN)

const agent = (id: string, over: Partial<AgentView> = {}): AgentView => ({
  id,
  label: id,
  status: 'idle',
  steps: [],
  files: [],
  edits: [],
  linesChanged: 0,
  startedAt: T0,
  usage: { input: 0, output: 0, cacheRead: 0 },
  costUsd: 0,
  turns: 0,
  turnMs: 0,
  calls: 0,
  errors: 0,
  stepMs: 0,
  toolMix: {},
  updates: [],
  ...over,
})

test('costOf takes the longest matching prefix and is 0 for unknown models', () => {
  const u = { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000 }
  expect(Math.round((costOf('claude-opus-5-5', u)) * 1e6) / 1e6).toBe(24.2)
  expect(Math.round((costOf('claude-opus-4-8', u)) * 1e6) / 1e6).toBe(30.5)
  expect(Math.round((costOf('us.anthropic.claude-sonnet-5-5', u)) * 1e6) / 1e6).toBe(12.2)
  expect(costOf('gpt-x', u)).toBe(0)
})

test('bump adds within a minute, opens a new one on rollover, keeps 120', () => {
  let s = bump([], T0 + 5_000, { calls: 1 })
  s = bump(s, T0 + 50_000, { calls: 2, errors: 1 })
  expect(s).toEqual([{ t: T0, calls: 3, errors: 1, tokens: 0, cost: 0, lines: 0, stepMs: 0 }])
  s = bump(s, T0 + MIN, { lines: 4 })
  expect(s.map(b => b.t)).toEqual([T0, T0 + MIN])
  for (let i = 2; i < 130; i++) s = bump(s, T0 + i * MIN, { calls: 1 })
  expect(s.length).toBe(120)
  expect(s[0]!.t).toBe(T0 + 10 * MIN)
  expect(s[119]!.t).toBe(T0 + 129 * MIN)
})

test('kpis gives eight cards with range values, sparks and prev', () => {
  const now = T0 + 29 * MIN + 30_000
  const agents = { a: agent('a', { status: 'working' }), b: agent('b') }
  let s = bump([], T0 + 2 * MIN, { calls: 4, errors: 1, stepMs: 400, tokens: 100 })
  s = bump(s, T0 + 20 * MIN, { calls: 6, stepMs: 600, lines: 10, cost: 0.5 })

  const all = kpis(agents, s, 'session', now)
  expect(all.map(k => k.key)).toEqual(['agents', 'active', 'calls', 'tokens', 'cost', 'errorRate', 'avgStep', 'lines'])
  const by = Object.fromEntries(all.map(k => [k.key, k]))
  expect(by.agents!.value).toBe(2)
  expect(by.active!.value).toBe(1)
  expect(by.calls!.value).toBe(10)
  expect(Math.round((by.errorRate!.value) * 1e6) / 1e6).toBe(0.1)
  expect(by.avgStep!.value).toBe(100)
  expect(by.calls!.spark.length).toBe(30)
  expect(by.calls!.spark[2]).toBe(4)
  expect(by.calls!.prev).toBeNull()

  const last15 = Object.fromEntries(kpis(agents, s, '15m', now).map(k => [k.key, k]))
  expect(last15.calls!.value).toBe(6)
  expect(last15.calls!.prev).toBe(4)
  expect(last15.lines!.value).toBe(10)
  expect(last15.agents!.prev).toBeNull()
  // 1h: 61 minutes in 2-minute bins stays within 30 points; nothing older, so no prev.
  const hour = kpis(agents, s, '1h', now).find(k => k.key === 'calls')!
  expect(hour.spark.length).toBeLessThanOrEqual(31)
  expect(hour.prev).toBeNull()
})

test('lanes clip to the window and end a running step at now', () => {
  const step = (id: string, at: number, over: Partial<Step> = {}): Step =>
    ({ id, at, tool: 'Bash', kind: 'run', target: 'ls', isDone: true, endAt: at + 1000, ...over })
  const now = T0 + 10 * MIN
  const a = agent('a', { steps: [step('old', T0), step('ok', now - 5000, { isError: true }), step('run', now - 2000, { isDone: false, endAt: undefined })] })
  const [lane] = lanes({ a }, now - MIN, now)
  expect(lane!.blocks.length).toBe(2)
  expect(lane!.blocks[0]!.isError).toBe(true)
  expect(lane!.blocks[1]!.end).toBe(now)
})

test('filesTable lists edited files first, then by lines changed', () => {
  const rows = filesTable({
    a: agent('a', { files: [{ path: '/r', adds: 0, dels: 0, isEdited: false }, { path: '/s', adds: 1, dels: 0, isEdited: true }] }),
    b: agent('b', { files: [{ path: '/big', adds: 9, dels: 3, isEdited: true }] }),
  })
  expect(rows.map(r => `${r.agent}:${r.path}`)).toEqual(['b:/big', 'a:/s', 'a:/r'])
})
