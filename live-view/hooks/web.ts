// The Agent Web window: a local page, in its own Chrome window, drawn from a state file the mod rewrites.
import type { EngineInterface } from 'claude-code'
import type { AgentView, Bucket, Site } from '../types'
import { goalText } from './plan'
import { attentionOf } from './lib'

/** The port tried first, so a window left open finds the server again after a reload. */
export const WEB_PORT = 47390

/** True on Windows, where the macOS tools this file runs (open, mktemp, cp, lsof, swiftc) are missing. */
export async function isWindows($: EngineInterface): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

/** A new empty folder of the mod's own under the system's temp folder; undefined when none could be made. */
export async function makeTempDir($: EngineInterface, name: string): Promise<string | undefined> {
  if (!(await isWindows($))) return (await $.process.run(['mktemp', '-d', '-t', name])).stdout.trim() || undefined
  const temp = await $.env.get('TEMP')
  if (!temp) return undefined
  const dir = `${temp}\\${name}-${await $.clock.now()}`
  // writing a file makes its folders
  await $.fs.write(`${dir}\\.keep`, '')
  return dir
}

/** The Python to run: python3 on macOS; the py launcher or python on Windows. */
async function pythonArgv($: EngineInterface): Promise<string[]> {
  if (!(await isWindows($))) return ['python3']
  for (const argv of [['py', '-3'], ['python']]) {
    const r = await $.process.run([...argv, '--version']).catch(() => undefined)
    if (r?.exitCode === 0) return argv
  }
  return ['python']
}

// Serves one folder on this machine only (127.0.0.1), never cached, quietly.
const SERVER = `
import http.server, functools, sys, urllib.parse, subprocess, os, json, threading, time
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        # Agent-built pages run walled off from this page's data, even opened in a tab of their own.
        if getattr(self, 'sandbox', True):
            self.send_header('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups')
        super().end_headers()
    # Only this machine's own pages, by name: a page elsewhere that rebinds its name to 127.0.0.1 gets nothing.
    def ok(self):
        host = (self.headers.get('Host') or '').rsplit(':', 1)[0]
        parts = [p for p in urllib.parse.unquote(self.path.split('?')[0]).split('/') if p]
        if host in ('127.0.0.1', 'localhost') and not any(p.startswith('.') for p in parts):
            root = os.path.realpath(self.directory)
            real = os.path.realpath(self.translate_path(self.path))
            # judged by where the path lands on disk, not how the URL spells it (the disk ignores case, %2F decodes)
            self.sandbox = not (real == root or real.startswith(root + os.sep))
            if not self.sandbox: return True
            # A preview serves its own folder only: links inside it that lead elsewhere are refused.
            if len(parts) >= 2:
                base = os.path.realpath(os.path.join(root, 'site', parts[1]))
                if real == base or real.startswith(base + os.sep): return True
        self.send_error(404)
        return False
    def do_GET(self):
        if self.ok(): super().do_GET()
    def do_HEAD(self):
        if self.ok(): super().do_HEAD()
    # The page's "Back to Claude" button. The custom header keeps other sites out: a cross-site request carrying it is never sent.
    def do_POST(self):
        if not self.ok(): return
        if self.path == '/focus-claude' and self.headers.get('X-Agent-Web') == '1':
            # elsewhere the page falls back to the claude:// link, so say this did nothing
            if sys.platform != 'darwin':
                self.send_error(501)
                return
            subprocess.Popen(['open', '-a', 'Claude'])
            self.send_response(204)
            self.end_headers()
        # A message typed in the page: handed to the mod as one stdout line, which sends it to Claude.
        elif self.path == '/ask' and self.headers.get('X-Agent-Web') == '1' and self.same_origin():
            try:
                n = int(self.headers.get('Content-Length') or 0)
                body = json.loads(self.rfile.read(n)) if 0 < n <= 20000 else None
                text = body.get('text', '').strip() if isinstance(body, dict) and isinstance(body.get('text'), str) else ''
                mode = body.get('mode') if isinstance(body, dict) and body.get('mode') in ('send', 'draft') else 'send'
            except (ValueError, UnicodeDecodeError):
                text = ''
            if not text or len(text) > 4000:
                self.send_error(400)
                return
            print('ASK ' + json.dumps({'text': text, 'mode': mode}), flush=True)
            self.send_response(202)
            self.end_headers()
        # The page's Mini button: the mod opens the small always-on-top monitor.
        elif self.path == '/open-mini' and self.headers.get('X-Agent-Web') == '1' and self.same_origin():
            print('MINI', flush=True)
            self.send_response(202)
            self.end_headers()
        else:
            self.send_error(403)
    # A browser sends Origin on POST; anything but this page's own is refused.
    def same_origin(self):
        origin = self.headers.get('Origin')
        port = self.server.server_address[1]
        return origin is None or origin in ('http://127.0.0.1:%d' % port, 'http://localhost:%d' % port)
    def list_directory(self, path):
        self.send_error(404)
        return None
handler = functools.partial(H, directory=sys.argv[1])
# Claude gone: the server goes too, so no window keeps showing a dead session's last state
def watch_parent(ppid):
    while True:
        time.sleep(2)
        if os.getppid() != ppid: os._exit(0)
if sys.platform != 'win32': threading.Thread(target=watch_parent, args=(os.getppid(),), daemon=True).start()
try:
    s = http.server.ThreadingHTTPServer(('127.0.0.1', ${WEB_PORT}), handler)
except OSError:
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
print(s.server_address[1], flush=True)
s.serve_forever()
`

