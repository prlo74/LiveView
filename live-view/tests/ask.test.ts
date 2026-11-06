import { expect, test } from 'claude-code/testing'
import { deliverAsk } from '../hooks/web'

test('a message from the Agent Web is sent framed as LiveView\'s, or added to the prompt box on its own line', async () => {
  const sent: Record<string, unknown>[] = [], filled: Record<string, unknown>[] = []
  // just the prompt calls deliverAsk makes; something is already typed in Claude's box
  const $ = {
    prompt: {
      submit: async (e: Record<string, unknown>) => { sent.push(e); return { text: e.text } },
      fill: async (e: Record<string, unknown>) => { filled.push(e); return { isFilled: true } },
      read: async () => ({ text: 'check the tests', cursor: 15 }),
    },
  }

  await deliverAsk($ as never, JSON.stringify({ text: 'run the tests', mode: 'send' }))
  await deliverAsk($ as never, JSON.stringify({ text: 'draft this', mode: 'draft' }))
  // junk from the pipe is ignored
  await deliverAsk($ as never, 'not json')
  await deliverAsk($ as never, JSON.stringify({ text: '   ' }))

  expect(sent.length).toBe(1)
  expect(sent[0]).toMatchObject({ text: 'run the tests' })
  // any program on this machine can reach /ask, so it never passes as the person's own words
  expect(sent[0]!.asUser).toBeUndefined()
  expect(filled.length).toBe(1)
  expect(filled[0]).toMatchObject({ text: '\ndraft this', mode: 'append' })
})
