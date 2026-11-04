// CONTRACT STUB — the charts agent replaces the bodies; keep every export and signature.
// Pure chart builders: SVG strings for the desktop pane's `Svg`, block text elsewhere.
import type { Part } from './metrics'

export const COBALT = '#00E5FF'
export const GLOW = '#FCEE0A'
export const INK = '#06060A'
export const CARD = '#0C0D14'
export const LINE = '#1E2A3A'
export const MUTED = '#7A8BA8'
export const TEXT = '#D6F9FF'
export const UP = '#39FF88'
export const DOWN = '#FF2A6D'
/** Slice colours (Netrunner neon), cyan first, distinct in lightness as well as hue. */
export const PALETTE: string[] = [COBALT, GLOW, '#FF2A6D', '#39FF88', '#B36BFF', '#FF9F1C', '#3D8BFF', '#0A8F9E']

export type Slice = { label: string; value: number; color: string }

/** Parts as slices, coloured from PALETTE in order; empty parts dropped. */
export function slices(parts: Part[]): Slice[] {
  return parts.filter(p => p.value > 0).map((p, i) => ({ ...p, color: PALETTE[i % PALETTE.length]! }))
}

const r1 = (n: number) => Math.round(n * 10) / 10
const total = (sl: Slice[]) => sl.reduce((a, s) => a + Math.max(0, s.value), 0)

/** Legend rows for slices: share of the total as 0..1. */
export function legend(sl: Slice[]): { label: string; value: number; pct: number; color: string }[] {
  const t = total(sl)
  return sl.map(s => ({ label: s.label, value: s.value, pct: t > 0 ? Math.max(0, s.value) / t : 0, color: s.color }))
}

/** A ring chart (`size` px square) as an SVG document string. */
export function donutSvg(sl: Slice[], size = 120): string {
  const c = size / 2, stroke = Math.max(4, size * 0.12), r = c - stroke / 2 - 2
  const C = 2 * Math.PI * r, t = total(sl), gap = 2
  const live = t > 0 ? sl.filter(s => s.value > 0) : []
  let off = 0
  const arcs = live.map(s => {
    const len = (s.value / t) * C
    const dash = live.length === 1 ? C : Math.max(0, len - gap)
    const el = `<circle cx="${c}" cy="${c}" r="${r1(r)}" fill="none" stroke="${s.color}" stroke-width="${r1(stroke)}" stroke-dasharray="${r1(dash)} ${r1(C)}" stroke-dashoffset="${r1(-off)}"/>`
    off += len
    return el
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<defs><filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${r1(size / 60)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
    + `<circle cx="${c}" cy="${c}" r="${r1(r)}" fill="none" stroke="${LINE}" stroke-width="${r1(stroke)}"/>`
    + (arcs ? `<g transform="rotate(-90 ${c} ${c})" filter="url(#glow)">${arcs}</g>` : '')
    + `</svg>`
}

/** A line sparkline as an SVG document string. */
export function sparkSvg(values: number[], o: { width?: number; height?: number; color?: string } = {}): string {
  const w = o.width ?? 80, h = o.height ?? 24, color = o.color ?? COBALT
  const vs = (values.length ? values : [0]).map(v => (Number.isFinite(v) ? Math.max(0, v) : 0))
  const pts = vs.length === 1 ? [vs[0]!, vs[0]!] : vs
  const max = Math.max(...pts), pad = 3
  const xy = pts.map((v, i) => [r1((i / (pts.length - 1)) * (w - pad * 2) + pad), r1(max > 0 ? h - pad - (v / max) * (h - pad * 2) : h - pad)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
  const [lx, ly] = xy[xy.length - 1]!
  const id = `sg${color.replace(/[^0-9a-z]/gi, '')}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`
    + `<path d="${line} L${lx} ${h} L${xy[0]![0]} ${h} Z" fill="url(#${id})"/>`
    + `<path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<circle cx="${lx}" cy="${ly}" r="2" fill="${color}"/>`
    + `</svg>`
}

const BLOCKS = ' ▁▂▃▄▅▆▇█'

/** A sparkline in block characters, one per value. */
export function sparkText(values: number[]): string {
  const vs = values.map(v => (Number.isFinite(v) ? Math.max(0, v) : 0))
  const max = Math.max(0, ...vs)
  if (max === 0) return '▁'.repeat(vs.length)
  return vs.map(v => BLOCKS[Math.round((v / max) * 8)]!).join('')
}

/** One `█░` bar line per slice, `width` columns of bar. */
export function barText(sl: Slice[], width: number): string[] {
  const w = Math.max(0, Math.floor(width))
  return legend(sl).map(s => {
    const f = Math.min(w, Math.round(s.pct * w))
    return `${'█'.repeat(f)}${'░'.repeat(w - f)} ${s.label} ${fmt.pct(s.pct)}`
  })
}

/** "↑12.5% vs prev" and its tone; flat when there is no previous value. */
export function deltaLabel(cur: number, prev: number | null): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (prev === null || !Number.isFinite(prev) || !Number.isFinite(cur)) return { text: '—', tone: 'flat' }
  if (prev === 0) return cur > 0 ? { text: 'new', tone: 'up' } : { text: '—', tone: 'flat' }
  const ch = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(ch) < 0.05) return { text: '0.0% vs prev', tone: 'flat' }
  return { text: `${ch > 0 ? '↑' : '↓'}${Math.abs(ch).toFixed(1)}% vs prev`, tone: ch > 0 ? 'up' : 'down' }
}

function compact(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? '-' : ''
  if (a < 1000) return sign + String(Number.isInteger(a) ? a : r1(a))
  for (const [d, u] of [[1e3, 'K'], [1e6, 'M'], [1e9, 'B']] as const) {
    const v = r1(a / d)
    if (v < 1000 || u === 'B') return `${sign}${v}${u}`
  }
  return String(n)
}

function duration(ms: number): string {
  if (!(ms >= 0)) return '0ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000 && r1(ms / 1000) < 60) return `${r1(ms / 1000).toFixed(1)}s`
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export const fmt = {
  num: compact,
  usd: (n: number) => (n > 0 && n < 0.01 ? '<$0.01' : `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`),
  ms: duration,
  pct: (n: number) => `${((Number.isFinite(n) ? n : 0) * 100).toFixed(1)}%`,
}
