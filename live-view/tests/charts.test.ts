import { expect, test } from 'claude-code/testing'

import { COBALT, LINE, PALETTE, barText, deltaLabel, donutSvg, fmt, legend, slices, sparkSvg, sparkText } from '../hooks/charts'

const safe = (svg: string) => {
  expect(svg.length < 131072).toBe(true)
  expect(svg.includes('<script')).toBe(false)
  expect(svg.includes('foreignObject')).toBe(false)
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  expect(svg.includes('viewBox=')).toBe(true)
}

test('slices drop empty parts and colour from the palette', async () => {
  const sl = slices([{ label: 'a', value: 2 }, { label: 'z', value: 0 }, { label: 'b', value: 1 }])
  expect(sl.map(s => s.label)).toEqual(['a', 'b'])
  expect(sl[0]!.color).toBe(PALETTE[0])
  expect(legend(sl).map(r => r.pct)).toEqual([2 / 3, 1 / 3])
})

test('donutSvg draws a track plus one arc per slice, and only the track when empty', async () => {
  const empty = donutSvg([])
  safe(empty)
  expect(empty.includes(LINE)).toBe(true)
  expect((empty.match(/<circle/g) ?? []).length).toBe(1)
  const sl = slices([{ label: 'a', value: 3 }, { label: 'b', value: 1 }])
  const svg = donutSvg(sl, 96)
  safe(svg)
  expect(svg.includes('width="96"')).toBe(true)
  expect((svg.match(/stroke-dasharray/g) ?? []).length).toBe(2)
  expect(svg.includes(COBALT)).toBe(true)
  const many = donutSvg(slices(Array.from({ length: 200 }, (_, i) => ({ label: `s${i}`, value: i + 1 }))))
  safe(many)
})

test('sparkSvg handles 0, 1, flat and normal series', async () => {
  for (const v of [[], [5], [0, 0, 0], [1, 4, 2, 8, 3], Array.from({ length: 2000 }, (_, i) => i % 7)]) safe(sparkSvg(v))
  const flat = sparkSvg([0, 0, 0], { width: 40, height: 10 })
  expect(flat.includes('M3 7 L20 7 L37 7')).toBe(true)
  expect(sparkSvg([1, 2], { color: '#FF0000' }).includes('#FF0000')).toBe(true)
  expect(sparkSvg([1, 2]).includes('linearGradient')).toBe(true)
})

test('sparkText scales block chars to the max', async () => {
  expect(sparkText([0, 4, 8])).toBe(' ▄█')
  expect(sparkText([0, 0])).toBe('▁▁')
  expect(sparkText([])).toBe('')
})

test('barText fills proportionally and labels with percent', async () => {
  const lines = barText(slices([{ label: 'Edit', value: 3 }, { label: 'Bash', value: 1 }]), 8)
  expect(lines).toEqual(['██████░░ Edit 75.0%', '██░░░░░░ Bash 25.0%'])
  expect(barText([], 8)).toEqual([])
})

test('deltaLabel', async () => {
  expect(deltaLabel(5, null)).toEqual({ text: '—', tone: 'flat' })
  expect(deltaLabel(0, 0)).toEqual({ text: '—', tone: 'flat' })
  expect(deltaLabel(3, 0)).toEqual({ text: 'new', tone: 'up' })
  expect(deltaLabel(112.5, 100)).toEqual({ text: '↑12.5% vs prev', tone: 'up' })
  expect(deltaLabel(97, 100)).toEqual({ text: '↓3.0% vs prev', tone: 'down' })
  expect(deltaLabel(100.01, 100).tone).toBe('flat')
})

test('fmt', async () => {
  expect(fmt.num(377100)).toBe('377.1K')
  expect(fmt.num(1.2e6)).toBe('1.2M')
  expect(fmt.num(42)).toBe('42')
  expect(fmt.num(999_990)).toBe('1M')
  expect(fmt.usd(25)).toBe('$25.00')
  expect(fmt.usd(0.004)).toBe('<$0.01')
  expect(fmt.usd(0)).toBe('$0.00')
  expect(fmt.ms(850)).toBe('850ms')
  expect(fmt.ms(12_400)).toBe('12.4s')
  expect(fmt.ms(125_000)).toBe('2m 05s')
  expect(fmt.ms(59_990)).toBe('1m 00s')
  expect(fmt.pct(0.25)).toBe('25.0%')
})
