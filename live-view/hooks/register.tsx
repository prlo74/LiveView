import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentView, Bucket, FileTouch, FxEvent, FxKind, Kind, Page, Range, Screen, ScreenLine, Site, SiteMode, Step } from '../types'
import { renderDashboard, renderTeam } from './dashboard'
import type { DashCtx, Els } from './dashboard'
import { attentionOf, isSecretFile, redact, redactLines, testCounts, toCode, viewLines } from './lib'
import { bump, costOf } from './metrics'
import { narrate, pushUpdate } from './narrate'
import { findLocalUrl, takeSnapshot } from './site'
import { nextPlan } from './plan'
import { type HeadroomBase, type Pairings, readPairings } from './pairings'
import { foundServers, makeTempDir, type MiniHow, openMiniWindow, openWebWindow, scanServers, sitePreview, startWeb, WEB_PORT, webSnapshot, webUp, writeWebState } from './web'
import type { ScreenProps } from './screen'

export { testCounts, toCode, viewLines } from './lib'

const PANE = 'live-view'
/** The wide org-chart pane of every agent at once. */
const TEAM = 'agent-team'
const MAIN = 'main'
// Change a tag when that value's fields change: it declines what an earlier version stored.
const agents = atom({ plugin: 'live-view', key: 'agents' } as const, {} as Record<string, AgentView>, {
  shape: 'agents-6',
})
const focused = atom({ plugin: 'live-view', key: 'focused' } as const, '', { shape: 'focused-1' })
const director = atom({ plugin: 'live-view', key: 'director' } as const, false, { shape: 'director-1' })
const series = atom({ plugin: 'live-view', key: 'series' } as const, [] as Bucket[], { shape: 'series-1' })
const page = atom({ plugin: 'live-view', key: 'page' } as const, 'overview' as Page, { shape: 'page-1' })
const range = atom({ plugin: 'live-view', key: 'range' } as const, 'session' as Range, { shape: 'range-1' })
const sites = atom({ plugin: 'live-view', key: 'sites' } as const, {} as Record<string, Site>, { shape: 'sites-1' })
const siteMode = atom({ plugin: 'live-view', key: 'siteMode' } as const, 'tiles' as SiteMode, { shape: 'siteMode-1' })
/** Whether the Agent Web window was opened this session: its server restarts after a reload. */
const webOn = atom({ plugin: 'live-view', key: 'webOn' } as const, false, { shape: 'webOn-1' })
// Headroom's first reading this session: kept in state so a mod reload does not restart the count
const headroomBase = atom({ plugin: 'live-view', key: 'headroomBase' } as const, null as HeadroomBase | null, { shape: 'headroomBase-1' })
/** The app's own browser pane, when this session has it. */
const BROWSER_TOOL = 'mcp__Claude_Browser__preview_start'
/** Wait this long after an edit before a snapshot, so a burst of edits takes one. */
const SNAP_DELAY = 2000

const MAX_LINES = 120
const CONTEXT = 12
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov|wasm)$/i
/** Files whose edit can change a page: only these fall back to the newest site. */
const WEB_FILE = /\.(html?|css|s[ac]ss|[jt]sx?|vue|svelte|astro|md|mdx)$/i
/** At most one snapshot per site this often: each one launches Chrome. */
const SNAP_EVERY = 20_000
/** Events big enough for director mode to cut to that agent. */
const HEADLINE: FxKind[] = ['add', 'cut', 'fail', 'error', 'pass']
const SOUND: Partial<Record<FxKind, string>> = {
  add: 'assets/tick.wav',
  cut: 'assets/tick.wav',
  pass: 'assets/chime.wav',
  done: 'assets/chime.wav',
  fail: 'assets/buzz.wav',
  error: 'assets/buzz.wav',
}

const blank = (id: string, label: string, at = 0): AgentView => ({
  id,
  label,
  status: 'idle',
  steps: [],
  files: [],
  edits: [],
  linesChanged: 0,
  startedAt: at,
  usage: { input: 0, output: 0, cacheRead: 0 },
  costUsd: 0,
  turns: 0,
  turnMs: 0,
  calls: 0,
  errors: 0,
  stepMs: 0,
  toolMix: {},
  updates: [],
})

