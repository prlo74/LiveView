// The Live View pane, as an "Agent Control Center": side nav (top tabs when narrow) + Overview / Agents / Activity / Files.
import type { Elements, RenderElement } from 'claude-code'

import type { AgentView, Bucket, Kind, Page, Range, Site, SiteMode, Update } from '../types'
import { CARD, COBALT, DOWN, GLOW, INK, LINE, MUTED, TEXT, UP, barText, deltaLabel, donutSvg, fmt, slices, sparkSvg, sparkText } from './charts'
import type { Slice } from './charts'
import { costByAgent, filesTable, kpis, lanes, rangeStart, tokensByModel, toolMix } from './metrics'
import type { Kpi, Lane, Part } from './metrics'
import { attentionOf, toCode, viewLines } from './lib'
import { ago } from './narrate'
import { THUMB_RATIO, thumbSvg } from './site'

export type Els = Elements[keyof Elements]

/** Everything a page needs: the drawing's elements and sizes, the stored state, and the actions its buttons call. */
export type DashCtx = {
  els: Els
  surface: keyof Elements
  /** Columns the pane body has. */
  cols: number
  /** Rows the viewport has. */
  rows: number
  now: number
  page: Page
  range: Range
  agents: Record<string, AgentView>
  series: Bucket[]
  /** The agent id in focus on the Agents page, '' for the grid. */
  focused: string
  director: boolean
  /** Local dev servers by URL, with their latest snapshots. */
  sites: Record<string, Site>
  siteMode: SiteMode
  actions: {
    setPage: (p: Page) => unknown
    setRange: (r: Range) => unknown
    focus: (id: string) => unknown
    back: () => unknown
    toggleDirector: () => unknown
    openTranscript: (id: string) => unknown
    /** Opens the wide org-chart pane. */
    openTeam: () => unknown
    /** Opens the Agent Web in a window of its own. */
    openWeb: () => unknown
    setSiteMode: (m: SiteMode) => unknown
    /** Opens a site in the app's browser pane (or copies its address where there is none). */
    openSite: (url: string) => unknown
  }
  /** The animated live screen (a `Client`) where the surface draws one; undefined elsewhere. */
  screenOf: (a: AgentView, rows: number, width: number, key: string) => RenderElement | undefined
}

export const MAIN = 'main'
const STATUS_COLOR = { working: 'claude', idle: 'subtle', done: 'success' } as const
const KIND_VERB: Record<Kind, string> = {
  edit: 'Editing',
  read: 'Reading',
  browse: 'Browsing',
  run: 'Running',
  search: 'Searching',
  agent: 'Delegating',
  other: 'Using',
}
export const KIND_COLOR: Record<Kind, string> = { edit: UP, run: '#FFB547', browse: GLOW, read: MUTED, search: MUTED, agent: '#B37BFF', other: LINE }
const NAV: [Page, string][] = [['overview', 'Overview'], ['team', 'Team'], ['agents', 'Agents'], ['activity', 'Activity'], ['files', 'Files']]
const RANGES: [Range, string][] = [['session', 'This session'], ['15m', 'Last 15 min'], ['1h', 'Last hour']]
const EMPTY = 'No agent activity yet. It shows up here as soon as a tool runs.'
/** Rough CSS px per terminal cell, for sizing Svg on remote surfaces. */
const PX = 7

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text)
const base = (path: string) => path.split('/').pop() || path
const dir = (path: string) => path.slice(0, Math.max(0, path.length - base(path).length - 1))
const clock = (ms: number) => {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}
const sorted = (agents: Record<string, AgentView>) =>
  Object.values(agents).sort((x, y) => (x.id === MAIN ? -1 : y.id === MAIN ? 1 : 0))

export function nowLine(a: AgentView, now?: number): string {
  const att = now === undefined ? undefined : attentionOf(a, now)
  if (att) return `⚠ ${att.short} · ${att.text}`
  const cur = [...a.steps].reverse().find(s => !s.isDone)
  if (cur) return `${KIND_VERB[cur.kind]} ${cur.kind === 'edit' || cur.kind === 'read' ? base(cur.target) : cur.target || cur.tool}`
  return a.status === 'done' ? 'Finished' : a.status === 'idle' ? 'Waiting for you' : 'Thinking…'
}

