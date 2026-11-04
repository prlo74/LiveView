// Orrery: a brass astronomical instrument on dark walnut. The wood grain and a faint engraved star chart
// are built once per window size; each frame only slides the wood a few pixels, turns the chart (twelve
// minutes a turn) and moves a soft lamp glow. The core is a polished bronze sphere with engraved grooves turning slowly.
;(() => {
  const TAU = Math.PI * 2
  const BRASS = '201,162,74', HI = '232,201,122', SHADE = '122,90,36'
  const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const layer = (w, h) => { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')] }

  // ---- walnut: a gradient board with flowing grain bent round a few knots, plus a vignette ----
  let WD = null
  function buildWood(W, H, dpr) {
    const M = 24, w = W + 2 * M, h = H + 2 * M, r = rng(4127), [c, x] = layer(w * dpr, h * dpr)
    x.setTransform(dpr, 0, 0, dpr, 0, 0)
    const gr = x.createLinearGradient(0, 0, w * 0.4, h)
    gr.addColorStop(0, '#140d08'); gr.addColorStop(0.55, '#1f140b'); gr.addColorStop(1, '#2a1a10')
    x.fillStyle = gr; x.fillRect(0, 0, w, h)
    const knots = Array.from({ length: 4 }, () => ({ x: r() * w, y: r() * h, s: 50 + r() * 70, a: 14 + r() * 20 }))
    const line = (y0, p1, p2, amp) => {
      x.beginPath()
      for (let px = -10; px <= w + 10; px += 10) {
        let y = y0 + amp * Math.sin(px / w * TAU * 0.7 + p1 + y0 * 0.004) + amp * 0.4 * Math.sin(px / w * TAU * 2.3 + p2)
        for (const k of knots) { const dx = px - k.x, dy = y0 - k.y; y += Math.sign(dy || 1) * k.a * Math.exp(-(dx * dx) / (k.s * k.s * 4) - (dy * dy) / (k.s * k.s)) }
        px > -10 ? x.lineTo(px, y) : x.moveTo(px, y)
      }
      x.stroke()
    }
    // broad figure bands first, then the fine grain
    x.lineCap = 'round'
    for (let i = 0; i < 16; i++) { x.strokeStyle = r() < 0.5 ? '#4a2e17' : '#0a0603'; x.globalAlpha = 0.05 + r() * 0.05; x.lineWidth = 12 + r() * 26; line(r() * h, r() * TAU, r() * TAU, 7) }
    const n = Math.round(h / 5)
    for (let i = 0; i < n; i++) {
      const light = r() < 0.5
      x.strokeStyle = light ? '#5a3a1e' : '#070402'; x.globalAlpha = light ? 0.1 + r() * 0.14 : 0.22 + r() * 0.2
      x.lineWidth = light ? 0.6 + r() * 0.9 : 0.8 + r() * 1.6
      line(i * h / n + (r() - 0.5) * 3, r() * 0.6, r() * TAU, 6)
    }
    for (const k of knots) { x.strokeStyle = '#070402'; x.lineWidth = 1; for (let j = 1; j <= 3; j++) { x.globalAlpha = 0.18 / j; x.beginPath(); x.ellipse(k.x, k.y, k.s * 0.22 * j, k.s * 0.07 * j, 0, 0, TAU); x.stroke() } }
    x.globalAlpha = 1
    const vg = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.78)
    vg.addColorStop(0, 'rgba(6,4,2,0)'); vg.addColorStop(1, 'rgba(6,4,2,.55)')
    x.fillStyle = vg; x.fillRect(0, 0, w, h)
    WD = { W, H, dpr, M, c }
  }

  // ---- the engraved star chart, as paths round the origin (drawn at the core and turned there) ----
  let CH = null
  function buildChart(W, H) {
    const r = rng(907), Rc = Math.hypot(W, H), m = Math.min(W, H), gap = m * 0.09
    const rings = new Path2D(), ticks = new Path2D(), ecl = new Path2D(), figs = new Path2D(), stars = new Path2D(), bright = new Path2D()
    for (let k = 2; k * gap < Rc; k++) { rings.moveTo(k * gap, 0); rings.arc(0, 0, k * gap, 0, TAU) }
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; rings.moveTo(Math.cos(a) * gap * 2, Math.sin(a) * gap * 2); rings.lineTo(Math.cos(a) * Rc, Math.sin(a) * Rc) }
    // a degree scale with a double border
    const rs = m * 0.5
    for (const rr of [rs, rs + 12]) { ticks.moveTo(rr, 0); ticks.arc(0, 0, rr, 0, TAU) }
    for (let i = 0; i < 180; i++) { const a = i / 180 * TAU, l = i % 5 ? 4 : i % 15 ? 7 : 12; ticks.moveTo(Math.cos(a) * rs, Math.sin(a) * rs); ticks.lineTo(Math.cos(a) * (rs + l), Math.sin(a) * (rs + l)) }
    // the ecliptic, an off-centre circle as on a planisphere
    ecl.arc(0, -m * 0.1, m * 0.38, 0, TAU)
    for (let i = 0; i < 170; i++) { const a = r() * TAU, d = Rc * Math.sqrt(r()), s = 0.5 + r() * 1.1, px = Math.cos(a) * d, py = Math.sin(a) * d; stars.moveTo(px + s, py); stars.arc(px, py, s, 0, TAU) }
    // a few figures: short walks between brighter stars
    for (let f = 0; f < 9; f++) {
      const a = r() * TAU, d = m * (0.2 + r() * 0.75)
      let px = Math.cos(a) * d, py = Math.sin(a) * d, dir = r() * TAU
      figs.moveTo(px, py)
      for (let j = 0, n = 4 + (r() * 3 | 0); j <= n; j++) {
        const s = 1.3 + r() * 1.2; bright.moveTo(px + s, py); bright.arc(px, py, s, 0, TAU)
        if (j === n) break
        dir += (r() - 0.5) * 2.2; const L = m * (0.035 + r() * 0.05); px += Math.cos(dir) * L; py += Math.sin(dir) * L; figs.lineTo(px, py)
      }
    }
    CH = { W, H, rings, ticks, ecl, figs, stars, bright }
  }

  // ---- web view: two brass orbits round the web, the outer one graduated ----
  let WR = null
  function buildWebRings(R) {
    const p = new Path2D(), sc = new Path2D(), ro = R * 1.38
    p.arc(0, 0, R * 0.66, 0, TAU); p.moveTo(ro, 0); p.arc(0, 0, ro, 0, TAU); p.moveTo(ro + 9, 0); p.arc(0, 0, ro + 9, 0, TAU)
    for (let i = 0; i < 120; i++) { const a = i / 120 * TAU, l = i % 10 ? 4 : 9; sc.moveTo(Math.cos(a) * ro, Math.sin(a) * ro); sc.lineTo(Math.cos(a) * (ro + l), Math.sin(a) * (ro + l)) }
    WR = { R, p, sc }
  }

  function backdrop(g, b) {
    const { W, H, t, cx, cy } = b, dpr = g.getTransform().a || 1, lift = b.saver ? 1.4 : 1
    if (!WD || WD.W !== W || WD.H !== H || WD.dpr !== dpr) buildWood(W, H, dpr)
    if (!CH || CH.W !== W || CH.H !== H) buildChart(W, H)
    const M = WD.M, ox = 6 * Math.sin(t * TAU / 110), oy = 3 * Math.sin(t * TAU / 87 + 1)
    g.drawImage(WD.c, -M + ox, -M + oy, W + 2 * M, H + 2 * M)
    // lamp light drifting over the board
    const lx = W * (0.34 + 0.12 * Math.sin(t * TAU / 96)), ly = H * (0.3 + 0.1 * Math.cos(t * TAU / 118)), lr = Math.max(W, H) * 0.75
    const lg = g.createRadialGradient(lx, ly, 0, lx, ly, lr)
    lg.addColorStop(0, `rgba(255,196,120,${(0.07 + 0.015 * Math.sin(t * TAU / 61)) * lift})`); lg.addColorStop(1, 'rgba(255,196,120,0)')
    g.fillStyle = lg; g.fillRect(0, 0, W, H)
    // the star chart, turning once every twelve minutes, breathing a little
    const k = (0.9 + 0.1 * Math.sin(t * TAU / 75)) * lift
    g.save(); g.translate(cx, cy); g.rotate(t * TAU / 720)
    g.lineWidth = 0.8
    g.strokeStyle = `rgba(${BRASS},${0.075 * k})`; g.stroke(CH.rings)
    g.fillStyle = `rgba(${HI},${0.2 * k})`; g.fill(CH.stars)
    if (!b.low) {
      g.strokeStyle = `rgba(${BRASS},${0.11 * k})`; g.stroke(CH.ticks)
      g.setLineDash([3, 6]); g.strokeStyle = `rgba(${BRASS},${0.09 * k})`; g.stroke(CH.ecl); g.setLineDash([])
      g.strokeStyle = `rgba(${HI},${0.1 * k})`; g.stroke(CH.figs)
      g.fillStyle = `rgba(${HI},${0.32 * k})`; g.fill(CH.bright)
    }
    g.restore()
    if (!b.core && b.R) {
      if (!WR || WR.R !== Math.round(b.R)) buildWebRings(Math.round(b.R))
      g.save(); g.translate(cx, cy); g.rotate(-t * TAU / 900)
      g.lineWidth = 1; g.strokeStyle = `rgba(${BRASS},${0.16 * lift})`; g.stroke(WR.p)
      g.strokeStyle = `rgba(${BRASS},${0.2 * lift})`; g.stroke(WR.sc)
      g.restore()
    }
  }

  let SC = null
  function buildScale(R) {
    const p = new Path2D(), r0 = R * 1.12
    for (const rr of [r0, R * 1.2]) { p.moveTo(rr, 0); p.arc(0, 0, rr, 0, TAU) }
    for (let i = 0; i < 144; i++) { const a = i / 144 * TAU, l = i % 12 ? (i % 4 ? 0.022 : 0.04) : 0.08; p.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); p.lineTo(Math.cos(a) * (r0 + l * R), Math.sin(a) * (r0 + l * R)) }
    SC = { R, p }
  }


  // ---- the engraved bronze sphere ----
  // The grooves are polylines of points on the unit sphere, made once; each frame turns them (yaw from t,
  // fixed forward tilt), keeps the near side and buckets segments by depth so the limb fades.
  // Screen x right, y down, z toward the viewer.
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  // small circle of angular radius `ang` round unit axis c, from s0 to s1 (radians round the axis)
  function circ(c, ang, s0, s1, n) {
    let e1 = cross(c, Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]); e1 = norm(e1); const e2 = cross(c, e1)
    const ca = Math.cos(ang), sa = Math.sin(ang), out = []
    for (let i = 0; i <= n; i++) { const s = s0 + (s1 - s0) * i / n, a = Math.cos(s) * sa, b = Math.sin(s) * sa; out.push([0, 1, 2].map(k => c[k] * ca + e1[k] * a + e2[k] * b)) }
    return out
  }
  let EN = null
  function buildEngraving(low) {
    const r = rng(5113), rv = () => norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]), lines = [], dots = []
    // crossing great circles
    for (let i = 0, n = low ? 4 : 8; i < n; i++) lines.push(circ(rv(), Math.PI / 2, 0, TAU, 120))
    // nests of concentric small circles
    for (let i = 0, n = low ? 3 : 6; i < n; i++) { const c = rv(); for (const a of [0.07, 0.15, 0.24]) lines.push(circ(c, a, 0, TAU, 40)) }
    // crescents: an outer arc and an inner arc round a shifted centre, closed at the horns
    for (let i = 0, n = low ? 2 : 5; i < n; i++) {
      const c = rv(), sh = norm([0, 1, 2].map(k => c[k] + rv()[k] * 0.12)), o = circ(c, 0.22, 0, TAU, 48), inr = circ(sh, 0.19, 0, TAU, 48)
      // keep the outer points not inside the shifted circle, and the inner points inside the first
      const cosI = Math.cos(0.19), cosO = Math.cos(0.22), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
      let run = []
      for (const p of o) { if (dot(p, sh) < cosI) run.push(p); else if (run.length > 1) { lines.push(run); run = [] } else run = [] }
      if (run.length > 1) lines.push(run); run = []
      for (const p of inr) { if (dot(p, c) > cosO) run.push(p); else if (run.length > 1) { lines.push(run); run = [] } else run = [] }
      if (run.length > 1) lines.push(run)
    }
    // rows of drilled dots along short arcs
    for (let i = 0, n = low ? 3 : 8; i < n; i++) { const c = rv(), a = 0.35 + r() * 0.9, s0 = r() * TAU; for (const p of circ(c, a, s0, s0 + 0.5 + r() * 0.6, low ? 8 : 14)) dots.push(p) }
    // one small star figure among the random ones (Leo: the sickle from Regulus, then the body to Denebola),
    // stars as drilled dots joined by grooves; [ra, dec] in degrees, laid flat round a fixed point on the sphere
    const LEO = [[152.1, 12.0], [151.8, 16.8], [155.0, 19.8], [154.2, 23.4], [148.2, 26.0], [146.5, 23.8], [168.5, 20.5], [168.6, 15.4], [177.3, 14.6]]
    const lc = norm([-0.45, -0.3, 0.84]), l1 = norm(cross(lc, [0, 1, 0])), l2 = cross(lc, l1), k = 0.019
    const sp = ([ra, de]) => { const x = (ra - 162) * 0.946 * k, y = (de - 19) * k; return norm([0, 1, 2].map(i => lc[i] + l1[i] * x + l2[i] * y)) }
    const L = LEO.map(sp)
    for (const ix of [[0, 1, 2, 3, 4, 5], [2, 6, 8, 7, 0], [6, 7]]) lines.push(ix.map(i => L[i]))
    dots.push(...L)
    EN = { low, lines, dots }
  }
  // the lit metal body, cached per radius and device scale
  let BZ = null
  function buildBody(R, dpr) {
    const P = Math.ceil(R + 4), [c, x] = layer(2 * P * dpr, 2 * P * dpr)
    x.setTransform(dpr, 0, 0, dpr, P * dpr, P * dpr)
    x.beginPath(); x.arc(0, 0, R, 0, TAU); x.save(); x.clip()
    const g1 = x.createRadialGradient(-R * 0.38, -R * 0.42, R * 0.04, -R * 0.1, -R * 0.1, R * 1.25)
    g1.addColorStop(0, '#f6d7a4'); g1.addColorStop(0.12, '#d79a5c'); g1.addColorStop(0.42, '#a8652f'); g1.addColorStop(0.75, '#6a3a18'); g1.addColorStop(1, '#2b150a')
    x.fillStyle = g1; x.fillRect(-R, -R, 2 * R, 2 * R)
    // darker underside, then a faint warm bounce light on the lower right rim
    const g2 = x.createLinearGradient(0, -R * 0.2, 0, R)
    g2.addColorStop(0, 'rgba(20,9,3,0)'); g2.addColorStop(1, 'rgba(20,9,3,.55)')
    x.fillStyle = g2; x.fillRect(-R, -R, 2 * R, 2 * R)
    const g3 = x.createRadialGradient(0, 0, R * 0.82, 0, 0, R)
    g3.addColorStop(0, 'rgba(255,170,100,0)'); g3.addColorStop(1, 'rgba(255,170,100,.16)')
    x.fillStyle = g3; x.beginPath(); x.arc(R * 0.08, R * 0.1, R, 0, TAU); x.fill()
    x.restore()
    x.strokeStyle = 'rgba(30,14,5,.9)'; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, R - 0.5, 0, TAU); x.stroke()
    // the specular glint sits on top of the grooves, so it is its own layer
    const [s, y] = layer(2 * P * dpr, 2 * P * dpr)
    y.setTransform(dpr, 0, 0, dpr, P * dpr, P * dpr)
    const g4 = y.createRadialGradient(-R * 0.42, -R * 0.46, 0, -R * 0.42, -R * 0.46, R * 0.3)
    g4.addColorStop(0, 'rgba(255,246,225,.5)'); g4.addColorStop(1, 'rgba(255,246,225,0)')
    y.fillStyle = g4; y.beginPath(); y.arc(0, 0, R, 0, TAU); y.fill()
    BZ = { R, dpr, P, c, s }
  }
  const TILT = 0.38, ct = Math.cos(TILT), st = Math.sin(TILT)
  const BANDS = [[0.05, 0.3], [0.3, 0.6], [0.6, 1.01]]

  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter, recent, low } = cc, dpr = g.getTransform().a || 1
    if (!BZ || BZ.R !== R || BZ.dpr !== dpr) buildBody(R, dpr)
    if (!EN || EN.low !== low) buildEngraving(low)
    // a slim dark three-legged stand
    g.lineCap = 'round'; g.strokeStyle = 'rgba(14,8,4,.9)'; g.lineWidth = 3
    const hy = cy + R * 0.92, fy = cy + R * 1.32
    g.beginPath(); g.moveTo(cx - R * 0.5, hy - R * 0.12); g.quadraticCurveTo(cx - R * 0.55, fy - R * 0.1, cx - R * 0.62, fy)
    g.moveTo(cx + R * 0.5, hy - R * 0.12); g.quadraticCurveTo(cx + R * 0.55, fy - R * 0.1, cx + R * 0.62, fy)
    g.moveTo(cx, hy); g.lineTo(cx, fy + R * 0.04); g.stroke()
    g.lineWidth = 2; g.beginPath(); g.ellipse(cx, fy, R * 0.66, R * 0.05, 0, 0, TAU); g.stroke()
    // a soft lamp halo round the body, brighter at the goal
    const br = 1 + 0.06 * Math.sin(t * TAU / 45) + flare * 0.6, gl = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.18)
    gl.addColorStop(0, `rgba(${HI},${0.1 * br})`); gl.addColorStop(1, `rgba(${HI},0)`)
    g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, R * 1.18, 0, TAU); g.fill()
    g.drawImage(BZ.c, cx - BZ.P, cy - BZ.P, 2 * BZ.P, 2 * BZ.P)
    // project the grooves: yaw a full turn every three minutes
    const a = t * TAU / 180, ca = Math.cos(a), sa = Math.sin(a)
    const pr = p => { const x = p[0] * ca + p[2] * sa, z = -p[0] * sa + p[2] * ca; return [cx + x * R, cy + (p[1] * ct - z * st) * R, p[1] * st + z * ct] }
    const paths = BANDS.map(() => new Path2D())
    for (const ln of EN.lines) {
      let q = pr(ln[0])
      for (let i = 1; i < ln.length; i++) {
        const p = pr(ln[i]), z = Math.min(q[2], p[2])
        if (z > 0.05) { const k = z < 0.3 ? 0 : z < 0.6 ? 1 : 2; paths[k].moveTo(q[0], q[1]); paths[k].lineTo(p[0], p[1]) }
        q = p
      }
    }
    const holes = new Path2D(), dr = low ? 1.6 : 2.1
    for (const d of EN.dots) { const p = pr(d); if (p[2] > 0.15) { const rr = dr * Math.sqrt(p[2]); holes.moveTo(p[0] + rr, p[1]); holes.arc(p[0], p[1], rr, 0, TAU) } }
    // each groove: a light lip below-right (the far wall catching the lamp), then the dark cut
    BANDS.forEach((bd, k) => {
      const f = (bd[0] + bd[1]) / 2
      if (!low) { g.save(); g.translate(0.8, 0.9); g.strokeStyle = `rgba(255,214,160,${0.22 * f})`; g.lineWidth = 1; g.stroke(paths[k]); g.restore() }
      g.strokeStyle = `rgba(28,12,4,${0.45 + 0.45 * f})`; g.lineWidth = 1 + 1.9 * f; g.stroke(paths[k])
    })
    g.fillStyle = 'rgba(24,10,3,.8)'; g.fill(holes)
    g.drawImage(BZ.s, cx - BZ.P, cy - BZ.P, 2 * BZ.P, 2 * BZ.P)
    // the rim: red while an error shakes the core
    g.beginPath(); g.arc(cx, cy, R, 0, TAU)
    if (jitter) { g.strokeStyle = C.red; g.lineWidth = 3; g.stroke() }
    else { g.strokeStyle = `rgba(${HI},.35)`; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R + 1.5, Math.PI * 0.95, Math.PI * 1.55); g.stroke() }
    // the graduated brass scale outside, turning slowly (faster when the agent is busy)
    if (!SC || SC.R !== R) buildScale(R)
    g.save(); g.translate(cx, cy); g.rotate(t * (0.008 + Math.min(0.04, recent * 0.003)))
    g.strokeStyle = `rgba(${BRASS},${0.32 + flare * 0.3})`; g.lineWidth = 1; g.stroke(SC.p)
    g.restore()
  }

  // orrery arms from the hub out to each plan step, each step carrying a small turning moon
  function coreUnder(g, cc) {
    const { cx, cy, t, steps, low } = cc
    g.lineCap = 'round'
    g.strokeStyle = `rgba(${BRASS},.2)`; g.lineWidth = 1.2; g.beginPath()
    for (const p of steps) { g.moveTo(cx, cy); g.lineTo(p.x, p.y) }
    g.stroke()
    if (low) return
    g.lineWidth = 0.8
    steps.forEach((p, i) => {
      g.strokeStyle = `rgba(${BRASS},.28)`; g.beginPath(); g.arc(p.x, p.y, 17, 0, TAU); g.stroke()
      const a = t * TAU / (50 + i * 9) + i * 1.7
      g.fillStyle = `rgba(${HI},.6)`; g.beginPath(); g.arc(p.x + Math.cos(a) * 17, p.y + Math.sin(a) * 17, 1.8, 0, TAU); g.fill()
    })
  }

  // the goal as a gold sun, behind the page's goal rings
  function coreOver(g, cc) {
    const { goal, t, complete, flare, steps } = cc
    if (!goal || !steps.length) return
    const rgb = complete ? '159,214,122' : C.goalRGB, k = 1 + 0.08 * Math.sin(t * TAU / 40) + flare
    const gr = g.createRadialGradient(goal.x, goal.y, 0, goal.x, goal.y, 58 * k)
    gr.addColorStop(0, `rgba(${rgb},.28)`); gr.addColorStop(0.5, `rgba(${rgb},.08)`); gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr; g.beginPath(); g.arc(goal.x, goal.y, 58 * k, 0, TAU); g.fill()
    g.save(); g.translate(goal.x, goal.y); g.rotate(t * TAU / 200)
    g.strokeStyle = `rgba(${rgb},.45)`; g.lineWidth = 1.2; g.lineCap = 'round'; g.beginPath()
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r1 = i % 2 ? 47 : 52; g.moveTo(Math.cos(a) * 43, Math.sin(a) * 43); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1) }
    g.stroke(); g.restore()
  }

  function link(g, x1, y1, x2, y2, color, b) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2)
    if (!color) { g.strokeStyle = 'rgba(36,16,6,.55)'; g.lineWidth = 0.9; g.stroke(); return }
    // a dark seat under the lit line so the firing colour stands off the bronze
    g.lineCap = 'round'; g.strokeStyle = 'rgba(20,9,3,.6)'; g.lineWidth = 2.5 + 2 * b; g.stroke(); g.strokeStyle = color
    if (b > 0.45) { g.globalAlpha = 0.2 * b; g.lineWidth = 6 * b; g.stroke() }
    g.globalAlpha = 0.4 + 0.6 * b; g.lineWidth = 1 + 2 * b; g.stroke()
  }

  // idle neurons are brass rivets: a shaded rim, a disc and a highlight from the lamp
  function neuron(g, x, y, r, color, b, i, cc) {
    if (!color) {
      g.fillStyle = `rgba(${SHADE},.9)`; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.25, r * 1.2, 0, TAU); g.fill()
      g.fillStyle = C.neuron; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
      if (r > 1.6 && !cc.low) { g.fillStyle = 'rgba(255,240,200,.75)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.38, 0, TAU); g.fill() }
      return
    }
    g.fillStyle = color; g.globalAlpha = 0.25 * b; g.beginPath(); g.arc(x, y, r * 3.2, 0, TAU); g.fill()
    g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
    g.strokeStyle = 'rgba(20,9,3,.75)'; g.lineWidth = 1; g.stroke()
    if (b > 0.5) { g.fillStyle = C.packet; g.beginPath(); g.arc(x, y, r * 0.45, 0, TAU); g.fill() }
  }

  // the hub: a small gold sun with fine rays
  function coreCenter(g, cc) {
    const { cx, cy, t } = cc, k = Math.sin(t * TAU / 36)
    const halo = g.createRadialGradient(cx, cy, 8, cx, cy, 44)
    halo.addColorStop(0, `rgba(${HI},${0.3 + 0.05 * k})`); halo.addColorStop(1, `rgba(${HI},0)`)
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, 44, 0, TAU); g.fill()
    g.save(); g.translate(cx, cy); g.rotate(t * TAU / 180)
    g.strokeStyle = `rgba(${HI},.7)`; g.lineWidth = 1.2; g.lineCap = 'round'; g.beginPath()
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, r1 = i % 2 ? 19 : 24; g.moveTo(Math.cos(a) * 15, Math.sin(a) * 15); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1) }
    g.stroke(); g.restore()
    const sun = g.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, 12)
    sun.addColorStop(0, '#fff3cf'); sun.addColorStop(0.45, '#e8c97a'); sun.addColorStop(1, '#9a7330')
    g.fillStyle = sun; g.beginPath(); g.arc(cx, cy, 12, 0, TAU); g.fill()
    g.strokeStyle = `rgba(${SHADE},.9)`; g.lineWidth = 1.2; g.stroke()
  }

  registerTheme({
    id: 'orrery',
    name: 'Orrery',
    light: false,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Marcellus&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    fonts: { mono: '"IBM Plex Mono", ui-monospace, monospace', head: 'Marcellus, Georgia, serif' },
    webSilk: false,
    css: {
      '--bg': '#140d08', '--panel': 'rgba(30,19,11,.9)', '--panel2': '#1a110a', '--line': '#5c4421',
      '--cyan': '#7fd6c8', '--yellow': '#f4cf5c', '--red': '#ff5448', '--green': '#a3d977', '--purple': '#c9a2f2',
      '--amber': '#f28a3a', '--blue': '#8fadff', '--dim': '#b29e7e', '--text': '#f3e8d2', '--muted': '#cdb995',
      '--mono': "'IBM Plex Mono', ui-monospace, Menlo, monospace", '--head': 'Marcellus, Georgia, serif',
      '--radius': '6px', '--clip': 'none',
    },
    colors: {
      bg: '#140d08', cyan: '#7fd6c8', yellow: '#f4cf5c', red: '#ff5448', green: '#a3d977', purple: '#c9a2f2', amber: '#f28a3a', blue: '#8fadff',
      dim: '#b29e7e', line: '#5c4421', text: '#f3e8d2',
      muted: '#cdb995', todo: '#8a7456', doneInk: '#d3eab8', ink2: '#fff4dc', nodeFill: '#1d130b', chip: 'rgba(20,13,8,.8)', labelBg: 'rgba(20,13,8,.94)',
      link: 'rgba(201,162,74,.3)', neuron: '#d9b45e', shell: 'rgba(201,162,74,.6)', wire: 'rgba(201,162,74,.16)', packet: '#fff6dc',
      accentRGB: '127,214,200', goalRGB: '244,207,92', tickRGB: '201,162,74', glow0: '232,201,122', glow1: '201,162,74', glow2: '122,90,36',
    },
    backdrop, sphere, coreUnder, coreOver, link, neuron, coreCenter,
  })
})()
