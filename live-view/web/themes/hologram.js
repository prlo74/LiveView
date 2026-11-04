// Hologram: cyan light projected over a near-black navy room. The floor grid, distant city-light bokeh and
// corner brackets are built once per window size; each frame only drifts that layer, turns a faint radar
// sweep (90 s a turn) and moves a few sparse data ticks. The core is a wire-and-particle globe inside
// segmented, graduated rings that turn at different slow speeds, with two small arc gauges for activity.
;(() => {
  const TAU = Math.PI * 2
  const CY = '0,210,255', ICE = '127,233,255', HOT = '225,250,255', GOLD = '255,196,84'
  const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const layer = (w, h) => { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')] }

  // ---- the room: gradient, perspective floor grid, bokeh, corner brackets, vignette (one bitmap) ----
  let BG = null
  function buildBg(W, H, dpr) {
    const M = 20, w = W + 2 * M, h = H + 2 * M, r = rng(5113), [c, x] = layer(w * dpr, h * dpr)
    x.setTransform(dpr, 0, 0, dpr, 0, 0)
    const gr = x.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, '#02060d'); gr.addColorStop(0.6, '#041022'); gr.addColorStop(1, '#030a16')
    x.fillStyle = gr; x.fillRect(0, 0, w, h)
    // city lights far away: soft out-of-focus discs, most of them low in the frame
    for (let i = 0; i < 70; i++) {
      const bx = r() * w, by = h * (0.35 + 0.6 * Math.pow(r(), 0.7)), br = 3 + r() * 16, warm = r() < 0.12
      const rgb = warm ? GOLD : r() < 0.5 ? CY : ICE, a = 0.025 + r() * 0.05
      const bg = x.createRadialGradient(bx, by, 0, bx, by, br)
      bg.addColorStop(0, `rgba(${rgb},${a})`); bg.addColorStop(0.7, `rgba(${rgb},${a * 0.6})`); bg.addColorStop(1, `rgba(${rgb},0)`)
      x.fillStyle = bg; x.beginPath(); x.arc(bx, by, br, 0, TAU); x.fill()
    }
    // perspective floor grid toward a horizon at 62% height
    const hy = h * 0.62, vx = w / 2
    x.lineWidth = 1
    for (let i = -24; i <= 24; i++) {
      const fx = vx + i * w * 0.09, a = 0.06 * (1 - Math.abs(i) / 26)
      x.strokeStyle = `rgba(${CY},${a})`; x.beginPath(); x.moveTo(vx + i * 6, hy); x.lineTo(fx, h); x.stroke()
    }
    for (let k = 1; k < 16; k++) {
      const y = hy + (h - hy) * Math.pow(k / 15, 2.1)
      x.strokeStyle = `rgba(${CY},${0.02 + 0.05 * k / 15})`; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke()
    }
    const hz = x.createLinearGradient(0, hy - 30, 0, hy + 30)
    hz.addColorStop(0, `rgba(${CY},0)`); hz.addColorStop(0.5, `rgba(${CY},.05)`); hz.addColorStop(1, `rgba(${CY},0)`)
    x.fillStyle = hz; x.fillRect(0, hy - 30, w, 60)
    // corner brackets with a few small ticks
    const m = M + 18, L = 46
    x.strokeStyle = `rgba(${ICE},.28)`; x.lineWidth = 1.2; x.beginPath()
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const ox = sx > 0 ? m : w - m, oy = sy > 0 ? m : h - m
      x.moveTo(ox, oy + sy * L); x.lineTo(ox, oy); x.lineTo(ox + sx * L, oy)
      for (let j = 1; j <= 3; j++) { x.moveTo(ox + sx * (L + 6 * j), oy); x.lineTo(ox + sx * (L + 6 * j), oy + sy * 3) }
    }
    x.stroke()
    const vg = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75)
    vg.addColorStop(0, 'rgba(1,3,8,0)'); vg.addColorStop(1, 'rgba(1,3,8,.6)')
    x.fillStyle = vg; x.fillRect(0, 0, w, h)
    // sparse data ticks: short dashes that drift upward on long cycles
    const ticks = Array.from({ length: 34 }, () => ({ x: r() * W, y: r() * H, l: 4 + r() * 14, p: 70 + r() * 60, a: 0.08 + r() * 0.12 }))
    BG = { W, H, dpr, M, c, ticks }
  }

  // radar sweep: a conic wedge, built once per size and only rotated each frame
  let SW = null
  function buildSweep(rad) {
    // built at quarter size and scaled up: the wedge is soft, and a full-size bitmap would cost ~5 Mpx per frame
    const s = Math.ceil(rad / 2), [c, x] = layer(s, s), k = typeof x.createConicGradient === 'function'
    if (k) {
      const cg = x.createConicGradient(0, s / 2, s / 2)
      cg.addColorStop(0, `rgba(${CY},.055)`); cg.addColorStop(0.08, `rgba(${CY},.012)`); cg.addColorStop(0.16, `rgba(${CY},0)`); cg.addColorStop(1, `rgba(${CY},0)`)
      x.fillStyle = cg; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, TAU); x.fill()
    }
    x.strokeStyle = `rgba(${ICE},.08)`; x.lineWidth = 1; x.beginPath(); x.moveTo(s / 2, s / 2); x.lineTo(s, s / 2); x.stroke()
    SW = { rad, c, s }
  }

  // a small wireframe sailboat on a projector disc low on the left, just right of the activity log, turning once every 80 s
  const BOAT = (() => {
    const bow = [1, 0, 0], pm = [0.1, 0, 0.28], sp = [-0.8, 0, 0.2], ss = [-0.8, 0, -0.2], sm = [0.1, 0, -0.28], kl = [-0.1, -0.24, 0], st = [-0.8, -0.04, 0]
    const ft = [0.1, 0, 0], top = [0.1, 1.5, 0], gf = [0.1, 0.12, 0], be = [-0.75, 0.12, 0], jh = [0.1, 1.22, 0], jb = [0.98, 0.03, 0]
    return [[bow, pm], [pm, sp], [sp, ss], [ss, sm], [sm, bow], [bow, kl], [kl, st], [pm, kl], [sm, kl], [ft, top], [top, be], [be, gf], [jh, jb]]
  })()
  function drawBoat(g, b, lift) {
    const s = Math.max(14, Math.min(22, Math.min(b.W, b.H) * 0.022)), ox = (b.W > 900 ? 352 : 18) + s * 1.3, oy = b.H - 40 - s * 0.6
    const yaw = b.t * TAU / 80, ca = Math.cos(yaw), sa = Math.sin(yaw), ct = Math.cos(0.3), st = Math.sin(0.3)
    const P = q => { const x = q[0] * ca + q[2] * sa, z = -q[0] * sa + q[2] * ca; return [ox + x * s, oy - (q[1] * ct - z * st) * s] }
    g.save(); g.lineWidth = 1; g.strokeStyle = `rgba(${ICE},${0.2 * lift})`; g.beginPath()
    for (const [a, c] of BOAT) { const p = P(a), q = P(c); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]) }
    g.stroke()
    g.strokeStyle = `rgba(${CY},${0.12 * lift})`; g.setLineDash([2, 4]); g.beginPath(); g.ellipse(ox, oy + s * 0.3, s * 1.15, s * 0.3, 0, 0, TAU); g.stroke(); g.setLineDash([])
    g.fillStyle = `rgba(${ICE},${0.18 * lift})`; g.font = '9px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'center'
    g.fillText('BRG 152 · REGULUS', ox, oy + s * 0.3 + 16); g.restore()
  }

  function backdrop(g, b) {
    const { W, H, t, cx, cy, low } = b, dpr = g.getTransform().a || 1, lift = b.saver ? 1.5 : 1
    if (!BG || BG.W !== W || BG.H !== H || BG.dpr !== dpr) buildBg(W, H, dpr)
    const M = BG.M
    g.drawImage(BG.c, -M + 8 * Math.sin(t * TAU / 100), -M + 4 * Math.sin(t * TAU / 77 + 1), W + 2 * M, H + 2 * M)
    // a cool ambient bloom that wanders slowly
    const lx = W * (0.5 + 0.15 * Math.sin(t * TAU / 110)), ly = H * (0.4 + 0.08 * Math.cos(t * TAU / 93)), lr = Math.max(W, H) * 0.6
    const lg = g.createRadialGradient(lx, ly, 0, lx, ly, lr)
    lg.addColorStop(0, `rgba(${CY},${(0.04 + 0.012 * Math.sin(t * TAU / 57)) * lift})`); lg.addColorStop(1, `rgba(${CY},0)`)
    g.fillStyle = lg; g.fillRect(0, 0, W, H)
    if (low) return
    const rad = Math.round(Math.hypot(W, H) * 0.6)
    if (!SW || SW.rad !== rad) buildSweep(rad)
    g.save(); g.translate(cx, cy); g.rotate(t * TAU / 90); g.globalAlpha = Math.min(1, lift); g.drawImage(SW.c, -rad, -rad, 2 * rad, 2 * rad); g.restore()
    // faint range rings round the centre
    g.strokeStyle = `rgba(${CY},${0.045 * lift})`; g.lineWidth = 1; g.setLineDash([2, 8]); g.beginPath()
    const m = Math.min(W, H)
    for (let k = 1; k <= 3; k++) { const rr = m * (0.42 + k * 0.16); g.moveTo(cx + rr, cy); g.arc(cx, cy, rr, 0, TAU) }
    g.stroke(); g.setLineDash([])
    g.strokeStyle = `rgba(${ICE},1)`; g.lineWidth = 1
    for (const d of BG.ticks) {
      const y = ((d.y - (t * H) / d.p) % H + H) % H
      g.globalAlpha = d.a * lift * (0.6 + 0.4 * Math.sin(t * TAU / d.p + d.x))
      g.beginPath(); g.moveTo(d.x, y); g.lineTo(d.x + d.l, y); g.stroke()
    }
    g.globalAlpha = 1
    drawBoat(g, b, lift)
  }

  // ---- the globe: filament rings and particles on a unit sphere, turned in 3D each frame ----
  const RINGS = (() => {
    const r = rng(77), out = []
    for (let i = 0; i < 9; i++) {
      // tilted great/small circles: normal n, latitude offset h
      const th = r() * TAU, ph = Math.acos(2 * r() - 1), n = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)], h = i < 3 ? 0 : (r() - 0.5) * 1.2
      const e1 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u0 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]
      const ul = Math.hypot(...u0), u = u0.map(v => v / ul), v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]], rr = Math.sqrt(1 - h * h)
      const pts = []
      for (let j = 0; j <= 40; j++) { const a = j / 40 * TAU; pts.push([0, 1, 2].map(k => n[k] * h + rr * (Math.cos(a) * u[k] + Math.sin(a) * v[k]))) }
      out.push(pts)
    }
    return out
  })()
  const DOTS = (() => { const r = rng(311), o = []; for (let i = 0; i < 140; i++) { const z = 2 * r() - 1, a = r() * TAU, s = Math.sqrt(1 - z * z), k = 0.55 + 0.45 * Math.cbrt(r()); o.push([s * Math.cos(a) * k, z * k, s * Math.sin(a) * k, r()]) } return o })()

  // segmented rings with graduations, as paths round the origin (radii in units of R)
  let RG = null
  function buildRings(R) {
    const seg = (r0, n, gap) => { const p = new Path2D(); for (let i = 0; i < n; i++) { const a0 = i / n * TAU + gap, a1 = (i + 1) / n * TAU - gap; p.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); p.arc(0, 0, r0, a0, a1) } return p }
    const ticks = (r0, n, l, every, l2) => { const p = new Path2D(); for (let i = 0; i < n; i++) { const a = i / n * TAU, ll = i % every ? l : l2; p.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); p.lineTo(Math.cos(a) * (r0 + ll), Math.sin(a) * (r0 + ll)) } return p }
    const a = seg(R * 1.08, 6, 0.06), b = seg(R * 1.2, 24, 0.03), c = seg(R * 1.33, 3, 0.35)
    const ta = ticks(R * 1.12, 120, 3, 10, 8), tb = ticks(R * 1.25, 72, 2.5, 6, 6)
    // bright arc caps on the outer ring
    const caps = new Path2D(); for (let i = 0; i < 3; i++) { const a0 = i / 3 * TAU + 0.35; caps.moveTo(Math.cos(a0) * R * 1.33, Math.sin(a0) * R * 1.33); caps.arc(0, 0, R * 1.33, a0, a0 + 0.12) }
    RG = { R, a, b, c, ta, tb, caps }
  }

  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter, recent, low, fire } = cc
    const br = 1 + 0.06 * Math.sin(t * TAU / 40) + flare * 0.7
    // inner light
    const gl = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15)
    gl.addColorStop(0, `rgba(${ICE},${0.1 * br})`); gl.addColorStop(0.6, `rgba(${CY},${0.045 * br})`); gl.addColorStop(1, `rgba(${CY},0)`)
    g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, R * 1.15, 0, TAU); g.fill()
    // turn the globe: a slow spin round a slightly tipped axis
    const yaw = t * TAU / 120, ca = Math.cos(yaw), sa = Math.sin(yaw), tip = 0.35, ct = Math.cos(tip), st = Math.sin(tip), rr = R * 0.92
    const P = q => { const x = q[0] * ca + q[2] * sa, z = -q[0] * sa + q[2] * ca, y = q[1] * ct - z * st, z2 = q[1] * st + z * ct; return [cx + x * rr, cy + y * rr, z2] }
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'
    const rings = low ? RINGS.slice(0, 5) : RINGS
    for (const front of [false, true]) {
      g.strokeStyle = front ? `rgba(${ICE},${0.32 * br})` : `rgba(${CY},${0.1 * br})`; g.lineWidth = front ? 1 : 0.8; g.beginPath()
      for (const pts of rings) {
        let pen = false
        for (const q of pts) { const p = P(q); if ((p[2] > 0) === front) { pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true } else pen = false }
      }
      g.stroke()
    }
    if (!low) {
      g.fillStyle = `rgba(${HOT},${0.55 * br})`; g.beginPath()
      for (const d of DOTS) { const p = P(d), s = 0.5 + 0.9 * (p[2] + 1) / 2 * (0.6 + 0.4 * Math.sin(t * TAU / 20 + d[3] * TAU)); g.moveTo(p[0] + s, p[1]); g.arc(p[0], p[1], s, 0, TAU) }
      g.fill()
    }
    g.restore()
    // the shell
    g.beginPath(); g.arc(cx, cy, R, 0, TAU)
    g.strokeStyle = jitter ? C.red : `rgba(${ICE},.5)`; g.lineWidth = jitter ? 2.5 : 1.2; g.stroke()
    // rotating segmented rings
    if (!RG || RG.R !== R) buildRings(R)
    const rot = (k, p, s, a, w) => { g.save(); g.translate(cx, cy); g.rotate(k); g.strokeStyle = s; g.globalAlpha = a; g.lineWidth = w; g.stroke(p); g.restore() }
    // busy brightens the rings; it must not change a rotation rate (angle = t * rate would snap when recent changes)
    const busy = Math.min(1, recent / 15)
    rot(t * 0.02, RG.a, `rgb(${ICE})`, 0.45 + busy * 0.15 + flare * 0.3, 2)
    rot(-t * 0.012, RG.ta, `rgb(${CY})`, 0.45, 1)
    if (!low) {
      rot(t * 0.007, RG.b, `rgb(${CY})`, 0.35, 1)
      rot(-t * 0.005, RG.tb, `rgb(${ICE})`, 0.26 + busy * 0.1, 1)
      rot(t * 0.004, RG.c, `rgb(${CY})`, 0.22, 1)
      rot(t * 0.004, RG.caps, `rgb(${HOT})`, 0.6, 2.2)
    }
    // two small arc gauges: left shows recent activity, right is lit in the colour of the current action
    const gr = R * 1.42, lvl = Math.min(1, recent / 20)
    g.lineCap = 'butt'; g.lineWidth = 3
    g.strokeStyle = `rgba(${CY},.16)`; g.beginPath(); g.arc(cx, cy, gr, Math.PI * 0.85, Math.PI * 1.15); g.stroke()
    g.beginPath(); g.arc(cx, cy, gr, -Math.PI * 0.15, Math.PI * 0.15); g.stroke()
    g.strokeStyle = `rgba(${ICE},.75)`; g.beginPath(); g.arc(cx, cy, gr, Math.PI * 1.15 - Math.PI * 0.3 * lvl, Math.PI * 1.15); g.stroke()
    if (cc.kind) { g.strokeStyle = fire; g.globalAlpha = 0.8; g.beginPath(); g.arc(cx, cy, gr, -Math.PI * 0.15, Math.PI * 0.15); g.stroke(); g.globalAlpha = 1 }
  }

  // thin guide filaments from the hub to the plan steps
  function coreUnder(g, cc) {
    const { cx, cy, steps } = cc
    g.strokeStyle = `rgba(${CY},.12)`; g.lineWidth = 1; g.setLineDash([2, 6]); g.beginPath()
    for (const p of steps) { g.moveTo(cx, cy); g.lineTo(p.x, p.y) }
    g.stroke(); g.setLineDash([])
  }

  // the goal: a warm gold glow with a slowly turning segmented ring
  function coreOver(g, cc) {
    const { goal, t, complete, flare, steps } = cc
    if (!goal || !steps.length) return
    const rgb = complete ? '120,230,150' : C.goalRGB, k = 1 + 0.06 * Math.sin(t * TAU / 40) + flare
    g.save(); g.globalCompositeOperation = 'lighter'
    const gr = g.createRadialGradient(goal.x, goal.y, 0, goal.x, goal.y, 54 * k)
    gr.addColorStop(0, `rgba(${rgb},.24)`); gr.addColorStop(0.5, `rgba(${rgb},.06)`); gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr; g.beginPath(); g.arc(goal.x, goal.y, 54 * k, 0, TAU); g.fill()
    g.translate(goal.x, goal.y); g.rotate(t * TAU / 160)
    g.strokeStyle = `rgba(${rgb},.5)`; g.lineWidth = 1.4; g.beginPath()
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; g.moveTo(Math.cos(a) * 44, Math.sin(a) * 44); g.arc(0, 0, 44, a, a + 1.1) }
    g.stroke(); g.restore()
  }

  function link(g, x1, y1, x2, y2, color, b) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2)
    if (!color) { g.strokeStyle = C.link; g.lineWidth = 0.7; g.stroke(); return }
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.strokeStyle = color
    g.globalAlpha = 0.18 * b; g.lineWidth = 7 * b + 1; g.stroke()
    g.globalAlpha = 0.5 + 0.5 * b; g.lineWidth = 0.8 + 1.4 * b; g.stroke()
    if (b > 0.6) { g.strokeStyle = C.packet; g.globalAlpha = (b - 0.6) * 1.5; g.lineWidth = 0.8; g.stroke() }
    g.restore()
  }

  function neuron(g, x, y, r, color, b) {
    if (!color) {
      g.fillStyle = C.neuron; g.globalAlpha = 0.7; g.beginPath(); g.arc(x, y, r * 0.8, 0, TAU); g.fill(); g.globalAlpha = 1
      return
    }
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = color
    g.globalAlpha = 0.22 * b; g.beginPath(); g.arc(x, y, r * 3.4, 0, TAU); g.fill()
    g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
    if (b > 0.4) { g.fillStyle = C.packet; g.beginPath(); g.arc(x, y, r * 0.5, 0, TAU); g.fill() }
    g.restore()
  }

  // the hub: a white-hot core in a thin ring with four marks
  function coreCenter(g, cc) {
    const { cx, cy, t } = cc, k = 1 + 0.08 * Math.sin(t * TAU / 30)
    g.save(); g.globalCompositeOperation = 'lighter'
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, 40 * k)
    halo.addColorStop(0, `rgba(${HOT},.75)`); halo.addColorStop(0.18, `rgba(${ICE},.35)`); halo.addColorStop(1, `rgba(${CY},0)`)
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, 40 * k, 0, TAU); g.fill()
    g.translate(cx, cy); g.rotate(-t * TAU / 60)
    g.strokeStyle = `rgba(${ICE},.7)`; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 16, 0, TAU)
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; g.moveTo(Math.cos(a) * 19, Math.sin(a) * 19); g.lineTo(Math.cos(a) * 25, Math.sin(a) * 25) }
    g.stroke(); g.restore()
    g.fillStyle = '#f2fdff'; g.beginPath(); g.arc(cx, cy, 4.5, 0, TAU); g.fill()
  }

  registerTheme({
    id: 'hologram',
    name: 'Hologram',
    light: false,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
    fonts: { mono: '"JetBrains Mono", ui-monospace, monospace', head: 'Rajdhani, "Helvetica Neue", sans-serif' },
    webSilk: true,
    css: {
      '--bg': '#030a16', '--panel': 'rgba(5,16,32,.88)', '--panel2': '#06142a', '--line': '#16486a',
      '--cyan': '#3fdcff', '--yellow': '#ffc454', '--red': '#ff4d5e', '--green': '#5ef0a0', '--purple': '#b99bff',
      '--amber': '#ff9a3c', '--blue': '#6f9dff', '--dim': '#7fa3bd', '--text': '#e4f7ff', '--muted': '#9fc4d8',
      '--mono': "'JetBrains Mono', ui-monospace, Menlo, monospace", '--head': "Rajdhani, 'Helvetica Neue', sans-serif",
      '--radius': '4px', '--clip': 'none',
    },
    colors: {
      bg: '#030a16', cyan: '#3fdcff', yellow: '#ffc454', red: '#ff4d5e', green: '#5ef0a0', purple: '#b99bff', amber: '#ff9a3c', blue: '#6f9dff',
      dim: '#7fa3bd', line: '#16486a', text: '#e4f7ff',
      muted: '#9fc4d8', todo: '#6a8ca6', doneInk: '#b8f7d2', ink2: '#f2fdff', nodeFill: '#051226', chip: 'rgba(3,10,22,.82)', labelBg: 'rgba(3,10,22,.94)',
      link: 'rgba(0,210,255,.16)', neuron: '#7fe9ff', shell: 'rgba(127,233,255,.5)', wire: 'rgba(0,210,255,.12)', packet: '#f2fdff',
      accentRGB: '63,220,255', goalRGB: '255,196,84', tickRGB: '127,233,255', glow0: '127,233,255', glow1: '0,210,255', glow2: '0,60,110',
    },
    backdrop, sphere, coreUnder, coreOver, link, neuron, coreCenter,
  })
})()