/** Finished helpers sent to the page in full; older ones are trimmed to their node. */
export const KEEP_DONE = 20
const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

/** What the page reads: each agent trimmed to what the web draws, plus the session's totals. */
export function webSnapshot(agents: Record<string, AgentView>, sites: Record<string, Site>, series: Bucket[], now: number) {
  // finished helpers past the newest 20 keep only what their node shows, so long sessions stay small
  const done = Object.values(agents).filter(a => a.status === 'done' && a.parentId).sort((x, y) => lastAt(y) - lastAt(x))
  const slim = new Set(done.slice(KEEP_DONE).map(a => a.id))
  return {
    now,
    series: series.slice(-30).map(b => ({ t: b.t, calls: b.calls, errors: b.errors, lines: b.lines })),
    sites: Object.values(sites).map(s => ({ url: s.url, at: s.at })),
    agents: Object.values(agents).map(a => ({
      id: a.id,
      label: a.label,
      status: a.status,
      parentId: a.parentId,
      model: a.model,
      startedAt: a.startedAt,
      linesChanged: a.linesChanged,
      costUsd: a.costUsd,
      calls: a.calls,
      errors: a.errors,
      turns: a.turns,
      toolMix: a.toolMix,
      siteUrl: a.siteUrl,
      task: a.task,
      waiting: a.waiting,
      attention: attentionOf(a, now) ?? null,
      goal: goalText(a.task),
      plan: slim.has(a.id) ? undefined : a.plan?.slice(0, 24).map(s => ({ text: cut(s.text, 90), status: s.status })),
      fx: a.fx,
      steps: a.steps.slice(slim.has(a.id) ? -1 : -14).map(s => ({
        at: s.at,
        endAt: s.endAt,
        tool: s.tool,
        kind: s.kind,
        target: cut(s.target.split('\n')[0] ?? '', 90),
        isDone: s.isDone,
        isError: s.isError,
        isDenied: s.isDenied,
      })),
      updates: a.updates.slice(slim.has(a.id) ? -1 : -10),
      files: slim.has(a.id) ? [] : a.files.slice(-8),
      screen: !slim.has(a.id) && a.screen && {
        kind: a.screen.kind,
        title: a.screen.title,
        focus: Math.min(a.screen.focus, 12),
        lines: a.screen.lines.slice(Math.max(0, a.screen.focus - 12), a.screen.focus + 18).map(l => ({ ...l, text: cut(l.text, 140) })),
      },
    })),
  }
}

// Module state: a reload kills the server with the module, and the next start binds the same port again.
let dir: string | undefined
let url: string | undefined
let lastJson = '', lastWriteAt = 0, sid = ''
let starting: Promise<string | undefined> | undefined