export function describe(tool: string, a: Record<string, unknown>): { kind: Kind; target: string } {
  const s = (...keys: string[]) => {
    for (const k of keys) if (typeof a[k] === 'string' && a[k]) return a[k] as string
    return ''
  }
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return { kind: 'edit', target: s('file_path', 'notebook_path') }
  if (tool === 'Read') return { kind: 'read', target: s('file_path') }
  if (tool === 'Bash') return { kind: 'run', target: s('command', 'description') }
  if (tool === 'Grep' || tool === 'Glob') return { kind: 'search', target: s('pattern') }
  if (tool === 'WebFetch') return { kind: 'browse', target: s('url') }
  if (tool === 'WebSearch') return { kind: 'browse', target: s('query') }
  if (tool === 'Agent' || tool === 'Task') return { kind: 'agent', target: s('description') }
  // Browser MCP tools (navigate, page reads) count as browsing.
  if (/browser|chrome|playwright|navigate|browse/i.test(tool)) return { kind: 'browse', target: s('url', 'query', 'text') }
  return { kind: 'other', target: s('file_path', 'url', 'path', 'query') }
}

/** The site an agent is building from plain files: the HTML file it last edited, and when anything beside it last changed. */
export function siteFiles(ag: AgentView, kind: Kind, target: string, isFailed: boolean, at: number): Pick<AgentView, 'htmlFile' | 'siteRev'> {
  if (kind !== 'edit' || isFailed || !target.startsWith('/')) return { htmlFile: ag.htmlFile, siteRev: ag.siteRev }
  const htmlFile = /\.html?$/i.test(target) ? target : ag.htmlFile
  const root = htmlFile ? htmlFile.slice(0, htmlFile.lastIndexOf('/') + 1) : undefined
  return { htmlFile, siteRev: root && target.startsWith(root) ? at : ag.siteRev }
}

