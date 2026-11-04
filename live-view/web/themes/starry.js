// Starry Night: a cobalt sky of short curved brush strokes that follow slow vortices,
// haloed yellow stars, a crescent moon, a cypress at the left edge and low hills.
// Heavy geometry is painted once per window size into offscreen canvases; each frame only
// moves those images (a slow slide and slow turns), streams a few hundred strokes along
// precomputed flow lines and draws a few dozen cheap shapes.
(() => {
  const TAU = Math.PI * 2
  const SKY = ['#0b1d4a', '#102a63', '#1b3f8c', '#2c5bb3', '#3f74c9', '#6f9be0', '#a7c6f2']
  const OCHRE = '#e8c35a', GOLD = '#f7d774', CREAM = '#fff6cf', CYP = '#0a1a16'
  const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  // a layer painted once (many strokes), then only moved as an image each frame; kept GPU-side so drawing it is a cheap copy
  const layer = (w, h) => { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')] }

  // one stroke: a short arc from p-dir*L/2 to p+dir*L/2, bowed by `bow` px to the left of its direction
  function brush(x, px, py, ang, L, bow, col, a, w) {
    const ux = Math.cos(ang), uy = Math.sin(ang)
    x.strokeStyle = col; x.globalAlpha = a; x.lineWidth = w
    x.beginPath(); x.moveTo(px - ux * L / 2, py - uy * L / 2)
    x.quadraticCurveTo(px - uy * bow, py + ux * bow, px + ux * L / 2, py + uy * L / 2); x.stroke()
  }
  // colour of a sky stroke: mostly mid blues, a few pale, rare ochre
  function pick(r, warm) {
    const n = r()
    if (n < warm) return [OCHRE, 0.2]
    if (n < 0.08) return [SKY[6], 0.1]
    if (n < 0.22) return [SKY[5], 0.16]
    if (n < 0.45) return [SKY[4], 0.25]
    if (n < 0.72) return [SKY[3], 0.38]
    if (n < 0.9) return [SKY[2], 0.5]
    return [SKY[0], 0.45]
  }
  // a spiral of dashed thick strokes, as on a swirl's eye
  function spiral(x, r0, r1, turns, dir) {
    x.beginPath()
    for (let k = 0; k <= 90; k++) { const u = k / 90, a = dir * u * turns * TAU, rr = r0 + (r1 - r0) * u; x[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr) }
    x.stroke()
  }

  let S = null
  // flow lines: FLK points FLH px apart; strokes cover FLN segments and move about FLV px a second
  const FLK = 44, FLH = 7, FLN = 4, FLV = 15, LEV = 5
  const STREAM = [[SKY[4], 0.55, 3.4], [SKY[5], 0.5, 3], [SKY[6], 0.42, 2.4], [OCHRE, 0.45, 2.6]]   // colour, alpha, width
  /** The sky for one window size: a sliding stroke field, turning swirl discs, star and moon spots, hills. */
  function build(W, H, A, dpr) {
    const r = rng(1889), m = Math.min(A, H), M = 28, sc = clamp(m / 900, 0.7, 1.3)
    const vs = [
      { x: A * 0.34, y: H * 0.26, rad: m * 0.21, dir: 1, T: 120, eye: [[SKY[6], 0.32, 6], [SKY[4], 0.4, 9]] },
      { x: A * 0.63, y: H * 0.19, rad: m * 0.15, dir: -1, T: 140, eye: [[OCHRE, 0.28, 5]] },
      { x: A * 0.84, y: H * 0.63, rad: m * 0.15, dir: 1, T: 130, eye: [[SKY[6], 0.24, 5]] },
      { x: A * 0.17, y: H * 0.66, rad: m * 0.13, dir: -1, T: 155, eye: [[SKY[5], 0.3, 5]] },
    ]
    // the wind: a gentle eastward drift that bends round each swirl in its turning direction
    const flow = (px, py) => {
      let fx = 1, fy = 0.3 * Math.sin(px / A * TAU * 1.2 + py / H * 5) + 0.12 * Math.sin(py / H * 13)
      for (const v of vs) { const dx = px - v.x, dy = py - v.y, d = Math.hypot(dx, dy) || 1, w = Math.exp(-((d / v.rad) ** 2)); fx += -v.dir * dy / d * w * 2.4; fy += v.dir * dx / d * w * 2.4 }
      return [fx, fy]
    }
    for (const v of vs) { v.size = Math.ceil(v.rad * 2.5); [v.c, v.x2] = layer(v.size * dpr, v.size * dpr); v.x2.setTransform(dpr, 0, 0, dpr, dpr * v.size / 2, dpr * v.size / 2); v.x2.lineCap = 'round' }
    // the base: gradient sky plus every stroke outside the swirls
    const [bg, x] = layer((W + 2 * M) * dpr, (H + 2 * M) * dpr)
    x.setTransform(dpr, 0, 0, dpr, M * dpr, M * dpr)
    const gr = x.createLinearGradient(0, -M, 0, H + M)
    gr.addColorStop(0, '#0d2254'); gr.addColorStop(0.45, '#112c68'); gr.addColorStop(1, '#0a1838')
    x.fillStyle = gr; x.fillRect(-M, -M, W + 2 * M, H + 2 * M)
    x.lineCap = 'round'
    const step = Math.max(15, Math.sqrt(W * H / 1500))
    for (let y = -M; y < H + M; y += step * 0.72) for (let x0 = -M; x0 < W + M; x0 += step) {
      const px = x0 + (r() - 0.5) * step, py = y + (r() - 0.5) * step * 0.7
      let best = null, bw = 0
      for (const v of vs) { const w = Math.exp(-((Math.hypot(px - v.x, py - v.y) / v.rad) ** 2)); if (w > bw) { bw = w; best = v } }
      const [fx, fy] = flow(px, py)
      const L = step * (0.9 + r() * 0.9), wd = (2.4 + r() * 2.6) * sc
      if (bw > 0.32) {   // inside a swirl: follow its circles, painted in its local frame so it can turn
        const dx = px - best.x, dy = py - best.y, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx)
        const [col, al] = pick(r, best.eye[0][0] === OCHRE ? 0.2 : 0.04)
        const edge = clamp((bw - 0.32) / 0.25, 0.35, 1)
        brush(best.x2, dx, dy, a + best.dir * (Math.PI / 2 + 0.2), L, best.dir * L * L / (4 * d), col, al * edge * (0.75 + r() * 0.5), wd)
      } else {
        const [col, al] = pick(r, 0.015)
        brush(x, px, py, Math.atan2(fy, fx), L, (r() - 0.5) * L * 0.3, col, al * (0.75 + r() * 0.5), wd)
      }
    }
    for (const v of vs) for (const [col, al, w] of v.eye) {
      const t = v.x2; t.strokeStyle = col; t.globalAlpha = al; t.lineWidth = w * sc; t.setLineDash([16 * sc, 9 * sc])
      spiral(t, v.rad * 0.05, v.rad * (w > 6 ? 0.85 : 0.65), w > 6 ? 1.5 : 2.1, v.dir); t.setLineDash([])
    }
    // stars (fractions of the area left of the side panel), kept out of the header and goal band
    const stars = [[0.07, 0.29, 1], [0.24, 0.235, 0.7], [0.46, 0.3, 0.85], [0.7, 0.33, 0.65], [0.91, 0.42, 0.8], [0.95, 0.77, 0.6], [0.31, 0.47, 0.55], [0.6, 0.53, 0.5]]
      .map(([u, v, s], i) => ({ x: A * u, y: H * v, s: s * sc, T: 8 + i * 1.3, p: i * 1.9 }))
    const dots = new Path2D()
    for (let i = 0; i < 70; i++) { const px = r() * A, py = 80 + r() * H * 0.75, rr = 0.6 + r() * 1.1; dots.moveTo(px + rr, py); dots.arc(px, py, rr, 0, TAU) }
    // hills: two bands of low rolling land
    const hill = (base, a1, a2, ph) => { const p = new Path2D(), top = []; p.moveTo(-10, H + 10)
      for (let px = -10; px <= W + 10; px += 16) { const py = H - H * (base + a1 * Math.sin(px / A * TAU * 0.8 + ph) + a2 * Math.sin(px / A * TAU * 2.3 + ph * 2)); p.lineTo(px, py); top.push([px, py]) }
      p.lineTo(W + 10, H + 10); p.closePath(); return { p, top } }
    const hills = [hill(0.085, 0.022, 0.012, 0.6), hill(0.05, 0.015, 0.01, 2.2)]
    // the sickle of Leo, faint, low on the right: Regulus first, then η, γ, ζ, μ, ε (sky offsets in degrees, east to the left)
    const lk = 3.6 * sc, lx = A * 0.86, ly = H * 0.85
    const leo = [[-2, -12], [-1.7, -16.8], [-4.7, -19.8], [-4, -23.4], [1.7, -26], [3.4, -23.8]].map(([u, v]) => [lx + u * lk, ly + (v + 12) * lk])
    const leoDots = new Path2D(), leoLine = new Path2D()
    leo.forEach(([px, py], i) => { if (i) leoDots.moveTo(px + 1.1, py), leoDots.arc(px, py, 1.1, 0, TAU); leoLine[i ? 'lineTo' : 'moveTo'](px, py) })
    // flow lines traced once; each frame a short stroke slides along each one, fading in and out
    const lines = [], n = Math.round(clamp(W * H / 4200, 160, 420))
    for (let i = 0; i < n; i++) {
      let px = -40 + r() * (W + 40), py = r() * H * 0.92
      const pts = new Float32Array(FLK * 2), mask = new Float32Array(FLK)
      for (let k = 0; k < FLK; k++) {
        pts[2 * k] = px; pts[2 * k + 1] = py
        mask[k] = py < 225 && px < A * 0.66 ? 0.3 : 1   // quieter behind the goal title
        const [fx, fy] = flow(px, py), d = Math.hypot(fx, fy) || 1
        px += fx / d * FLH; py += fy / d * FLH
      }
      const n2 = r(), col = n2 < 0.1 ? 3 : n2 < 0.36 ? 2 : n2 < 0.7 ? 1 : 0
      lines.push({ pts, mask, col, sp: (0.7 + r() * 0.6) * FLV / FLH, ph: r() * FLK })
    }
    S = { W, H, A, dpr, M, bg, vs, stars, dots, hills, sc, lines, leo, leoDots, leoLine,
      hillFill: ['#0d1f45', '#081530'], moon: { x: A - 112 * sc, y: 172 }, cyp: { w: clamp(A * 0.08, 72, 130), h: H * 0.7 } }
  }

  function cypress(g, b) {
    const { w, h } = S.cyp, H = b.H, sway = 5 * Math.sin(b.t * TAU / 75), xc = 14 + w * 0.48, N = 40
    const at = (u, side) => {
      const lobe = 0.72 + 0.28 * Math.sin(u * 23 + side * 1.7) * Math.sin(u * 7 + side)
      const hw = w / 2 * Math.pow(1 - u, 0.8) * lobe * (u < 0.08 ? 0.85 + u * 2 : 1)
      return [xc + sway * u * u + 7 * Math.sin(u * 8.5) * u + side * hw, H - u * h]
    }
    g.fillStyle = CYP; g.beginPath()
    for (let k = 0; k <= N; k++) { const [px, py] = at(k / N, -1); g[k ? 'lineTo' : 'moveTo'](px, py) }
    for (let k = N; k >= 0; k--) { const [px, py] = at(k / N, 1); g.lineTo(px, py) }
    g.closePath(); g.fill()
    // a few inner flame strokes
    g.lineCap = 'round'
    for (const [off, col, lw, top] of [[-0.25, '#1f3d2e', 5, 0.8], [0.12, '#16302a', 6, 0.92], [0.32, '#1f3d2e', 4, 0.6]]) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath()
      for (let k = 0; k <= 16; k++) { const u = k / 16 * top, [px, py] = at(u, 0); g[k ? 'lineTo' : 'moveTo'](px + off * w * Math.pow(1 - u, 0.8) * (1 + 0.4 * Math.sin(u * 17 + off * 9)), py) }
      g.stroke()
    }
  }

  // the moving strokes, bucketed by colour and fade level so the whole set is a handful of stroke() calls
  function streams(g, t, ox, oy, every) {
    const paths = STREAM.map(() => Array.from({ length: LEV }, () => new Path2D())), span = FLK - 1 - FLN
    for (let i = 0; i < S.lines.length; i += every) {
      const l = S.lines[i], u = FLN + ((t * l.sp + l.ph) % span), q = (u - FLN) / span
      const lev = Math.floor(Math.sin(Math.PI * q) * l.mask[u | 0] * LEV)
      if (lev < 1) continue
      const p = paths[l.col][lev - 1], P = l.pts
      for (let k = 0; k <= FLN; k++) {
        const s = u - k, j = s | 0, f = s - j, x = P[2 * j] + (P[2 * j + 2] - P[2 * j]) * f + ox, y = P[2 * j + 1] + (P[2 * j + 3] - P[2 * j + 1]) * f + oy
        k ? p.lineTo(x, y) : p.moveTo(x, y)
      }
    }
    g.lineCap = 'round'; g.lineJoin = 'round'
    STREAM.forEach(([col, a, w], c) => { g.strokeStyle = col; g.lineWidth = w * S.sc
      for (let v = 0; v < LEV; v++) { g.globalAlpha = a * (v + 1) / LEV; g.stroke(paths[c][v]) } })
    g.globalAlpha = 1
  }

  function star(g, s, t, low) {
    const k = Math.sin(t * TAU / s.T + s.p), R = 24 * s.s * (1 + 0.1 * k)
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, R * 1.5)
    gr.addColorStop(0, 'rgba(255,246,207,.9)'); gr.addColorStop(0.18, `rgba(247,215,116,${0.38 + 0.12 * k})`); gr.addColorStop(1, 'rgba(247,215,116,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, R * 1.5, 0, TAU); g.fill()
    if (!low) {
      g.strokeStyle = OCHRE; g.lineWidth = 2.6 * s.s; g.setLineDash([9 * s.s, 6 * s.s]); g.lineDashOffset = t * 1.5 + s.p * 10
      g.globalAlpha = 0.3 + 0.1 * k; g.beginPath(); g.arc(s.x, s.y, R * 0.9, 0, TAU); g.stroke()
      g.strokeStyle = SKY[6]; g.globalAlpha = 0.16 + 0.06 * k; g.lineDashOffset = -t * 1.2; g.beginPath(); g.arc(s.x, s.y, R * 1.35, 0, TAU); g.stroke()
      g.setLineDash([]); g.globalAlpha = 1
    }
    g.fillStyle = CREAM; g.beginPath(); g.arc(s.x, s.y, 4.2 * s.s, 0, TAU); g.fill()
  }

  function moon(g, t, sc) {
    const { x, y } = S.moon, r = 36 * sc, k = Math.sin(t * TAU / 14)
    const gr = g.createRadialGradient(x, y, r * 0.6, x, y, r * 3.4)
    gr.addColorStop(0, `rgba(247,215,116,${0.26 + 0.04 * k})`); gr.addColorStop(1, 'rgba(247,215,116,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3.4, 0, TAU); g.fill()
    g.strokeStyle = OCHRE; g.lineWidth = 4 * sc; g.setLineDash([14 * sc, 8 * sc])
    for (const [rr, a, d] of [[1.5, 0.32, 1], [2.1, 0.18, -1]]) { g.globalAlpha = a + 0.05 * k; g.lineDashOffset = d * t * 1.4; g.beginPath(); g.arc(x, y, r * rr * (1 + 0.025 * k), 0, TAU); g.stroke() }
    g.setLineDash([]); g.globalAlpha = 1
    // the crescent: inside the disc, outside a disc shifted up-right
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip()
    g.fillStyle = GOLD; g.beginPath(); g.arc(x, y, r, 0, TAU); g.arc(x + r * 0.46, y - r * 0.3, r * 0.9, 0, TAU); g.fill('evenodd')
    g.restore()
  }

  function backdrop(g, b) {
    const dpr = g.getTransform().a || 1, A = Math.round(clamp(2 * b.cx, 320, b.W))
    if (!S || S.W !== b.W || S.H !== b.H || S.A !== A || S.dpr !== dpr) build(b.W, b.H, A, dpr)
    const t = b.t, M = S.M
    // the field creeps sideways along the wind and back, about 10 px over 80 s
    const ox = 10 * Math.sin(t * TAU / 80), oy = 4 * Math.sin(t * TAU / 110 + 1)
    g.drawImage(S.bg, -M + ox, -M + oy, b.W + 2 * M, b.H + 2 * M)
    // swirls turn, one turn every four to six minutes
    for (const v of S.vs) {
      g.save(); g.translate(v.x + ox * 0.5, v.y + oy * 0.5); g.rotate(v.dir * t * TAU / v.T)
      g.drawImage(v.c, -v.size / 2, -v.size / 2, v.size, v.size); g.restore()
    }
    streams(g, t, ox, oy, b.low && !b.saver ? 2 : 1)
    // a soft wash of light drifting across the sky
    const wx = b.W * (0.45 + 0.25 * Math.sin(t * TAU / 97)), wy = b.H * (0.32 + 0.12 * Math.cos(t * TAU / 121)), wr = Math.max(b.W, b.H) * 0.45
    const wg = g.createRadialGradient(wx, wy, 0, wx, wy, wr)
    wg.addColorStop(0, `rgba(111,155,224,${b.saver ? 0.09 : 0.06})`); wg.addColorStop(1, 'rgba(111,155,224,0)')
    g.fillStyle = wg; g.fillRect(0, 0, b.W, b.H)
    g.fillStyle = 'rgba(255,246,207,.45)'; g.fill(S.dots)
    for (const s of S.stars) star(g, s, t, b.low)
    // Leo: a barely-there dashed sickle; Regulus a little brighter, breathing on a 60 s cycle
    if (!b.low) { g.strokeStyle = SKY[5]; g.globalAlpha = 0.1; g.lineWidth = 1; g.setLineDash([3, 4]); g.stroke(S.leoLine); g.setLineDash([]) }
    g.fillStyle = CREAM; g.globalAlpha = 0.42; g.fill(S.leoDots)
    const [rx, ry] = S.leo[0]; g.globalAlpha = 0.6 + 0.1 * Math.sin(t * TAU / 60); g.beginPath(); g.arc(rx, ry, 1.7 * S.sc, 0, TAU); g.fill(); g.globalAlpha = 1
    moon(g, t, S.sc)
    // hills, then the cypress in front
    S.hills.forEach((hl, i) => {
      g.fillStyle = S.hillFill[i]; g.fill(hl.p)
      if (!b.low) { g.strokeStyle = SKY[i ? 2 : 3]; g.globalAlpha = 0.45; g.lineWidth = 3 * S.sc; g.lineCap = 'round'; g.setLineDash([22, 14]); g.lineDashOffset = i * 11
        g.beginPath(); hl.top.forEach(([px, py], k) => g[k ? 'lineTo' : 'moveTo'](px, py + 7 + i * 3)); g.stroke(); g.setLineDash([]); g.globalAlpha = 1 }
    })
    cypress(g, b)
  }

  // ---- the core: a night vortex inside the sphere ----
  let V = null
  function buildVortex(R, dpr) {
    const r = rng(77), size = Math.ceil(R * 2), [c, x] = layer(size * dpr, size * dpr)
    x.setTransform(dpr, 0, 0, dpr, dpr * size / 2, dpr * size / 2); x.lineCap = 'round'
    for (let i = 0; i < 190; i++) {
      const d = R * Math.sqrt(0.02 + r() * 0.93), a = r() * TAU, L = 16 + r() * 18, [col, al] = pick(r, 0.07)
      brush(x, Math.cos(a) * d, Math.sin(a) * d, a + Math.PI / 2 + 0.2, L, L * L / (4 * d), col, al * 0.85, 2.4 + r() * 2)
    }
    x.setLineDash([18, 10]); x.lineWidth = 5; x.strokeStyle = SKY[6]; x.globalAlpha = 0.2; spiral(x, R * 0.08, R * 0.86, 2.3, 1)
    x.lineWidth = 3; x.strokeStyle = OCHRE; x.globalAlpha = 0.18; spiral(x, R * 0.25, R * 0.93, 1.5, 1)
    V = { R, dpr, c, size }
  }

  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter, recent } = cc
    const dpr = g.getTransform().a || 1
    if (!V || V.R !== R || V.dpr !== dpr) buildVortex(R, dpr)
    const br = 1 + 0.06 * Math.sin(t * TAU / 40) + flare * 0.5
    const gr = g.createRadialGradient(cx, cy - R * 0.1, 0, cx, cy, R * 1.1)
    gr.addColorStop(0, `rgba(63,116,201,${0.5 * br})`); gr.addColorStop(0.5, `rgba(27,63,140,${0.55 * br})`); gr.addColorStop(0.88, 'rgba(11,29,74,.7)'); gr.addColorStop(1, 'rgba(11,29,74,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * 1.1, 0, TAU); g.fill()
    // the vortex inside turns once every three and a half minutes
    g.save(); g.translate(cx, cy); g.rotate(t * TAU / 210); g.drawImage(V.c, -V.size / 2, -V.size / 2, V.size, V.size); g.restore()
    // the rim and two brushy halos that turn a little faster when the agent is busy
    g.strokeStyle = jitter ? C.red : C.shell; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke()
    const spin = t * (0.02 + Math.min(0.12, recent * 0.01))
    g.lineCap = 'round'; g.setLineDash([16, 11])
    for (const [rr, col, a, lw, d] of [[1.14, OCHRE, 0.32, 3, 1], [1.3, SKY[6], 0.16, 2.4, -1]]) {
      g.strokeStyle = col; g.globalAlpha = a * (1 + 0.15 * Math.sin(t * TAU / 50 + rr)) + flare * 0.3; g.lineWidth = lw
      g.lineDashOffset = d * spin * R; g.beginPath(); g.arc(cx, cy, R * rr, 0, TAU); g.stroke()
    }
    g.setLineDash([]); g.globalAlpha = 1
  }

  function link(g, x1, y1, x2, y2, color, b, i) {
    const dx = x2 - x1, dy = y2 - y1, k = ((i * 7919) % 13 - 6) / 6 * 0.14
    const mx = (x1 + x2) / 2 - dy * k, my = (y1 + y2) / 2 + dx * k
    g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(mx, my, x2, y2)
    if (!color) { g.strokeStyle = C.link; g.lineWidth = 1.2; g.stroke(); return }
    g.strokeStyle = color
    if (b > 0.45) { g.globalAlpha = 0.22 * b; g.lineWidth = 7 * b; g.stroke() }
    g.globalAlpha = 0.4 + 0.6 * b; g.lineWidth = 1.2 + 2.2 * b; g.stroke()
  }

  function neuron(g, x, y, r, color, b, i, cc) {
    if (!color) {
      const tw = 0.72 + 0.28 * Math.sin(cc.t * 0.25 + i * 2.3)
      if (r > 2.2) { g.fillStyle = GOLD; g.globalAlpha = 0.12 * tw; g.beginPath(); g.arc(x, y, r * 2.8, 0, TAU); g.fill() }
      g.fillStyle = C.neuron; g.globalAlpha = tw; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); return
    }
    g.fillStyle = color; g.globalAlpha = 0.25 * b; g.beginPath(); g.arc(x, y, r * 3.4, 0, TAU); g.fill()
    g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
    if (b > 0.5) { g.fillStyle = C.packet; g.beginPath(); g.arc(x, y, r * 0.45, 0, TAU); g.fill() }
  }

  function coreCenter(g, cc) {
    const { cx, cy, t } = cc, k = Math.sin(t * TAU / 36)
    const gr = g.createRadialGradient(cx, cy, 6, cx, cy, 46)
    gr.addColorStop(0, `rgba(247,215,116,${0.3 + 0.05 * k})`); gr.addColorStop(1, 'rgba(247,215,116,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 46, 0, TAU); g.fill()
    g.fillStyle = C.chip; g.beginPath(); g.arc(cx, cy, 20, 0, TAU); g.fill()
    g.strokeStyle = C.yellow; g.lineWidth = 1.6; g.stroke()
    g.lineCap = 'round'; g.setLineDash([7, 6]); g.lineDashOffset = t * 1.5; g.globalAlpha = 0.5; g.lineWidth = 2.2
    g.beginPath(); g.arc(cx, cy, 28, 0, TAU); g.stroke(); g.setLineDash([]); g.globalAlpha = 1
    g.fillStyle = CREAM; g.beginPath(); g.arc(cx, cy, 5, 0, TAU); g.fill()
  }

  registerTheme({
    id: 'starry',
    name: 'Starry Night',
    light: false,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    fonts: { mono: '"IBM Plex Mono", ui-monospace, monospace', head: '"Cormorant Garamond", Georgia, serif' },
    css: {
      '--bg': '#0a1838', '--panel': 'rgba(9,22,58,.86)', '--panel2': '#081634', '--line': '#2f4f93',
      '--cyan': '#9fd8f5', '--yellow': '#f7d774', '--red': '#ff5a50', '--green': '#b8e08c', '--purple': '#c9a6ff',
      '--amber': '#f39a4c', '--blue': '#7f9fff', '--dim': '#94a8d4', '--text': '#f4ecd8', '--muted': '#b8c6e6',
      '--mono': "'IBM Plex Mono', ui-monospace, Menlo, monospace", '--head': "'Cormorant Garamond', Georgia, serif",
      '--radius': '10px', '--clip': 'none',
    },
    colors: {
      bg: '#0a1838', cyan: '#9fd8f5', yellow: '#f7d774', red: '#ff5a50', green: '#b8e08c', purple: '#c9a6ff', amber: '#f39a4c', blue: '#7f9fff',
      dim: '#94a8d4', line: '#2f4f93', text: '#f4ecd8',
      muted: '#b8c6e6', todo: '#7d90c0', doneInk: '#d6ecbc', ink2: '#fff6dc', nodeFill: '#0c1f4f', chip: 'rgba(8,20,54,.74)', labelBg: 'rgba(8,20,54,.92)',
      link: 'rgba(199,216,255,.26)', neuron: 'rgba(255,246,207,.85)', shell: 'rgba(247,215,116,.55)', wire: 'rgba(167,198,242,.12)', packet: '#fffbe6',
      accentRGB: '159,216,245', goalRGB: '247,215,116', tickRGB: '167,198,242', glow0: '111,155,224', glow1: '44,91,179', glow2: '16,42,99',
    },
    backdrop, sphere, link, neuron, coreCenter,
  })
})()
