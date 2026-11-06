import { expect, test } from 'claude-code/testing'
import type { AgentView } from '../types'
import { attentionOf, NEEDS_YOU_AFTER } from '../hooks/lib'
import { KEEP_DONE, webSnapshot } from '../hooks/web'

const agent = (over: Partial<AgentView>): AgentView => ({
  id: 'main', label: 'Main agent', status: 'working', steps: [], files: [], edits: [], linesChanged: 0, startedAt: 0,
  usage: { input: 0, output: 0, cacheRead: 0 }, costUsd: 0, turns: 0, turnMs: 0, calls: 0, errors: 0, stepMs: 0, toolMix: {}, updates: [], ...over,
})

test('a question or a plan waiting on the person reads as needs you, in plain words', () => {
  const at = NEEDS_YOU_AFTER + 1
  expect(attentionOf(agent({ waiting: { since: 0, tool: 'AskUserQuestion', person: true } }), at)).toMatchObject({ kind: 'wait', text: 'Waiting for your answer' })
  expect(attentionOf(agent({ waiting: { since: 0, tool: 'ExitPlanMode', person: true } }), at)).toMatchObject({ kind: 'wait', text: 'Waiting for you to approve the plan' })
  expect(attentionOf(agent({ waiting: { since: 0, tool: 'Bash', person: true } }), at)?.text).toBe('Waiting for your approval · Bash')
})

test('finished helpers past the newest few are trimmed to their node, so long sessions stay small', () => {
  const step = (at: number) => ({ id: `s${at}`, at, tool: 'Read', kind: 'read' as const, target: 'a.ts', isDone: true })
  const agents: Record<string, AgentView> = { main: agent({}) }
  for (let i = 0; i < KEEP_DONE + 5; i++) {
    agents[`h${i}`] = agent({ id: `h${i}`, label: `h${i}`, parentId: 'main', status: 'done', steps: [step(i), step(i + 0.5)], files: [{ path: 'a.ts', adds: 1, dels: 0, isEdited: true }], plan: [{ text: 'x', status: 'completed' }] })
  }
  const snap = webSnapshot(agents, {}, [], 1000)
  const full = snap.agents.filter(a => a.files.length), slim = snap.agents.filter(a => a.parentId && !a.files.length)
  // the newest KEEP_DONE helpers stay whole; the oldest five keep one step and no plan
  expect(full.length).toBe(KEEP_DONE)
  expect(slim.map(a => a.id).sort()).toEqual(['h0', 'h1', 'h2', 'h3', 'h4'])
  expect(slim.every(a => a.steps.length === 1 && a.plan === undefined && !a.screen)).toBe(true)
  expect(snap.agents.length).toBe(KEEP_DONE + 6)
})
