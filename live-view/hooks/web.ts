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
import http.server, functools, sys, urllib.parse, subprocess, os
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
            if sys.platform == 'darwin': subprocess.Popen(['open', '-a', 'Claude'])
            self.send_response(204)
            self.end_headers()
        else:
            self.send_error(403)
    def list_directory(self, path):
        self.send_error(404)
        return None
handler = functools.partial(H, directory=sys.argv[1])
try:
    s = http.server.ThreadingHTTPServer(('127.0.0.1', ${WEB_PORT}), handler)
except OSError:
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
print(s.server_address[1], flush=True)
s.serve_forever()
`

const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

/** What the page reads: each agent trimmed to what the web draws, plus the session's totals. */
export function webSnapshot(agents: Record<string, AgentView>, sites: Record<string, Site>, series: Bucket[], now: number) {
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
      plan: a.plan?.slice(0, 24).map(s => ({ text: cut(s.text, 90), status: s.status })),
      fx: a.fx,
      steps: a.steps.slice(-14).map(s => ({
        at: s.at,
        endAt: s.endAt,
        tool: s.tool,
        kind: s.kind,
        target: cut(s.target.split('\n')[0] ?? '', 90),
        isDone: s.isDone,
        isError: s.isError,
        isDenied: s.isDenied,
      })),
      updates: a.updates.slice(-10),
      files: a.files.slice(-8),
      screen: a.screen && {
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
let lastJson = ''
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
    const child = $.process.spawn({ argv: [...(await pythonArgv($)), '-I', '-c', SERVER, dir] })
    return new Promise<string | undefined>(resolve => {
      void (async () => {
        try {
          for await (const { stream, text } of child) {
            const port = stream === 'stdout' && !url ? /(\d+)/.exec(text)?.[1] : undefined
            if (port) {
              url = `http://127.0.0.1:${port}/`
              resolve(url)
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
export async function writeWebState($: EngineInterface, snap: ReturnType<typeof webSnapshot> & { preview?: unknown; servers?: unknown }) {
  if (!dir || !url) return
  const { now: _now, ...rest } = snap
  const body = JSON.stringify(rest)
  if (body === lastJson) return
  lastJson = body
  await $.fs.write(`${dir}/state.json`, JSON.stringify(snap))
}

/**
 * Opens the small monitor (?mini): a native always-on-top window (built once with swiftc, cached under ~/Library/Caches),
 * else a small Chrome app window, which cannot stay on top.
 */
export async function openMiniWindow($: EngineInterface, address: string): Promise<'native' | 'chrome'> {
  const mini = `${address}?mini`
  if (await isWindows($)) {
    await openAppWindowWindows($, mini)
    return 'chrome'
  }
  const home = (await $.env.get('HOME')) ?? ''
  const dir = `${home}/Library/Caches/agentweb-mini`, bin = `${dir}/agentweb-mini`, src = `${$.plugin.root}/mini/MiniWindow.swift`
  if (home) {
    // rebuilt only when the source is newer than the binary
    const fresh = (await $.process.run(['test', bin, '-nt', src])).exitCode === 0
    if (!fresh) {
      await $.process.run(['mkdir', '-p', dir])
      await $.process.run(['swiftc', '-O', src, '-o', bin], { timeoutMs: 120_000 })
    }
    if ((await $.process.run(['test', '-x', bin])).exitCode === 0) {
      await $.process.run(['pkill', '-x', 'agentweb-mini'])
      // detached, so it outlives this call
      await $.process.run(['sh', '-c', 'nohup "$0" "$1" >/dev/null 2>&1 &', bin, mini])
      return 'native'
    }
  }
  await $.process.run(['open', '-na', 'Google Chrome', '--args', `--app=${mini}`, '--window-size=480,270', '--new-window'])
  return 'chrome'
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
async function openAppWindowWindows($: EngineInterface, address: string): Promise<boolean> {
  const app = await $.process.run(['cmd', '/c', 'start', 'msedge', `--app=${address}`, '--new-window']).catch(() => undefined)
  if (app?.exitCode === 0) return true
  await $.process.run(['explorer', address]).catch(() => undefined)
  return false
}
