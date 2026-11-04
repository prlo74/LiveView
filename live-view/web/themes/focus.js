/* Focus: a still, quiet dark style built for reading. High-contrast text and action colours (each a different
   lightness, so they stay apart for red-green colour blindness) on deep graphite, with hairline drawing and no glow.
   The background does not move: a soft light behind the work, darker corners and a faint fixed dot grid. */
;(() => {
  const TAU = Math.PI * 2, BG = '#0c0d10'
  // action colours: bright, flat, L* roughly 55-92 so they differ in lightness as well as hue
  const P = { red: '#ff4d4d', amber: '#ffa83a', green: '#5ef0a4', cyan: '#72dcf4', blue: '#7f98ff', purple: '#d59cff', yellow: '#f6e46a' }

  // ---- background pieces, built once per window size / centre; nothing here changes over time ----
  let key = '', lift = null, vig = null, dots = null, sail = null
  function build(g, b) {
    const { W, H, cx, cy, R } = b, k = W + 'x' + H + ':' + Math.round(cx) + ',' + Math.round(cy) + ':' + Math.round(R || 0)
    if (k === key) return
    key = k
    const r = Math.hypot(W, H)
    lift = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(R || 0, 160) * 2.6)
    lift.addColorStop(0, 'rgba(120,140,165,.075)'); lift.addColorStop(0.55, 'rgba(120,140,165,.025)'); lift.addColorStop(1, 'rgba(120,140,165,0)')
    vig = g.createRadialGradient(W / 2, H / 2, r * 0.28, W / 2, H / 2, r * 0.62)
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.5)')
    // a fixed grid of tiny dots, aligned to the centre so it frames the work symmetrically
    const S = Math.max(28, Math.round(Math.max(W, H) / 52))
    dots = new Path2D()
    const x0 = ((cx % S) + S) % S, y0 = ((cy % S) + S) % S
    for (let y = y0; y < H; y += S) for (let x = x0; x < W; x += S) dots.rect(Math.round(x), Math.round(y), 1, 1)
    // a hairline horizon with one small sail, low at the bottom edge under the work (the corners hold panels); drawn at near-background contrast
    const hx = Math.round(cx) - 36, hy = H - 30
    sail = new Path2D()
    sail.moveTo(hx, hy + 0.5); sail.lineTo(hx + 72, hy + 0.5)
    sail.moveTo(hx + 30.5, hy - 2); sail.lineTo(hx + 30.5, hy - 17); sail.lineTo(hx + 40, hy - 3); sail.closePath()
    sail.moveTo(hx + 29, hy - 13); sail.lineTo(hx + 22, hy - 3); sail.lineTo(hx + 29, hy - 3)
    sail.moveTo(hx + 22, hy - 1.5); sail.lineTo(hx + 41, hy - 1.5)
  }

  function backdrop(g, b) {
    const { W, H } = b
    build(g, b)
    g.fillStyle = BG; g.fillRect(0, 0, W, H)
    g.fillStyle = lift; g.fillRect(0, 0, W, H)
    if (!b.low) { g.fillStyle = b.saver ? 'rgba(200,210,222,.13)' : 'rgba(200,210,222,.075)'; g.fill(dots) }
    g.fillStyle = vig; g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(200,210,222,.11)'; g.lineWidth = 1; g.stroke(sail)
  }

  // ---- core view: a clean disc, one fine shell, a still dial of hairline ticks ----
  let tickKey = -1, ticks = null, majors = null
  function buildTicks(R) {
    if (R === tickKey) return
    tickKey = R; ticks = new Path2D(); majors = new Path2D()
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU - TAU / 4, c = Math.cos(a), s = Math.sin(a), big = i % 5 === 0
      const p = big ? majors : ticks, r0 = R * 1.075, r1 = R * (big ? 1.115 : 1.095)
      p.moveTo(c * r0, s * r0); p.lineTo(c * r1, s * r1)
    }
  }
  function sphere(g, cc) {
    const { cx, cy, R, jitter } = cc
    g.fillStyle = '#0a0b0d'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill()
    g.strokeStyle = 'rgba(210,218,228,.08)'; g.lineWidth = 1; g.beginPath()
    for (const r of [0.38, 0.7]) { g.moveTo(cx + R * r, cy); g.arc(cx, cy, R * r, 0, TAU) }
    g.stroke()
    g.strokeStyle = jitter ? C.red : 'rgba(232,236,240,.62)'; g.lineWidth = jitter ? 2 : 1.25
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke()
    if (cc.low) return
    buildTicks(Math.round(R))
    g.save(); g.translate(cx, cy)
    g.lineWidth = 1; g.strokeStyle = 'rgba(210,218,228,.22)'; g.stroke(ticks)
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(232,236,240,.5)'; g.stroke(majors)
    g.restore()
  }

  // idle: hairline; firing: solid, a little thicker, in the action colour
  function link(g, x1, y1, x2, y2, color, b) {
    if (color) { g.strokeStyle = color; g.globalAlpha = 0.5 + 0.5 * b; g.lineWidth = 1 + b * 1.6 }
    else { g.strokeStyle = C.link; g.lineWidth = 0.75 }
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
  }
  // idle: small grey dot; firing: a solid dot in the action colour with a dark ring to separate it from the links
  function neuron(g, x, y, r, color) {
    if (!color) { g.fillStyle = C.neuron; g.beginPath(); g.arc(x, y, Math.min(r, 2.2) * 0.85, 0, TAU); g.fill(); return }
    g.beginPath(); g.arc(x, y, r + 1, 0, TAU)
    g.fillStyle = color; g.fill(); g.strokeStyle = BG; g.lineWidth = 1.5; g.stroke()
  }
  // the agent: a dark disc with one fine ring; the dot inside shows what it is doing
  function coreCenter(g, cc) {
    const { cx, cy, kind, fire } = cc
    g.fillStyle = C.nodeFill; g.beginPath(); g.arc(cx, cy, 17, 0, TAU); g.fill()
    g.strokeStyle = kind === 'error' ? C.red : 'rgba(240,243,246,.85)'; g.lineWidth = kind === 'error' ? 2.5 : 1.5; g.stroke()
    g.fillStyle = kind ? fire : C.yellow
    g.beginPath(); g.arc(cx, cy, 6, 0, TAU); g.fill()
  }

  registerTheme({
    id: 'focus',
    name: 'Focus',
    light: false,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Atkinson+Hyperlegible+Mono:wght@400;600&display=swap',
    fonts: { mono: '"Atkinson Hyperlegible Mono", "Atkinson Hyperlegible", ui-monospace, monospace', head: '"Atkinson Hyperlegible", system-ui, sans-serif' },
    css: {
      '--bg': BG, '--panel': 'rgba(18,20,24,.96)', '--panel2': '#101216', '--line': '#3a4048',
      '--cyan': P.cyan, '--yellow': P.yellow, '--red': P.red, '--green': P.green, '--purple': P.purple, '--amber': P.amber, '--blue': P.blue,
      '--dim': '#a9b0b8', '--text': '#f3f5f7', '--muted': '#c9ced4',
      '--mono': '"Atkinson Hyperlegible Mono", "Atkinson Hyperlegible", ui-monospace, Menlo, monospace', '--head': '"Atkinson Hyperlegible", system-ui, sans-serif',
      '--radius': '5px', '--clip': 'none',
    },
    colors: {
      bg: BG, ...P, dim: '#a9b0b8', line: '#3a4048', text: '#f3f5f7',
      muted: '#c9ced4', todo: '#8a929b', doneInk: '#c6f7dc', ink2: '#ffffff', nodeFill: '#121418', chip: 'rgba(12,13,16,.9)', labelBg: 'rgba(16,18,22,.97)',
      link: 'rgba(200,208,218,.17)', neuron: '#7f8790', shell: 'rgba(232,236,240,.62)', wire: 'rgba(200,208,218,.08)', packet: '#ffffff',
      accentRGB: '114,220,244', goalRGB: '246,228,106', tickRGB: '200,208,218', glow0: '22,25,30', glow1: '14,16,19', glow2: '10,11,13',
    },
    backdrop, sphere, link, neuron, coreCenter,
  })
})()