/** Starts the local server once and resolves its address; undefined when python3 is missing. */
export function startWeb($: EngineInterface): Promise<string | undefined> {
  starting ??= (async () => {
    mounts.clear()
    dir = await makeTempDir($, 'live-view-web')
    if (!dir) return undefined
    // the page and everything beside it (themes/): copied, so edits to the mod reach the window after a reload
    if (await isWindows($)) await $.process.run(['robocopy', `${$.plugin.root}\\web`, dir, '/E', '/NFL', '/NDL', '/NJH', '/NJS'])
    else await $.process.run(['cp', '-R', `${$.plugin.root}/web/.`, dir])
    lastJson = ''
    sid = await $.session.id().catch(() => '')
    const child = $.process.spawn({ argv: [...(await pythonArgv($)), '-I', '-c', SERVER, dir] })
    return new Promise<string | undefined>(resolve => {
      void (async () => {
        try {
          let buf = ''
          for await (const { stream, text } of child) {
            if (stream !== 'stdout') continue
            const lines = (buf + text).split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              if (line.startsWith('ASK ')) { void deliverAsk($, line.slice(4)); continue }
              if (line.trim() === 'MINI') { if (url) void openMiniWindow($, url).catch(() => undefined); continue }
              const port = !url ? /^(\d+)$/.exec(line.trim())?.[1] : undefined
              if (port) {
                url = `http://127.0.0.1:${port}/`
                resolve(url)
              }
            }
          }
        } catch {
          // python3 missing, or it would not start
        }
        url = undefined
        starting = undefined
        resolve(undefined)
      })()
    })
  })()
  return starting
}

/** A message typed in the Agent Web, and what became of it (the page shows the last few). */
export type Ask = { id: number; text: string; status: 'queued' | 'sent' | 'drafted' | 'refused' }
let asks: Ask[] = [], askSeq = 0
const setAsk = (id: number, status: Ask['status']) => { asks = asks.map(a => (a.id === id ? { ...a, status } : a)) }

/** Sends a message from the page to Claude: as a prompt (a turn once Claude is free), or into the prompt box as a draft.
 *  Framed as this plugin's message, not the person's own words: any program on this machine can reach /ask, not only the page. */
export async function deliverAsk($: EngineInterface, line: string) {
  let msg: { text?: unknown; mode?: unknown }
  try { msg = JSON.parse(line) } catch { return }
  if (typeof msg.text !== 'string' || !msg.text.trim()) return
  const text = msg.text.slice(0, 4000)
  const ask: Ask = { id: ++askSeq, text: cut(text.replace(/\s+/g, ' '), 80), status: 'queued' }
  asks = [...asks, ask].slice(-5)
  if (msg.mode === 'draft') {
    // append: never wipes what the person already typed in the box; on its own line after it
    const box = await $.prompt.read()
    const r = await $.prompt.fill({ text: box.text.trim() ? `\n${text}` : text, mode: 'append' })
    setAsk(ask.id, r.isFilled ? 'drafted' : 'refused')
    return
  }
  const r = await $.prompt.submit({ text })
  setAsk(ask.id, 'drop' in r && r.drop ? 'refused' : 'sent')
}

const lastAt = (a: AgentView) => a.steps[a.steps.length - 1]?.at ?? a.startedAt

/** A dev server listening on this machine, found by `lsof`. */
export type Listener = { url: string; cmd: string; port: number }
// Programs that run dev servers; anything else listening (system services, apps) is left out.
const DEV_CMD = /^(node|bun|deno|python[\d.]*|ruby|php|java|go|hugo|caddy|next-server|vite|astro|nuxt|remix|webpack|esbuild|parcel|rails|uvicorn|gunicorn|flask|django)/i
// Node's --inspect debugger: never a site to preview
const NOT_DEV = new Set([9229, 9230])
const DEV_PORTS = [3000, 5173, 8080, 4321, 4200, 8000, 3001, 5174, 4173, 8888, 5000]
/** Reads `lsof -nP -iTCP -sTCP:LISTEN -Fcn` output: dev-server programs and their ports, likely dev ports first. */
export function parseListeners(text: string, skip: number[] = []): Listener[] {
  const out = new Map<number, Listener>()
  let cmd = ''
  for (const line of text.split('\n')) {
    if (line[0] === 'c') cmd = line.slice(1)
    if (line[0] !== 'n' || !DEV_CMD.test(cmd)) continue
    const port = Number(line.slice(line.lastIndexOf(':') + 1))
    if (port > 1023 && !NOT_DEV.has(port) && !skip.includes(port) && !out.has(port)) out.set(port, { url: `http://localhost:${port}/`, cmd, port })
  }
  const rank = (p: number) => (DEV_PORTS.includes(p) ? DEV_PORTS.indexOf(p) : 100 + p)
  return [...out.values()].sort((x, y) => rank(x.port) - rank(y.port)).slice(0, 8)
}
let servers: Listener[] = []
export const foundServers = () => servers
/** True once the window's server is up. */
export const webUp = () => !!url
/** Looks for dev servers already running (one `lsof`), while the window is open. */
export async function scanServers($: EngineInterface) {
  // shortcut: no lsof on Windows, so only servers an agent starts are previewed there; parse `netstat -ano` to add more
  if (!url || (await isWindows($))) return
  const own = Number(new URL(url).port)
  const r = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fcn'], { timeoutMs: 3000 })
  servers = parseListeners(r.stdout, [own, WEB_PORT])
}

