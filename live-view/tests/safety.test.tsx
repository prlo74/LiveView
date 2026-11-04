import { expect, test } from 'claude-code/testing'

import { attentionOf, isSecretFile, redact, redactLines } from '../hooks/lib'
import { isBroadFolder } from '../hooks/web'
import type { AgentView, Step } from '../types'

const agent = (over: Partial<AgentView>): AgentView => ({
  id: 'w1', label: 'build:web', status: 'working', steps: [], files: [], edits: [], linesChanged: 0, startedAt: 0,
  usage: { input: 0, output: 0, cacheRead: 0 }, costUsd: 0, turns: 0, turnMs: 0, calls: 0, errors: 0, stepMs: 0, toolMix: {}, updates: [], ...over,
})
const step = (over: Partial<Step>): Step => ({ id: 's', at: 0, tool: 'Bash', kind: 'run', target: 'npm test', isDone: true, endAt: 1, ...over })

test('secrets are masked, ordinary code is left readable', () => {
  expect(redact('curl -H "Authorization: Bearer abcdefgh12345678" x')).toBe('curl -H "Authorization: Bearer [secret hidden]" x')
  expect(redact('ANTHROPIC_API_KEY=sk-ant-api03-abcdefghij')).toBe('ANTHROPIC_API_KEY=[secret hidden]')
  expect(redact('push with ghp_abcdefghijklmnopqrstuvwxyz0123')).toBe('push with [secret hidden]')
  expect(redact('const token: string = getToken()')).toBe('const token: string = getToken()')
  expect(redact('password = "hunter22hunter"')).toBe('password = "[secret hidden]"')
  expect(isSecretFile('/p/.env.local')).toBe(true)
  expect(isSecretFile('/k/.ssh/id_ed25519')).toBe(true)
  expect(isSecretFile('/p/src/env.ts')).toBe(false)
  expect(redact('STRIPE=sk_live_abcdefghijklmnop1234')).toBe('STRIPE=[secret hidden]')
  expect(redact('DATABASE_URL=postgres://u:p@h/db')).toBe('DATABASE_URL=postgres://u:[secret hidden]@h/db')
  expect(redact('jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4')).toBe('jwt [secret hidden]')
  expect(redact(`npm_${'a1'.repeat(18)}`)).toBe('[secret hidden]')
  expect(redact('glpat-abcdefghij0123456789')).toBe('[secret hidden]')
  expect(redact('post https://hooks.slack.com/services/T00/B00/xyz')).toBe('post https://hooks.slack.com/services/[secret hidden]')
  expect(redact('PRIVATE_KEY=abc123def456')).toBe('PRIVATE_KEY=[secret hidden]')
  for (const f of ['/p/.envrc', '/h/.git-credentials', '/h/.pgpass', '/p/.dev.vars', '/p/prod.tfvars', '/h/.kube/config', '/h/.docker/config.json'])
    expect([f, isSecretFile(f)]).toEqual([f, true])
  const lines = redactLines([{ text: 'a' }, { text: '-----BEGIN OPENSSH PRIVATE KEY-----' }, { text: 'b3BlbnNzaA' }, { text: '-----END OPENSSH PRIVATE KEY-----' }, { text: 'z' }])
  expect(lines.map(l => l.text)).toEqual(['a', '[private key hidden]', '[private key hidden]', '[private key hidden]', 'z'])
})

test('attention: approvals, long runs, failures; a declined call is never the agent failing', () => {
  expect(attentionOf(agent({ waiting: { since: 0, tool: 'Bash' } }), 29_000)).toBeUndefined()
  expect(attentionOf(agent({ waiting: { since: 0, tool: 'Bash' } }), 30_000)!.short).toBe('Needs you')
  expect(attentionOf(agent({ waiting: { since: 0, tool: 'Bash' } }), 90_000)!.text).toBe('Asked to approve Bash · may be running now')
  expect(attentionOf(agent({ waiting: { since: 0, tool: 'Bash', person: true } }), 200_000)!.short).toBe('Needs you')
  expect(attentionOf(agent({ waiting: { since: 0, tool: 'Bash', person: false } }), 200_000)).toBeUndefined()
  expect(attentionOf(agent({ steps: [step({ isDone: false, endAt: undefined })] }), 300_000)!.kind).toBe('long')
  expect(attentionOf(agent({ steps: [step({ tool: 'Agent', kind: 'agent', isDone: false, endAt: undefined })] }), 300_000)).toBeUndefined()
  const fails = [1, 2, 3].map(i => step({ id: `s${i}`, isError: true }))
  expect(attentionOf(agent({ steps: fails }), 10)!.text).toBe('The same Bash failed 3 times in a row')
  expect(attentionOf(agent({ steps: fails.map(s => ({ ...s, isDenied: true })) }), 10)).toBeUndefined()
  expect(attentionOf(agent({ steps: [step({ endAt: 0 })] }), 200_000)!.kind).toBe('quiet')
  expect(attentionOf(agent({ status: 'done', waiting: { since: 0, tool: 'Bash' } }), 10)).toBeUndefined()
})

test('a preview never serves a broad folder', () => {
  const home = '/Users/x'
  for (const r of ['/', '/Users', home, `${home}/Downloads`, `${home}/Desktop/`, `${home}/Library/Mail`, '/tmp/site', '/private/var/folders/q', '/Volumes/Disk'])
    expect([r, isBroadFolder(r, home)]).toEqual([r, true])
  for (const r of [`${home}/Downloads/JadeAngel/web`, `${home}/code/site`, `${home}/Library/Application Support/Claude/scratch-workspaces/a/b`, '/Volumes/Disk/proj'])
    expect([r, isBroadFolder(r, home)]).toEqual([r, false])
})

const PANE = (requestId: string, bodyColumns: number) =>
  ({ plugin: 'live-view', component: 'Pane', requestId, props: { title: 'x', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } }) as const

test('a refused call reads as refused, and an env file never reaches the screen', async ($, on) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('fs.read', () => ({ value: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx' }))
  on('tool.call', (_, e) => (e.tool === 'Edit' ? { deny: 'no' } : { result: {}, text: '' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Read', file_path: '/p/.env' })
  const ui = await $.ui.mount({ ...PANE('live-view', 120), surface: 'desktop' })
  await ui.press({ key: 'nav-team' })
  expect(await ui.find({ type: 'Text', text: /Edit was refused on a\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sk-abcdefghijklmnop/ })).toBeUndefined()
  await ui.unmount()
})
