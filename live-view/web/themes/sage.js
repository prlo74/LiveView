/* Sage: a calm botanical light style. Cream ground, soft sage hills and grass that sway slowly,
   two leafy fronds from the corners, and a warm tangerine sun that drifts across the top. */
;(() => {
  const TAU = Math.PI * 2
  const BG = '#f4efe2', INK = '#24332a', TANG = '239,125,35'
  let seed = 431
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

  // ---- scenery, built once per window size ----
  let key = '', ground = null, blades = [], fronds = [], hills = [], NX = 48, clocks = [], seedP = null
  // dandelion clock ("dent de lion"): a seed head of fine spokes with tufted tips, centred at 0,0
  function clockPath(r, n, gap) {
    const p = new Path2D()
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + (i % 3) * 0.05
      if (gap && a > gap[0] && a < gap[1]) continue
      const ex = Math.cos(a) * r, ey = Math.sin(a) * r
      p.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15); p.lineTo(ex, ey)
      p.moveTo(ex + Math.cos(a + 1.2) * r * 0.12, ey + Math.sin(a + 1.2) * r * 0.12); p.lineTo(ex, ey); p.lineTo(ex + Math.cos(a - 1.2) * r * 0.12, ey + Math.sin(a - 1.2) * r * 0.12)
    }
    return p
  }
  function frondPath(len, n) {
    // a curved stem with alternating leaves, pointing along +x
    const p = new Path2D(), stem = new Path2D()
    stem.moveTo(0, 0); stem.quadraticCurveTo(len * 0.5, -len * 0.12, len, -len * 0.05)
    for (let i = 1; i <= n; i++) {
      const u = i / (n + 1), x = len * u, y = -len * 0.12 * 4 * u * (1 - u) * 0.5 - len * 0.05 * u * u
      const side = i % 2 ? 1 : -1, L = len * (0.2 - u * 0.1), a = -0.5 * side + 0.25
      const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L * side * 1.1
      const mx = (x + ex) / 2, my = (y + ey) / 2, nx = -(ey - y) * 0.32, ny = (ex - x) * 0.32
      p.moveTo(x, y); p.quadraticCurveTo(mx + nx, my + ny, ex, ey); p.quadraticCurveTo(mx - nx, my - ny, x, y)
    }
    const tip = len * 0.16
    p.moveTo(len, -len * 0.05); p.quadraticCurveTo(len + tip * 0.5, -len * 0.05 - tip * 0.3, len + tip, -len * 0.05); p.quadraticCurveTo(len + tip * 0.5, -len * 0.05 + tip * 0.3, len, -len * 0.05)
    return { leaves: p, stem }
  }
  function build(g, W, H, low) {
    const k = W + 'x' + H + (low ? 'l' : '')
    if (k === key) return
    key = k; seed = 431
    NX = low ? 24 : 48
    ground = g.createLinearGradient(0, 0, 0, H)
    ground.addColorStop(0, '#f7f3e8'); ground.addColorStop(0.6, '#f2ecdc'); ground.addColorStop(1, '#e9e3cd')
    hills = [
      { y: 0.80, a: 0.025, f: 1.3, per: 61, c: 'rgba(143,170,132,.16)' },
      { y: 0.86, a: 0.02, f: 2.1, per: 47, c: 'rgba(122,154,113,.18)' },
      { y: 0.93, a: 0.015, f: 3.2, per: 37, c: 'rgba(98,134,92,.2)' },
    ].map(h => ({ ...h, ph: rnd() * TAU }))
    const n = low ? 60 : Math.min(220, Math.round(W / 7))
    blades = Array.from({ length: n }, () => ({ x: rnd() * W, h: H * (0.04 + rnd() * 0.07), lean: (rnd() - 0.5) * 0.5, c: rnd() < 0.5 ? 0 : 1, ph: rnd() * TAU }))
    const M = Math.min(W, H)
    fronds = [
      { x: -M * 0.02, y: H * 1.01, rot: -1.05, len: M * 0.42, per: 41, amp: 0.05 },
      { x: -M * 0.03, y: H * 0.93, rot: -0.55, len: M * 0.3, per: 53, amp: 0.06 },
      { x: W * 1.02, y: -M * 0.02, rot: 2.25, len: M * 0.36, per: 47, amp: 0.05 },
      { x: W * 1.03, y: M * 0.12, rot: 2.75, len: M * 0.24, per: 59, amp: 0.06 },
    ].map((f, i) => ({ ...f, ...frondPath(f.len, 9 - (i % 2) * 2), ph: rnd() * TAU }))
    // two dandelion clocks standing in the grass, bottom middle (clear of the side panels); the second is half blown
    const r = M * 0.02
    clocks = [
      { x: W * 0.6, h: H * 0.12, r, per: 37, head: clockPath(r, 34) },
      { x: W * 0.62, h: H * 0.095, r: r * 0.85, per: 43, head: clockPath(r * 0.85, 26, [5.0, 6.2]) },
    ]
    const q = r * 0.55
    seedP = new Path2D(); seedP.moveTo(0, q); seedP.lineTo(0, 0)
    for (let i = -2; i <= 2; i++) { seedP.moveTo(0, 0); seedP.lineTo(Math.sin(i * 0.45) * q * 0.6, -Math.cos(i * 0.45) * q * 0.6) }
  }

  function backdrop(g, b) {
    const { W, H, t, low } = b
    build(g, W, H, low)
    const lift = b.saver ? 1.4 : 1
    g.fillStyle = ground; g.fillRect(0, 0, W, H)

    // tangerine sun drifting slowly along the top right
    const sx = W * (0.78 + 0.06 * Math.sin(t / 97)), sy = H * (0.2 + 0.04 * Math.cos(t / 83)), sr = Math.max(W, H) * (0.34 + 0.02 * Math.sin(t / 41))
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, sr)
    sun.addColorStop(0, `rgba(${TANG},${0.2 * lift})`); sun.addColorStop(0.35, `rgba(${TANG},${0.07 * lift})`); sun.addColorStop(1, `rgba(${TANG},0)`)
    g.fillStyle = sun; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2)
    if (!low) {
      g.strokeStyle = `rgba(${TANG},${0.22 * lift})`; g.lineWidth = 1.2
      g.beginPath(); g.arc(sx, sy, sr * 0.16, 0, TAU); g.stroke()
      g.strokeStyle = `rgba(${TANG},${0.1 * lift})`; g.beginPath(); g.arc(sx, sy, sr * 0.24 + 4 * Math.sin(t / 19), 0, TAU); g.stroke()
    }

    // soft sage hills, slowly rolling
    for (const h of hills) {
      g.fillStyle = h.c; g.beginPath(); g.moveTo(0, H)
      for (let i = 0; i <= NX; i++) {
        const u = i / NX, y = H * (h.y + h.a * Math.sin(u * TAU * h.f + h.ph + t * TAU / h.per) + h.a * 0.5 * Math.sin(u * TAU * h.f * 2.3 - t * TAU / (h.per * 1.7)))
        g.lineTo(u * W, y)
      }
      g.lineTo(W, H); g.closePath(); g.fill()
    }

    // grass along the bottom, swaying in a slow travelling breeze
    g.lineCap = 'round'
    for (const c of [0, 1]) {
      g.strokeStyle = c ? `rgba(84,118,80,${0.38 * lift})` : `rgba(132,160,120,${0.42 * lift})`; g.lineWidth = c ? 1.6 : 1.3
      g.beginPath()
      for (const bl of blades) {
        if (bl.c !== c) continue
        const sw = 0.22 * Math.sin(t * TAU / 11 + bl.x / 210 + bl.ph * 0.3) + 0.1 * Math.sin(t * TAU / 29 + bl.x / 520)
        const a = bl.lean + sw, tx = bl.x + Math.sin(a) * bl.h, ty = H - Math.cos(a) * bl.h
        g.moveTo(bl.x, H + 2); g.quadraticCurveTo(bl.x + Math.sin(a) * bl.h * 0.25, H - bl.h * 0.55, tx, ty)
      }
      g.stroke()
    }

    // dandelion clocks with a few seeds drifting off on the breeze
    g.strokeStyle = `rgba(84,118,80,${0.3 * lift})`; g.lineWidth = 1.1
    const m0 = g.getTransform()
    for (const d of clocks) {
      const a = 0.04 * Math.sin(t * TAU / d.per), hx = d.x + Math.sin(a) * d.h, hy = H - Math.cos(a) * d.h
      g.beginPath(); g.moveTo(d.x, H + 2); g.quadraticCurveTo(d.x + d.h * 0.06, H - d.h * 0.5, hx, hy); g.stroke()
      g.translate(hx, hy); g.rotate(a); g.lineWidth = 0.7; g.stroke(d.head); g.setTransform(m0); g.lineWidth = 1.1
      d.hx = hx; d.hy = hy
    }
    if (!low) {
      const d = clocks[1]
      g.lineWidth = 0.7
      for (let i = 0; i < 4; i++) {
        const p = (t / 90 + i * 0.25) % 1, sx2 = d.hx + d.r + p * W * 0.16, sy2 = d.hy - p * H * 0.22 - Math.sin(p * 9 + i) * H * 0.012
        g.globalAlpha = Math.sin(Math.PI * p) * 0.9
        g.translate(sx2, sy2); g.rotate(0.5 * Math.sin(p * 7 + i)); g.stroke(seedP); g.setTransform(m0)
      }
      g.globalAlpha = 1
    }
    g.lineCap = 'butt'

    // leafy fronds reaching in from two corners, gently swaying
    const m = g.getTransform()
    for (const f of fronds) {
      g.setTransform(m); g.translate(f.x, f.y); g.rotate(f.rot + f.amp * Math.sin(t * TAU / f.per + f.ph))
      g.fillStyle = `rgba(118,150,110,${0.26 * lift})`; g.fill(f.leaves)
      if (!low) { g.strokeStyle = `rgba(84,118,80,${0.28 * lift})`; g.lineWidth = 1.4; g.stroke(f.stem) }
    }
    g.setTransform(m)
  }

  // the agent: a tangerine hexagon on cream, ringed in the current action's colour
  function coreCenter(g, cc) {
    const { cx, cy, t, flare, kind } = cc, s = 22, br = Math.min(1, 0.85 + 0.15 * Math.sin(t * 0.8) + flare * 0.5)
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, s * 3.2)
    halo.addColorStop(0, `rgba(${TANG},${0.32 * br})`); halo.addColorStop(1, `rgba(${TANG},0)`)
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, s * 3.2, 0, TAU); g.fill()
    hexPath(cx, cy, s); g.fillStyle = '#fbf7ee'; g.fill()
    g.strokeStyle = kind === 'error' ? C.red : '#e0701a'; g.lineWidth = 2; g.stroke()
    hexPath(cx, cy, s * 0.55); g.fillStyle = `rgba(${TANG},${0.75 + 0.25 * br})`; g.fill()
    if (kind) { g.strokeStyle = cc.fire; g.globalAlpha = 0.7; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, s * 1.45, 0, TAU); g.stroke(); g.globalAlpha = 1 }
  }

  registerTheme({
    id: 'sage',
    name: 'Sage',
    light: true,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    fonts: { mono: '"IBM Plex Mono", ui-monospace, monospace', head: 'Fraunces, Georgia, serif' },
    css: {
      '--bg': BG, '--panel': 'rgba(250,247,238,.93)', '--panel2': '#faf6ec', '--line': '#c9d2bd',
      '--cyan': '#2e6b63', '--yellow': '#856500', '--red': '#c0142c', '--green': '#3a7536', '--purple': '#74439a', '--amber': '#a9520a', '--blue': '#2a55a3',
      '--dim': '#5c6a5a', '--text': INK, '--muted': '#4c5c4d',
      '--mono': '"IBM Plex Mono", ui-monospace, Menlo, monospace', '--head': 'Fraunces, Georgia, serif',
      '--radius': '12px', '--clip': 'none',
    },
    colors: {
      bg: BG, cyan: '#2e6b63', yellow: '#856500', red: '#c0142c', green: '#3a7536', purple: '#74439a', amber: '#a9520a', blue: '#2a55a3',
      dim: '#5c6a5a', line: '#c9d2bd', text: INK,
      muted: '#4c5c4d', todo: '#8e9a88', doneInk: '#2d5c2a', ink2: '#16221a', nodeFill: '#faf6ec', chip: 'rgba(250,247,238,.9)', labelBg: 'rgba(252,250,244,.97)',
      link: 'rgba(76,104,72,.22)', neuron: 'rgba(70,98,66,.6)', shell: 'rgba(70,104,68,.6)', wire: 'rgba(84,118,80,.16)', packet: '#16221a',
      accentRGB: '46,107,99', goalRGB: '133,101,0', tickRGB: '84,118,80', glow0: '255,226,190', glow1: '168,192,152', glow2: '200,214,186',
    },
    backdrop, coreCenter,
  })
})()
