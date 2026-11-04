// Pure metric math over the stored state: no `$` here.
import type { AgentView, Bucket, Kind, Range, Usage } from '../types'

const MIN = 60_000
const KEEP = 120
const POINTS = 30

/**
 * USD per million tokens, by model id prefix (Anthropic first-party list prices, cached 2026-10).
 * Older ids fall back to the family entry; every figure here is an estimate.
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-fable': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-mythos': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-opus': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku': { input: 1, output: 5, cacheRead: 0.1 },
  'claude-haiku-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}

/** Estimated cost of `usage` on `model`; 0 for an unknown model. */
export function costOf(model: string, usage: Usage): number {
  const id = model.replace(/^.*anthropic\./, '') // Bedrock-style ids: "us.anthropic.claude-…"
  let best = ''
  for (const k of Object.keys(PRICES)) if (id.startsWith(k) && k.length > best.length) best = k
  const p = PRICES[best]
  if (!p) return 0
  return (usage.input * p.input + usage.output * p.output + usage.cacheRead * p.cacheRead) / 1e6
}

const minute = (at: number) => Math.floor(at / MIN) * MIN
const empty = (t: number): Bucket => ({ t, calls: 0, errors: 0, tokens: 0, cost: 0, lines: 0, stepMs: 0 })

/** `series` with `delta` added into the minute holding `at`, kept to the last 120 minutes, oldest first. */
export function bump(series: Bucket[], at: number, delta: Partial<Omit<Bucket, 't'>>): Bucket[] {
  const t = minute(at)
  const b = { ...(series.find(x => x.t === t) ?? empty(t)) }
  for (const [k, v] of Object.entries(delta) as [keyof Omit<Bucket, 't'>, number | undefined][]) b[k] += v ?? 0
  const all = [...series.filter(x => x.t !== t), b].sort((x, y) => x.t - y.t)
  const newest = all[all.length - 1]!.t
  return all.filter(x => x.t > newest - KEEP * MIN)
}

/** The earliest time (ms) a range covers. */
export function rangeStart(range: Range, now: number, agents: Record<string, AgentView>): number {
  if (range === '15m') return now - 15 * MIN
  if (range === '1h') return now - 60 * MIN
  const starts = Object.values(agents).map(a => a.startedAt).filter(t => t > 0)
  return starts.length ? Math.min(...starts) : now
}

export type KpiKey = 'agents' | 'active' | 'calls' | 'tokens' | 'cost' | 'errorRate' | 'avgStep' | 'lines'
export type Kpi = {
  key: KpiKey
  label: string
  value: number
  /** One point per minute across the range, for the sparkline. */
  spark: number[]
  /** The same figure over the equally long period before the range; null when there is none. */
  prev: number | null
}

type Sums = Omit<Bucket, 't'>
const sum = (bs: Bucket[]): Sums =>
  bs.reduce<Sums>(
    (s, b) => ({
      calls: s.calls + b.calls,
      errors: s.errors + b.errors,
      tokens: s.tokens + b.tokens,
      cost: s.cost + b.cost,
      lines: s.lines + b.lines,
      stepMs: s.stepMs + b.stepMs,
    }),
    { calls: 0, errors: 0, tokens: 0, cost: 0, lines: 0, stepMs: 0 },
  )

const FIGURES: { key: Exclude<KpiKey, 'agents' | 'active'>; label: string; of: (s: Sums) => number }[] = [
  { key: 'calls', label: 'Tool calls', of: s => s.calls },
  { key: 'tokens', label: 'Tokens', of: s => s.tokens },
  { key: 'cost', label: 'Cost (est.)', of: s => s.cost },
  { key: 'errorRate', label: 'Error rate', of: s => (s.calls ? s.errors / s.calls : 0) },
  { key: 'avgStep', label: 'Avg step', of: s => (s.calls ? s.stepMs / s.calls : 0) },
  { key: 'lines', label: 'Lines changed', of: s => s.lines },
]