/** Width the page content gets, after the nav column. */
const contentCols = (ctx: DashCtx) => (ctx.cols >= 100 ? ctx.cols - 20 : ctx.cols)

/** The pane: banner (when empty), nav, header, then the page. */
export function renderDashboard(ctx: DashCtx): RenderElement {
  const { Box, Text, Button } = ctx.els
  const { actions } = ctx
  const isWide = ctx.cols >= 100
  const isEmpty = Object.keys(ctx.agents).length === 0
  // A focused agent wins on every page, so director cuts land even from Overview.
  const page = ctx.focused && ctx.agents[ctx.focused] ? 'agents' : ctx.page
  const go = (p: Page) => {
    if (ctx.focused) actions.back()
    actions.setPage(p)
  }
  const pill = (key: string, label: string, isOn: boolean, onPress: () => unknown) => (
    <Box key={`${key}-box`} backgroundColor={isOn ? COBALT : undefined} paddingX={1}>
      <Button key={key} plain onPress={() => void onPress()}>
        <Text color={isOn ? INK : MUTED} weight={isOn ? 'semibold' : 'regular'}>{label}</Text>
      </Button>
    </Box>
  )
  const navItems = NAV.map(([p, label]) => pill(`nav-${p}`, label, p === page, () => go(p)))

  const header = (
    <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" gap={1}>
      <Box flexDirection="column">
        <Text size="title" weight="bold" color={TEXT}>Agent Control Center</Text>
        <Text color={MUTED}>Monitor your Claude agents live</Text>
      </Box>
      <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
        <Box flexDirection="row" borderStyle="round" borderColor={LINE}>
          {RANGES.map(([r, label]) => pill(`range-${r}`, label, r === ctx.range, () => actions.setRange(r)))}
        </Box>
        <Button key="open-web" variant="primary" onPress={() => actions.openWeb()}>
          ⧉ Agent Web
        </Button>
        <Button key="director" onPress={() => actions.toggleDirector()}>
          {ctx.director ? '◉ Director on' : '○ Director off'}
        </Button>
      </Box>
      {siteControls(ctx, pill)}
    </Box>
  )

  const body =
    page === 'agents' ? agentsPage(ctx) : page === 'team' ? teamPage(ctx, contentCols(ctx), true) : page === 'activity' ? activityPage(ctx) : page === 'files' ? filesPage(ctx) : overviewPage(ctx)

  const content = (
    <Box flexDirection="column" gap={1} flexGrow={1} width={isWide ? contentCols(ctx) : undefined}>
      {!isWide && <Box flexDirection="row" flexWrap="wrap" gap={1}>{navItems}</Box>}
      {header}
      {body}
    </Box>
  )

  return (
    <Box flexDirection="column" backgroundColor={INK} gap={1}>
      {isEmpty && (
        <Box borderStyle="round" borderColor={LINE} backgroundColor={CARD} paddingX={1}>
          <Text color={MUTED}>{EMPTY}</Text>
        </Box>
      )}
      {isWide ? (
        <Box flexDirection="row" gap={1}>
          <Box flexDirection="column" width={18} borderStyle="single" borderColor={LINE} backgroundColor={CARD} paddingX={1} gap={1}>
            <Text color={COBALT} weight="bold">◆ Live View</Text>
            <Box flexDirection="column">{navItems}</Box>
          </Box>
          {content}
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text color={COBALT} weight="bold">◆ Live View</Text>
          {content}
        </Box>
      )}
    </Box>
  )
}

// ---------- Overview ----------

const KPI_FMT: Record<Kpi['key'], (n: number) => string> = {
  agents: fmt.num,
  active: fmt.num,
  calls: fmt.num,
  tokens: fmt.num,
  cost: fmt.usd,
  errorRate: fmt.pct,
  avgStep: fmt.ms,
  lines: fmt.num,
}

