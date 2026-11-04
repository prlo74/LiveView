/* Blob tracking: a dim monochrome video feed of soft drifting blobs, each followed by a tracking box,
   an ID, a centroid crosshair, a motion trail and a small coordinate readout; light grain and scanlines.
   In the core view the agent, its newest firing chain and the current step are framed with tracking brackets. */
;(() => {
  const TAU = Math.PI * 2
  let seed = 4242
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const FONT = '10px "IBM Plex Mono", ui-monospace, Menlo, monospace'
  const ACC = '63,217,230'

  // ---- offscreen tiles, made once ----
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const sprite = mk(256, 256)
  {
    const s = sprite.getContext('2d'), gr = s.createRadialGradient(128, 128, 0, 128, 128, 128)
    gr.addColorStop(0, 'rgba(190,232,236,.34)'); gr.addColorStop(0.35, 'rgba(110,170,178,.2)'); gr.addColorStop(0.7, 'rgba(50,92,100,.08)'); gr.addColorStop(1, 'rgba(30,60,66,0)')
    s.fillStyle = gr; s.fillRect(0, 0, 256, 256)
  }
  const grain = mk(160, 160)
  {
    const s = grain.getContext('2d')
    for (let i = 0; i < 1400; i++) { const v = rnd() < 0.5 ? 255 : 0; s.fillStyle = `rgba(${v},${v},${v},${0.03 + rnd() * 0.05})`; s.fillRect(rnd() * 160 | 0, rnd() * 160 | 0, 1, 1) }
  }
  const scan = mk(4, 3)
  { const s = scan.getContext('2d'); s.fillStyle = 'rgba(0,0,0,.22)'; s.fillRect(0, 2, 4, 1) }
  let patFor = null, grainPat = null, scanPat = null

  // ---- blobs, built once per window size ----
  let key = '', blobs = [], TRAIL = 12
  function build(W, H, low) {
    const k = W + 'x' + H + (low ? 'l' : '')
    if (k === key) return
    key = k; seed = 4242
    const M = Math.max(W, H)
    TRAIL = low ? 6 : 12
    blobs = Array.from({ length: low ? 5 : 8 }, (_, i) => ({
      id: '#' + String(i + 4).padStart(2, '0'),   // #01, #02 are the agent and its firing chain
      fx: 0.14 + rnd() * 0.72, fy: 0.16 + rnd() * 0.68, ax: 0.06 + rnd() * 0.1, ay: 0.05 + rnd() * 0.09,
      px: 55 + rnd() * 65, py: 60 + rnd() * 60, ph: rnd() * TAU, pq: rnd() * TAU,
      r: M * (0.06 + rnd() * 0.06), pr: 30 + rnd() * 40,
      cls: i === 2 ? ' \u00b7 boat 0.93' : i === 4 ? ' \u00b7 lion 0.71' : '',   // a quiet nod to Leo: two blobs carry a detector class
    }))
  }
  const pos = (B, W, H, t) => [
    W * (B.fx + B.ax * Math.sin(t * TAU / B.px + B.ph) + 0.02 * Math.sin(t * TAU / (B.px * 0.53) + B.pq)),
    H * (B.fy + B.ay * Math.sin(t * TAU / B.py + B.pq) + 0.02 * Math.cos(t * TAU / (B.py * 0.61) + B.ph)),
  ]

  // four corner brackets of a box
  function brackets(g, x, y, w, h, l) {
    g.moveTo(x, y + l); g.lineTo(x, y); g.lineTo(x + l, y)
    g.moveTo(x + w - l, y); g.lineTo(x + w, y); g.lineTo(x + w, y + l)
    g.moveTo(x + w, y + h - l); g.lineTo(x + w, y + h); g.lineTo(x + w - l, y + h)
    g.moveTo(x + l, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - l)
  }
  function cross(g, x, y, s) { g.moveTo(x - s, y); g.lineTo(x - 2, y); g.moveTo(x + 2, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y - 2); g.moveTo(x, y + 2); g.lineTo(x, y + s) }
  function tag(g, text, x, y, color) {
    const w = g.measureText(text).width + 8
    g.fillStyle = 'rgba(6,10,11,.72)'; g.fillRect(x - 1, y - 11, w, 14)
    g.fillStyle = color; g.fillText(text, x + 3, y)
  }

  function backdrop(g, b) {
    const { W, H, t, cx, cy, R } = b, low = b.low, lift = b.saver ? 1.3 : 1
    build(W, H, low)
    const M = Math.max(W, H)
    // dark feed with a soft vignette
    g.fillStyle = '#070a0b'; g.fillRect(0, 0, W, H)
    const vg = g.createRadialGradient(cx, cy, 0, cx, cy, M * 0.75)
    vg.addColorStop(0, 'rgba(22,36,38,.9)'); vg.addColorStop(1, 'rgba(7,10,11,0)')
    g.fillStyle = vg; g.fillRect(0, 0, W, H)

    // blobs: additive soft discs, so close ones merge like metaballs
    const P = blobs.map(B => pos(B, W, H, t)), RR = blobs.map(B => B.r * (1 + 0.14 * Math.sin(t * TAU / B.pr + B.ph)))
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, 0.8 * lift)
    blobs.forEach((B, i) => { const r = RR[i] * 1.5; g.drawImage(sprite, P[i][0] - r, P[i][1] - r, r * 2, r * 2) })
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1

    // trails, tracking boxes, centroid crosshairs, IDs and readouts; faded near the core so the agent stays clear
    g.font = FONT; g.textBaseline = 'alphabetic'
    blobs.forEach((B, i) => {
      const [x, y] = P[i], hw = RR[i] * 0.62, hh = RR[i] * 0.55
      const f = b.core ? Math.min(1, Math.max(0, (Math.hypot(x - cx, y - cy) - R * 0.9) / (R * 0.6))) : 1
      if (f <= 0.02) return
      g.globalAlpha = f * Math.min(1, lift)
      g.lineWidth = 1; g.strokeStyle = `rgba(${ACC},.16)`; g.beginPath()
      for (let k = 0; k <= TRAIL; k++) { const q = pos(B, W, H, t - k * 0.9); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]) }
      g.stroke()
      g.fillStyle = `rgba(${ACC},.3)`; g.beginPath()
      for (let k = 2; k <= TRAIL; k += 2) { const q = pos(B, W, H, t - k * 0.9); g.moveTo(q[0] + 1.4, q[1]); g.arc(q[0], q[1], 1.4, 0, TAU) }
      g.fill()
      g.strokeStyle = `rgba(${ACC},.1)`; g.strokeRect(x - hw, y - hh, hw * 2, hh * 2)
      g.strokeStyle = `rgba(${ACC},.5)`; g.lineWidth = 1.2; g.beginPath(); brackets(g, x - hw, y - hh, hw * 2, hh * 2, Math.min(18, hw * 0.3)); g.stroke()
      g.strokeStyle = 'rgba(220,245,248,.45)'; g.lineWidth = 1; g.beginPath(); cross(g, x, y, 7); g.stroke()
      tag(g, `${B.id} \u00b7 ${x | 0},${y | 0}${B.cls}`, x - hw, y - hh - 5, 'rgba(200,236,240,.75)')
    })
    g.globalAlpha = 1

    // scanlines, a slow rolling band and drifting grain
    if (patFor !== g) { patFor = g; grainPat = g.createPattern(grain, 'repeat'); scanPat = g.createPattern(scan, 'repeat') }
    g.fillStyle = scanPat; g.fillRect(0, 0, W, H)
    if (!low) {
      const by = ((t / 45) % 1) * (H + 300) - 150, band = g.createLinearGradient(0, by - 150, 0, by + 150)
      band.addColorStop(0, 'rgba(160,220,225,0)'); band.addColorStop(0.5, 'rgba(160,220,225,.035)'); band.addColorStop(1, 'rgba(160,220,225,0)')
      g.fillStyle = band; g.fillRect(0, by - 150, W, 300)
      const ox = (t * 7) % 160, oy = (t * 4) % 160
      g.save(); g.translate(ox, oy); g.fillStyle = grainPat; g.fillRect(-ox, -oy, W, H); g.restore()
    }
  }

  // ---- core view ----
  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter } = cc, br = 0.9 + 0.1 * Math.sin(t * 0.6) + flare * 0.6
    const gl = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15)
    gl.addColorStop(0, `rgba(200,240,245,${0.14 * br})`); gl.addColorStop(0.5, `rgba(63,160,175,${0.09 * br})`); gl.addColorStop(1, 'rgba(12,30,34,0)')
    g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, R * 1.15, 0, TAU); g.fill()
    g.strokeStyle = jitter ? C.red : C.shell; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke()
    // reticle: a slow dashed inner ring and axis ticks
    g.save(); g.translate(cx, cy); g.rotate(t * 0.03)
    g.strokeStyle = `rgba(${ACC},.25)`; g.lineWidth = 1; g.setLineDash([4, 10]); g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.stroke(); g.setLineDash([])
    g.restore()
    g.strokeStyle = `rgba(${ACC},.3)`; g.beginPath()
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); g.moveTo(cx + c * R * 1.04, cy + s * R * 1.04); g.lineTo(cx + c * R * 1.14, cy + s * R * 1.14) }
    for (let k = 0; k < 72; k++) { const a = k * TAU / 72, l = k % 6 ? 0.015 : 0.035, c = Math.cos(a), s = Math.sin(a); g.moveTo(cx + c * R, cy + s * R); g.lineTo(cx + c * R * (1 - l), cy + s * R * (1 - l)) }
    g.stroke()
  }

  let tx = null, ty = null
  function coreOver(g, cc) {
    const { cx, cy, R, t, kind, tip, steps, cur } = cc
    const col = kind === 'error' ? C.red : `rgba(${ACC},.75)`, fire = cc.fire || C.cyan
    g.font = FONT; g.textBaseline = 'alphabetic'
    // the agent itself
    const h = R * 1.24, l = R * 0.16 + 2 * Math.sin(t * 0.8)
    g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); brackets(g, cx - h, cy - h, h * 2, h * 2, l); g.stroke()
    tag(g, `#01 \u00b7 ${cx | 0},${cy | 0}`, cx - h, cy - h - 6, kind === 'error' ? C.red : C.text)
    // the current step
    const live = cur >= 0 && cur < steps.length ? steps[cur] : null
    if (live) { g.strokeStyle = C.cyan; g.lineWidth = 1.2; g.beginPath(); brackets(g, live.x - 16, live.y - 16, 32, 32, 7); g.stroke() }
    // the newest firing chain, followed smoothly
    if (tip && Number.isFinite(tip.x + tip.y)) {
      if (tx === null || !(Math.abs(tx - tip.x) + Math.abs(ty - tip.y) <= R * 4)) { tx = tip.x; ty = tip.y }
      tx += (tip.x - tx) * 0.12; ty += (tip.y - ty) * 0.12
      g.strokeStyle = fire; g.lineWidth = 1.2; g.beginPath(); brackets(g, tx - 14, ty - 14, 28, 28, 6); cross(g, tx, ty, 6); g.stroke()
      tag(g, `#02 \u00b7 ${tx | 0},${ty | 0}`, tx + 18, ty - 8, C.muted)
    }
  }

  registerTheme({
    id: 'blobtrack',
    name: 'Blob tracking',
    fontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@500;600&display=swap',
    fonts: { mono: '"IBM Plex Mono", ui-monospace, monospace', head: '"IBM Plex Sans", system-ui, sans-serif' },
    css: {
      '--bg': '#070a0b', '--panel': 'rgba(10,16,17,.9)', '--panel2': '#0a1112', '--line': '#22393a',
      '--cyan': '#3fd9e6', '--yellow': '#f2c94c', '--red': '#ff3b3b', '--green': '#7ee07a', '--purple': '#b892ff', '--amber': '#ff9640', '--blue': '#5aa2ff',
      '--dim': '#8aa09c', '--text': '#e4ece9', '--muted': '#a6bcb8',
      '--mono': '"IBM Plex Mono", ui-monospace, Menlo, monospace', '--head': '"IBM Plex Sans", system-ui, sans-serif',
      '--radius': '4px', '--clip': 'none',
    },
    colors: {
      bg: '#070a0b', cyan: '#3fd9e6', yellow: '#f2c94c', red: '#ff3b3b', green: '#7ee07a', purple: '#b892ff', amber: '#ff9640', blue: '#5aa2ff',
      dim: '#8aa09c', line: '#22393a', text: '#e4ece9',
      muted: '#a6bcb8', todo: '#6f847f', doneInk: '#c4ecc0', ink2: '#ffffff', nodeFill: '#0a1112', chip: 'rgba(6,10,11,.78)', labelBg: 'rgba(6,10,11,.92)',
      link: 'rgba(120,170,175,.22)', neuron: 'rgba(170,215,220,.6)', shell: 'rgba(63,217,230,.45)', wire: 'rgba(63,217,230,.1)', packet: '#eaffff',
      accentRGB: ACC, goalRGB: '242,201,76', tickRGB: '150,190,190', glow0: '200,240,245', glow1: '63,160,175', glow2: '12,30,34',
    },
    backdrop, sphere, coreOver,
  })
})()