/** The eight KPI cards, in display order. */
export function kpis(agents: Record<string, AgentView>, series: Bucket[], range: Range, now: number): Kpi[] {
  const start = rangeStart(range, now, agents)
  const from = minute(start)
  const len = now - start
  const inRange = series.filter(b => b.t >= from && b.t <= now)
  const before =
    range === 'session' || !series.some(b => b.t < from) ? null : series.filter(b => b.t >= minute(start - len) && b.t < from)

  // Minutes across the range, grouped into at most 30 bins; empty minutes count as zero.
  const minutes = Math.floor((minute(now) - from) / MIN) + 1
  const per = Math.ceil(minutes / POINTS)
  const bins: Bucket[][] = Array.from({ length: Math.ceil(minutes / per) }, () => [])
  for (const b of inRange) bins[Math.min(bins.length - 1, Math.floor((b.t - from) / MIN / per))]!.push(b)
  const binSums = bins.map(sum)

  const all = Object.values(agents)
  const active = all.filter(a => a.status === 'working').length
  const total = sum(inRange)
  return [
    { key: 'agents', label: 'Agents', value: all.length, spark: bins.map(() => all.length), prev: null },
    { key: 'active', label: 'Active', value: active, spark: bins.map(() => active), prev: null },
    ...FIGURES.map(f => ({ key: f.key, label: f.label, value: f.of(total), spark: binSums.map(f.of), prev: before && f.of(sum(before)) })),
  ]
}

export type Part = { label: string; value: number }

const parts = (m: Map<string, number>): Part[] =>
  [...m].filter(([, v]) => v > 0).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

export function costByAgent(agents: Record<string, AgentView>): Part[] {
  const m = new Map<string, number>()
  for (const a of Object.values(agents)) add(m, a.label, a.costUsd)
  return parts(m)
}

/** Tool calls by tool name since `since`, largest first. */
export function toolMix(agents: Record<string, AgentView>, since: number): Part[] {
  const m = new Map<string, number>()
  for (const a of Object.values(agents)) {
    // The whole session: the running totals; a window: the recent steps (the last 100 per agent).
    if (since <= a.startedAt) for (const [tool, n] of Object.entries(a.toolMix)) add(m, tool, n)
    else for (const s of a.steps) if (s.at >= since) add(m, s.tool, 1)
  }
  return parts(m)
}

export function tokensByModel(agents: Record<string, AgentView>): Part[] {
  const m = new Map<string, number>()
  // shortcut: an agent's tokens all count under its last model; split per turn if agents switch models.
  for (const a of Object.values(agents)) add(m, a.model ?? 'unknown', a.usage.input + a.usage.output + a.usage.cacheRead)
  return parts(m)
}

export type Lane = {
  id: string
  label: string
  status: AgentView['status']
  blocks: { start: number; end: number; kind: Kind; isError: boolean; tool: string; target: string }[]
}

/** One lane per agent of its steps that overlap [since, now]; a running step ends at `now`. */
export function lanes(agents: Record<string, AgentView>, since: number, now: number): Lane[] {
  return Object.values(agents).map(a => ({
    id: a.id,
    label: a.label,
    status: a.status,
    blocks: a.steps
      .map(s => ({
        start: s.at,
        end: s.endAt ?? (s.isDone ? s.at : now),
        kind: s.kind,
        isError: s.isError === true,
        tool: s.tool,
        target: s.target,
      }))
      .filter(b => b.start <= now && b.end >= since),
  }))
}

export type FileRow = { path: string; agent: string; adds: number; dels: number; isEdited: boolean }

/** Every file any agent touched, edited ones first, then by lines changed. */
export function filesTable(agents: Record<string, AgentView>): FileRow[] {
  return Object.values(agents)
    .flatMap(a => a.files.map(f => ({ path: f.path, agent: a.label, adds: f.adds, dels: f.dels, isEdited: f.isEdited })))
    .sort((x, y) => Number(y.isEdited) - Number(x.isEdited) || y.adds + y.dels - (x.adds + x.dels))
}
