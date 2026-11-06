// Other tools LiveView shows when they are in use: Headroom's token savings, and the Caveman / Ponytail output modes.
import type { EngineInterface } from 'claude-code'

export type Pairings = {
  /** Output-shortening plugins switched on, with their level ("full"). */
  modes: { name: string; level: string }[]
  /** Tokens Headroom saved since this session started; usd only when Headroom prices it. */
  headroom?: { tokens: number; usd?: number }
}

/** The proxy Claude talks to, when it runs on this machine (Headroom's `headroom proxy`). */
export function localProxy(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined
  try {
    const u = new URL(baseUrl)
    return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ? `${u.protocol}//${u.host}` : undefined
  } catch {
    return undefined
  }
}

/** Headroom's /stats: tokens saved, and dollars only when it has prices (litellm_available false means unpriced, not $0). */
export function parseHeadroom(text: string): { tokens: number; usd?: number } | undefined {
  let s: { tokens?: { saved?: unknown }; cost?: { total_savings_usd?: unknown }; litellm_available?: unknown }
  try { s = JSON.parse(text) } catch { return undefined }
  const tokens = s?.tokens?.saved
  if (typeof tokens !== 'number' || !Number.isFinite(tokens)) return undefined
  const usd = s.cost?.total_savings_usd
  return { tokens, ...(s.litellm_available !== false && typeof usd === 'number' && Number.isFinite(usd) ? { usd } : {}) }
}

/** A mode file's word, if it is one; anything else is ignored rather than shown. */
export const modeLevel = (text: string | undefined) => (text && /^[a-z]{2,12}$/.test(text.trim()) ? text.trim() : undefined)

export type HeadroomBase = { tokens: number; usd?: number }

/** Reads what is in use right now. Never throws: a tool that is not there is simply left out.
 *  Headroom's figures cover the whole proxy, so `base` (the session's first reading, kept by the caller) is the zero counted from. */
export async function readPairings($: EngineInterface, base?: HeadroomBase): Promise<{ pairings: Pairings; base?: HeadroomBase }> {
  const home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
  const modes: Pairings['modes'] = []
  for (const name of ['caveman', 'ponytail']) {
    const text = home ? await $.fs.read(`${home}/.claude/.${name}-active`).catch(() => undefined) : undefined
    const level = modeLevel(typeof text === 'string' ? text : undefined)
    if (level && level !== 'off') modes.push({ name, level })
  }
  const proxy = localProxy(await $.env.get('ANTHROPIC_BASE_URL').catch(() => undefined))
  if (!proxy) return { pairings: { modes }, base }
  const r = await $.http.fetch(`${proxy}/stats`).catch(() => undefined)
  const now = r?.ok ? parseHeadroom(r.text) : undefined
  if (!now) return { pairings: { modes }, base }
  const zero = base ?? now
  const usd = now.usd !== undefined && zero.usd !== undefined ? now.usd - zero.usd : undefined
  return { pairings: { modes, headroom: { tokens: Math.max(0, now.tokens - zero.tokens), ...(usd !== undefined ? { usd: Math.max(0, usd) } : {}) } }, base: zero }
}