function overviewPage(ctx: DashCtx): RenderElement {
  const { Box, Text } = ctx.els
  const w = contentCols(ctx)
  const perRow = ctx.cols >= 100 ? 4 : 2
  const cardW = Math.max(16, Math.floor((w - (perRow - 1)) / perRow))
  const since = rangeStart(ctx.range, ctx.now, ctx.agents)
  const list = sorted(ctx.agents)
  const tileW = w >= 70 ? Math.floor((w - 1) / 2) : w
  const donutW = w >= 90 ? Math.floor((w - 2) / 3) : w
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {kpis(ctx.agents, ctx.series, ctx.range, ctx.now).map(k => kpiCard(ctx, k, cardW))}
      </Box>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {donutCard(ctx, 'Cost by agent', costByAgent(ctx.agents), fmt.usd, n => `${fmt.usd(n)} est. total`, donutW)}
        {donutCard(ctx, 'Tool mix', toolMix(ctx.agents, since), fmt.num, n => `${fmt.num(n)} calls`, donutW)}
        {donutCard(ctx, 'Tokens by model', tokensByModel(ctx.agents), fmt.num, n => `${fmt.num(n)} tokens`, donutW)}
      </Box>
      {list.length > 0 && (
        <Box flexDirection="column" gap={1}>
          <Text weight="bold" color={TEXT}>Live agents</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {list.map(a =>
              tile(ctx, a, tileW, 6, () => {
                ctx.actions.setPage('agents')
                ctx.actions.focus(a.id)
              }),
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}

function kpiCard(ctx: DashCtx, k: Kpi, width: number): RenderElement {
  const { Box, Text } = ctx.els
  const Svg = 'Svg' in ctx.els ? ctx.els.Svg : undefined
  const d = deltaLabel(k.value, k.prev)
  const isBadUp = k.key === 'errorRate' || k.key === 'avgStep'
  const tone = d.tone === 'flat' ? MUTED : (d.tone === 'up') !== isBadUp ? UP : DOWN
  const label = k.key === 'cost' ? 'EST. COST' : k.label.toUpperCase()
  const sparkW = Math.max(8, width - 4)
  return (
    <Box key={`kpi-${k.key}`} width={width} flexDirection="column" borderStyle="round" borderColor={LINE} backgroundColor={CARD} paddingX={1}>
      <Text size="caption" color={MUTED}>{label}</Text>
      <Text size="heading" weight="bold" color={TEXT}>{KPI_FMT[k.key](k.value)}</Text>
      {Svg ? (
        <Svg source={sparkSvg(k.spark, { width: sparkW * PX, height: 24, color: COBALT })} alt={`${label} trend`} height={24} />
      ) : (
        <Text color={COBALT}>{sparkText(k.spark.slice(-sparkW))}</Text>
      )}
      <Text>
        <Text color={tone}>{d.text}</Text>
        {k.key === 'active' && <Text color={k.value > 0 ? UP : MUTED}>{k.value > 0 ? '  ● Online' : '  ○ Idle'}</Text>}
      </Text>
    </Box>
  )
}

function donutCard(ctx: DashCtx, title: string, parts: Part[], money: (n: number) => string, subtitle: (n: number) => string, width: number): RenderElement {
  const { Box, Text } = ctx.els
  const Svg = 'Svg' in ctx.els ? ctx.els.Svg : undefined
  const sl: Slice[] = slices(parts).slice(0, 8)
  const total = sl.reduce((n, s) => n + s.value, 0)
  return (
    <Box key={`donut-${title}`} width={width} flexDirection="column" borderStyle="round" borderColor={LINE} backgroundColor={CARD} paddingX={1}>
      <Text weight="bold" color={TEXT}>{title}</Text>
      <Text size="caption" color={MUTED}>{subtitle(total)}</Text>
      {sl.length === 0 ? (
        <Text color={MUTED}>No data yet</Text>
      ) : (
        <Box flexDirection="column">
          {Svg ? (
            <Svg source={donutSvg(sl, 110)} alt={`${title}: ${sl.map(s => `${s.label} ${money(s.value)}`).join(', ')}`} width={110} height={110} />
          ) : (
            barText(sl, Math.max(6, Math.min(20, width - 24))).map((line, i) => <Text color={sl[i]?.color ?? MUTED}>{line}</Text>)
          )}
          {sl.map(s => (
            <Text>
              <Text color={s.color}>● </Text>
              <Text color={TEXT}>{short(s.label, Math.max(6, width - 22))} </Text>
              <Text color={MUTED}>{money(s.value)} · {fmt.pct(total ? s.value / total : 0)}</Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

// ---------- Agents ----------

/** Surfaces without a Client (VS Code, mobile) get the screen drawn still, with the last event as a chip. */
function stillScreen(ctx: DashCtx, a: AgentView, rows: number, width: number): RenderElement {
  const { Box, Text, Code, Markdown } = ctx.els
  const s = a.screen
  if (!s) return <Text dimColor>Nothing opened yet.</Text>
  const name = s.kind === 'terminal' ? 'Terminal' : s.kind === 'browser' ? 'Browser' : 'Editor'
  const code = toCode(viewLines(s, rows), s.kind === 'file')
  const tone = a.fx?.kind === 'add' || a.fx?.kind === 'pass' ? 'success' : a.fx?.kind === 'cut' || a.fx?.kind === 'fail' || a.fx?.kind === 'error' ? 'error' : 'subtle'
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={tone} paddingX={1}>
      <Text dimColor>
        {name} · {short(s.title, Math.max(8, width - 14))} {a.fx?.label ?? ''}
      </Text>
      {s.kind === 'browser' ? (
        <Markdown text={(s.markdown ?? '').slice(0, rows * Math.max(20, width - 4))} />
      ) : (
        <Code source={code.source} format={code.format} startLine={code.startLine} language={s.language} wrap="truncate-end" />
      )}
    </Box>
  )
}
const screen = (ctx: DashCtx, a: AgentView, rows: number, width: number, key: string) => {
  const live = ctx.screenOf(a, rows, width, key) ?? stillScreen(ctx, a, rows, width)
  const thumb = siteThumb(ctx, a, width)
  return thumb ? <ctx.els.Box flexDirection="column">{live}{thumb}</ctx.els.Box> : live
}

function tile(ctx: DashCtx, a: AgentView, tileW: number, rows: number, onOpen: () => void): RenderElement {
  const { Box, Text, Button } = ctx.els
  return (
    <Box key={`tile-${a.id}`} width={tileW} flexDirection="column" borderStyle="round" borderColor={LINE} backgroundColor={CARD} paddingX={1}>
      <Button key={`open-${a.id}`} plain onPress={() => onOpen()}>
        <Text weight="bold" color={TEXT}>{short(a.label, tileW - 16)}</Text> <Text color={STATUS_COLOR[a.status]}>● {a.status}</Text>
      </Button>
      <Text color={GLOW}>{short(nowLine(a, ctx.now), tileW - 4)}</Text>
      {screen(ctx, a, rows, tileW - 4, `tile-${a.id}`)}
    </Box>
  )
}

/** The live screens: a grid of tiles, or one agent in focus. The director toggle lives in the dashboard header. */
export function agentsPage(ctx: DashCtx): RenderElement {
  const { Box, Text, Button } = ctx.els
  const { agents, actions } = ctx
  const cols = contentCols(ctx)
  const list = sorted(agents)

  if (list.length === 0) return <Text dimColor>{EMPTY}</Text>

  const agent = ctx.focused ? agents[ctx.focused] : undefined
  if (agent) {
    const rows = Math.max(12, ctx.rows - 16)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
          <Button key="back" onPress={() => actions.back()}>← All agents</Button>
          <Text weight="bold" color={TEXT}>{agent.label}</Text>
          <Text color={STATUS_COLOR[agent.status]}>● {agent.status}</Text>
          {ctx.director && <Text color={COBALT}>◉ director</Text>}
          {agent.id !== MAIN && (
            <Button key="transcript" onPress={() => actions.openTranscript(agent.id)}>Open transcript</Button>
          )}
        </Box>
        <Text color={GLOW}>{short(nowLine(agent, ctx.now), cols * 2)}</Text>
        {screen(ctx, agent, rows, cols, `focus-${agent.id}`)}
        <Box flexDirection="column">
          <Text color={MUTED}>Recent steps</Text>
          {[...agent.steps].reverse().slice(0, 6).map(s => (
            <Text dimColor={s.isDone} color={s.isError ? DOWN : undefined}>
              {clock(s.at)} {s.isDone ? (s.isError ? '✗' : '✓') : '…'} {s.tool} {short(s.target, Math.max(10, cols - 24))}
            </Text>
          ))}
        </Box>
        {agent.files.length > 0 && (
          <Text dimColor>
            Files: {agent.files.slice(0, 6).map(f => `${base(f.path)}${f.isEdited ? ` +${f.adds} −${f.dels}` : ''}`).join(' · ')}
          </Text>
        )}
      </Box>
    )
  }

  const tileW = cols >= 70 ? Math.floor((cols - 1) / 2) : cols
  const summary = (['working', 'idle', 'done'] as const).map(st => `${list.filter(a => a.status === st).length} ${st}`).join(' · ')
  return (
    <Box flexDirection="column" gap={1}>
      <Text color={MUTED}>
        <Text color={UP}>● LIVE</Text> · {list.length} agent{list.length === 1 ? '' : 's'} · {summary}
      </Text>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {list.map(a => tile(ctx, a, tileW, 9, () => actions.focus(a.id)))}
      </Box>
      <Text color={MUTED}>Click an agent's name to watch its screen. Director mode cuts to whoever just did something big.</Text>
    </Box>
  )
}

// ---------- Activity ----------

/** One lane's blocks as an SVG strip, `w`×`h` px over [since, now]. */
export function laneSvg(lane: Lane, since: number, now: number, w: number, h = 14): string {
  const span = Math.max(1, now - since)
  const rects = lane.blocks.map(b => {
    const x = ((Math.max(b.start, since) - since) / span) * w
    const bw = Math.max(2, ((Math.min(b.end, now) - Math.max(b.start, since)) / span) * w)
    const c = b.isError ? DOWN : KIND_COLOR[b.kind]
    return `<rect x="${x.toFixed(1)}" y="1" width="${bw.toFixed(1)}" height="${h - 2}" rx="2" fill="${c}"/>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="3" fill="${CARD}" stroke="${LINE}"/>${rects.join('')}</svg>`
}

/** One lane as `cells` text cells: the colour of the block covering each cell, or '' for none. */
export function laneCells(lane: Lane, since: number, now: number, cells: number): string[] {
  const span = Math.max(1, now - since)
  return Array.from({ length: cells }, (_, i) => {
    const a = since + (span * i) / cells
    const z = since + (span * (i + 1)) / cells
    const b = [...lane.blocks].reverse().find(x => x.start < z && x.end >= a)
    return b ? (b.isError ? DOWN : KIND_COLOR[b.kind]) : ''
  })
}

/** Consecutive equal cells as [value, count] runs, so a strip is a few Text spans, not one per cell. */
function runs(cells: string[]): [string, number][] {
  const out: [string, number][] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last[0] === c) last[1]++
    else out.push([c, 1])
  }
  return out
}

function activityPage(ctx: DashCtx): RenderElement {
  const { Box, Text } = ctx.els
  const Svg = 'Svg' in ctx.els ? ctx.els.Svg : undefined
  const w = contentCols(ctx)
  let since = rangeStart(ctx.range, ctx.now, ctx.agents)
  if (!(since > 0 && since < ctx.now)) since = ctx.now - 15 * 60_000
  const ls = lanes(ctx.agents, since, ctx.now)
  const labelW = Math.min(18, Math.max(8, Math.floor(w / 5)))
  const cells = Math.max(10, w - labelW - 4)
  const legend: [string, string][] = [['edit', UP], ['run', '#FFB547'], ['browse', GLOW], ['read/search', MUTED], ['agent', '#B37BFF'], ['error', DOWN]]
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={LINE} backgroundColor={CARD} paddingX={1} gap={1}>
      <Text weight="bold" color={TEXT}>Activity timeline</Text>
      {ls.length === 0 ? (
        <Text color={MUTED}>No activity in this range yet</Text>
      ) : (
        <Box flexDirection="column">
          {ls.map(l => (
            <Box key={`lane-${l.id}`} flexDirection="row" gap={1} alignItems="center">
              <Box width={labelW}>
                <Text color={TEXT}>
                  <Text color={STATUS_COLOR[l.status]}>● </Text>
                  {short(l.label, labelW - 2)}
                </Text>
              </Box>
              {Svg ? (
                <Svg source={laneSvg(l, since, ctx.now, cells * PX)} alt={`${l.label}: ${l.blocks.length} steps`} height={14} />
              ) : (
                <Text>{runs(laneCells(l, since, ctx.now, cells)).map(([c, n]) => <Text color={c || LINE}>{(c ? '█' : '·').repeat(n)}</Text>)}</Text>
              )}
            </Box>
          ))}
          <Box flexDirection="row" gap={1}>
            <Box width={labelW}><Text> </Text></Box>
            <Box flexDirection="row" justifyContent="space-between" width={cells}>
              <Text size="caption" color={MUTED}>{clock(since)}</Text>
              <Text size="caption" color={MUTED}>now</Text>
            </Box>
          </Box>
        </Box>
      )}
      <Text>
        {legend.map(([label, c]) => (
          <Text>
            <Text color={c}>■ </Text>
            <Text color={MUTED}>{label}  </Text>
          </Text>
        ))}
      </Text>
    </Box>
  )
}

// ---------- Files ----------

function filesPage(ctx: DashCtx): RenderElement {
  const { Box, Text } = ctx.els
  const w = contentCols(ctx)
  const rows = filesTable(ctx.agents).slice(0, 60)
  const fileW = Math.max(14, w - 40)
  const label = (id: string) => ctx.agents[id]?.label ?? id
  const row = (key: string, cells: [RenderElement, number][]) => (
    <Box key={key} flexDirection="row" gap={1}>
      {cells.map(([c, cw]) => <Box width={cw}>{c}</Box>)}
    </Box>
  )
  const head = (t: string) => <Text size="caption" color={MUTED}>{t}</Text>
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={LINE} backgroundColor={CARD} paddingX={1}>
      <Text weight="bold" color={TEXT}>Files touched</Text>
      {rows.length === 0 ? (
        <Text color={MUTED}>No files touched yet</Text>
      ) : (
        <Box flexDirection="column">
          {row('files-head', [[head('FILE'), fileW], [head('AGENT'), 14], [head('+'), 6], [head('−'), 6], [head('KIND'), 7]])}
          {rows.map(f =>
            row(`file-${f.agent}-${f.path}`, [
              [
                <Text color={TEXT}>
                  {short(base(f.path), fileW)}
                  <Text color={MUTED}> {short(dir(f.path), Math.max(1, fileW - base(f.path).length - 1))}</Text>
                </Text>,
                fileW,
              ],
              [<Text color={MUTED}>{short(label(f.agent), 14)}</Text>, 14],
              [<Text color={f.adds ? UP : MUTED}>+{f.adds}</Text>, 6],
              [<Text color={f.dels ? DOWN : MUTED}>−{f.dels}</Text>, 6],
              [<Text color={f.isEdited ? GLOW : MUTED}>{f.isEdited ? 'edited' : 'read'}</Text>, 7],
            ]),
          )}
        </Box>
      )}
    </Box>
  )
}

// ---------- Team: every agent at once, as an org chart ----------

const TONE_COLOR: Record<Update['tone'], string> = { add: UP, cut: DOWN, pass: UP, fail: DOWN, error: DOWN, info: MUTED }
const NODE_COLOR = { working: COBALT, idle: MUTED, done: UP } as const
const BRANCH = '#3A4560'
const NBSP = ' '
const CARD_MIN = 26
const CARD_MAX = 38

/** Who reports to whom: the main agent on top, each agent under the one that spawned it (the main agent when unknown). */
export function teamTree(agents: Record<string, AgentView>): { roots: AgentView[]; kids: Map<string, AgentView[]> } {
  const all = sorted(agents)
  const ids = new Set(all.map(a => a.id))
  const kids = new Map<string, AgentView[]>()
  const roots: AgentView[] = []
  for (const a of all) {
    const parent = a.id === MAIN ? undefined : a.parentId && ids.has(a.parentId) && a.parentId !== a.id ? a.parentId : ids.has(MAIN) ? MAIN : undefined
    if (parent) kids.set(parent, [...(kids.get(parent) ?? []), a])
    else roots.push(a)
  }
  return { roots, kids }
}

/** The branch row under a card: a bar from the parent's centre `p` out to each child's centre, `width` cells wide. */
export function branchLine(width: number, centers: number[], p: number): string {
  const ch = new Array<string>(Math.max(0, width)).fill(NBSP)
  if (centers.length === 0 || width <= 0) return ch.join('')
  const first = centers[0]!
  const last = centers[centers.length - 1]!
  const lo = Math.min(p, first)
  const hi = Math.min(width - 1, Math.max(p, last))
  for (let x = lo; x <= hi; x++) ch[x] = '─'
  for (const c of centers) if (c < width) ch[c] = '┬'
  if (first < p) ch[first] = '┌'
  if (last > p && last < width) ch[last] = '┐'
  if (p < width) ch[p] = centers.length === 1 && first === p ? '│' : centers.includes(p) ? '┼' : '┴'
  return ch.join('')
}

const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/** The org chart, `width` columns wide; `canExpand` adds the button that opens it in its own wide pane. */
export function teamPage(ctx: DashCtx, width: number, canExpand: boolean): RenderElement {
  const { Box, Text, Button } = ctx.els
  const { actions, now } = ctx
  const { roots, kids } = teamTree(ctx.agents)
  const all = Object.values(ctx.agents)
  const working = all.filter(a => a.status === 'working').length

  const node = (a: AgentView, w: number) => {
    const running = a.steps.some(s => !s.isDone)
    const latest = a.updates[a.updates.length - 1]
    const att = attentionOf(a, now)
    const headline = att ? nowLine(a, now) : running ? `${nowLine(a)}…` : latest?.text ?? nowLine(a)
    const tone = att ? (att.kind === 'wait' ? GLOW : DOWN) : running ? GLOW : latest ? TONE_COLOR[latest.tone] : MUTED
    const earlier = a.updates.slice(running ? -3 : -4, running ? undefined : -1).reverse()
    return (
      <Box key={`node-${a.id}`} width={w} flexDirection="column" borderStyle="round" borderColor={NODE_COLOR[a.status]} backgroundColor={CARD} paddingX={1}>
        <Button key={`team-open-${a.id}`} plain onPress={() => { actions.setPage('agents'); actions.focus(a.id) }}>
          <Text weight="bold" color={TEXT}>{short(a.label, Math.max(6, w - 14))}</Text> <Text color={NODE_COLOR[a.status]}>● {a.status}</Text>
        </Button>
        <Text color={tone}>{short(headline, Math.max(10, (w - 4) * 2))}</Text>
        {earlier.map(u => (
          <Text color={MUTED}>
            {ago(now, u.at)} · {short(u.text, Math.max(8, w - 10))}
          </Text>
        ))}
        <Text color={MUTED} size="caption">
          {a.calls} steps · {a.linesChanged} lines · {fmt.usd(a.costUsd)} est.
        </Text>
      </Box>
    )
  }

  const subtree = (a: AgentView, w: number, depth: number): RenderElement => {
    const children = kids.get(a.id) ?? []
    const cardW = Math.max(Math.min(w, CARD_MIN), Math.min(w, CARD_MAX))
    const head = (
      <Box flexDirection="row" justifyContent="center" width={w}>
        {node(a, cardW)}
      </Box>
    )
    if (children.length === 0 || depth >= 4) {
      return <Box key={`sub-${a.id}`} flexDirection="column" width={w}>{head}</Box>
    }
    const perRow = Math.max(1, Math.min(children.length, Math.floor((w + 1) / (CARD_MIN + 1))))
    const p = Math.floor(w / 2)
    return (
      <Box key={`sub-${a.id}`} flexDirection="column" width={w}>
        {head}
        {chunk(children, perRow).map((row, ri) => {
          const cw = Math.floor((w - (row.length - 1)) / row.length)
          const centers = row.map((_, i) => i * (cw + 1) + Math.floor(cw / 2))
          return (
            <Box key={`row-${a.id}-${ri}`} flexDirection="column">
              <Text mono color={BRANCH}>{branchLine(w, centers, p)}</Text>
              <Box flexDirection="row" gap={1}>{row.map(c => subtree(c, cw, depth + 1))}</Box>
            </Box>
          )
        })}
        {depth === 0 && (
          <Box flexDirection="row" justifyContent="center" width={w}>
            <Text color={MUTED} size="caption">└ workers · {children.length} ┘</Text>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" gap={1}>
        <Text color={MUTED}>
          {all.length} agent{all.length === 1 ? '' : 's'} · {working} working · newest update first on each card
        </Text>
        {canExpand && (
          <Button key="team-expand" onPress={() => actions.openTeam()}>⤢ Expand</Button>
        )}
      </Box>
      {all.length === 0 ? <Text color={MUTED}>{EMPTY}</Text> : roots.map(r => subtree(r, width, 0))}
    </Box>
  )
}

/** The wide pane: the org chart alone, on the dark ground. */
export function renderTeam(ctx: DashCtx): RenderElement {
  const { Box, Text } = ctx.els
  return (
    <Box flexDirection="column" backgroundColor={INK} gap={1}>
      <Text color={COBALT} weight="bold">◆ Agent team</Text>
      {teamPage(ctx, Math.max(CARD_MIN, ctx.cols - 1), false)}
    </Box>
  )
}

// ---------- The site being built ----------

const SITE_MODES: [SiteMode, string][] = [['tiles', 'Snapshots'], ['pane', 'Browser pane']]

/** The newest local dev server any agent started; undefined before one is seen. */
export function latestSiteUrl(sites: Record<string, Site>): string | undefined {
  return Object.values(sites).sort((x, y) => y.foundAt - x.foundAt)[0]?.url
}

/** The header row: where the site shows (snapshots in tiles, or the app's browser pane), and a button to open it. */
function siteControls(ctx: DashCtx, pill: (key: string, label: string, isOn: boolean, onPress: () => unknown) => RenderElement): RenderElement {
  const { Box, Text, Button } = ctx.els
  const url = latestSiteUrl(ctx.sites)
  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
      <Text color={MUTED}>Site</Text>
      <Box flexDirection="row" borderStyle="round" borderColor={LINE}>
        {SITE_MODES.map(([m, label]) => pill(`site-${m}`, label, m === ctx.siteMode, () => ctx.actions.setSiteMode(m)))}
      </Box>
      {url ? (
        <Button key="open-site" variant={ctx.siteMode === 'pane' ? 'primary' : 'secondary'} onPress={() => ctx.actions.openSite(url)}>
          ↗ Open {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </Button>
      ) : (
        <Text color={MUTED}>no dev server yet</Text>
      )}
    </Box>
  )
}

/** The latest snapshot of the site this agent works on, under its screen; nothing in browser-pane mode or before a site is known. */
function siteThumb(ctx: DashCtx, a: AgentView, width: number): RenderElement | undefined {
  const site = a.siteUrl ? ctx.sites[a.siteUrl] : undefined
  if (!site || ctx.siteMode !== 'tiles') return undefined
  const { Box, Text } = ctx.els
  const host = site.url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const state = site.isTaking
    ? 'updating…'
    : site.error
      ? site.error
      : site.at
        ? `updated ${ago(ctx.now, site.at)} ago`
        : 'first snapshot coming…'
  const alt = `Snapshot of ${host}`
  const cols = Math.max(10, width)
  let picture: RenderElement | undefined
  if (site.jpeg && 'Svg' in ctx.els) {
    const wPx = cols * PX
    const hPx = Math.round(wPx * THUMB_RATIO)
    picture = <ctx.els.Svg source={thumbSvg(site.jpeg, wPx, hPx)} alt={alt} width={wPx} height={hPx} />
  } else if (site.png && 'Image' in ctx.els) {
    const c = Math.min(255, cols)
    // Terminal cells are about twice as tall as wide.
    picture = <ctx.els.Image key={`snap-${a.id}`} source={{ file: site.png, format: 'png', generation: site.generation }} columns={c} rows={Math.max(3, Math.round((c * THUMB_RATIO) / 2))} alt={alt} />
  }
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={site.error ? DOWN : LINE} paddingX={1}>
      <Text color={site.error ? DOWN : MUTED}>
        ◉ {host} · {state}
      </Text>
      {picture}
    </Box>
  )
}
