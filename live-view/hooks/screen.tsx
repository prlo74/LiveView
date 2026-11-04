// The agent's screen as a surface module: it animates on its own frame clock
// (flashes, typewriter, camera scroll, terminal roll-in, particles), so no
// redraw round-trips through the hooks module per frame.
import type { ClientSurface, JsonValue } from 'claude-code'

import type { FxEvent, FxKind, Screen } from '../types'
import { EFFECT_MS, ease, particles, sparkline, toCode, viewLines } from './lib'
import type { Effect } from './lib'

export type ScreenProps = {
  screen: Screen | null
  fx: FxEvent | null
  rows: number
  /** Columns the region is laid out at, until the surface has measured it. */
  width: number
  edits: number[]
  lines: number
}

type State = {
  fxId: string
  fxStart: number
  screenKey: string
  screenStart: number
  linesFrom: number
  linesTo: number
  linesStart: number
  isRunning: boolean
  now: number
}

const FX_MS: Record<FxKind, number> = {
  add: 900,
  cut: 900,
  error: 900,
  pass: 2600,
  fail: 2600,
  spawn: 2000,
  done: 2600,
  search: 1200,
  run: 600,
  browse: 600,
}
const ANIMATE_MS = 2600
const TICK = 50

const keyOf = (s: Screen | null) => (s ? `${s.kind}|${s.title}|${s.lines.length}|${s.focus}|${s.isRunning ? 1 : 0}` : '')
const shownLines = (s: State, t: number) => Math.round(s.linesFrom + (s.linesTo - s.linesFrom) * ease((t - s.linesStart) / 700))
// Time is counted in frame-clock ticks (`now`), so it only moves while something animates.
const isAnimating = (s: State) =>
  s.isRunning || s.now - s.fxStart < ANIMATE_MS || s.now - s.screenStart < 1500 || s.now - s.linesStart < 800

export function effectFor(fx: FxEvent): Effect | undefined {
  if (fx.kind === 'pass' || fx.kind === 'done') return 'confetti'
  if (fx.kind === 'add' && fx.size >= 20) return 'sparks'
  if (fx.kind === 'error' || fx.kind === 'fail' || (fx.kind === 'cut' && fx.size >= 20)) return 'lightning'
  return undefined
}

