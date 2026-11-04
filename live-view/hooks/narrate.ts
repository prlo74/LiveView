// Turns what an agent did into one plain sentence for the Team view.
import type { FxEvent, Kind, Update } from '../types'

const MERGE_MS = 60_000
const KEEP = 30

const base = (path: string) => path.split('/').pop() || path
const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const host = (url: string) => /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.replace(/^www\./, '') ?? url

/** A shell command in everyday words where it is a common one, else the command itself. */
function command(cmd: string): string {
  const c = cmd.trim().split('\n')[0] ?? ''
  if (/^(npm|pnpm|yarn|bun)\s+(i|install|add)\b/.test(c)) return 'Installed packages'
  if (/^git\s+commit\b/.test(c)) return 'Committed changes'
  if (/^git\s+push\b/.test(c)) return 'Pushed to git'
  if (/^git\s+(status|diff|log|show)\b/.test(c)) return 'Checked git history'
  if (/^(ls|find|tree)\b/.test(c)) return 'Looked around the folders'
  if (/^(cat|head|tail|sed -n|wc)\b/.test(c)) return 'Peeked at a file'
  if (/^mkdir\b/.test(c)) return 'Made a folder'
  const script = /^(?:npm|pnpm|yarn|bun)\s+run\s+(build|dev|start)\b/.exec(c)
  if (script) return `Started the ${script[1]} script`
  return `Ran ${short(c, 40)}`
}

/**
 * One plain sentence for a finished tool call. `fx` is the reaction the call earned (an edit's size, a test result),
 * `adds`/`dels` the lines it changed.
 */
export function narrate(
  tool: string,
  kind: Kind,
  target: string,
  fx: Pick<FxEvent, 'kind' | 'label' | 'size'> | undefined,
  isFailed: boolean,
  adds: number,
  dels: number,
): Omit<Update, 'at'> {
  const name = base(target)
  if (fx?.kind === 'pass') return { text: `Ran the tests: ${fx.label}`, tone: 'pass' }
  if (fx?.kind === 'fail') return { text: `Ran the tests: ${fx.label}`, tone: 'fail' }
  if (isFailed) {
    if (kind === 'run') return { text: `A command failed: ${short(target.split('\n')[0] ?? '', 40)}`, tone: 'error' }
    return { text: `${tool} didn't work${name ? ` on ${short(name, 30)}` : ''}`, tone: 'error' }
  }
  switch (kind) {
    case 'edit':
      if (tool === 'Write') return { text: `Wrote ${name} (${plural(adds, 'line')})`, tone: 'add' }
      if (dels === 0) return { text: `Added ${plural(adds, 'line')} to ${name}`, tone: 'add' }
      if (adds === 0) return { text: `Removed ${plural(dels, 'line')} from ${name}`, tone: 'cut' }
      return adds >= dels
        ? { text: `Changed ${name} (+${adds} −${dels})`, tone: 'add' }
        : { text: `Trimmed ${name} (+${adds} −${dels})`, tone: 'cut' }
    case 'read':
      return { text: `Read ${name}`, tone: 'info', mergeKey: 'read', names: [name] }
    case 'run':
      return { text: command(target), tone: 'info' }
    case 'search':
      return tool === 'Glob'
        ? { text: `Looked for files matching ${short(target, 30)}`, tone: 'info', mergeKey: 'search', names: [target] }
        : { text: `Searched the code for "${short(target, 30)}"`, tone: 'info', mergeKey: 'search', names: [target] }
    case 'browse':
      if (tool === 'WebSearch') return { text: `Searched the web for "${short(target, 36)}"`, tone: 'info' }
      return { text: `Read a page on ${host(target) || 'the web'}`, tone: 'info', mergeKey: 'browse', names: [host(target)] }
    case 'agent':
      return { text: `Handed "${short(target, 40)}" to a helper`, tone: 'info' }
    default:
      return { text: `Used ${tool}`, tone: 'info' }
  }
}

/** The text a run of merged updates reads as. */
function merged(key: string, names: string[]): string {
  const list = (ns: string[]) => {
    const unique = [...new Set(ns)]
    const shown = unique.slice(0, 3).join(', ')
    return unique.length > 3 ? `${shown} +${unique.length - 3} more` : shown
  }
  if (key === 'read') return `Read ${plural(names.length, 'file')}: ${list(names)}`
  if (key === 'browse') return `Read ${plural(names.length, 'page')} on ${list(names)}`
  return `Searched the code ${plural(names.length, 'time')}`
}

/** `list` with `u` added: it joins the last update when both share a merge key and land within a minute. Kept to 30. */
export function pushUpdate(list: Update[], u: Update): Update[] {
  const last = list[list.length - 1]
  if (u.mergeKey && last?.mergeKey === u.mergeKey && u.at - last.at < MERGE_MS) {
    const names = [...(last.names ?? []), ...(u.names ?? [])]
    return [...list.slice(0, -1), { ...last, at: u.at, names, text: merged(u.mergeKey, names) }]
  }
  return [...list, u].slice(-KEEP)
}

/** "now", "40s", "3m", "2h": how long ago `at` was. */
export function ago(now: number, at: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 5) return 'now'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}
