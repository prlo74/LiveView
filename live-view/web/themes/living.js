/* Living core: a dark forest-teal room with slow topographic ridges, a river of light, moss and drifting leaves;
   the agent is an amber honeycomb whose roots grow out to each plan step, with a small swarm where the work is. */
;(() => {
  const TAU = Math.PI * 2
  // seeded random, so the scenery keeps its shape between reloads
  let seed = 917
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

  // ---- scenery, built once per window size ----
  let sceneKey = '', paw = null, hills = [], tufts = [], leaves = [], NPT = 72, SIN = [], COS = []
  function buildScene(W, H, low) {
    const key = W + 'x' + H + (low ? 'l' : '')
    if (key === sceneKey) return
    sceneKey = key; seed = 917
    NPT = low ? 40 : 72
    SIN = [1, 2, 3, 5].map(j => Float32Array.from({ length: NPT + 1 }, (_, p) => Math.sin(j * p / NPT * TAU)))
    COS = [1, 2, 3, 5].map(j => Float32Array.from({ length: NPT + 1 }, (_, p) => Math.cos(j * p / NPT * TAU)))
    const M = Math.max(W, H), gap = Math.max(34, M / 38)
    // two hills, off to the sides of the centre, whose contour rings cover the window
    hills = [[0.18, 0.78], [0.86, 0.2]].map(([fx, fy], h) => ({
      fx, fy, gap, rings: Math.ceil(M * 0.62 / gap),
      amp: [0.07, 0.05, 0.035, 0.015].map(a => a * (0.7 + rnd() * 0.6)),
      ph: [0, 1, 2, 3].map(() => rnd() * TAU),
      per: [0, 1, 2, 3].map(() => 55 + rnd() * 65),   // seconds per morph cycle
      h,
    }))
    tufts = Array.from({ length: low ? 0 : 30 }, () => {
      const h = rnd() < 0.5 ? 0 : 1
      return { h, k: 2 + (rnd() * (hills[h].rings - 3) | 0), p: rnd() * NPT | 0,
        dots: Array.from({ length: 4 + (rnd() * 3 | 0) }, () => ({ dx: (rnd() - 0.5) * 10, dy: (rnd() - 0.5) * 6 - 2, r: 0.8 + rnd() * 1.5, c: rnd() < 0.55 ? 0 : 1 })) }
    })
    // a single paw print pressed in the moss (an easter egg for Leo), built once per size
    paw = new Path2D()
    paw.ellipse(0, 4, 6, 4.6, 0, 0, TAU)
    for (const [x, y] of [[-6.6, -3.2], [-2.4, -7.4], [2.4, -7.4], [6.6, -3.2]]) { paw.moveTo(x + 2.2, y); paw.ellipse(x, y, 2.2, 2.8, x * 0.06, 0, TAU) }
    leaves = Array.from({ length: low ? 5 : 12 }, (_, i) => ({ x: rnd(), v: 4 + rnd() * 5, y: 0.1 + rnd() * 0.82, a: rnd() * TAU, s: 0.8 + rnd() * 0.7,
      px: 50 + rnd() * 60, py: 70 + rnd() * 50, ph: rnd() * TAU, c: ['rgba(127,176,105,', 'rgba(155,225,93,', 'rgba(79,138,58,'][i % 3] }))
  }

  // per-frame harmonic weights for one ring of one hill (cos/sin of a slowly turning phase)
  const ringW = (hl, k, t, out) => {
    for (let j = 0; j < 4; j++) {
      const a = hl.ph[j] + k * 0.11 * (j + 1) + t * TAU / hl.per[j], amp = hl.amp[j] * (0.75 + k * 0.03)
      out[j * 2] = Math.cos(a) * amp; out[j * 2 + 1] = Math.sin(a) * amp
    }
    return out
  }
  const ringR = (w, p) => 1 + w[0] * SIN[0][p] + w[1] * COS[0][p] + w[2] * SIN[1][p] + w[3] * COS[1][p] + w[4] * SIN[2][p] + w[5] * COS[2][p] + w[6] * SIN[3][p] + w[7] * COS[3][p]
  const WBUF = new Float32Array(8)

  function backdrop(g, b) {
    const { W, H, t, cx, cy, R } = b, low = b.low
    buildScene(W, H, low)
    const M = Math.max(W, H), lift = b.saver ? 1.35 : 1
    // forest floor: a deep teal glow round the core that wanders a little
    const gx = cx - W * 0.06 + Math.sin(t / 97) * W * 0.04, gy = cy + Math.cos(t / 83) * H * 0.04
    const base = g.createRadialGradient(gx, gy, 0, gx, gy, M * 0.85)
    base.addColorStop(0, '#0f2a24'); base.addColorStop(0.5, '#08160f'); base.addColorStop(1, '#040a08')
    g.fillStyle = base; g.fillRect(0, 0, W, H)
    // a faint warm breath of the core
    const wr = R * (2.2 + 0.15 * Math.sin(t / 41)), warm = g.createRadialGradient(cx, cy, 0, cx, cy, wr)
    warm.addColorStop(0, `rgba(230,154,46,${0.06 + 0.02 * Math.sin(t / 53)})`); warm.addColorStop(1, 'rgba(230,154,46,0)')
    g.fillStyle = warm; g.fillRect(cx - wr, cy - wr, wr * 2, wr * 2)

    // topographic ridges: nested rings round two hills, slowly breathing
    g.lineWidth = 1
    for (const hl of hills) {
      const hx = W * hl.fx + Math.sin(t / 89 + hl.h) * W * 0.02, hy = H * hl.fy + Math.cos(t / 107 + hl.h) * H * 0.02
      hl.x = hx; hl.y = hy
      const breathe = 1 + 0.025 * Math.sin(t / 47 + hl.h * 2)
      for (const major of [false, true]) {
        g.strokeStyle = major ? `rgba(127,176,105,${0.085 * lift})` : `rgba(95,211,196,${0.045 * lift})`
        g.beginPath()
        for (let k = 1; k <= hl.rings; k++) {
          if ((k % 5 === 0) !== major) continue
          const w = ringW(hl, k, t, WBUF), r0 = k * hl.gap * breathe
          for (let p = 0; p <= NPT; p++) { const r = r0 * ringR(w, p), x = hx + r * COS[0][p], y = hy + r * SIN[0][p]; p ? g.lineTo(x, y) : g.moveTo(x, y) }
        }
        g.stroke()
      }
      // a soft brighter band moving outward through the rings, about one ring every 6 s
      const wp = (t / 6 + hl.h * 9) % (hl.rings + 4)
      for (let k = Math.max(1, Math.floor(wp - 2)); k <= Math.min(hl.rings, Math.ceil(wp + 2)); k++) {
        const f = 1 - Math.abs(k - wp) / 2.2
        if (f <= 0) continue
        const w = ringW(hl, k, t, WBUF), r0 = k * hl.gap * breathe
        g.strokeStyle = `rgba(155,225,93,${0.09 * f * lift})`; g.lineWidth = 1 + f; g.beginPath()
        for (let p = 0; p <= NPT; p++) { const r = r0 * ringR(w, p), x = hx + r * COS[0][p], y = hy + r * SIN[0][p]; p ? g.lineTo(x, y) : g.moveTo(x, y) }
        g.stroke()
      }
      g.lineWidth = 1
    }

    // moss along the ridges
    if (tufts.length) {
      for (const c of [0, 1]) {
        g.fillStyle = c ? `rgba(79,138,58,${0.42 * lift})` : `rgba(127,176,105,${0.32 * lift})`
        g.beginPath()
        for (const tf of tufts) {
          const hl = hills[tf.h], w = ringW(hl, tf.k, t, WBUF), r = tf.k * hl.gap * (1 + 0.025 * Math.sin(t / 47 + hl.h * 2)) * ringR(w, tf.p)
          const x = hl.x + r * COS[0][tf.p], y = hl.y + r * SIN[0][tf.p]
          if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue
          for (const d of tf.dots) if (d.c === c) { g.moveTo(x + d.dx + d.r, y + d.dy); g.arc(x + d.dx, y + d.dy, d.r, 0, TAU) }
        }
        g.fill()
      }
    }

    // the paw print rides with the lower-left hill's moss, low contrast and small
    { const m = g.getTransform(), hl = hills[0]
      g.translate(hl.x - W * 0.07, hl.y - H * 0.42); g.rotate(-0.35); g.scale(1.15, 1.15)
      g.fillStyle = `rgba(127,176,105,${0.14 * lift})`; g.fill(paw); g.setTransform(m) }

    // a slow river of light, from lower left to upper right, between the hills
    const s1 = Math.sin(t / 71), s2 = Math.cos(t / 93), s3 = Math.sin(t / 113 + 1)
    const river = () => {
      g.beginPath(); g.moveTo(-W * 0.05, H * (0.6 + 0.03 * s3))
      g.bezierCurveTo(W * (0.28 + 0.03 * s1), H * (0.4 + 0.05 * s2), W * (0.55 + 0.03 * s2), H * (0.92 + 0.04 * s1), W * 1.05, H * (0.36 + 0.03 * s3))
    }
    g.lineCap = 'round'
    for (const [lw, a] of (low ? [[60, 0.03], [8, 0.05]] : [[110, 0.018], [48, 0.026], [16, 0.04], [5, 0.05]])) { g.strokeStyle = `rgba(95,211,196,${a * lift})`; g.lineWidth = lw; river(); g.stroke() }
    // light drifting downstream: soft specks a few pixels a second (kept on the cheap path too)
    g.strokeStyle = `rgba(200,245,225,${0.14 * lift})`; g.lineWidth = 1.6; g.setLineDash([1, 34]); g.lineDashOffset = -t * 9; river(); g.stroke()
    if (!low) {
      g.strokeStyle = `rgba(255,225,160,${0.06 * lift})`; g.lineWidth = 3; g.setLineDash([70, 330]); g.lineDashOffset = -t * 14; river(); g.stroke()
      }
    g.setLineDash([]); g.lineDashOffset = 0
    g.lineCap = 'butt'

    // leaves drifting on long, slow paths
    if (leaves.length) {
      const m = g.getTransform()
      for (const L of leaves) {
        const x = ((W * L.x + t * L.v) % (W + 220)) - 110 + Math.sin(t / L.px + L.ph) * 50, y = H * L.y + Math.cos(t / L.py + L.ph) * 45
        g.setTransform(m); g.translate(x, y); g.rotate(L.a + Math.sin(t / 37 + L.ph) * 0.7); g.scale(L.s, L.s)
        g.fillStyle = L.c + (0.32 * lift) + ')'
        g.beginPath(); g.moveTo(-7, 0); g.quadraticCurveTo(0, -6, 8, 0); g.quadraticCurveTo(0, 6, -7, 0); g.fill()
        g.strokeStyle = 'rgba(4,10,8,.45)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-6, 0); g.lineTo(7, 0); g.stroke()
      }
      g.setTransform(m)
    }
  }

  // ---- core view ----
  // one tapered strand from (x0,y0) to (x1,y1), bent sideways by `bend`
  function strand(g, x0, y0, x1, y1, bend, w0, w1, fill) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L
    const c1x = x0 + dx * 0.35 + nx * L * bend, c1y = y0 + dy * 0.35 + ny * L * bend, c2x = x0 + dx * 0.7 - nx * L * bend * 0.6, c2y = y0 + dy * 0.7 - ny * L * bend * 0.6
    const N = 16, left = [], right = []
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u
      const x = v * v * v * x0 + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * x1, y = v * v * v * y0 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y1
      const tx = 3 * v * v * (c1x - x0) + 6 * v * u * (c2x - c1x) + 3 * u * u * (x1 - c2x), ty = 3 * v * v * (c1y - y0) + 6 * v * u * (c2y - c1y) + 3 * u * u * (y1 - c2y)
      const tl = Math.hypot(tx, ty) || 1, w = (w0 + (w1 - w0) * u) / 2
      left.push(x - ty / tl * w, y + tx / tl * w); right.push(x + ty / tl * w, y - tx / tl * w)
    }
    if (fill) {
      g.fillStyle = fill; g.beginPath(); g.moveTo(left[0], left[1])
      for (let i = 2; i < left.length; i += 2) g.lineTo(left[i], left[i + 1])
      for (let i = right.length - 2; i >= 0; i -= 2) g.lineTo(right[i], right[i + 1])
      g.closePath(); g.fill()
    }
    return { c1x, c1y, c2x, c2y }
  }

  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter, steps, cur, goal, complete } = cc
    const br = 0.9 + 0.1 * Math.sin(t * 0.7) + flare * 0.6
    // a mossy glow with a warm honey centre
    const glow = g.createRadialGradient(cx, cy - R * 0.08, 0, cx, cy, R * 1.12)
    glow.addColorStop(0, `rgba(45,107,82,${0.5 * br})`); glow.addColorStop(0.55, `rgba(18,58,46,${0.4 * br})`); glow.addColorStop(1, 'rgba(6,17,15,0)')
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, TAU); g.fill()
    const honey = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6)
    honey.addColorStop(0, `rgba(230,154,46,${0.22 * br})`); honey.addColorStop(1, 'rgba(230,154,46,0)')
    g.fillStyle = honey; g.beginPath(); g.arc(cx, cy, R * 0.6, 0, TAU); g.fill()

    // teal holographic rings and crosshair
    g.lineWidth = 1
    g.strokeStyle = `rgba(95,211,196,.16)`; g.beginPath()
    g.moveTo(cx - R * 2.1, cy); g.lineTo(cx - R * 0.3, cy); g.moveTo(cx + R * 0.3, cy); g.lineTo(cx + R * 2.1, cy)
    g.moveTo(cx, cy - R * 1.75); g.lineTo(cx, cy - R * 0.3); g.moveTo(cx, cy + R * 0.3); g.lineTo(cx, cy + R * 1.75)
    for (let k = -8; k <= 8; k++) if (k) { const d = k * R * 0.2, l = k % 5 ? 3 : 7; g.moveTo(cx + d, cy - l); g.lineTo(cx + d, cy + l); g.moveTo(cx - l, cy + d); g.lineTo(cx + l, cy + d) }
    g.stroke()
    const rings = [[0.52, 0.3], [1.16, 0.3], [1.42, 0.2], [1.72, 0.13], [2.03, 0.08]]
    for (const [r, o] of rings) { g.strokeStyle = `rgba(95,211,196,${o})`; g.beginPath(); g.arc(cx, cy, R * r, 0, TAU); g.stroke() }
    g.save(); g.translate(cx, cy); g.rotate(t * 0.02)
    g.strokeStyle = 'rgba(95,211,196,.42)'; g.lineWidth = 2; g.setLineDash([R * 0.5, R * 0.22, R * 0.08, R * 0.22]); g.beginPath(); g.arc(0, 0, R * 1.16, 0, TAU); g.stroke()
    g.rotate(-t * 0.035); g.lineWidth = 1; g.setLineDash([2, 8]); g.strokeStyle = 'rgba(95,211,196,.3)'; g.beginPath(); g.arc(0, 0, R * 1.29, 0, TAU); g.stroke(); g.setLineDash([])
    g.restore()
    g.fillStyle = '#06110f'; g.strokeStyle = 'rgba(95,211,196,.7)'; g.lineWidth = 1.3; g.beginPath()
    for (const [r] of rings.slice(1)) for (let q = 0; q < 4; q++) { const x = cx + Math.cos(q * Math.PI / 2) * R * r, y = cy + Math.sin(q * Math.PI / 2) * R * r; g.moveTo(x + 3, y); g.arc(x, y, 3, 0, TAU) }
    g.fill(); g.stroke()
    // shell
    g.strokeStyle = jitter ? C.red : C.shell; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke()

    // roots from the core out to each plan step (and the goal), brighter where the work is done
    const targets = steps.map((p, i) => ({ x: p.x, y: p.y, st: p.s.status === 'completed' ? 'done' : i === cur ? 'live' : 'todo', i }))
    if (steps.length && goal) targets.push({ x: goal.x, y: goal.y, st: complete ? 'done' : 'goal', i: steps.length })
    const r0 = Math.max(10, Math.min(17, R * 0.06)) * 2.4
    for (const p of targets) {
      const a = Math.atan2(p.y - cy, p.x - cx), sx = cx + Math.cos(a) * r0, sy = cy + Math.sin(a) * r0
      const bend = (((p.i * 0.618 + 0.3) % 1) - 0.5) * 0.5 + Math.sin(t / 31 + p.i) * 0.04
      const lit = p.st === 'done' || p.st === 'live'
      g.globalAlpha = lit ? 0.95 : 0.55
      strand(g, sx, sy, p.x, p.y, bend, 8, 2.5, '#5a3a14')
      const c = strand(g, sx, sy, p.x, p.y, bend, 4, 1.2, p.st === 'done' ? '#c98b3a' : p.st === 'live' ? '#b07a34' : '#6e5226')
      g.strokeStyle = p.st === 'done' ? '#ffe1a0' : p.st === 'live' ? cc.fire : p.st === 'goal' ? 'rgba(240,199,90,.5)' : 'rgba(160,122,58,.55)'
      g.lineWidth = p.st === 'done' ? 1.1 : 0.9; g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, p.x, p.y); g.stroke()
      // two small side branches
      g.strokeStyle = lit ? 'rgba(154,106,42,.75)' : 'rgba(110,82,38,.55)'; g.lineWidth = 1.4; g.beginPath()
      for (let k = 0; k < 2; k++) {
        const u = 0.38 + k * 0.28, bx = sx + (p.x - sx) * u, by = sy + (p.y - sy) * u, ba = a + (k ? 0.85 : -0.85) + Math.sin(t / 43 + p.i + k) * 0.05, bl = R * (0.14 + ((p.i * 0.37 + k * 0.5) % 1) * 0.12)
        g.moveTo(bx, by); g.quadraticCurveTo(bx + Math.cos(ba) * bl * 0.6 + Math.cos(a) * 8, by + Math.sin(ba) * bl * 0.6 + Math.sin(a) * 8, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl)
      }
      g.stroke()
    }
    g.globalAlpha = 1
  }

  // gently curved root strands for links; amber seeds for neurons
  function link(g, x1, y1, x2, y2, color, b, i) {
    const k = (((i * 7919) % 13) - 6) / 6 * 0.16, mx = (x1 + x2) / 2 - (y2 - y1) * k, my = (y1 + y2) / 2 + (x2 - x1) * k
    if (color) { g.strokeStyle = color; g.globalAlpha = 0.35 + 0.65 * b; g.lineWidth = 0.9 + b * 2; if (b > 0.6) { g.shadowColor = color; g.shadowBlur = 8 } }
    else { g.strokeStyle = C.link; g.lineWidth = 0.8 }
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(mx, my, x2, y2); g.stroke()
  }
  function neuron(g, x, y, r, color, b, i) {
    g.fillStyle = color || C.neuron
    if (color && b > 0.4) { g.shadowColor = color; g.shadowBlur = 10 }
    g.beginPath(); g.ellipse(x, y, r * 1.3, r * 0.8, i * 2.4, 0, TAU); g.fill()
  }

  // the agent: seven glowing honeycomb cells
  function coreCenter(g, cc) {
    const { cx, cy, R, t, flare, kind } = cc, s = Math.max(10, Math.min(17, R * 0.06)), d = s * Math.sqrt(3) + 2
    const br = Math.min(1, 0.85 + 0.15 * Math.sin(t * 0.8) + flare * 0.5)
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, s * 5)
    halo.addColorStop(0, `rgba(255,200,110,${0.42 * br})`); halo.addColorStop(1, 'rgba(255,200,110,0)')
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, s * 5, 0, TAU); g.fill()
    if (kind) { g.strokeStyle = cc.fire; g.globalAlpha = 0.55; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, d + s * 1.45, 0, TAU); g.stroke(); g.globalAlpha = 1 }
    for (let i = 0; i < 7; i++) {
      const a = (i - 1) * Math.PI / 3, x = i ? cx + Math.cos(a) * d : cx, y = i ? cy + Math.sin(a) * d : cy
      const cell = g.createRadialGradient(x, y - s * 0.3, 0, x, y, s * 1.05)
      cell.addColorStop(0, '#ffe7a3'); cell.addColorStop(0.55, '#e69a2e'); cell.addColorStop(1, '#8a5416')
      g.globalAlpha = i ? 0.72 + 0.28 * Math.sin(t * 0.9 + i * 1.3) * br : 1
      hexPath(x, y, s); g.fillStyle = cell; g.fill()
      g.strokeStyle = kind === 'error' ? C.red : '#ffe1a0'; g.lineWidth = 1.4; g.stroke()
    }
    g.globalAlpha = 1
  }

  // a small amber swarm that drifts to where the work is
  const BEES = Array.from({ length: 56 }, (_, i) => { const u = ((i * 0.6180339) % 1); return { ph: i * 2.39996, w: (0.35 + u * 0.55) * (i % 5 ? 1 : -1), r: 6 + Math.pow(((i * 0.7548776) % 1), 0.8) * 30, o: 0.55 + ((i * 0.4142) % 1) * 0.45 } })
  let swx = null, swy = null
  function coreOver(g, cc) {
    const { cx, cy, R, t, steps, cur, tip } = cc
    const live = cur >= 0 && cur < steps.length ? steps[cur] : null
    // rest part-way out along the current step's root, leaning toward the newest firing chain
    let tx = live ? cx + (live.x - cx) * 0.7 : cx, ty = live ? cy + (live.y - cy) * 0.7 : cy - R * 0.35
    if (tip) { tx = tx * 0.7 + tip.x * 0.3; ty = ty * 0.7 + tip.y * 0.3 }
    if (!Number.isFinite(tx + ty)) return
    if (swx === null || !(Math.abs(swx - tx) + Math.abs(swy - ty) <= R * 4)) { swx = tx; swy = ty }   // also recovers from a NaN
    swx += (tx - swx) * 0.03; swy += (ty - swy) * 0.03
    const hr = 58, halo = g.createRadialGradient(swx, swy, 0, swx, swy, hr)
    halo.addColorStop(0, 'rgba(255,214,130,.2)'); halo.addColorStop(1, 'rgba(255,214,130,0)')
    g.fillStyle = halo; g.fillRect(swx - hr, swy - hr, hr * 2, hr * 2)
    g.fillStyle = '#ffd98a'
    for (const hi of [false, true]) {
      g.globalAlpha = hi ? 0.95 : 0.6; g.beginPath()
      BEES.forEach((bee, i) => {
        if ((bee.o > 0.8) !== hi) return
        const a = bee.ph + t * bee.w, rr = bee.r * (1 + 0.15 * Math.sin(t * 0.5 + i)), x = swx + Math.cos(a) * rr * 1.3 + Math.sin(t * 2.1 + i) * 2.5, y = swy + Math.sin(a) * rr + Math.cos(t * 1.7 + i) * 2
        const hd = a + (bee.w > 0 ? Math.PI / 2 : -Math.PI / 2); g.moveTo(x + Math.cos(hd) * 3.2, y + Math.sin(hd) * 3.2); g.ellipse(x, y, 3.2, 1.8, hd, 0, TAU)
      })
      g.fill()
    }
    g.globalAlpha = 1
  }

  registerTheme({
    id: 'living',
    name: 'Living core',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500&display=swap',
    fonts: { mono: '"JetBrains Mono", ui-monospace, monospace', head: 'Fraunces, Georgia, serif' },
    css: {
      '--bg': '#040a08', '--panel': 'rgba(8,24,20,.88)', '--panel2': '#06110f', '--line': '#24564b',
      '--cyan': '#5fd3c4', '--yellow': '#f0c75a', '--red': '#ff3d47', '--green': '#9be15d', '--purple': '#c39bff', '--amber': '#ff8f3d', '--blue': '#6aa8ff',
      '--dim': '#8fb0a1', '--text': '#e9f1e4', '--muted': '#a9c4b6',
      '--mono': '"JetBrains Mono", ui-monospace, Menlo, monospace', '--head': 'Fraunces, Georgia, serif',
      '--radius': '12px', '--clip': 'none',
    },
    colors: {
      bg: '#040a08', cyan: '#5fd3c4', yellow: '#f0c75a', red: '#ff3d47', green: '#9be15d', purple: '#c39bff', amber: '#ff8f3d', blue: '#6aa8ff',
      dim: '#8fb0a1', line: '#24564b', text: '#e9f1e4',
      muted: '#a9c4b6', todo: '#6a8a7b', doneInk: '#cdeaae', ink2: '#ffe7a3', nodeFill: '#07140f', chip: 'rgba(5,14,11,.74)', labelBg: 'rgba(5,14,11,.92)',
      link: 'rgba(201,139,58,.3)', neuron: 'rgba(214,160,82,.72)', shell: 'rgba(95,211,196,.45)', wire: 'rgba(95,211,196,.1)', packet: '#fff3cf',
      accentRGB: '95,211,196', goalRGB: '240,199,90', tickRGB: '127,176,105', glow0: '255,214,140', glow1: '201,139,58', glow2: '15,42,36',
    },
    backdrop, sphere, link, neuron, coreCenter, coreOver,
  })
})()