export default function LiveScreen(raw: JsonValue, surface: ClientSurface<State>) {
  const p = raw as unknown as ScreenProps
  const { Box, Text, Code, Markdown } = surface.elements
  const key = keyOf(p.screen)
  let st = surface.state

  if (!st) {
    // First mount: show what is there without replaying an old effect.
    st = { fxId: p.fx?.id ?? '', fxStart: -ANIMATE_MS, screenKey: key, screenStart: -ANIMATE_MS, linesFrom: p.lines, linesTo: p.lines, linesStart: -ANIMATE_MS, isRunning: !!p.screen?.isRunning, now: 0 }
    surface.every(TICK, () => {
      const s = surface.state
      if (s && isAnimating(s)) surface.setState({ ...s, now: s.now + TICK })
    })
    surface.setState(st)
  } else if ((p.fx && p.fx.id !== st.fxId) || key !== st.screenKey || p.lines !== st.linesTo) {
    const t = st.now
    const next: State = { ...st }
    if (p.fx && p.fx.id !== st.fxId) {
      next.fxId = p.fx.id
      next.fxStart = t
    }
    if (key !== st.screenKey) {
      next.screenKey = key
      next.screenStart = t
      next.isRunning = !!p.screen?.isRunning
    }
    if (p.lines !== st.linesTo) {
      next.linesFrom = shownLines(st, t)
      next.linesTo = p.lines
      next.linesStart = t
    }
    surface.setState(next)
    st = next
  }

  const t = st.now
  const fx = p.fx && p.fx.id === st.fxId ? p.fx : null
  const ft = t - st.fxStart
  const live = fx && ft < FX_MS[fx.kind] ? fx : null
  const sc = p.screen
  const tt = t - st.screenStart
  const rows = Math.max(3, p.rows)
  const blink = Math.floor(t / 260) % 2 === 0

  // Flash: the border and ground pulse green (added) or red (cut, error), then fade.
  let border = sc?.isRunning ? 'claude' : 'subtle'
  let ground: string | undefined
  if (live) {
    const strong = ft < 160
    const soft = ft < 480
    if (live.kind === 'add' || live.kind === 'pass' || live.kind === 'done') {
      border = soft ? 'success' : border
      ground = strong ? 'diffAdded' : soft ? 'diffAddedDimmed' : undefined
    } else if (live.kind === 'cut') {
      border = soft ? 'error' : border
      ground = strong ? 'diffRemoved' : soft ? 'diffRemovedDimmed' : undefined
    } else if (live.kind === 'error' || live.kind === 'fail') {
      const strobe = ft < 520 && Math.floor(ft / 80) % 2 === 0
      border = strobe ? 'error' : ft < 900 ? 'warning' : border
      ground = strobe ? 'diffRemoved' : undefined
    } else if (live.kind === 'spawn') {
      border = Math.floor(ft / 150) % 2 === 0 ? 'claude' : 'suggestion'
    } else if (live.kind === 'search') {
      border = ft < 600 ? 'warning' : border
    }
  }
  const shake = live && (live.kind === 'error' || live.kind === 'fail') && ft < 360 ? [0, 2, 0, 1, 0, 1][Math.floor(ft / 60) % 6]! : 0

  let body
  let name = 'Screen'
  if (!sc) {
    body = <Text dimColor>Nothing opened yet.</Text>
  } else if (sc.kind === 'file') {
    name = 'Editor'
    // Typewriter: added lines type in one by one with a block cursor.
    const plus: number[] = []
    sc.lines.forEach((l, i) => l.mark === '+' && plus.push(i))
    let lines = sc.lines
    if (plus.length > 0 && tt < 1400) {
      const per = Math.max(15, 900 / plus.length)
      const shown = Math.floor(tt / per)
      const lastShown = plus[Math.min(shown, plus.length) - 1]
      lines = sc.lines
        .map((l, i) => (i === lastShown && shown < plus.length && blink ? { ...l, text: `${l.text}▌` } : l))
        .filter((l, i) => l.mark !== '+' || plus.indexOf(i) < shown)
    }
    // Camera: scroll from the top of the window down to the line the agent is on.
    const focus = sc.focus * ease(tt / 450)
    const code = toCode(viewLines({ ...sc, lines }, rows, focus), true)
    body = <Code source={code.source} format={code.format} startLine={code.startLine} language={sc.language} wrap="truncate-end" />
  } else if (sc.kind === 'terminal') {
    name = 'Terminal'
    const cmd = sc.lines[0]?.text ?? '$'
    const typed = cmd.slice(0, Math.ceil(cmd.length * Math.min(1, tt / 300)))
    const out = sc.lines.slice(1)
    const rolled = sc.isRunning ? [] : out.slice(0, Math.max(0, Math.floor((tt - 300) / 35))).slice(-(rows - 1))
    const isSearch = /^\$ (Grep|Glob) /.test(cmd)
    const pulse = isSearch && tt < 1200 && Math.floor(tt / 200) % 2 === 0
    body = (
      <Box flexDirection="column">
        <Text mono color="claude">
          {typed}
          {sc.isRunning && blink ? ' ▌' : ''}
        </Text>
        {rolled.map(l => (
          <Text mono color={pulse ? 'warning' : undefined}>
            {l.text || ' '}
          </Text>
        ))}
      </Box>
    )
  } else {
    name = 'Browser'
    const width = Math.max(10, (surface.columns || p.width) - 6)
    const url = sc.title.slice(0, Math.ceil(sc.title.length * Math.min(1, tt / 300)))
    const fill = sc.isRunning ? -1 : Math.round(width * ease((tt - 300) / 400))
    const at = Math.floor(tt / 60) % width
    const bar =
      fill < 0
        ? `${'─'.repeat(at)}━━━━${'─'.repeat(Math.max(0, width - at - 4))}`.slice(0, width)
        : `${'━'.repeat(fill)}${'─'.repeat(Math.max(0, width - fill))}`
    const isLoaded = !sc.isRunning && tt > 700
    body = (
      <Box flexDirection="column">
        <Text mono>⌕ {url}</Text>
        <Text color="claude">{bar}</Text>
        {isLoaded && <Markdown text={(sc.markdown ?? '').slice(0, rows * Math.max(20, width))} />}
      </Box>
    )
  }

  // A banner for test results and the agent's arrival and finish.
  const banner =
    live?.kind === 'pass' ? (
      <Text backgroundColor="success" color="inverseText" weight="bold"> ✓ {live.label} </Text>
    ) : live?.kind === 'fail' ? (
      <Text backgroundColor="error" color="inverseText" weight="bold"> ✗ {live.label} </Text>
    ) : live?.kind === 'done' ? (
      <Text backgroundColor="success" color="inverseText" weight="bold"> ✓ DONE </Text>
    ) : live?.kind === 'spawn' ? (
      <Text backgroundColor="claude" color="inverseText" weight="bold"> NEW AGENT </Text>
    ) : live?.kind === 'error' ? (
      <Text backgroundColor="error" color="inverseText" weight="bold"> ⚠ {live.label} </Text>
    ) : null
  const chip =
    live?.kind === 'add' ? <Text color="success" weight="bold">{live.label}</Text> : live?.kind === 'cut' ? <Text color="error" weight="bold">{live.label}</Text> : null

  const lines = shownLines(st, t)
  const ticking = t - st.linesStart < 700
  const effect = fx ? effectFor(fx) : undefined
  const cols = surface.columns || p.width
  const height = surface.rows
  const dots = effect && ft <= EFFECT_MS[effect] ? particles(effect, fx!.id, ft, cols, height, Math.max(1, Math.floor(height / 3))) : []
  const title = sc ? sc.title : ''

  return (
    <Box flexDirection="column" marginLeft={shake}>
      <Box flexDirection="column" borderStyle="single" borderColor={border} backgroundColor={ground} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text dimColor>
            {name}
            {title ? ` · ${title.length > cols - 22 ? `${title.slice(0, Math.max(4, cols - 23))}…` : title}` : ''}
            {sc?.isRunning ? ' · running…' : ''}
          </Text>
          {chip}
        </Box>
        {banner}
        {body}
      </Box>
      <Text dimColor>
        {sparkline(p.edits, Date.now())} <Text color={ticking ? 'success' : undefined}>{lines}</Text> lines changed
      </Text>
      {dots.length > 0 && (
        <Box position="absolute" top={0} left={0} width={cols} height={height}>
          {dots.map(d => (
            <Box position="absolute" top={d.y} left={d.x}>
              <Text color={d.color}>{d.ch}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
