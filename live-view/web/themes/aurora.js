// Aurora: a polar night. A navy-to-black sky with a faint star field, slow-folding curtains of
// aurora drawn as soft vertical-gradient rays along undulating curves, and dark snowy mountains.
// The sky, stars and mountains are painted once per window size; each frame draws a few hundred
// scaled copies of small ray textures (the curtains) and a few dozen twinkling stars.
;(() => {
  const TAU = Math.PI * 2
  const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const layer = (w, h) => { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')] }

  // one ray texture: colour bands from a sharp lower edge upward to a transparent top, soft at the sides
  function ray(stops) {
    const [c, x] = layer(32, 256)
    const v = x.createLinearGradient(0, 256, 0, 0)
    for (const [k, col] of stops) v.addColorStop(k, col)
    x.fillStyle = v; x.fillRect(0, 0, 32, 256)
    const h = x.createLinearGradient(0, 0, 32, 0)
    h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)')
    x.globalCompositeOperation = 'destination-in'; x.fillStyle = h; x.fillRect(0, 0, 32, 256)
    return c
  }
  let TEX = null
  const tex = () => TEX || (TEX = [
    ray([[0, 'rgba(92,242,165,0)'], [0.06, 'rgba(92,242,165,1)'], [0.22, 'rgba(92,242,190,.7)'], [0.5, 'rgba(70,200,210,.32)'], [0.78, 'rgba(165,139,255,.14)'], [1, 'rgba(165,139,255,0)']]),
    ray([[0, 'rgba(80,225,200,0)'], [0.04, 'rgba(80,225,200,.9)'], [0.3, 'rgba(110,190,240,.45)'], [0.65, 'rgba(165,139,255,.22)'], [1, 'rgba(240,130,200,0)']]),
    ray([[0, 'rgba(165,139,255,0)'], [0.05, 'rgba(165,139,255,.8)'], [0.4, 'rgba(200,140,240,.35)'], [0.75, 'rgba(245,140,200,.14)'], [1, 'rgba(245,140,200,0)']]),
  ])

  // curtains: base height (fraction of H), two slow waves for the curve, a travelling fold wave for brightness,
  // a reach across the width, plus the always-visible motion: a ripple running along the lower edge (ar/kr/Tr),
  // rays swaying sideways so they bunch into folds (ks/Ts), and ray heights shimmering (kh/Th)
  const CURTAINS = [
    { tex: 0, y0: 0.40, a1: 0.050, k1: 0.9, T1: 97, a2: 0.018, k2: 2.3, T2: 61, h: 0.30, kf: 3.1, Tf: 26, x0: 0.04, x1: 0.78, Tx: 113, a: 0.26, p: 0.4, ar: 0.013, kr: 7, Tr: 17, ks: 5, Ts: 13, kh: 9, Th: 11 },
    { tex: 1, y0: 0.31, a1: 0.040, k1: 1.3, T1: 83, a2: 0.016, k2: 2.9, T2: 47, h: 0.24, kf: 4.2, Tf: 21, x0: 0.30, x1: 1.02, Tx: 89, a: 0.2, p: 2.1, ar: 0.011, kr: 8.5, Tr: 14, ks: 6, Ts: 15, kh: 11, Th: 9 },
    { tex: 2, y0: 0.24, a1: 0.035, k1: 0.7, T1: 119, a2: 0.012, k2: 2.0, T2: 71, h: 0.18, kf: 2.6, Tf: 31, x0: 0.12, x1: 0.62, Tx: 101, a: 0.15, p: 4.0, ar: 0.009, kr: 6, Tr: 19, ks: 4, Ts: 17, kh: 8, Th: 12 },
  ]

  // two real constellations, [RA hours, Dec degrees, magnitude, colour "r,g,b"]: Leo bright, Cancer faint
  const LEO = [
    [10.1395, 11.967, 1.35, '205,222,255'],  // Regulus
    [10.1222, 16.763, 3.49, '228,236,255'],  // eta Leo
    [10.3329, 19.842, 2.01, '255,224,182'],  // Algieba
    [10.2782, 23.417, 3.43, '255,245,224'],  // Adhafera
    [9.8794, 26.007, 3.88, '255,220,176'],   // Rasalas
    [9.7642, 23.774, 2.98, '255,238,204'],   // epsilon Leo
    [11.2351, 20.524, 2.56, '238,243,255'],  // Zosma
    [11.2373, 15.430, 3.33, '238,243,255'],  // Chertan
    [11.8177, 14.572, 2.14, '240,245,255'],  // Denebola
  ]
  const LEO_L = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 8], [8, 7], [7, 0], [6, 7]]   // sickle, then the hind triangle
  const CNC = [
    [8.2753, 9.186, 3.52, '255,228,196'],   // Tarf (beta)
    [8.7448, 18.154, 3.94, '255,230,196'],  // Asellus Australis (delta)
    [8.7212, 21.469, 4.66, '236,241,255'],  // Asellus Borealis (gamma)
    [8.9748, 11.858, 4.26, '236,241,255'],  // Acubens (alpha)
    [8.7779, 28.760, 4.02, '255,242,214'],  // iota Cancri
  ]
  const CNC_L = [[0, 1], [1, 2], [2, 4], [1, 3]]
  // sky coordinates to pixels: east to the left, north up; x0/y0 is the pattern's top-left corner, s pixels per degree
  const place = (list, x0, y0, s) => {
    const ra = Math.max(...list.map(q => q[0])), de = Math.max(...list.map(q => q[1]))
    return list.map(([h, d, m, c]) => ({ x: x0 + (ra - h) * 15 * 0.946 * s, y: y0 + (de - d) * s, m, c }))
  }
  const HALO = {}
  const halo = c => HALO[c] || (HALO[c] = (() => {
    const [cv, x] = layer(64, 64), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(0.12, `rgba(${c},.55)`); gr.addColorStop(0.4, `rgba(${c},.13)`); gr.addColorStop(1, `rgba(${c},0)`)
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return cv
  })())

  let S = null
  /** The still parts for one window size: sky with stars and horizon glow, the mountains, per-ray jitter. */
  function build(W, H, dpr) {
    const r = rng(6022), [sky, x] = layer(W * dpr, H * dpr)
    x.setTransform(dpr, 0, 0, dpr, 0, 0)
    const gr = x.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, '#030713'); gr.addColorStop(0.55, '#071026'); gr.addColorStop(1, '#0a1631')
    x.fillStyle = gr; x.fillRect(0, 0, W, H)
    const hz = x.createLinearGradient(0, H * 0.62, 0, H * 0.9)
    hz.addColorStop(0, 'rgba(90,130,190,0)'); hz.addColorStop(1, 'rgba(90,130,190,.10)')
    x.fillStyle = hz; x.fillRect(0, H * 0.62, W, H * 0.38)
    const n = Math.round(W * H / 4200)
    for (let i = 0; i < n; i++) {
      const px = r() * W, py = Math.pow(r(), 1.3) * H * 0.85, rr = 0.35 + r() * r() * 1.1
      x.fillStyle = `rgba(220,230,255,${(0.12 + r() * 0.4).toFixed(2)})`; x.beginPath(); x.arc(px, py, rr, 0, TAU); x.fill()
    }
    const tw = []
    for (let i = 0; i < 70; i++) tw.push({ x: r() * W, y: Math.pow(r(), 1.4) * H * 0.75, r: 0.7 + r() * 0.9, T: 3 + r() * 5, p: r() * TAU, a: 0.3 + r() * 0.3 })
    // Leo in the gap left of the core, below the goal text; Cancer in the column right of the goal text, left of the side panel
    const sc = Math.min(W / 172, H / 108)
    const leo = place(LEO, W * 0.035, Math.max(236, H * 0.25), sc * 1.15), cnc = place(CNC, W - 420 - 9.93 * sc, Math.max(90, H * 0.1), sc)
    for (const [pts, ls, al, lw] of [[leo, LEO_L, 0.2, 0.9], [cnc, CNC_L, 0.13, 0.7]]) {
      x.strokeStyle = `rgba(200,215,255,${al})`; x.lineWidth = lw; x.beginPath()
      for (const [i, j] of ls) {   // stop each line a few pixels short of its stars
        const p = pts[i], q = pts[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), k = 5 / d
        x.moveTo(p.x + dx * k, p.y + dy * k); x.lineTo(q.x - dx * k, q.y - dy * k)
      }
      x.stroke()
    }
    const con = [
      ...leo.map(q => { const rr = 0.9 + (4.2 - q.m) * 0.72; return { ...q, r: rr, hr: rr * (q.m < 1.5 ? 9.5 : 6.5), ha: 0.34 + (4 - q.m) * 0.14, a: 1, tw: 0.1 + r() * 0.08, T: 5 + r() * 6, p: r() * TAU, glint: q.m < 2.2, h: halo(q.c) } }),
      ...cnc.map(q => { const rr = 0.6 + (5 - q.m) * 0.35; return { ...q, r: rr, hr: rr * 4, ha: 0.12, a: 0.42 + (5 - q.m) * 0.12, tw: 0.08, T: 6 + r() * 6, p: r() * TAU, glint: false, h: halo(q.c) } }),
    ]

    // mountains: two ranges of ridged peaks with a snow-lit crest
    const [front, m] = layer(W * dpr, H * dpr)
    m.setTransform(dpr, 0, 0, dpr, 0, 0)
    // a ridge line by midpoint displacement: broad slopes, uneven peaks
    const ridge = (base, amp, rough, seed) => {
      const q = rng(seed), n = 257, v = new Float32Array(n)
      v[0] = q(); v[n - 1] = q()
      for (let s = n - 1, a = 0.7; s > 1; s >>= 1, a *= rough) for (let i = s >> 1; i < n; i += s) v[i] = (v[i - (s >> 1)] + v[i + (s >> 1)]) / 2 + (q() - 0.5) * a
      let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x) }
      const pk = Array.from({ length: 4 }, () => [q(), 0.08 + q() * 0.12, 0.5 + q() * 0.5])   // a few distinct peaks: centre, half-width, height
      return Array.from(v, (x, i) => {
        const u = i / (n - 1), m = Math.max(0, ...pk.map(([c, w, h]) => h * Math.max(0, 1 - Math.abs(u - c) / w) ** 1.25))
        return [-8 + u * (W + 16), H - H * base - amp * H * (0.4 * (x - lo) / (hi - lo) + 0.6 * m)]
      })
    }
    const range = (pts, fill, crest) => {
      const p = new Path2D(); p.moveTo(-8, H + 8); for (const [px, py] of pts) p.lineTo(px, py); p.lineTo(W + 8, H + 8); p.closePath(); pts.path = p
      const top = Math.min(...pts.map(q => q[1])), f = m.createLinearGradient(0, top, 0, H)
      f.addColorStop(0, fill[0]); f.addColorStop(1, fill[1]); m.fillStyle = f; m.fill(p)
      m.save(); m.clip(p); m.lineJoin = 'round'
      for (const [lw, a] of [[14, crest * 0.35], [5, crest * 0.6], [1.4, crest]]) {
        m.strokeStyle = `rgba(200,220,250,${a})`; m.lineWidth = lw; m.beginPath(); pts.forEach(([px, py], i) => m[i ? 'lineTo' : 'moveTo'](px, py)); m.stroke()
      }
      m.restore()
    }
    const far = ridge(0.085, 0.14, 0.58, 41), near = ridge(0.02, 0.085, 0.55, 97)
    range(far, ['#15213d', '#0a1126'], 0.10)
    range(near, ['#0b1226', '#04070f'], 0.06)
    const snowTop = Math.min(...far.map(q => q[1]))
    // a still strip of fjord water along the bottom, with a few faint streaks of aurora light lying on it
    const wy = H - Math.max(14, H * 0.022), wg = m.createLinearGradient(0, wy, 0, H)
    wg.addColorStop(0, '#060b1b'); wg.addColorStop(1, '#03060e'); m.fillStyle = wg; m.fillRect(0, wy, W, H - wy)
    m.fillStyle = 'rgba(200,220,250,.07)'; m.fillRect(0, wy, W, 1)
    for (let i = 0; i < 9; i++) { m.fillStyle = `rgba(${i % 3 ? '92,242,165' : '165,139,255'},${(0.03 + r() * 0.03).toFixed(3)})`; m.fillRect(r() * W, wy + 3 + r() * (H - wy - 5), 20 + r() * 70, 1) }
    S = { W, H, dpr, sky, front, tw, con, snowTop, snow: far.path, jit: Array.from({ length: 400 }, () => 0.55 + r() * 0.45),
      wy, bx: W * 0.53, bk: Math.min(1.25, Math.max(0.8, H / 1000)) }
  }

  function backdrop(g, b) {
    const dpr = g.getTransform().a || 1, { W, H, t } = b
    if (!S || S.W !== W || S.H !== H || S.dpr !== dpr) build(W, H, dpr)
    g.drawImage(S.sky, 0, 0, W, H)
    // the brighter stars twinkle softly, each on its own 3–8 s cycle
    g.fillStyle = '#e8efff'
    for (const s of S.tw) { g.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t * TAU / s.T + s.p)); g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill() }
    g.globalAlpha = 1
    constellations(g, t, b.low)
    curtains(g, b)
    g.drawImage(S.front, 0, 0, W, H)
    // the aurora's light on the snow: a pool under each of the two main curtains, following its drift and fold,
    // its colour shifting slowly between green and violet
    g.globalCompositeOperation = 'lighter'
    for (let ci = 0; ci < (b.low ? 1 : 2); ci++) {
      const c = CURTAINS[ci], drift = 0.06 * Math.sin(t * TAU / c.Tx + c.p)
      const px = W * ((c.x0 + c.x1) / 2 + drift + 0.12 * Math.sin(t * TAU / 37 + c.p)), py = S.snowTop + H * 0.06
      const k = 0.5 + 0.5 * Math.sin(t * TAU / 29 + c.p), m = 0.5 + 0.5 * Math.sin(t * TAU / 53 + ci * 2)
      const col = `${Math.round(92 + 73 * m)},${Math.round(242 - 103 * m)},${Math.round(165 + 90 * m)}`
      const sg = g.createRadialGradient(px, py, 0, px, py, W * 0.38)
      sg.addColorStop(0, `rgba(${col},${0.08 + 0.06 * k})`); sg.addColorStop(1, `rgba(${col},0)`)
      g.fillStyle = sg; g.fill(S.snow)
    }
    g.globalCompositeOperation = 'source-over'
    boat(g, t, b.low)
  }

  // a small sailboat on the fjord, only its sail edges caught by the aurora; it rocks on a ~47 s swell, mirrored in the water
  const HULL = new Path2D('M-7.5 -2.4 L7.5 -2.4 L5 0 L-5 0 Z'), SAIL = new Path2D('M0.7 -17 L0.7 -3.3 L7 -3.3 Z M-0.7 -15 L-0.7 -3.3 L-5.8 -3.3 Z')
  function boat(g, t, low) {
    const rock = 0.035 * Math.sin(t * TAU / 47), bob = 0.5 * Math.sin(t * TAU / 31 + 1)
    for (const [fy, al] of low ? [[1, 1]] : [[1, 1], [-0.75, 0.35]]) {
      g.save(); g.translate(S.bx, S.wy + (fy > 0 ? bob : 0)); g.scale(1, fy > 0 ? 1 : fy); g.rotate(rock); g.scale(S.bk, S.bk)
      g.globalAlpha = al; g.fillStyle = 'rgba(2,4,10,.9)'; g.fill(HULL)
      g.fillStyle = 'rgba(190,215,245,.07)'; g.fill(SAIL)
      g.strokeStyle = 'rgba(200,220,250,.16)'; g.lineWidth = 0.7; g.stroke(SAIL); g.stroke(HULL)
      g.restore()
    }
    g.globalAlpha = 1
  }

  // Leo's stars glow with soft halos and twinkle slowly, Regulus brightest; Cancer's stay small and dim
  function constellations(g, t, low) {
    g.globalCompositeOperation = 'lighter'; g.lineWidth = 0.7
    for (const s of S.con) {
      const k = 1 + s.tw * Math.sin(t * TAU / s.T + s.p)
      if (!low || s.glint) { const hr = s.hr * k; g.globalAlpha = Math.min(1, s.ha * k); g.drawImage(s.h, s.x - hr, s.y - hr, hr * 2, hr * 2) }
      if (s.glint && !low) {
        const l = s.r * 6 * k; g.globalAlpha = 0.3 * k; g.strokeStyle = `rgb(${s.c})`
        g.beginPath(); g.moveTo(s.x - l, s.y); g.lineTo(s.x + l, s.y); g.moveTo(s.x, s.y - l); g.lineTo(s.x, s.y + l); g.stroke()
      }
      g.globalAlpha = Math.min(1, s.a * k); g.fillStyle = `rgb(${s.c})`; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill()
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
  }

  function curtains(g, b) {
    const { W, H, t, low, saver } = b, T = tex(), step = low ? 22 : 9, wd = step * 3.2, boost = saver ? 1.35 : 1
    g.globalCompositeOperation = 'lighter'
    for (const [ci, c] of CURTAINS.entries()) {
      if (low && ci === 2) break
      const drift = 0.06 * Math.sin(t * TAU / c.Tx + c.p), xa = (c.x0 + drift) * W, xb = (c.x1 + drift) * W
      const w1 = t * TAU / c.T1 + c.p, w2 = t * TAU / c.T2, wf = t * TAU / c.Tf, wr = t * TAU / c.Tr, ws = t * TAU / c.Ts, wh = t * TAU / c.Th
      for (let x = Math.max(0, xa), i = 0; x < Math.min(W, xb); x += step, i++) {
        const u = (x - xa) / (xb - xa), env = Math.sin(u * Math.PI) ** 1.5
        const fx = x / W * TAU
        const base = H * (c.y0 + c.a1 * Math.sin(fx * c.k1 + w1) + c.a2 * Math.sin(fx * c.k2 - w2) + c.ar * Math.sin(fx * c.kr - wr))
        const fold = 0.5 + 0.5 * Math.sin(fx * c.kf - wf + c.p)
        const h = H * c.h * (0.75 + 0.25 * Math.sin(fx * 1.7 - w2 + c.p)) * (1 + 0.1 * Math.sin(fx * c.kh + wh))
        const sx = x + step * 1.4 * Math.sin(fx * c.ks - ws + c.p)
        g.globalAlpha = c.a * boost * env * (0.3 + 0.7 * fold) * S.jit[(i + ci * 131) % S.jit.length]
        g.drawImage(T[c.tex], sx - wd / 2, base - h, wd, h * 1.04)
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
  }

  // ---- the core: a cold glass moon lit from above by the aurora ----
  let M = null
  function buildMoon(R, dpr) {
    const r = rng(1969), size = Math.ceil(R * 2), [c, x] = layer(size * dpr, size * dpr)
    x.setTransform(dpr, 0, 0, dpr, dpr * size / 2, dpr * size / 2)
    x.beginPath(); x.arc(0, 0, R, 0, TAU); x.clip()
    for (let i = 0; i < 14; i++) {   // soft maria, very faint
      const d = R * Math.sqrt(r()) * 0.85, a = r() * TAU, rr = R * (0.12 + r() * 0.22), px = Math.cos(a) * d, py = Math.sin(a) * d
      const m = x.createRadialGradient(px, py, 0, px, py, rr)
      m.addColorStop(0, `rgba(150,175,215,${(0.04 + r() * 0.04).toFixed(3)})`); m.addColorStop(1, 'rgba(150,175,215,0)')
      x.fillStyle = m; x.fillRect(px - rr, py - rr, rr * 2, rr * 2)
    }
    M = { R, dpr, c, size }
  }

  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter, recent, low } = cc
    const dpr = g.getTransform().a || 1
    if (!M || M.R !== R || M.dpr !== dpr) buildMoon(R, dpr)
    const br = 1 + 0.08 * Math.sin(t * TAU / 48) + flare * 0.6
    // a halo of aurora light around the orb
    const halo = g.createRadialGradient(cx, cy - R * 0.2, R * 0.8, cx, cy, R * 1.45)
    halo.addColorStop(0, `rgba(92,242,165,${0.07 * br})`); halo.addColorStop(0.5, `rgba(120,140,255,${0.035 * br})`); halo.addColorStop(1, 'rgba(120,140,255,0)')
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R * 1.45, 0, TAU); g.fill()
    // the glass body: lit from the top, dark at the bottom
    const body = g.createRadialGradient(cx, cy - R * 0.55, R * 0.05, cx, cy, R * 1.05)
    body.addColorStop(0, `rgba(170,240,220,${0.16 * br})`); body.addColorStop(0.45, 'rgba(70,110,170,.12)'); body.addColorStop(0.85, 'rgba(12,22,50,.55)'); body.addColorStop(1, 'rgba(6,12,30,.7)')
    g.fillStyle = body; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill()
    if (!low) { g.save(); g.translate(cx, cy); g.rotate(t * TAU / 240); g.drawImage(M.c, -M.size / 2, -M.size / 2, M.size, M.size); g.restore() }
    // reflections of the curtains on the upper rim, sliding slowly
    const sh = 0.25 * Math.sin(t * TAU / 90)
    g.lineCap = 'round'
    for (const [a0, a1, col, lw, al] of [[-2.6, -1.3, '92,242,165', 0.05, 0.22], [-1.6, -0.5, '165,139,255', 0.035, 0.16], [-2.3, -0.9, '220,255,240', 0.012, 0.35]]) {
      g.strokeStyle = `rgba(${col},${al * br})`; g.lineWidth = R * lw
      g.beginPath(); g.arc(cx, cy, R * (1 - lw / 2), a0 + sh, a1 + sh); g.stroke()
    }
    g.strokeStyle = jitter ? C.red : C.shell; g.lineWidth = 1.3; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke()
    // a fine dotted ring that turns faster while the agent is busy
    g.strokeStyle = `rgba(${C.tickRGB},${0.28 + flare * 0.4})`; g.lineWidth = 1.6; g.setLineDash([1.5, 11])
    g.lineDashOffset = -t * (4 + Math.min(30, recent * 3)); g.beginPath(); g.arc(cx, cy, R * 1.18, 0, TAU); g.stroke()
    g.setLineDash([]); g.strokeStyle = `rgba(${C.tickRGB},.08)`; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R * 1.32, 0, TAU); g.stroke()
  }

  function link(g, x1, y1, x2, y2, color, b, i, cc) {
    if (!color) { g.strokeStyle = C.link; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); return }
    const dx = x2 - x1, dy = y2 - y1, k = ((i * 7919) % 11 - 5) / 5 * 0.12
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2 - dy * k, (y1 + y2) / 2 + dx * k, x2, y2)
    const sh = 0.8 + 0.2 * Math.sin(cc.t * 3 + i)   // a thread's shimmer
    g.strokeStyle = color; g.lineCap = 'round'
    if (b > 0.3) { g.globalAlpha = 0.16 * b * sh; g.lineWidth = 7 * b; g.stroke() }
    g.globalAlpha = (0.35 + 0.65 * b) * sh; g.lineWidth = 1 + 1.6 * b; g.stroke()
  }

  function neuron(g, x, y, r, color, b, i, cc) {
    if (!color) {
      const tw = 0.6 + 0.4 * Math.sin(cc.t * 0.3 + i * 2.3)
      g.fillStyle = C.neuron; g.globalAlpha = tw; g.beginPath(); g.arc(x, y, r * 0.85, 0, TAU); g.fill()
      if (r > 2.2) { g.strokeStyle = C.neuron; g.globalAlpha = 0.3 * tw; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - r * 3, y); g.lineTo(x + r * 3, y); g.moveTo(x, y - r * 3); g.lineTo(x, y + r * 3); g.stroke() }
      return
    }
    g.fillStyle = color; g.globalAlpha = 0.22 * b; g.beginPath(); g.arc(x, y, r * 3.2, 0, TAU); g.fill()
    g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
    if (b > 0.5) { g.fillStyle = C.packet; g.beginPath(); g.arc(x, y, r * 0.45, 0, TAU); g.fill() }
  }

  function coreCenter(g, cc) {
    const { cx, cy, t } = cc, k = Math.sin(t * TAU / 40)
    const gr = g.createRadialGradient(cx, cy, 6, cx, cy, 44)
    gr.addColorStop(0, `rgba(${C.goalRGB},${0.24 + 0.04 * k})`); gr.addColorStop(1, `rgba(${C.goalRGB},0)`)
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 44, 0, TAU); g.fill()
    g.fillStyle = C.chip; g.beginPath(); g.arc(cx, cy, 20, 0, TAU); g.fill()
    g.strokeStyle = C.yellow; g.lineWidth = 1.6; g.stroke()
    // a four-point star
    g.fillStyle = C.ink2; g.beginPath()
    for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4 - Math.PI / 2, rr = j % 2 ? 2.2 : 8; g[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) }
    g.closePath(); g.fill()
  }

  registerTheme({
    id: 'aurora',
    name: 'Aurora',
    light: false,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    fonts: { mono: '"IBM Plex Mono", ui-monospace, monospace', head: 'Jost, system-ui, sans-serif' },
    css: {
      '--bg': '#060c1e', '--panel': 'rgba(7,13,32,.86)', '--panel2': '#0a1430', '--line': '#24355e',
      '--cyan': '#7fdcf0', '--yellow': '#f2d67a', '--red': '#ff5a5a', '--green': '#6ef0a8', '--purple': '#b79cff',
      '--amber': '#ff9f57', '--blue': '#86a4ff', '--dim': '#93a1c0', '--text': '#e8eef8', '--muted': '#aab8d2',
      '--mono': "'IBM Plex Mono', ui-monospace, Menlo, monospace", '--head': 'Jost, system-ui, sans-serif',
      '--radius': '12px', '--clip': 'none',
    },
    colors: {
      bg: '#060c1e', cyan: '#7fdcf0', yellow: '#f2d67a', red: '#ff5a5a', green: '#6ef0a8', purple: '#b79cff', amber: '#ff9f57', blue: '#86a4ff',
      dim: '#93a1c0', line: '#24355e', text: '#e8eef8',
      muted: '#aab8d2', todo: '#66759c', doneInk: '#c2f5d8', ink2: '#f4f8ff', nodeFill: '#0a1430', chip: 'rgba(6,12,30,.76)', labelBg: 'rgba(6,12,30,.92)',
      link: 'rgba(170,200,255,.16)', neuron: 'rgba(228,238,255,.82)', shell: 'rgba(160,235,215,.42)', wire: 'rgba(170,200,255,.1)', packet: '#f6fffb',
      accentRGB: '127,220,240', goalRGB: '242,214,122', tickRGB: '175,205,240', glow0: '150,240,210', glow1: '80,150,200', glow2: '20,40,90',
    },
    backdrop, sphere, link, neuron, coreCenter,
  })
})()