/** A task prompt squeezed to one tidy paragraph for the task card. */
export const taskText = (text: string | undefined) => {
  const t = redact((text ?? '').replace(/\s+/g, ' ').trim())
  return t ? (t.length > 600 ? `${t.slice(0, 599)}…` : t) : undefined
}
const split = (text: unknown) => (typeof text === 'string' && text ? text.split('\n') : [])
const cut = (t: string) => (t.length > 240 ? `${t.slice(0, 239)}…` : t)
const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text)
const base = (path: string) => path.split('/').pop() || path
const ext = (path: string) => (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase()

/** The edit pairs a tool call makes: [old, new] per change. */
function editPairs(tool: string, a: Record<string, unknown>): [string, string][] {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  if (tool === 'Edit') return [[str(a.old_string), str(a.new_string)]]
  if (tool === 'MultiEdit' && Array.isArray(a.edits))
    return (a.edits as Record<string, unknown>[]).map(x => [str(x.old_string), str(x.new_string)])
  return []
}

/** A file's lines with secrets masked; a key or env file shows nothing of its contents. */
const guard = (path: string, lines: ScreenLine[]): ScreenLine[] =>
  isSecretFile(path) ? [{ no: 1, mark: ' ', text: '[contents hidden: this file can hold secrets]' }] : redactLines(lines)

/** The file as the agent's editor shows it: lines `start` (1-based) onward. */
export function fileScreen(path: string, text: string, start: number, count: number, title: string): Screen {
  const all = text.split('\n')
  const from = Math.min(Math.max(0, start - 1), Math.max(0, all.length - 1))
  const lines = all.slice(from, from + Math.min(count, MAX_LINES)).map((t, i) => ({ no: from + i + 1, mark: ' ' as const, text: cut(t) }))
  return { kind: 'file', title, language: ext(path) || undefined, lines: guard(path, lines), focus: 0 }
}

/** The edited file around the change, with the removed and added lines marked at their real line numbers. */
export function editScreen(path: string, fileText: string | undefined, oldS: string, newS: string): Screen {
  const oldL = split(oldS)
  const newL = split(newS)
  const pos = fileText && newS ? fileText.indexOf(newS) : -1
  // the new text found twice cannot say which one changed
  if (fileText === undefined || pos < 0 || pos !== fileText.lastIndexOf(newS)) {
    // shortcut: the file could not be read or the new text not found once; show the change alone, numbered from 1.
    const lines: ScreenLine[] = [
      ...oldL.map((t, i) => ({ no: i + 1, mark: '-' as const, text: cut(t) })),
      ...newL.map((t, i) => ({ no: i + 1, mark: '+' as const, text: cut(t) })),
    ]
    return { kind: 'file', title: `${base(path)} · edited`, language: ext(path) || undefined, lines: guard(path, lines), focus: 0 }
  }
  const all = fileText.split('\n')
  const at = fileText.slice(0, pos).split('\n').length - 1
  const before = all.slice(Math.max(0, at - CONTEXT), at)
  const after = all.slice(at + newL.length, at + newL.length + CONTEXT)
  const first = at - before.length
  const lines: ScreenLine[] = [
    ...before.map((t, i) => ({ no: first + i + 1, mark: ' ' as const, text: cut(t) })),
    ...oldL.map(t => ({ no: at + 1, mark: '-' as const, text: cut(t) })),
    ...newL.map((t, i) => ({ no: at + i + 1, mark: '+' as const, text: cut(t) })),
    ...after.map((t, i) => ({ no: at + newL.length + i + 1, mark: ' ' as const, text: cut(t) })),
  ].slice(0, MAX_LINES)
  return { kind: 'file', title: `${base(path)} · line ${at + 1}`, language: ext(path) || undefined, lines: guard(path, lines), focus: before.length }
}

export function termScreen(cmd: string, output: string | undefined, isRunning: boolean): Screen {
  const out = split(output ?? '').slice(-MAX_LINES + 1)
  const lines = redactLines([`$ ${cmd}`, ...out].map((t, i) => ({ no: i + 1, mark: ' ' as const, text: cut(t) })))
  return { kind: 'terminal', title: short(redact(cmd), 80), lines, focus: lines.length - 1, isRunning }
}

function browserScreen(url: string, text: string | undefined, isRunning: boolean): Screen {
  return { kind: 'browser', title: redact(url), lines: [], focus: 0, markdown: redact((text ?? 'Loading…').slice(0, 6000)), isRunning }
}

/** What the agent just did, as the event its screen reacts to. */
export function fxFor(
  kind: Kind,
  target: string,
  output: string,
  isFailed: boolean,
  adds: number,
  dels: number,
): Omit<FxEvent, 'id' | 'at'> | undefined {
  if (kind === 'run') {
    const tc = testCounts(target, output)
    if (tc?.failed) return { kind: 'fail', size: tc.failed, label: `${tc.failed} failed${tc.passed ? ` · ${tc.passed} passed` : ''}` }
    if (tc?.passed) return { kind: 'pass', size: tc.passed, label: `${tc.passed} passed` }
  }
  if (isFailed) return { kind: 'error', size: 1, label: 'error' }
  if (kind === 'edit') return adds >= dels ? { kind: 'add', size: adds, label: `+${adds}` } : { kind: 'cut', size: dels, label: `−${dels}` }
  if (kind === 'run') return { kind: 'run', size: 1, label: '' }
  if (kind === 'search') return { kind: 'search', size: 1, label: '' }
  if (kind === 'browse') return { kind: 'browse', size: 1, label: '' }
  return undefined
}

/** The slice of an agent's state its screen module needs, kept small for the trip to the surface. */
export function clientProps(a: AgentView, rows: number, width: number): ScreenProps {
  let screen = a.screen ?? null
  if (screen?.kind === 'terminal') {
    screen = { ...screen, lines: [...screen.lines.slice(0, 1), ...screen.lines.slice(1).slice(-rows * 3)] }
  } else if (screen?.kind === 'file') {
    const from = Math.max(0, screen.focus - rows * 2)
    screen = { ...screen, lines: screen.lines.slice(from, screen.focus + rows * 2), focus: screen.focus - from }
  }
  return { screen, fx: a.fx ?? null, rows, width, edits: a.edits.slice(-60), lines: a.linesChanged }
}

async function readText($: EngineInterface, path: string): Promise<string | undefined> {
  if (!path || BINARY.test(path)) return undefined
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

/** `at` is when the agent is first seen, if this patch creates it. */
function patch($: Parameters<typeof update>[0], id: string, at: number, fn: (a: AgentView) => AgentView) {
  return update($, agents, map => ({ ...map, [id]: fn(map[id] ?? blank(id, id === MAIN ? 'Main agent' : 'Subagent', at)) }))
}

function play($: EngineInterface, isOn: boolean, kind: FxKind) {
  const asset = SOUND[kind]
  if (isOn && asset) void $.audio.play({ asset }).catch(() => undefined)
}

// Module state: lost on a reload, which only means the next tick makes a new folder.
let snapDir: string | undefined
let isSnapping = false

const latestSite = (map: Record<string, Site>) => Object.values(map).sort((x, y) => y.foundAt - x.foundAt)[0]?.url

/** Takes the one snapshot that is due, if any. Runs on a timer started at session start. */
async function snapTick($: EngineInterface) {
  if (isSnapping) return
  const now = await $.clock.now()
  // isTaking is not checked: isSnapping already guards this process, and a reload mid-snapshot leaves it true
  const due = Object.values(await read($, sites)).find(s => s.dueAt !== undefined && s.dueAt <= now && now - s.at >= SNAP_EVERY)
  if (!due) return
  const url = due.url
  if ((await read($, siteMode)) !== 'tiles') {
    await update($, sites, m => (m[url] ? { ...m, [url]: { ...m[url]!, dueAt: undefined } } : m))
    return
  }
  isSnapping = true
  try {
    await update($, sites, m => (m[url] ? { ...m, [url]: { ...m[url]!, dueAt: undefined, isTaking: true } } : m))
    snapDir ??= await makeTempDir($, 'live-view-snaps')
    const gen = due.generation + 1
    const r = snapDir ? await takeSnapshot($, url, snapDir, gen) : { error: "Couldn't make a folder for snapshots" }
    const at = await $.clock.now()
    await update($, sites, m => {
      const s = m[url]
      if (!s) return m
      return {
        ...m,
        [url]: 'error' in r ? { ...s, isTaking: false, error: r.error } : { ...s, isTaking: false, error: undefined, jpeg: r.jpeg, png: r.png, generation: gen, at },
      }
    })
  } finally {
    isSnapping = false
    await update($, sites, m => (m[url]?.isTaking ? { ...m, [url]: { ...m[url]!, isTaking: false } } : m))
  }
}

/** Starts the Agent Web server if needed and opens its window. */
async function openWeb($: EngineInterface): Promise<string> {
  const address = await startWeb($)
  if (!address) return 'The Agent Web needs python3 to serve its page, and it could not start.'
  await update($, webOn, () => true)
  await webTick($)
  const how = await openWebWindow($, address)
  return how === 'chrome'
    ? `Agent Web opened in its own window (${address}). Press F there, or ⌃⌘F, for full screen.`
    : `Agent Web opened in your browser (${address}).`
}

const MINI_SAYS: Record<MiniHow, string> = {
  native: 'Mini monitor opened in the bottom-right corner. It stays above other windows; drag its title bar to move it, its edges to resize. Click the banner there to jump back to Claude.',
  chrome: 'Mini monitor opened as a small browser window, which cannot stay on top.',
  browser: 'Mini monitor opened in your browser (no Chrome found), which cannot stay on top.',
  'no-tools': 'Mini monitor opened as a small browser window. To keep it above other windows, install the Xcode Command Line Tools (xcode-select --install) and open it again.',
  'build-failed': 'Mini monitor opened as a small browser window: the native window would not build. Run claude --debug for the compiler output.',
}

/** Starts the Agent Web server if needed and opens the small always-on-top monitor. */
async function openMini($: EngineInterface): Promise<string> {
  const address = await startWeb($)
  if (!address) return 'The Agent Web needs python3 to serve its page, and it could not start.'
  await update($, webOn, () => true)
  await webTick($)
  return MINI_SAYS[await openMiniWindow($, address)]
}

// The kind each agent was last told about, so a pop-up says it once.
const alerted = new Map<string, string>()
// Who answers asks: once the engine has raised a dialog, an ask without one was settled by the mode;
// in these modes the person is never asked first.
let dialogsSeen = false
let mode: string | undefined
const AUTO_MODES = new Set(['auto', 'bypassPermissions', 'dontAsk'])
/** Tools whose whole call is the person's turn: a question, a plan to approve. */
const ASKS_PERSON = new Set(['AskUserQuestion', 'ExitPlanMode'])
/** A pop-up when an agent gets stuck, struggles or runs long. Approvals are left out: Claude Code already asks in the chat. */
async function alertTick($: EngineInterface) {
  const now = await $.clock.now()
  for (const a of Object.values(await read($, agents))) {
    const att = attentionOf(a, now), kind = att && ['long', 'stuck', 'struggling'].includes(att.kind) ? att.kind : ''
    if (kind && alerted.get(a.id) !== kind) $.ui.toast(`${a.label}: ${att!.short.toLowerCase()} · ${att!.text}`)
    alerted.set(a.id, kind)
  }
}

/** Writes the page's state file when anything changed. */
// what readPairings last found; shown in the Agent Web's header
let pairings: Pairings = { modes: [] }
async function webTick($: EngineInterface) {
  if (!webUp()) return
  const all = await read($, agents)
  await writeWebState($, { ...webSnapshot(all, await read($, sites), await read($, series), await $.clock.now()), preview: await sitePreview($, all), servers: foundServers(), pairings })
}

const TEAM_OPEN = { id: TEAM, title: 'Agent team', focus: true, columns: 220, rows: 48 } as const

/** What dashboard.tsx draws from: the stored state, sizes, and the actions its buttons call. */
async function buildCtx($: EngineInterface, els: Els, surface: DashCtx['surface'], cols: number, rows: number): Promise<DashCtx> {
  const Client = 'Client' in els ? els.Client : undefined
  return {
    els,
    surface,
    cols,
    rows,
    now: await $.clock.now(),
    page: await read($, page),
    range: await read($, range),
    agents: await read($, agents),
    series: await read($, series),
    focused: await read($, focused),
    director: await read($, director),
    sites: await read($, sites),
    siteMode: await read($, siteMode),
    actions: {
      setPage: p => update($, page, () => p),
      setRange: r => update($, range, () => r),
      focus: id => update($, focused, () => id),
      back: () => update($, focused, () => ''),
      toggleDirector: () => update($, director, d => !d),
      openTranscript: id => $.ui.view({ agentId: id }),
      openTeam: () => $.ui.open(TEAM_OPEN),
      openWeb: async () => $.ui.toast(await openWeb($)),
      setSiteMode: async m => {
        await update($, siteMode, () => m)
        // Back to snapshots: refresh every known site now.
        if (m === 'tiles') {
          const now = await $.clock.now()
          await update($, sites, map => Object.fromEntries(Object.entries(map).map(([k, s]) => [k, { ...s, dueAt: now }])))
        }
      },
      openSite: async url => {
        const tools = await $.tool.list()
        if (tools.some(t => t.name === BROWSER_TOOL)) {
          await $.tool.call({ tool: BROWSER_TOOL, url } as Parameters<typeof $.tool.call>[0])
          return
        }
        await $.ui.copy({ text: url })
        $.ui.toast(`Copied ${url}. Paste it into the app's browser pane.`)
      },
    },
    screenOf: (a, r, width, key) =>
      Client ? <Client key={key} module="./screen.tsx" width={width} props={clientProps(a, r, width)} /> : undefined,
  }
}

export const register: Register = (on, options) => {
  const sounds = (options as { sounds?: unknown } | undefined)?.sounds === true

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'live-view', description: 'Open the Live View pane of every agent in this session' })
    await $.command.register({ name: 'agent-team', description: 'Open a wide org-chart view of every agent at once' })
    await $.command.register({ name: 'agent-web', description: 'Open the Agent Web: every agent as a live spider web, in its own full-screen window' })
    await $.command.register({ name: 'agent-mini', description: 'Open a small always-on-top monitor of every agent, for a corner of the screen' })
    void $.ui.open({ id: PANE, title: 'Live View' })
    $.clock.every(1000, () => {
      void snapTick($).catch(() => {
        isSnapping = false
      })
    })
    $.clock.every(500, () => void webTick($).catch(() => undefined))
    $.clock.every(15_000, () => void scanServers($).catch(() => undefined))
    // Headroom and the Caveman / Ponytail modes, while the Agent Web is open
    $.clock.every(15_000, () => void (async () => {
      if (!webUp()) return
      const was = await read($, headroomBase), r = await readPairings($, was ?? undefined)
      pairings = r.pairings
      if (!was && r.base) await update($, headroomBase, () => r.base!)
    })().catch(() => undefined))
    $.clock.every(3000, () => void alertTick($).catch(() => undefined))
    // After a reload the window is still open: bring its server back on the same port. On another port the open windows are stranded.
    if (await read($, webOn)) void startWeb($).then(u => { if (u && !u.includes(`:${WEB_PORT}/`)) $.ui.toast('Agent Web restarted on a new address. Run /agent-web or /agent-mini to reopen its windows.') }).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'agent-web' }, async $ => ({ text: await openWeb($) }))
  on('command.run', { command: 'agent-mini' }, async $ => ({ text: await openMini($) }))

  on('command.run', { command: 'live-view' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Live View' })
    return { text: 'Live View pane opened.' }
  })

  on('command.run', { command: 'agent-team' }, async $ => {
    await $.ui.open(TEAM_OPEN)
    return { text: 'Agent team view opened.' }
  })

  // The main agent's task is whatever the person asked last.
  on('prompt.submit', async ($, e, next) => {
    const task = !e.isMeta && !e.command ? taskText(e.text) : undefined
    if (task) await patch($, MAIN, await $.clock.now(), a => ({ ...a, task }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // An approval about to be asked: the agent waits on it until the tool call ends.
  // An ask goes to the mode's decider first; only a dialog raised for the person (classic.PermissionRequest) means "needs you".
  on('tool.check', async ($, e, next) => {
    const v = await next(e)
    // a $.tool.check query has no tool_use_id and opens no dialog
    if (v.decision === 'ask' && e.tool_use_id) {
      const at = await $.clock.now(), person = dialogsSeen || AUTO_MODES.has(mode ?? '') ? false : undefined
      await patch($, e.agentId ?? MAIN, at, a => (a.waiting?.person && !a.waiting.id && a.waiting.tool === e.tool
        ? { ...a, waiting: { ...a.waiting, id: e.tool_use_id } }
        : { ...a, waiting: { since: at, tool: e.tool, id: e.tool_use_id, person } }))
    }
    return v
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    dialogsSeen = true
    if (e.permission_mode) mode = e.permission_mode
    const at = await $.clock.now()
    await patch($, e.agent_id ?? MAIN, at, a => ({ ...a, waiting: a.waiting && a.waiting.tool === e.tool_name ? { ...a.waiting, person: true } : { since: at, tool: e.tool_name, person: true } }))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (e.permission_mode) mode = e.permission_mode
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await patch($, e.agentId ?? MAIN, await $.clock.now(), a => ({ ...a, status: 'working' }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const at = await $.clock.now()
    const u = e.usage
    // Cache writes count as input: a slight under-estimate, the cost is labelled est. anyway.
    const used = u && { input: u.input_tokens + u.cache_creation_input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens }
    const cost = u && used ? costOf(u.model, used) : 0
    await patch($, e.agentId ?? MAIN, at, a => {
      const b: AgentView = {
        ...a,
        turns: a.turns + 1,
        turnMs: a.turnMs + e.durationMs,
        ...(u && used && {
          model: u.model,
          costUsd: a.costUsd + cost,
          usage: { input: a.usage.input + used.input, output: a.usage.output + used.output, cacheRead: a.usage.cacheRead + used.cacheRead },
        }),
      }
      return e.agentId
        ? {
            ...b,
            status: 'done',
            waiting: undefined,
            // a finished worker keeps only what its card shows
            screen: undefined,
            steps: b.steps.slice(-14),
            fx: { id: `done-${e.turnId}`, kind: 'done', size: 1, at, label: 'done' },
            updates: pushUpdate(b.updates, { at, text: 'Finished its task', tone: 'pass' }),
          }
        : { ...b, status: 'idle', waiting: undefined }
    })
    if (used) await update($, series, s => bump(s, at, { tokens: used.input + used.output + used.cacheRead, cost }))
    if (e.agentId) play($, sounds, 'done')
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    if (ran.agentId) {
      const label = redact(e.description || e.name || e.subagentType || 'Subagent')
      const at = await $.clock.now()
      await patch($, ran.agentId, at, a => ({
        ...a,
        label,
        status: 'working',
        parentId: e.parentAgentId ?? MAIN,
        task: taskText(e.prompt),
        fx: { id: `spawn-${ran.agentId}`, kind: 'spawn', size: 1, at, label },
        updates: pushUpdate(a.updates, { at, text: `Started: ${label}`, tone: 'info' }),
      }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const a = e as unknown as Record<string, unknown>
    const d = describe(e.tool, a), kind = d.kind, target = redact(d.target)
    const step: Step = { id: e.tool_use_id, at: await $.clock.now(), tool: e.tool, kind, target: cut(target), isDone: false }
    const pairs = editPairs(e.tool, a)
    const adds = e.tool === 'Write' ? split(a.content).length : pairs.reduce((n, [, nw]) => n + split(nw).length, 0)
    const dels = pairs.reduce((n, [o]) => n + split(o).length, 0)
    // What the screen shows while the tool runs: the command typed, the page loading.
    const pending = kind === 'run' ? termScreen(target, undefined, true) : kind === 'browse' ? browserScreen(target, undefined, true) : undefined

    // a question or a plan to approve waits on the person for as long as the call runs
    const asksPerson = ASKS_PERSON.has(e.tool) ? { waiting: { since: step.at, tool: e.tool, id: e.tool_use_id, person: true } } : {}
    await patch($, id, step.at, ag => ({ ...ag, status: 'working', steps: [...ag.steps, step].slice(-100), screen: pending ?? ag.screen, ...asksPerson }))

    const ran = await next(e)
    const output = ran.deny ?? ran.text ?? ''
    const isFailed = ran.deny !== undefined || ran.isError === true
    // a call the person declined is their choice: not an error, not a failure on the agent's record
    const isDenied = ran.deny !== undefined, isError = isFailed && !isDenied
    let screen: Screen | undefined
    if (!isFailed && kind === 'read') {
      const text = await readText($, target)
      const offset = typeof a.offset === 'number' ? a.offset : 1
      const limit = typeof a.limit === 'number' ? a.limit : 80
      if (text !== undefined) screen = fileScreen(target, text, offset, limit, `${base(target)} · line ${offset}`)
    } else if (!isFailed && kind === 'edit') {
      const text = await readText($, target)
      const last = pairs[pairs.length - 1]
      if (last) screen = editScreen(target, text, last[0], last[1])
      else if (text !== undefined) screen = fileScreen(target, text, 1, 80, `${base(target)} · written`)
    } else if (kind === 'run' || kind === 'search') {
      screen = termScreen(kind === 'search' ? `${e.tool} ${target}` : target, output, false)
    } else if (kind === 'browse') {
      screen = browserScreen(target, output, false)
    }

    const at = await $.clock.now()
    // a refused call changed nothing: no fx, no lines
    const made = isDenied ? undefined : fxFor(kind, target, output, isError, adds, dels)
    const fx: FxEvent | undefined = made && { ...made, id: step.id, at }
    const isEdit = fx?.kind === 'add' || fx?.kind === 'cut'
    const ms = at - step.at
    // The site being built: a dev server a command printed, or the one this agent (or the newest) edits for.
    const found = kind === 'run' && !isFailed ? findLocalUrl(`${target}\n${output}`) : undefined
    const siteMap = await read($, sites)
    const editSite = isEdit ? ((await read($, agents))[id]?.siteUrl ?? (WEB_FILE.test(target) ? latestSite(siteMap) : undefined)) : undefined
    const siteUrl = found ?? editSite
    const lines = isEdit ? adds + dels : 0
    await patch($, id, at, ag => {
      // only a call that went through touches files and the plan
      let files = ag.files
      if (!isFailed && target && (kind === 'edit' || kind === 'read')) {
        const old = files.find(f => f.path === target) ?? { path: target, adds: 0, dels: 0, isEdited: false }
        const now: FileTouch = kind === 'edit' ? { ...old, adds: old.adds + adds, dels: old.dels + dels, isEdited: true } : old
        files = [now, ...files.filter(f => f.path !== target)].slice(0, 30)
      }
      const plan = isFailed ? ag.plan : (nextPlan(ag.plan, e.tool, a) ?? ag.plan)
      return {
        ...ag,
        files,
        plan,
        steps: ag.steps.map(s => (s.id === step.id ? { ...s, isDone: true, endAt: at, isError, isDenied } : s)),
        calls: ag.calls + 1,
        errors: ag.errors + (isError ? 1 : 0),
        stepMs: ag.stepMs + ms,
        toolMix: { ...ag.toolMix, [e.tool]: (ag.toolMix[e.tool] ?? 0) + 1 },
        screen: screen ?? (ag.screen?.isRunning ? { ...ag.screen, isRunning: false } : ag.screen),
        fx: fx ?? ag.fx,
        edits: isEdit ? [...ag.edits, at].slice(-60) : ag.edits,
        linesChanged: ag.linesChanged + lines,
        // a rule, hook or plugin can refuse too, not only the person
        updates: pushUpdate(ag.updates, { ...(isDenied ? { text: `${e.tool} was refused${!target ? '' : kind === 'edit' || kind === 'read' ? ` on ${short(base(target), 30)}` : `: ${short(target, 40)}`}`, tone: 'info' as const } : narrate(e.tool, kind, target, made, isError, adds, dels)), at }),
        siteUrl: siteUrl ?? ag.siteUrl,
        ...siteFiles(ag, kind, target, isFailed, at),
        // only this call's approval clears: another call finishing leaves a pending approval in place
        waiting: ag.waiting?.id && ag.waiting.id !== step.id ? ag.waiting : undefined,
      }
    })
    if (siteUrl) {
      const isNew = !siteMap[siteUrl]
      await update($, sites, m => ({
        ...m,
        [siteUrl]: { ...(m[siteUrl] ?? { url: siteUrl, foundAt: at, at: 0, generation: 0 }), dueAt: at + (isNew ? 500 : SNAP_DELAY) },
      }))
      if (isNew && (await read($, siteMode)) === 'pane') $.ui.toast(`Site running at ${siteUrl}. Open it from Live View.`)
    }
    await update($, series, s => bump(s, at, { calls: 1, errors: isError ? 1 : 0, lines, stepMs: ms }))
    if (fx) {
      play($, sounds, fx.kind)
      if (HEADLINE.includes(fx.kind) && (await read($, director))) {
        await update($, focused, () => id)
        await update($, page, () => 'agents')
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Both panes are drawn by dashboard.tsx; these hooks only gather the state and the actions its buttons call.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    return renderDashboard(await buildCtx($, els, e.surface, e.props.bodyColumns, e.viewport?.rows ?? 40))
  })

  on('ui.render', { component: 'Pane', requestId: TEAM }, async ($, e) => {
    const els = $.ui.resolve(e)
    return renderTeam(await buildCtx($, els, e.surface, e.props.bodyColumns, e.viewport?.rows ?? 40))
  })
}