/** The site to preview: an agent's own dev server, else the HTML file it edited, else a dev server already running. */
export function pickPreview(agents: Record<string, AgentView>, found: Listener[] = []) {
  const a = Object.values(agents).filter(x => x.siteUrl || x.htmlFile).sort((x, y) => lastAt(y) - lastAt(x))[0]
  if (!a) return found[0] && { kind: 'server' as const, url: found[0].url, agent: `Running on this Mac (${found[0].cmd})`, rev: 0 }
  if (a.siteUrl) return { kind: 'server' as const, url: a.siteUrl, agent: a.label, rev: a.siteRev ?? 0 }
  const file = a.htmlFile!, root = file.slice(0, file.lastIndexOf('/'))
  return { kind: 'file' as const, root, file: file.slice(root.length + 1), path: file, agent: a.label, rev: a.siteRev ?? 0 }
}

// Each folder the preview serves gets a link under the page's own folder: /site/<n>/ → that folder.
const mounts = new Map<string, string>()
let home = ''
/** Folders never served whole: the disk, your home and its top folders, temp and system folders. */
export function isBroadFolder(root: string, homeDir: string): boolean {
  const r = root.replace(/\/+$/, '') || '/'
  if (r === '/' || r === homeDir || (homeDir + '/').startsWith(r + '/')) return true
  // dot-folders hold keys and config (~/.ssh, ~/.config/x)
  if (/\/\./.test(r)) return true
  if (/^\/(tmp|private|var|etc|usr|bin|sbin|dev|cores|System|Library|Applications|opt)(\/|$)/.test(r)) return true
  if (/^\/Volumes(\/[^/]+)?$/.test(r)) return true
  return homeDir !== '' && r.startsWith(homeDir + '/') && /^(Library|Desktop|Documents|Downloads|Pictures|Music|Movies|Public|Applications)$|^Library\/[^/]+$/.test(r.slice(homeDir.length + 1))
}
/** The preview with a URL the page can load: a dev server as it is, a plain-files site through its link. */
export async function sitePreview($: EngineInterface, agents: Record<string, AgentView>) {
  const p = pickPreview(agents, servers)
  if (!p || p.kind === 'server' || !dir) return p
  if (!home) home = (await $.env.get('HOME')) ?? ''
  // shortcut: isBroadFolder knows only macOS paths, so plain-file previews stay off on Windows until it learns drive paths
  if (!home || (await isWindows($)) || isBroadFolder(p.root, home)) return { kind: 'blocked' as const, root: p.root, file: p.file, agent: p.agent, rev: p.rev }
  let mount = mounts.get(p.root)
  if (!mount) {
    mount = `site/${mounts.size}`
    await $.process.run(['mkdir', '-p', `${dir}/site`])
    if ((await $.process.run(['ln', '-sfn', p.root, `${dir}/${mount}`])).exitCode !== 0) return undefined
    mounts.set(p.root, mount)
  }
  return { ...p, url: `/${mount}/${p.file.split('/').map(encodeURIComponent).join('/')}` }
}

/** Rewrites state.json when anything changed. A no-op until the server runs. */
export async function writeWebState($: EngineInterface, snap: ReturnType<typeof webSnapshot> & { preview?: unknown; servers?: unknown; pairings?: unknown }) {
  if (!dir || !url) return
  const { now: _now, ...rest } = snap
  const body = JSON.stringify({ ...rest, asks })
  // unchanged state is still rewritten every 2s: the page reads a file that stops changing as Claude gone
  if (body === lastJson && snap.now - lastWriteAt < 2000) return
  lastJson = body
  lastWriteAt = snap.now
  await $.fs.write(`${dir}/state.json`, JSON.stringify({ ...snap, sid, asks }))
}

