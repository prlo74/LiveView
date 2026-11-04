// An agent's goal and the steps it plans to reach it, read from its own to-do tool calls.
import type { PlanStep } from '../types'
import { redact } from './lib'

const STATUS: Record<string, PlanStep['status']> = { completed: 'completed', done: 'completed', in_progress: 'in_progress', pending: 'pending' }
const status = (s: unknown): PlanStep['status'] => STATUS[String(s)] ?? 'pending'
const text = (s: unknown) => (typeof s === 'string' ? redact(s.replace(/\s+/g, ' ').trim()) : '')
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [])

/** The plan after this tool call, or undefined when the call is not a plan tool. */
export function nextPlan(plan: PlanStep[] | undefined, tool: string, input: Record<string, unknown>): PlanStep[] | undefined {
  const cur = plan ?? []
  if (tool === 'TodoWrite') return list(input.todos).map(t => ({ text: text(t.content), status: status(t.status) })).filter(t => t.text)
  if (tool.endsWith('update_plan')) {
    if (Array.isArray(input.items)) return list(input.items).map(t => ({ text: text(t.content), status: status(t.status) })).filter(t => t.text)
    let next = cur.map(s => ({ ...s }))
    if (input.advance === true) {
      const i = next.findIndex(s => s.status === 'in_progress')
      if (i >= 0) next[i]!.status = 'completed'
      const j = next.findIndex(s => s.status === 'pending')
      if (j >= 0) next[j]!.status = 'in_progress'
    }
    if (Array.isArray(input.done)) for (const n of input.done) if (next[Number(n) - 1]) next[Number(n) - 1]!.status = 'completed'
    if (typeof input.start === 'number' && next[input.start - 1]) {
      next = next.map(s => (s.status === 'in_progress' ? { ...s, status: 'pending' } : s))
      next[input.start - 1]!.status = 'in_progress'
    }
    return next
  }
  // shortcut: TaskCreate ids are taken as the next number after the highest seen, which is how the tool numbers them in a fresh session.
  if (tool === 'TaskCreate') {
    const t = text(input.subject)
    const id = Math.max(0, ...cur.map(s => Number(s.id) || 0)) + 1
    return t ? [...cur, { id: String(id), text: t, status: 'pending' }] : cur
  }
  if (tool === 'TaskUpdate') {
    const id = String(input.taskId ?? '')
    if (input.status === 'deleted') return cur.filter(s => s.id !== id)
    return cur.map(s => (s.id === id ? { ...s, status: input.status ? status(input.status) : s.status, text: text(input.subject) || s.text } : s))
  }
  return undefined
}

/** The goal in one line: the first sentence of the task, cut to 120 characters. */
export function goalText(task: string | undefined) {
  const first = (task ?? '').split(/(?<=[.!?])\s/)[0]?.trim() ?? ''
  return first ? (first.length > 120 ? `${first.slice(0, 119)}…` : first) : undefined
}
