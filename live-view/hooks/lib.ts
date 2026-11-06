// Pure helpers shared by the hooks module and the screen's surface module.
import type { AgentView, Screen, ScreenLine, Step } from '../types'

// ---------- secrets: masked before anything is stored, drawn, written to the page or replayed ----------
const HIDDEN = '[secret hidden]'
const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[private key hidden]'],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, HIDDEN],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, HIDDEN],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, HIDDEN],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, HIDDEN],
  [/\bAKIA[0-9A-Z]{16}\b/g, HIDDEN],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, HIDDEN],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, HIDDEN],
  [/\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g, HIDDEN],
  [/\bnpm_[A-Za-z0-9]{36}\b/g, HIDDEN],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, HIDDEN],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, HIDDEN],
  [/hooks\.slack\.com\/services\/\S+/g, `hooks.slack.com/services/${HIDDEN}`],
  // the password in user:password@host, any scheme
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi, `$1${HIDDEN}@`],
  [/(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${HIDDEN}`],
  // key = value where the value looks like a secret (8+ characters with a digit), so `token: string` in code stays readable
  [/(\b[A-Za-z_]*(?:api[_-]?key|private[_-]?key|access[_-]?key|_key|secret|token|passw(?:or)?d)[A-Za-z_]*["']?\s*[:=]\s*["']?)(?=[^\s"',;]*\d)[A-Za-z0-9_\-./+=]{8,}/gi, `$1${HIDDEN}`],
]
/** The text with keys, tokens and passwords masked. */
export function redact(text: string): string {
  let t = text
  for (const [re, by] of SECRET_PATTERNS) t = t.replace(re, by)
  return t
}
/** Files whose contents are never shown at all: env files, keys, credentials. */
export const isSecretFile = (path: string) =>
  /(^|\/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx|keystore|jks)|id_[a-z0-9_]+(\.pub)?|credentials[^/]*|\.git-credentials|\.envrc|\.pgpass|\.dev\.vars|[^/]*\.tfvars(\.json)?|\.kube\/config|\.docker\/config\.json|\.netrc|\.npmrc|\.pypirc|secrets?\.[a-z]+)$/i.test(path)
/** Lines with secrets masked; a private key's lines go too, from its BEGIN line to its END line. */
export function redactLines<T extends { text: string }>(lines: T[]): T[] {
  let inKey = false
  return lines.map(l => {
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(l.text)) inKey = true
    const out = { ...l, text: inKey ? '[private key hidden]' : redact(l.text) }
    if (/-----END [A-Z ]*PRIVATE KEY-----/.test(l.text)) inKey = false
    return out
  })
}

// ---------- attention: what needs the person ----------
export type Attention = { kind: 'wait' | 'long' | 'stuck' | 'struggling' | 'quiet'; short: string; text: string; since?: number }
/**
 * An approval pending, a call running long, repeated failures, or silence. A call the person declined is their choice
 * and never counts as the agent failing.
 */
/** How long an approval waits before it shows as "Needs you". */
export const NEEDS_YOU_AFTER = 30_000

export function attentionOf(a: AgentView, now: number): Attention | undefined {
  if (a.status !== 'working') return undefined
  // an ask the mode settles (auto mode's classifier) is not the person's; a short wait is usually answered already
  if (a.waiting && a.waiting.person !== false && now - a.waiting.since >= NEEDS_YOU_AFTER) {
    // the engine says when it asks, not when the person answers: after a while an unconfirmed ask may well be running
    return a.waiting.person || now - a.waiting.since < 90_000
      ? { kind: 'wait', short: 'Needs you', text: a.waiting.tool === 'AskUserQuestion' ? 'Waiting for your answer' : a.waiting.tool === 'ExitPlanMode' ? 'Waiting for you to approve the plan' : `Waiting for your approval · ${a.waiting.tool}`, since: a.waiting.since }
      : { kind: 'wait', short: 'Needs you?', text: `Asked to approve ${a.waiting.tool} · may be running now`, since: a.waiting.since }
  }
  const last = a.steps[a.steps.length - 1]
  // a running Agent/Task is the helper working, not the main agent stuck
  if (last && !last.isDone && last.kind !== 'agent' && now - last.at > 240_000) return { kind: 'long', short: 'Long run', text: `${last.tool} still running`, since: last.at }
  const failed = (s: Step) => !!s.isError && !s.isDenied
  const done = a.steps.filter(s => s.isDone), last3 = done.slice(-3)
  if (last3.length === 3 && last3.every(failed)) {
    const same = last3.every(s => s.tool === last3[0]!.tool && s.target === last3[0]!.target)
    return { kind: 'stuck', short: 'Stuck', text: same ? `The same ${last3[0]!.tool} failed 3 times in a row` : 'Its last 3 actions failed' }
  }
  const last10 = done.slice(-10), bad = last10.filter(failed).length
  if (last10.length >= 6 && bad >= 5) return { kind: 'struggling', short: 'Struggling', text: `${bad} of its last ${last10.length} actions failed` }
  if (last && last.isDone && now - (last.endAt ?? last.at) > 180_000) return { kind: 'quiet', short: 'Quiet', text: 'No action', since: last.endAt ?? last.at }
  return undefined
}

/** The lines of a screen that fit `rows`, centred on `focus` (a terminal shows its tail). */
export function viewLines(s: Screen, rows: number, focus: number = s.focus): ScreenLine[] {
  if (s.kind === 'terminal') return s.lines.slice(-rows)
  const start = Math.max(0, Math.min(Math.round(focus) - Math.floor(rows / 3), s.lines.length - rows))
  return s.lines.slice(start, start + rows)
}

/** Lines as `Code` props: a unified diff when any line is marked, else plain source numbered from its first line. */
export function toCode(lines: ScreenLine[], numbered: boolean): { source: string; format?: 'diff'; startLine?: number } {
  if (!lines.some(l => l.mark !== ' ')) return { source: lines.map(l => l.text).join('\n'), startLine: numbered ? lines[0]?.no : undefined }
  const start = lines[0]?.no ?? 1
  const oldN = lines.filter(l => l.mark !== '+').length
  const newN = lines.filter(l => l.mark !== '-').length
  return { source: [`@@ -${start},${oldN} +${start},${newN} @@`, ...lines.map(l => `${l.mark}${l.text}`)].join('\n'), format: 'diff' }
}

/** Pass/fail counts from a test command's output (jest, vitest, pytest, mocha, go, cargo); undefined when it is no test run. */
export function testCounts(cmd: string, out: string): { passed: number; failed: number } | undefined {
  if (!/\b(test|tests|jest|vitest|pytest|mocha|spec)\b/i.test(cmd)) return undefined
  const most = (re: RegExp) => {
    let n = 0
    for (const m of out.matchAll(re)) n = Math.max(n, Number(m[1]))
    return n
  }
  let passed = most(/(\d+)\s+(?:passed|passing)\b/gi)
  let failed = most(/(\d+)\s+(?:failed|failing)\b/gi)
  if (!passed && !failed) {
    if (/^(?:FAIL|--- FAIL)\b/m.test(out)) failed = 1
    else if (/^(?:ok|PASS)\s/m.test(out)) passed = 1
  }
  return passed || failed ? { passed, failed } : undefined
}

const SPARK = ' ▁▂▃▄▅▆▇█'

/** Edits per 5 s over the last minute, as block characters. */
export function sparkline(times: number[], now: number, buckets = 12, span = 60_000): string {
  const counts = new Array<number>(buckets).fill(0)
  for (const t of times) {
    const age = now - t
    if (age >= 0 && age < span) counts[buckets - 1 - Math.floor(age / (span / buckets))]! += 1
  }
  const max = Math.max(1, ...counts)
  return counts.map(n => SPARK[Math.round((n / max) * 8)]).join('')
}

export const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3

/** A seeded random stream, so an effect looks the same on every redraw. */
export function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

export type Effect = 'sparks' | 'confetti' | 'lightning'
export type Particle = { x: number; y: number; ch: string; color: string }
export const EFFECT_MS: Record<Effect, number> = { sparks: 800, confetti: 1800, lightning: 520 }
const CONFETTI_COLORS = ['success', 'warning', 'error', 'claude', 'suggestion', 'merged', 'planMode']

/** Where each particle of `effect` sits `t` ms in, inside a `cols`×`rows` region; at most 40. */
export function particles(effect: Effect, seed: string, t: number, cols: number, rows: number, originRow: number): Particle[] {
  if (cols <= 0 || rows <= 0 || t < 0 || t > EFFECT_MS[effect]) return []
  const r = rng(seed)
  const out: Particle[] = []
  if (effect === 'sparks') {
    for (let i = 0; i < 28; i++) {
      const angle = r() * Math.PI * 2
      const speed = 0.015 + r() * 0.035
      const life = EFFECT_MS.sparks * (0.5 + r() * 0.5)
      const cx = r() * cols
      const ch = '✦*·˙'[Math.floor(r() * 4)]!
      const color = r() < 0.5 ? 'success' : 'warning'
      if (t > life) continue
      out.push({ x: cx + Math.cos(angle) * speed * t * 2, y: originRow + Math.sin(angle) * speed * t, ch, color })
    }
  } else if (effect === 'confetti') {
    for (let i = 0; i < 36; i++) {
      const x0 = r() * cols
      const y0 = -r() * 3
      const fall = (rows + 3) * (0.7 + r() * 0.6)
      const phase = r() * 6
      const ch = '▪●▲■◆★'[Math.floor(r() * 6)]!
      const color = CONFETTI_COLORS[Math.floor(r() * CONFETTI_COLORS.length)]!
      out.push({ x: x0 + Math.sin(t / 150 + phase) * 1.5, y: y0 + fall * (t / 1500) ** 1.5, ch, color })
    }
  } else {
    // Two bolts that strobe: drawn on even 70 ms frames only.
    if (Math.floor(t / 70) % 2 === 1) return []
    const color = Math.floor(t / 70) % 4 === 0 ? 'warning' : 'text'
    for (let bolt = 0; bolt < 2; bolt++) {
      let x = Math.floor(r() * cols)
      out.push({ x, y: 0, ch: '⚡', color })
      for (let y = 1; y < Math.min(rows, 14); y++) {
        const step = r() < 0.5 ? -1 : 1
        x += step
        out.push({ x, y, ch: step < 0 ? '╱' : '╲', color })
      }
    }
  }
  return out
    .map(p => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }))
    .filter(p => p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows)
    .slice(0, 40)
}