/** The mini's Info.plist: a menu-bar-only app (no Dock icon) with a stable id for its notification setting. */
const miniPlist = (exe: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.liveview.agentweb-mini</string>
<key>CFBundleName</key><string>LiveView monitor</string>
<key>CFBundleExecutable</key><string>${exe}</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSUIElement</key><true/>
</dict></plist>
`

/** How the mini monitor opened, or why the native window could not. */
export type MiniHow = 'native' | 'chrome' | 'browser' | 'no-tools' | 'build-failed'

/**
 * Opens the small monitor (?mini): a native always-on-top window (built with swiftc, cached under ~/Library/Caches
 * by a hash of its source), else a small Chrome app window, which cannot stay on top, else the default browser.
 * Only this session's mini is replaced; other sessions keep theirs.
 */
export async function openMiniWindow($: EngineInterface, address: string): Promise<MiniHow> {
  const mini = `${address}?mini`
  if (await isWindows($)) return (await openAppWindowWindows($, mini, '480,270')) ? 'chrome' : 'browser'
  const home = (await $.env.get('HOME')) ?? ''
  let why: MiniHow | undefined
  if (home) {
    const dir = `${home}/Library/Caches/agentweb-mini`, src = `${$.plugin.root}/mini/MiniWindow.swift`
    const hash = (await $.process.run(['shasum', '-a', '256', src])).stdout.slice(0, 10)
    // a small .app round the binary: macOS allows notifications only from a bundle
    const app = `${dir}/AgentWebMini-${hash}.app`, bin = `${app}/Contents/MacOS/agentweb-mini-${hash}`
    if ((await $.process.run(['test', '-x', bin])).exitCode !== 0) {
      // without the Command Line Tools /usr/bin/swiftc only pops up the install dialog
      if ((await $.process.run(['xcode-select', '-p'])).exitCode !== 0) why = 'no-tools'
      else {
        await $.process.run(['mkdir', '-p', `${app}/Contents/MacOS`])
        await $.fs.write(`${app}/Contents/Info.plist`, miniPlist(`agentweb-mini-${hash}`))
        // built under a temp name, then moved: two sessions building at once never run a half-written file
        const tmp = `${bin}.${await $.clock.now()}`
        const built = await $.process.run(['swiftc', '-O', src, '-o', tmp], { timeoutMs: 120_000 })
        if (built.exitCode === 0) {
          await $.process.run(['mv', '-f', tmp, bin])
          // ad-hoc signed, so macOS knows the bundle again on the next launch and keeps its notification setting
          await $.process.run(['codesign', '--force', '-s', '-', app])
        } else why = 'build-failed'
      }
    }
    if (!why && (await $.process.run(['test', '-x', bin])).exitCode === 0) {
      const port = new URL(address).port
      await $.process.run(['pkill', '-f', `agentweb-mini[^ ]* http://127\\.0\\.0\\.1:${port}/`])
      // through Launch Services, so it runs as an app (menu bar item, notifications) and outlives this call
      if ((await $.process.run(['open', '-n', app, '--args', mini])).exitCode === 0) return 'native'
    }
  }
  const app = await $.process.run(['open', '-na', 'Google Chrome', '--args', `--app=${mini}`, '--window-size=480,270', '--new-window'])
  if (app.exitCode === 0) return why ?? 'chrome'
  await $.process.run(['open', mini])
  return why ?? 'browser'
}

/** Opens the page in a window of its own: a Chrome app window when Chrome is there, else the default browser. */
export async function openWebWindow($: EngineInterface, address: string): Promise<'chrome' | 'browser'> {
  if (await isWindows($)) return (await openAppWindowWindows($, address)) ? 'chrome' : 'browser'
  const app = await $.process.run(['open', '-na', 'Google Chrome', '--args', `--app=${address}`, '--new-window'])
  if (app.exitCode === 0) return 'chrome'
  await $.process.run(['open', address])
  return 'browser'
}

/**
 * Windows: an Edge app window (Edge ships with Windows), else the default browser. `start` returns at once, as
 * `open` does on macOS. The address has no spaces or `&`, so cmd passes it through unquoted.
 */
async function openAppWindowWindows($: EngineInterface, address: string, size?: string): Promise<boolean> {
  const app = await $.process.run(['cmd', '/c', 'start', 'msedge', `--app=${address}`, '--new-window', ...(size ? [`--window-size=${size}`] : [])]).catch(() => undefined)
  if (app?.exitCode === 0) return true
  await $.process.run(['explorer', address]).catch(() => undefined)
  return false
}
