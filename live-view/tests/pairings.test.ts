import { expect, test } from 'claude-code/testing'
import { localProxy, modeLevel, parseHeadroom, readPairings } from '../hooks/pairings'

test('only a proxy on this machine counts as Headroom', () => {
  expect(localProxy('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
  expect(localProxy('http://localhost:8787/v1')).toBe('http://localhost:8787')
  expect(localProxy('https://api.anthropic.com')).toBeUndefined()
  expect(localProxy('not a url')).toBeUndefined()
  expect(localProxy(undefined)).toBeUndefined()
})

test('Headroom stats: tokens always, dollars only when Headroom has prices', () => {
  expect(parseHeadroom(JSON.stringify({ tokens: { saved: 1200 }, cost: { total_savings_usd: 0.5 }, litellm_available: true }))).toEqual({ tokens: 1200, usd: 0.5 })
  expect(parseHeadroom(JSON.stringify({ tokens: { saved: 1200 }, cost: { total_savings_usd: 0 }, litellm_available: false }))).toEqual({ tokens: 1200 })
  expect(parseHeadroom('{"tokens":{}}')).toBeUndefined()
  expect(parseHeadroom('<html>')).toBeUndefined()
})

test('a mode file shows only when it holds one plain word', () => {
  expect(modeLevel('full\n')).toBe('full')
  expect(modeLevel('<script>')).toBeUndefined()
  expect(modeLevel('')).toBeUndefined()
})

test('modes are read from their flag files, and Headroom counts from the first reading', async () => {
  let saved = 1000
  // just the three calls readPairings makes
  const $ = {
    env: { get: async (n: string) => (n === 'HOME' ? '/home/me' : n === 'ANTHROPIC_BASE_URL' ? 'http://127.0.0.1:8787' : undefined) },
    fs: { read: async (p: string) => { if (p.endsWith('.caveman-active')) return 'full\n'; throw new Error('ENOENT') } },
    http: { fetch: async () => ({ status: 200, ok: true, headers: {}, text: JSON.stringify({ tokens: { saved }, litellm_available: false }) }) },
  }
  const first = await readPairings($ as never)
  expect(first.pairings.modes).toEqual([{ name: 'caveman', level: 'full' }])
  expect(first.pairings.headroom).toEqual({ tokens: 0 })
  saved = 1800
  // the caller keeps the first reading (in session state) and hands it back
  expect((await readPairings($ as never, first.base)).pairings.headroom).toEqual({ tokens: 800 })
})
