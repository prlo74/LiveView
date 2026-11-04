/* Sky bloom: a light, airy look. A sky-blue to white gradient with soft white clouds drifting across it and a
   faint pink bloom wandering through; hot pink is kept for the accent (working, focus rings, the goal's halo). */
;(() => {
  const TAU = Math.PI * 2
  const PINK = '255,46,147', SKY = '120,186,236'
  const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const layer = (w, h) => { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')] }

  // one cloud: a cluster of soft white puffs, painted once at half size (it is all blur, so scaling up costs nothing visible)
  function cloudSprite(r, w, h) {
    const k = 0.5, [c, x] = layer(w * k, h * k)
    x.scale(k, k)
    const n = 6 + (r() * 4 | 0)
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, px = w * (0.18 + 0.64 * u + (r() - 0.5) * 0.08), py = h * (0.58 - Math.sin(u * Math.PI) * 0.16 + (r() - 0.5) * 0.08)
      const pr = h * (0.2 + Math.sin(u * Math.PI) * 0.22 + r() * 0.08)
      const gr = x.createRadialGradient(px, py, 0, px, py, pr)
      gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = gr; x.fillRect(px - pr, py - pr, pr * 2, pr * 2)
    }
    return c
  }

  // one cloud is softly shaped like a lion's head: a round face, a ring of mane puffs, two small ears
  function lionSprite(w, h) {
    const k = 0.5, [c, x] = layer(w * k, h * k), cx = w / 2, cy = h * 0.54, R = h * 0.3
    x.scale(k, k)
    const puff = (px, py, pr, a) => { const gr = x.createRadialGradient(px, py, 0, px, py, pr); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a / 2})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(px - pr, py - pr, pr * 2, pr * 2) }
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; puff(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 0.95, h * 0.17, 0.42) }
    for (const s of [-1, 1]) puff(cx + s * R * 0.62, cy - R * 0.72, h * 0.08, 0.5)
    puff(cx, cy, R * 0.95, 0.6); puff(cx, cy + R * 0.38, R * 0.36, 0.35)
    return c
  }

  // ---- scenery, built once per window size ----
  let S = null
  function build(W, H, low) {
    const r = rng(5113), M = Math.max(W, H)
    const clouds = Array.from({ length: low ? 4 : 8 }, (_, i) => {
      const w = M * (0.22 + r() * 0.2), h = w * (0.38 + r() * 0.12)
      return { img: cloudSprite(r, w, h), w, h, x0: r(), y: 0.06 + (i / (low ? 4 : 8)) * 0.86 + (r() - 0.5) * 0.08, v: 5 + r() * 6,
        bob: 50 + r() * 60, ph: r() * TAU, a: 0.55 + r() * 0.4 }
    })
    const L = clouds[2]; L.h = L.w * 0.62; L.img = lionSprite(L.w, L.h)
    // a tiny far-off sail low on the horizon, the size of a dust mote
    const sail = new Path2D(), u = Math.max(6, M * 0.007)
    sail.moveTo(0, 0); sail.lineTo(0, -u * 1.6); sail.lineTo(u * 0.9, 0); sail.closePath()
    sail.moveTo(-u * 0.2, -u * 1.25); sail.lineTo(-u * 0.75, 0); sail.lineTo(-u * 0.2, 0); sail.closePath()
    sail.moveTo(-u * 0.9, u * 0.22); sail.lineTo(u * 1.05, u * 0.22); sail.lineTo(u * 0.75, u * 0.5); sail.lineTo(-u * 0.6, u * 0.5); sail.closePath()
    S = { key: W + 'x' + H + (low ? 'l' : ''), clouds, M, sail }
  }

  function backdrop(g, b) {
    const { W, H, t } = b, low = b.low
    if (!S || S.key !== W + 'x' + H + (low ? 'l' : '')) build(W, H, low)
    const M = S.M, lift = b.saver ? 1.3 : 1
    const sky = g.createLinearGradient(0, 0, W * 0.25, H)
    sky.addColorStop(0, '#bfdef6'); sky.addColorStop(0.45, '#dcedfb'); sky.addColorStop(1, '#f8fbff')
    g.fillStyle = sky; g.fillRect(0, 0, W, H)
    // a broad, slow light from the upper side, wandering on a two-minute cycle
    const lx = W * (0.5 + 0.3 * Math.sin(t * TAU / 117)), ly = H * (0.12 + 0.08 * Math.cos(t * TAU / 89))
    const light = g.createRadialGradient(lx, ly, 0, lx, ly, M * 0.7)
    light.addColorStop(0, 'rgba(255,255,255,.5)'); light.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = light; g.fillRect(0, 0, W, H)
    // blooms: a faint pink and a deeper sky tone drifting slowly about
    for (const [k, rgb, a] of low ? [[0, PINK, 0.07]] : [[0, PINK, 0.08], [1, SKY, 0.22], [2, PINK, 0.05]]) {
      const x = W * (0.5 + 0.38 * Math.sin(t * TAU / (83 + k * 29) + k * 2.1)), y = H * (0.5 + 0.34 * Math.cos(t * TAU / (101 + k * 17) + k * 1.3))
      const rr = M * (0.32 + 0.05 * Math.sin(t * TAU / 61 + k)), gr = g.createRadialGradient(x, y, 0, x, y, rr)
      gr.addColorStop(0, `rgba(${rgb},${a * lift})`); gr.addColorStop(1, `rgba(${rgb},0)`)
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2)
    }
    // clouds drifting left to right a few pixels a second, wrapping round, bobbing gently
    g.globalAlpha = 1
    for (const c of S.clouds) {
      const span = W + c.w * 2, x = ((c.x0 * span + t * c.v) % span) - c.w * 1.5
      const sc = 1 + 0.05 * Math.sin(t * TAU / c.bob + c.ph), y = H * c.y + Math.sin(t * TAU / c.bob + c.ph) * H * 0.02
      g.globalAlpha = Math.min(1, c.a * lift)
      g.drawImage(c.img, x, y - c.h * sc / 2, c.w * sc, c.h * sc)
    }
    g.globalAlpha = 1
    // the sail creeps along the bottom edge, a pixel every few seconds, with a slight rock
    const sx = W * 0.42 + ((t * 0.35) % (W * 0.3)), sy = H * 0.955 + Math.sin(t * TAU / 47) * 1.5
    g.save(); g.translate(sx, sy); g.rotate(Math.sin(t * TAU / 23) * 0.04)
    g.fillStyle = 'rgba(40,95,150,.16)'; g.fill(S.sail); g.restore()
  }

  // ---- core view: a pale glass sphere with a pink focus ring ----
  const TICKS = Array.from({ length: 120 }, (_, i) => ({ l: i % 10 === 0 ? 0.07 : i % 5 === 0 ? 0.045 : 0.025, o: i % 10 === 0 ? 0.55 : 0.3 }))
  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter, recent } = cc
    const br = 0.9 + 0.1 * Math.sin(t * 0.6) + flare * 0.5
    // white glass, so the network reads clearly over the sky
    const fill = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 0, cx, cy, R * 1.15)
    fill.addColorStop(0, 'rgba(255,255,255,.92)'); fill.addColorStop(0.7, 'rgba(244,250,255,.78)'); fill.addColorStop(1, `rgba(${SKY},${0.3 * br})`)
    g.fillStyle = fill; g.beginPath(); g.arc(cx, cy, R * 1.04, 0, TAU); g.fill()
    g.strokeStyle = jitter ? C.red : C.shell; g.lineWidth = jitter ? 2 : 1.3; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke()
    // a slowly turning globe frame
    g.strokeStyle = C.wire; g.lineWidth = 1
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(cx, cy, Math.max(0.5, R * Math.abs(Math.cos(t / 30 + i * Math.PI / 3))), R, 0, 0, TAU); g.stroke() }
    for (const v of [-0.5, 0, 0.5]) { const rx = R * Math.cos(Math.asin(v)); g.beginPath(); g.ellipse(cx, cy + v * R, rx, rx * 0.18, 0, 0, TAU); g.stroke() }
    // fine ticks, a little quicker while the agent is busy
    g.save(); g.translate(cx, cy); g.rotate(t * (0.02 + Math.min(0.1, recent * 0.005)))
    g.lineWidth = 1
    for (const o of [0.3, 0.55]) {
      g.strokeStyle = `rgba(${C.tickRGB},${o})`; g.beginPath()
      TICKS.forEach((k, i) => { if (k.o !== o) return; const a = i / TICKS.length * TAU, r0 = R * 1.12; g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * (r0 + k.l * R), Math.sin(a) * (r0 + k.l * R)) })
      g.stroke()
    }
    g.restore()
    // the pink focus ring: two dashed arcs turning against each other
    g.save(); g.translate(cx, cy)
    g.rotate(-t * 0.04); g.strokeStyle = `rgba(${PINK},${0.5 + flare * 0.4})`; g.lineWidth = 1.6; g.setLineDash([R * 0.6, R * 0.25, R * 0.06, R * 0.25]); g.beginPath(); g.arc(0, 0, R * 1.3, 0, TAU); g.stroke()
    g.rotate(t * 0.07); g.strokeStyle = `rgba(${PINK},.25)`; g.lineWidth = 1; g.setLineDash([2, 9]); g.beginPath(); g.arc(0, 0, R * 1.42, 0, TAU); g.stroke()
    g.setLineDash([]); g.restore()
  }

  // a soft pink bloom behind the goal marker
  function coreUnder(g, cc) {
    const { goal, steps, t, flare } = cc
    if (!goal || !steps.length) return
    const rr = 64 * (1 + 0.08 * Math.sin(t * 0.5)) + flare * 30, gr = g.createRadialGradient(goal.x, goal.y, 0, goal.x, goal.y, rr)
    gr.addColorStop(0, `rgba(${PINK},${0.2 + flare * 0.2})`); gr.addColorStop(1, `rgba(${PINK},0)`)
    g.fillStyle = gr; g.fillRect(goal.x - rr, goal.y - rr, rr * 2, rr * 2)
  }

  // the agent: a white hexagon with a pink rim and the action's colour at its heart
  function coreCenter(g, cc) {
    const { cx, cy, t, kind, fire, flare } = cc
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, 70)
    halo.addColorStop(0, `rgba(${PINK},${0.16 + 0.04 * Math.sin(t * 0.8) + flare * 0.2})`); halo.addColorStop(1, `rgba(${PINK},0)`)
    g.fillStyle = halo; g.fillRect(cx - 70, cy - 70, 140, 140)
    hexPath(cx, cy, 23); g.fillStyle = C.nodeFill; g.fill(); g.strokeStyle = kind === 'error' ? C.red : C.cyan; g.lineWidth = 2; g.stroke()
    hexPath(cx, cy, 15); g.strokeStyle = `rgba(${C.accentRGB},.45)`; g.lineWidth = 1; g.stroke()
    g.fillStyle = kind ? fire : C.cyan; g.beginPath(); g.arc(cx, cy, 4.5 + flare * 3, 0, TAU); g.fill()
  }

  registerTheme({
    id: 'skybloom',
    name: 'Sky bloom',
    light: true,
    fontUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap',
    fonts: { mono: '"DM Mono", ui-monospace, monospace', head: '"DM Sans", system-ui, sans-serif' },
    css: {
      '--bg': '#eaf4fc', '--panel': 'rgba(255,255,255,.9)', '--panel2': '#f6faff', '--line': '#b8d4ec',
      '--cyan': '#c4006f', '--yellow': '#7d5a00', '--red': '#a8140a', '--green': '#1b6e3f', '--purple': '#5e35b1', '--amber': '#a54a00', '--blue': '#1a56b0',
      '--dim': '#48637b', '--text': '#102a43', '--muted': '#3d5a73',
      '--mono': '"DM Mono", ui-monospace, Menlo, monospace', '--head': '"DM Sans", system-ui, sans-serif',
      '--radius': '14px', '--clip': 'none',
    },
    colors: {
      bg: '#eaf4fc', cyan: '#c4006f', yellow: '#7d5a00', red: '#a8140a', green: '#1b6e3f', purple: '#5e35b1', amber: '#a54a00', blue: '#1a56b0',
      dim: '#48637b', line: '#b8d4ec', text: '#102a43',
      muted: '#3d5a73', todo: '#7f97ad', doneInk: '#15532f', ink2: '#0a1f33', nodeFill: '#ffffff', chip: 'rgba(255,255,255,.86)', labelBg: 'rgba(255,255,255,.97)',
      link: 'rgba(40,90,140,.2)', neuron: 'rgba(30,75,120,.5)', shell: 'rgba(40,110,175,.55)', wire: 'rgba(40,110,175,.14)', packet: '#ff2e93',
      accentRGB: '196,0,111', goalRGB: '125,90,0', tickRGB: '40,95,150', glow0: '255,255,255', glow1: '200,228,250', glow2: '150,200,240',
    },
    backdrop, sphere, coreUnder, coreCenter,
  })
})()
