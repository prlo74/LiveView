// Iridescent: a light style. Frosted pearl with clusters of faceted ice crystals growing in from the edges.
// Two lights move over them: one slowly turns, and a broad band sweeps across the window once a minute; the
// facets they reach shine white into a thin-film rainbow, their edges split into prismatic fringes, and starburst
// glints swell at the crystal tips. The crystals drift on slow loops and frost dust sparkles now and then.
// The core is a cut-crystal orb. All crystal geometry is built once per window size into two offscreen layers;
// a frame draws those images, refills the facets that shine, and stamps a few glint sprites.
;(() => {
  const TAU = Math.PI * 2
  const FILM = ['#ff9fd6', '#6fe2ff', '#ffd968', '#b796ff', '#5cbcff']   // thin-film fringe: pink, cyan, butter, lavender, sky
  const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const layer = (w, h) => { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')] }
  // the light's direction: one slow turn every ~110 s, with a gentle sway
  const lightAt = t => t * TAU / 110 + 0.6 * Math.sin(t * TAU / 53)
  const KEY = -2.3                                                    // fixed key light (upper left) for the static shading
  const facing = (n, L, p) => { const c = Math.cos(n - L); return c > 0 ? c ** p : 0 }
  const film = (x, x0, y0, x1, y1, o) => {
    const gr = x.createLinearGradient(x0, y0, x1, y1)
    for (let k = 0; k < FILM.length; k++) gr.addColorStop(k / (FILM.length - 1), FILM[(k + o) % FILM.length])
    return gr
  }

  // one starburst sprite, made once: a soft core, long thin cross rays, short diagonals, a faint rainbow halo
  let STAR = null
  function starSprite() {
    const n = 128, h = n / 2, [c, x] = layer(n, n)
    const halo = x.createRadialGradient(h, h, n * 0.1, h, h, n * 0.2)
    halo.addColorStop(0, 'rgba(255,160,220,0)'); halo.addColorStop(0.45, 'rgba(255,170,225,.22)'); halo.addColorStop(0.7, 'rgba(120,225,255,.22)'); halo.addColorStop(1, 'rgba(120,225,255,0)')
    x.fillStyle = halo; x.fillRect(0, 0, n, n)
    const core = x.createRadialGradient(h, h, 0, h, h, n * 0.12)
    core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.35, 'rgba(255,255,255,.85)'); core.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = core; x.fillRect(0, 0, n, n)
    const ray = (a, len, wd) => {
      x.save(); x.translate(h, h); x.rotate(a)
      const gr = x.createLinearGradient(-len, 0, len, 0)
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = gr; x.beginPath(); x.moveTo(-len, 0); x.lineTo(0, -wd); x.lineTo(len, 0); x.lineTo(0, wd); x.closePath(); x.fill(); x.restore()
    }
    ray(0, h, 2.2); ray(Math.PI / 2, h, 2.2); ray(Math.PI / 4, h * 0.42, 1.4); ray(-Math.PI / 4, h * 0.42, 1.4)
    return c
  }
  const glint = (g, x, y, s, a) => { if (a < 0.02) return; g.globalAlpha = Math.min(1, a); g.drawImage(STAR, x - s / 2, y - s / 2, s, s) }

  // ---------- the backdrop: ice crystals ----------
  // two layers, each painted once: the clusters, and loose flecks that drift a little further (slow parallax)
  const SWEEP = 0.5, SWEEP_P = 60                                     // the light band's direction (rad) and seconds per pass
  let S = null
  function build(W, H, dpr, g) {
    const r = rng(4417), m = Math.min(W, H)
    const facets = [], glints = [], dust = []
    let x, ridge, hair
    const begin = () => { const [c, ctx] = layer(W * dpr, H * dpr); x = ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineJoin = 'round'; ridge = new Path2D(); hair = new Path2D(); return c }
    const finish = () => { x.strokeStyle = 'rgba(88,108,165,.46)'; x.lineWidth = 0.8; x.stroke(hair); x.strokeStyle = 'rgba(255,255,255,.98)'; x.lineWidth = 1.2; x.stroke(ridge) }

    /** One hexagonal prism lying in the picture: three long faces and a three-faced point. */
    function prism(ox, oy, th, L, w, alpha, lay) {
      const co = Math.cos(th), si = Math.sin(th), P = (u, v) => [ox + co * u - si * v, oy + si * u + co * v]
      const d = (r() - 0.5) * w * 0.35, vs = [-w / 2, -w / 6 + d, w / 6 + d, w / 2]
      const k0 = 0.7 + r() * 0.12, ks = [k0, k0 + 0.06, k0 + 0.06, k0].map(k => k * L), tip = P(L, d * 0.6)
      const faces = []
      for (let j = 0; j < 3; j++) {
        const a = P(0, vs[j]), b = P(ks[j], vs[j]), cc = P(ks[j + 1], vs[j + 1]), e = P(0, vs[j + 1])
        faces.push({ pts: [a, b, cc, e], n: th + (j - 1) * 1.25 + (r() - 0.5) * 0.4, tip: false, edge: [a, b] })
        faces.push({ pts: [b, tip, cc], n: th + (j - 1) * 1.25 + 0.8 + (r() - 0.5) * 0.4, tip: true, edge: [b, tip] })
      }
      const base = P(0, 0)
      for (const f of faces) {
        const p = new Path2D(); f.pts.forEach((q, i) => p[i ? 'lineTo' : 'moveTo'](q[0], q[1])); p.closePath()
        // static shading: the side facing the key light is white, the other a cold blue-grey; fading into frost at the base
        const lb = 0.5 + 0.5 * Math.cos(f.n - KEY), col = [166 + 89 * lb, 182 + 73 * lb, 222 + 33 * lb].map(Math.round).join(',')
        const gr = x.createLinearGradient(base[0], base[1], tip[0], tip[1])
        gr.addColorStop(0, `rgba(${col},${(0.1 * alpha).toFixed(3)})`); gr.addColorStop(0.6, `rgba(${col},${((0.34 + 0.26 * lb) * alpha).toFixed(3)})`)
        gr.addColorStop(1, `rgba(${col},${((f.tip ? 0.8 : 0.6) * alpha).toFixed(3)})`)
        x.fillStyle = gr; x.fill(p)
        // the reflection: white into one thin-film colour, laid across the face
        const q0 = f.pts[0], q1 = f.pts[2], tint = FILM[Math.floor(r() * FILM.length)]
        const lg = g.createLinearGradient(q0[0], q0[1], q1[0], q1[1])
        lg.addColorStop(0, 'rgba(255,255,255,.97)'); lg.addColorStop(0.5, tint); lg.addColorStop(1, 'rgba(255,255,255,.7)')
        // and a prismatic fringe along the face's outer edge, shown only while the face shines
        const [e0, e1] = f.edge, ep = new Path2D(); ep.moveTo(e0[0], e0[1]); ep.lineTo(e1[0], e1[1])
        const fx = (f.pts.reduce((s, q) => s + q[0], 0)) / f.pts.length, fy = (f.pts.reduce((s, q) => s + q[1], 0)) / f.pts.length
        facets.push({ p, n: f.n, lg, a: alpha, ep, eg: film(g, e0[0], e0[1], e1[0], e1[1], Math.floor(r() * 5)), ew: Math.max(1, Math.min(2.2, w * 0.06)), pr: fx * Math.cos(SWEEP) + fy * Math.sin(SWEEP), lay })
      }
      // bright thin ridges between the faces and around the point; a fine cool hairline around the outline
      for (let j = 1; j < 3; j++) { const a = P(0, vs[j]), b = P(ks[j], vs[j]); ridge.moveTo(a[0], a[1]); ridge.lineTo(b[0], b[1]); ridge.lineTo(tip[0], tip[1]) }
      const o = [P(0, vs[0]), P(ks[0], vs[0]), tip, P(ks[3], vs[3]), P(0, vs[3])], s1 = P(ks[1], vs[1]), s2 = P(ks[2], vs[2])
      hair.moveTo(o[0][0], o[0][1]); for (let i = 1; i < 5; i++) hair.lineTo(o[i][0], o[i][1])
      ridge.moveTo(o[1][0], o[1][1]); ridge.lineTo(s1[0], s1[1]); ridge.lineTo(s2[0], s2[1]); ridge.lineTo(o[3][0], o[3][1])
      // a prismatic fringe just outside one long edge, as light splitting at the ice's rim
      const sd = r() < 0.5 ? -1 : 1, e0 = P(L * 0.08, sd * (w / 2 + 1.4)), e1 = P(ks[0] * 0.98, sd * (w / 2 + 1.4))
      x.strokeStyle = film(x, e0[0], e0[1], tip[0], tip[1], Math.floor(r() * 5)); x.globalAlpha = 0.75 * alpha; x.lineWidth = 1.4
      x.beginPath(); x.moveTo(e0[0], e0[1]); x.lineTo(e1[0], e1[1]); x.lineTo(tip[0], tip[1]); x.stroke(); x.globalAlpha = 1
      // glints live at the points (and sometimes a shoulder), shining when the face beside them meets the light
      const fi = facets.length - 3   // the middle tip face
      if (r() < 0.75) glints.push({ x: tip[0], y: tip[1], f: fi, s: m * (0.032 + r() * 0.035) * Math.min(1.4, 0.6 + alpha), P: 13 + r() * 17, ph: r() * TAU, lay })
      if (r() < 0.3) glints.push({ x: s1[0], y: s1[1], f: fi - 2, s: m * (0.02 + r() * 0.02), P: 17 + r() * 19, ph: r() * TAU, lay })
    }

    // clusters grow in from the corners and edges, leaving the middle (where the agents are) clear
    const c0 = begin()
    // a faint compass rose etched into the frost under the ice, its north point a touch brighter
    {
      const rx = W * 0.065, ry = H * 0.38, rr = m * 0.045   // open frost at the left, clear of the core and the side panel
      x.lineWidth = 0.7; x.strokeStyle = 'rgba(88,108,165,.16)'
      x.beginPath(); x.arc(rx, ry, rr * 0.62, 0, TAU); x.stroke()
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + i * TAU / 8, l = rr * (i % 2 ? 0.55 : 1), wd = rr * 0.11
        const tp = [rx + Math.cos(a) * l, ry + Math.sin(a) * l]
        for (const sd of [-1, 1]) {   // two halves per point: one catches the key light, one stays cool
          const sx = rx + Math.cos(a + sd * Math.PI / 2) * wd, sy = ry + Math.sin(a + sd * Math.PI / 2) * wd
          x.fillStyle = sd > 0 ? 'rgba(255,255,255,.34)' : 'rgba(120,138,190,.09)'
          x.beginPath(); x.moveTo(rx, ry); x.lineTo(sx, sy); x.lineTo(tp[0], tp[1]); x.closePath(); x.fill(); x.stroke()
        }
        if (!i) { x.strokeStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.moveTo(rx, ry); x.lineTo(tp[0], tp[1]); x.stroke(); x.strokeStyle = 'rgba(88,108,165,.16)' }
      }
    }
    const CL = [
      [-0.02, 1.03, -0.85, 9, 0.38, 1], [1.02, -0.03, 2.3, 8, 0.34, 1], [1.03, 0.97, -2.45, 7, 0.27, 0.95],
      [0.0, 0.03, 0.62, 5, 0.2, 0.85], [0.64, 1.04, -1.75, 6, 0.18, 0.85], [-0.03, 0.5, 0.1, 4, 0.15, 0.8], [0.36, -0.04, 1.5, 4, 0.14, 0.8],
      [1.03, 0.55, 3.05, 4, 0.14, 0.8],
    ]
    for (const [ux, uy, th0, n, len, al] of CL) {
      const list = []
      for (let i = 0; i < n; i++) list.push({ th: th0 + (r() - 0.5) * 1.5, L: m * len * (0.35 + 0.65 * r()), ox: ux * W + (r() - 0.5) * m * 0.05, oy: uy * H + (r() - 0.5) * m * 0.05 })
      list.sort((a, b) => b.L - a.L)   // long ones behind
      for (const s of list) prism(s.ox, s.oy, s.th, s.L, s.L * (0.11 + r() * 0.08), al * (0.75 + 0.25 * r()), 0)
    }
    finish()
    // frost dust: tiny bright specks near the crystals; some of them become slow sparkles
    x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath()
    for (const [ux, uy] of CL) for (let i = 0; i < 26; i++) {
      const a = r() * TAU, dd = m * 0.36 * Math.sqrt(r()), px = ux * W + Math.cos(a) * dd, py = uy * H + Math.sin(a) * dd, s = 0.5 + r() * 1.2
      x.moveTo(px + s, py); x.arc(px, py, s, 0, TAU)
      if (i % 3 === 0) dust.push({ x: px, y: py, s: 7 + r() * 9, P: 9 + r() * 14, ph: r() * TAU, pr: px * Math.cos(SWEEP) + py * Math.sin(SWEEP) })
    }
    x.fill()
    const nC = facets.length
    // loose double-pointed flecks in the frost, away from the centre, on their own drifting layer
    const c1 = begin()
    for (let i = 0, tries = 0; i < 20 && tries < 300; tries++) {
      const px = r() * W, py = r() * H, dx = (px - W / 2) / W, dy = (py - H / 2) / H
      if (dx * dx + dy * dy < 0.09) continue
      const th = r() * TAU, L = m * (0.014 + r() * 0.028), w = L * (0.35 + r() * 0.2), al = 0.6 + r() * 0.3
      prism(px, py, th, L, w, al, 1); prism(px, py, th + Math.PI, L * (0.7 + r() * 0.3), w, al, 1); i++
    }
    finish()
    let p0 = Infinity, p1 = -Infinity
    for (const f of facets) { p0 = Math.min(p0, f.pr); p1 = Math.max(p1, f.pr) }
    S = { W, H, dpr, c0, c1, nC, facets, glints, dust, p0, p1, bw: m * 0.16, lit: new Float32Array(facets.length) }
  }

  function backdrop(g, b) {
    const { W, H, t, low } = b, dpr = g.getTransform().a || 1
    if (!STAR) STAR = starSprite()
    if (!S || S.W !== W || S.H !== H || S.dpr !== dpr) build(W, H, dpr, g)
    // frosted pearl: a cool white wash, a soft light drifting over ~100 s, and faint thin-film haze in two corners
    const base = g.createLinearGradient(0, 0, W * 0.55, H)
    base.addColorStop(0, '#f5f8fc'); base.addColorStop(1, '#e2e7f1')
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    const lx = W * (0.35 + 0.15 * Math.sin(t / 16)), ly = H * (0.3 + 0.12 * Math.cos(t / 19)), lr = Math.max(W, H) * 0.65
    const glow = g.createRadialGradient(lx, ly, 0, lx, ly, lr)
    glow.addColorStop(0, 'rgba(255,255,255,.8)'); glow.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = glow; g.fillRect(0, 0, W, H)
    if (!low) {
      const hz = (px, py, rgb, a) => { const rr = Math.max(W, H) * 0.5, gr = g.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
      hz(W * (0.05 + 0.04 * Math.sin(t / 23)), H * (0.95 + 0.04 * Math.cos(t / 29)), '255,182,228', 0.16 + 0.05 * Math.sin(t / 37))
      hz(W * (0.96 + 0.03 * Math.cos(t / 27)), H * (0.06 + 0.04 * Math.sin(t / 31)), '150,228,255', 0.18 + 0.05 * Math.cos(t / 41))
    }
    // a broad band of light sweeps diagonally across the window, one pass a minute
    const span = S.p1 - S.p0 + 4 * S.bw, sw = S.p0 - 2 * S.bw + span * ((t / SWEEP_P) % 1), bw = S.bw
    const cs = Math.cos(SWEEP), sn = Math.sin(SWEEP)
    if (!low) {
      const sh = g.createLinearGradient(cs * (sw - bw * 2.5), sn * (sw - bw * 2.5), cs * (sw + bw * 2.5), sn * (sw + bw * 2.5))
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.42, 'rgba(236,246,255,.2)'); sh.addColorStop(0.5, 'rgba(255,255,255,.32)'); sh.addColorStop(0.58, 'rgba(255,240,250,.2)'); sh.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = sh; g.fillRect(0, 0, W, H)
    }
    // both crystal layers drift on slow loops: the clusters a few pixels, the loose flecks a little more
    const off = [[5 * Math.sin(t * TAU / 71), 4 * Math.cos(t * TAU / 89)], [14 * Math.sin(t * TAU / 97 + 1), 10 * Math.sin(t * TAU / 61)]]
    g.drawImage(S.c0, off[0][0], off[0][1], W, H)
    g.drawImage(S.c1, off[1][0], off[1][1], W, H)
    // the faces turned to the turning light, or crossed by the band, shine white into a thin-film colour,
    // and their outer edge splits the light into a rainbow fringe
    const L = lightAt(t), sat = b.saver ? 0.9 : 0.75, lit = S.lit
    for (let lay = 0; lay < 2; lay++) {
      g.save(); g.translate(off[lay][0], off[lay][1])
      for (let i = lay ? S.nC : 0, n = lay ? S.facets.length : S.nC; i < n; i++) {
        const f = S.facets[i], q = (f.pr - sw) / bw, band = q * q < 9 ? Math.exp(-q * q) : 0
        const k = Math.min(1, facing(f.n, L, 10) + band * (0.25 + 0.75 * facing(f.n, SWEEP + Math.PI, 2))); lit[i] = k
        if (k < (low ? 0.3 : 0.04)) continue
        g.globalAlpha = k * sat * f.a; g.fillStyle = f.lg; g.fill(f.p)
        if (!low && k > 0.3) { g.globalAlpha = (k - 0.3) * 1.3 * f.a; g.strokeStyle = f.eg; g.lineWidth = f.ew; g.stroke(f.ep) }
      }
      g.restore()
    }
    // starburst glints at the points: brightest when their face shines, each breathing on its own slow cycle
    for (let i = 0; i < S.glints.length; i++) {
      if (low && i % 3) continue
      const q = S.glints[i], o = off[q.lay], tw = 0.5 + 0.5 * Math.sin(t * TAU / q.P + q.ph)
      glint(g, q.x + o[0], q.y + o[1], q.s * (0.75 + 0.35 * tw), (0.15 + 0.85 * Math.sqrt(lit[q.f])) * tw * tw * (b.saver ? 1 : 0.85))
    }
    // slow sparkles in the frost dust: each swells and fades over ~10-20 s, a little brighter as the band passes
    if (!low) for (const d of S.dust) {
      const s = Math.sin(t * TAU / d.P + d.ph); if (s < 0.6) continue
      const q = (d.pr - sw) / bw, a = ((s - 0.6) / 0.4) ** 2 * (0.45 + 0.55 * Math.exp(-q * q))
      glint(g, d.x + off[0][0], d.y + off[0][1], d.s, a)
    }
    g.globalAlpha = 1
  }
  // ---------- the core: a cut-crystal orb ----------
  // a brilliant cut seen from above, in unit radius: a table, eight star facets, eight kites, sixteen girdle facets
  const CUT = (() => {
    const fs = [], P = (rr, a) => [Math.cos(a) * rr, Math.sin(a) * rr], T = 0.44, ST = 0.7, G = 0.985
    const v = i => i * TAU / 8, mid = i => (i + 0.5) * TAU / 8
    fs.push({ pts: Array.from({ length: 8 }, (_, i) => P(T, v(i))), n: 0, ring: 0 })
    for (let i = 0; i < 8; i++) {
      fs.push({ pts: [P(T, v(i)), P(ST, mid(i)), P(T, v(i + 1))], n: mid(i), ring: 1 })
      fs.push({ pts: [P(T, v(i)), P(ST, mid(i - 1)), P(G, v(i)), P(ST, mid(i))], n: v(i), ring: 2 })
      fs.push({ pts: [P(ST, mid(i)), P(G, v(i)), P(G, mid(i))], n: mid(i) - 0.2, ring: 3 })
      fs.push({ pts: [P(ST, mid(i)), P(G, mid(i)), P(G, v(i + 1))], n: mid(i) + 0.2, ring: 3 })
    }
    const edges = new Path2D()
    fs.forEach((f, j) => {
      f.p = new Path2D(); f.pts.forEach((q, i) => { f.p[i ? 'lineTo' : 'moveTo'](q[0], q[1]); edges[i ? 'lineTo' : 'moveTo'](q[0], q[1]) }); f.p.closePath(); edges.closePath()
      f.tint = FILM[j % FILM.length]
    })
    return { fs, edges }
  })()
  let GEM = null
  /** The orb's body and facet pattern for one radius, painted once. */
  function buildGem(R, dpr, g) {
    const size = Math.ceil(R * 2 + 8), [c, x] = layer(size * dpr, size * dpr), h = size / 2
    x.setTransform(dpr, 0, 0, dpr, dpr * h, dpr * h)
    const body = x.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R)
    body.addColorStop(0, 'rgba(255,255,255,.97)'); body.addColorStop(0.5, 'rgba(226,244,255,.86)'); body.addColorStop(0.86, 'rgba(222,216,255,.82)'); body.addColorStop(1, 'rgba(200,196,248,.78)')
    x.fillStyle = body; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill()
    x.save(); x.scale(R, R)
    for (const f of CUT.fs) {   // facets: lighter toward the key light, cooler away from it, faint so the network reads on top
      const lb = f.ring ? 0.5 + 0.5 * Math.cos(f.n - KEY) : 0.8
      x.fillStyle = lb > 0.5 ? `rgba(255,255,255,${(0.1 + 0.25 * (lb - 0.5)).toFixed(3)})` : `rgba(150,170,215,${(0.08 + 0.12 * (0.5 - lb)).toFixed(3)})`
      x.fill(f.p)
    }
    x.lineWidth = 1.2 / R; x.strokeStyle = 'rgba(255,255,255,.85)'; x.stroke(CUT.edges)
    x.lineWidth = 0.6 / R; x.strokeStyle = 'rgba(110,128,180,.2)'; x.stroke(CUT.edges)
    x.restore()
    // the reflection gradients for the lit facets, in unit space
    for (const f of CUT.fs) {
      const a = f.pts[0], b = f.pts[Math.floor(f.pts.length / 2)], lg = g.createLinearGradient(a[0], a[1], b[0], b[1])
      lg.addColorStop(0, 'rgba(255,255,255,.95)'); lg.addColorStop(0.6, f.tint); lg.addColorStop(1, 'rgba(255,255,255,.7)')
      f.lg = lg
    }
    GEM = { R, dpr, c, size }
  }
  function sphere(g, cc) {
    const { cx, cy, R, t } = cc, dpr = g.getTransform().a || 1
    if (!STAR) STAR = starSprite()
    if (!GEM || Math.abs(GEM.R - R) > 0.5 || GEM.dpr !== dpr) buildGem(R, dpr, g)
    // its soft cool shadow on the frost
    const sd = g.createRadialGradient(cx + R * 0.1, cy + R * 0.16, R * 0.7, cx + R * 0.1, cy + R * 0.16, R * 1.3)
    sd.addColorStop(0, 'rgba(29,42,107,.10)'); sd.addColorStop(1, 'rgba(29,42,107,0)')
    g.fillStyle = sd; g.beginPath(); g.arc(cx + R * 0.1, cy + R * 0.16, R * 1.3, 0, TAU); g.fill()
    // the cut turns once every four minutes; the facets that face the light shine
    const rot = t * TAU / 240, L = lightAt(t) - rot
    g.save(); g.translate(cx, cy); g.rotate(rot)
    g.drawImage(GEM.c, -GEM.size / 2, -GEM.size / 2, GEM.size, GEM.size)
    g.scale(R, R)
    for (const f of CUT.fs) {
      const k = f.ring ? facing(f.n, L, 6) * (f.ring === 3 ? 0.8 : 1) : 0.12 + 0.1 * Math.sin(t / 17)
      if (k < (cc.low ? 0.3 : 0.05)) continue
      g.globalAlpha = Math.min(1, k * (0.45 + cc.flare * 0.4)); g.fillStyle = f.lg; g.fill(f.p)
    }
    g.restore(); g.globalAlpha = 1
    // sharp highlight streaks: a crisp window crescent at the upper left, two thin diagonal flashes
    g.save(); g.translate(cx, cy)
    g.fillStyle = 'rgba(255,255,255,.88)'; g.beginPath(); g.arc(0, 0, R * 0.93, 3.55, 4.55); g.arc(R * 0.04, R * 0.05, R * 0.86, 4.55, 3.55, true); g.closePath(); g.fill()
    g.rotate(-0.78); g.fillStyle = 'rgba(255,255,255,.62)'
    g.beginPath(); g.moveTo(-R * 0.35, -R * 0.62); g.lineTo(R * 0.12, -R * 0.66); g.lineTo(R * 0.1, -R * 0.62); g.lineTo(-R * 0.33, -R * 0.58); g.closePath(); g.fill()
    g.beginPath(); g.moveTo(-R * 0.22, -R * 0.53); g.lineTo(R * 0.02, -R * 0.555); g.lineTo(R * 0.01, -R * 0.54); g.lineTo(-R * 0.21, -R * 0.515); g.closePath(); g.fill()
    g.restore()
    // a thin prismatic rim, its colours turning once every ~2 minutes, and a refracted rainbow arc at the lower right
    if (g.createConicGradient) {
      const rim = g.createConicGradient(t / 19, cx, cy)
      FILM.forEach((c, k) => rim.addColorStop(k / FILM.length, c)); rim.addColorStop(1, FILM[0])
      g.strokeStyle = rim; g.globalAlpha = 0.85; g.lineWidth = 3.5; g.beginPath(); g.arc(cx, cy, R - 2, 0, TAU); g.stroke()
      g.globalAlpha = 0.5 + 0.15 * Math.sin(t / 13); g.lineWidth = 2.2; g.beginPath(); g.arc(cx, cy, R * 0.9, 0.15, 1.45); g.stroke(); g.globalAlpha = 1
    }
    g.strokeStyle = cc.jitter ? C.red : 'rgba(255,255,255,.95)'; g.lineWidth = cc.jitter ? 2 : 1.4; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke()
    g.strokeStyle = 'rgba(110,126,176,.38)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R + 1.5, 0, TAU); g.stroke()
    // one quiet outer ring of fine ticks, turning faster the busier the agent is
    g.save(); g.translate(cx, cy); g.rotate(t * (0.02 + Math.min(0.2, cc.recent * 0.015)))
    g.strokeStyle = 'rgba(120,132,170,.4)'; g.lineWidth = 1; g.beginPath()
    for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, r0 = R * 1.14, r1 = r0 + (i % 6 ? 4 : 9); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1) }
    g.stroke(); g.restore()
    // glints on the highlight and the rim, breathing slowly
    const tw = k => 0.5 + 0.5 * Math.sin(t * TAU / k)
    glint(g, cx - R * 0.6, cy - R * 0.62, R * 0.3 * (0.8 + 0.3 * tw(19)), 0.35 + 0.55 * tw(19) ** 2 + cc.flare * 0.5)
    if (!cc.low) glint(g, cx + R * 0.71, cy + R * 0.69, R * 0.17, 0.6 * tw(27) ** 3)
    g.globalAlpha = 1
  }

  function link(g, x1, y1, x2, y2, color, b) {
    g.strokeStyle = color || 'rgba(118,134,180,.36)'; g.globalAlpha = color ? 0.4 + 0.6 * b : 1; g.lineWidth = color ? 0.9 + b * 1.8 : 0.8
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
  }
  // neurons are tiny four-point glints
  function neuron(g, x, y, r, color, b, i, cc) {
    const s = (r + 1.8) * (color ? 1 + 0.25 * b : 0.92 + 0.08 * Math.sin(cc.t / 7 + i)), k = s * 0.3
    g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + k, y - k); g.lineTo(x + s, y); g.lineTo(x + k, y + k); g.lineTo(x, y + s); g.lineTo(x - k, y + k); g.lineTo(x - s, y); g.lineTo(x - k, y - k); g.closePath()
    if (color) { g.fillStyle = color; if (b > 0.5) { g.shadowColor = color; g.shadowBlur = 10 } g.fill(); g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 0.8; g.stroke() }
    else { g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = 'rgba(100,118,170,.8)'; g.lineWidth = 0.8; g.stroke() }
  }
  // the centre: a small hexagonal crystal seen end-on, six facets, ringed in the goal colour
  function coreCenter(g, cc) {
    const { cx, cy } = cc, rr = 20
    g.shadowColor = 'rgba(29,42,107,.25)'; g.shadowBlur = 10; g.fillStyle = '#f4f6fb'; hexPath(cx, cy, rr); g.fill(); g.shadowBlur = 0
    for (let i = 0; i < 6; i++) {
      const a0 = Math.PI / 6 + i * Math.PI / 3, a1 = a0 + Math.PI / 3, lb = 0.5 + 0.5 * Math.cos((a0 + a1) / 2 - KEY)
      g.fillStyle = `rgb(${[200 + 55 * lb, 210 + 45 * lb, 236 + 19 * lb].map(Math.round).join(',')})`
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr); g.lineTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr); g.closePath(); g.fill()
    }
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1; g.beginPath()
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) }
    g.stroke()
    g.strokeStyle = C.yellow; g.lineWidth = 1.6; hexPath(cx, cy, rr); g.stroke()
  }

  registerTheme({
    id: 'iridescent',
    name: 'Iridescent',
    light: true,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    fonts: { mono: '"JetBrains Mono", ui-monospace, monospace', head: 'Manrope, system-ui, sans-serif' },
    css: {
      '--bg': '#eceff6', '--panel': 'rgba(255,255,255,.66)', '--panel2': '#f8f9fc', '--line': 'rgba(186,196,222,.85)',
      '--cyan': '#07709b', '--yellow': '#8a6100', '--red': '#c4283e', '--green': '#1a7040', '--purple': '#6a3fd6', '--amber': '#a8480a', '--blue': '#3552cc',
      '--dim': '#555c70', '--text': '#1f2433', '--muted': '#4b5266',
      '--mono': '"JetBrains Mono", ui-monospace, Menlo, monospace', '--head': 'Manrope, system-ui, sans-serif',
      '--radius': '14px', '--clip': 'none',
    },
    colors: {
      bg: '#eef1f7', cyan: '#07709b', yellow: '#8a6100', red: '#c4283e', green: '#1a7040', purple: '#6a3fd6', amber: '#a8480a', blue: '#3552cc',
      dim: '#555c70', line: '#cdd3e2', text: '#1f2433',
      muted: '#4b5266', todo: '#5f677d', doneInk: '#17683b', ink2: '#1f2433', nodeFill: 'rgba(255,255,255,.88)', chip: 'rgba(255,255,255,.76)', labelBg: 'rgba(255,255,255,.94)',
      link: 'rgba(118,134,180,.36)', neuron: '#ffffff', shell: 'rgba(150,164,204,.7)', wire: 'rgba(125,139,181,.18)', packet: '#ffffff',
      accentRGB: '7,112,155', goalRGB: '138,97,0', tickRGB: '110,122,160', glow0: '255,255,255', glow1: '214,236,255', glow2: '217,200,255',
    },
    backdrop, sphere, link, neuron, coreCenter,
  })
})()
