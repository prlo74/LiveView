/* Holo blueprint: the Blueprint drafting sheet (grid, centre lines, construction lines drawn and rubbed out, scan line, title block) as the background,
   with the Hologram look on top: a wire-and-particle globe in turning segmented rings, glowing links and neurons, and its chrome and fonts. */
;(() => {
  const TAU = Math.PI * 2
  const INK = '207,232,255'   // #cfe8ff, the sheet's line-work
  const CY = '0,210,255', ICE = '127,233,255', HOT = '225,250,255'
  const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296

  // a dimension line from (x1,y1) to (x2,y2): arrowheads at both ends, the label in a gap at the middle
  function dimension(g, x1, y1, x2, y2, label, a) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux
    g.font = `10px ${F.mono}`
    const gap = label ? g.measureText(label).width / 2 + 6 : 0, mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    g.strokeStyle = g.fillStyle = `rgba(${INK},${a})`; g.lineWidth = 0.9
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(mx - ux * gap, my - uy * gap); g.moveTo(mx + ux * gap, my + uy * gap); g.lineTo(x2, y2); g.stroke()
    g.beginPath()
    for (const [px, py, s] of [[x1, y1, 1], [x2, y2, -1]]) { g.moveTo(px, py); g.lineTo(px + s * ux * 8 + nx * 2.2, py + s * uy * 8 + ny * 2.2); g.lineTo(px + s * ux * 8 - nx * 2.2, py + s * uy * 8 - ny * 2.2) }
    g.fill()
    if (!label) return
    let ang = Math.atan2(dy, dx); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI
    g.save(); g.translate(mx, my); g.rotate(ang); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, 0); g.restore()
  }

  // ---- the sheet, built once per window size ----
  let sheetKey = '', S = null
  function buildSheet(W, H, cx, cy, R, core) {
    const key = [W, H, cx | 0, cy | 0, R | 0, core].join()
    if (key === sheetKey) return S
    sheetKey = key
    const minor = 16, major = 80, m = 32
    const gMinor = new Path2D(), gMajor = new Path2D(), ruler = new Path2D(), centre = new Path2D(), rings = new Path2D(), arcs = new Path2D()
    // the grid is anchored on the centre, so a major line runs through it
    const x0 = cx - Math.ceil((cx + m) / major) * major, y0 = cy - Math.ceil((cy + m) / major) * major
    for (let x = x0, i = 0; x <= W + m; x += minor, i++) { const p = i % 5 ? gMinor : gMajor, X = Math.round(x) + 0.5; p.moveTo(X, -m); p.lineTo(X, H + m) }
    for (let y = y0, i = 0; y <= H + m; y += minor, i++) { const p = i % 5 ? gMinor : gMajor, Y = Math.round(y) + 0.5; p.moveTo(-m, Y); p.lineTo(W + m, Y) }
    // sheet border with a scale along its left and bottom edges
    const bx = 6.5, by = 6.5, bw = W - 13, bh = H - 13
    ruler.rect(bx, by, bw, bh)
    for (let y = by + minor, i = 1; y < by + bh; y += minor, i++) { const l = i % 5 ? 4 : 9; ruler.moveTo(bx, y); ruler.lineTo(bx + l, y) }
    for (let x = bx + minor, i = 1; x < bx + bw; x += minor, i++) { const l = i % 5 ? 4 : 9; ruler.moveTo(x, by + bh); ruler.lineTo(x, by + bh - l) }
    // centre lines across the sheet, through the core (or the web's centre)
    centre.moveTo(-m, Math.round(cy) + 0.5); centre.lineTo(W + m, Math.round(cy) + 0.5)
    centre.moveTo(Math.round(cx) + 0.5, -m); centre.lineTo(Math.round(cx) + 0.5, H + m)
    // construction circles round the centre (at the origin; drawn translated and gently scaled)
    const rr = core ? [2.45, 2.9, 3.6] : [0.55, 1.05, 1.6, 2.2]
    for (const k of rr) { rings.moveTo(R * k, 0); rings.arc(0, 0, R * k, 0, TAU) }
    // compass arcs from the sheet's bottom left corner and top right corner
    const M = Math.max(W, H)
    for (const k of [0.34, 0.42]) { arcs.moveTo(M * k, 0); arcs.arc(0, 0, M * k, 0, TAU) }
    // construction lines that are drawn in and rubbed out on their own slow cycles (seeded, so stable per size)
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const snap = (v, c) => c + Math.round((v - c) / major) * major
    const cons = [], ringR = R * rr[rr.length - 1]
    for (let i = 0; i < 4; i++) {   // tangents to the outer construction circle
      const a = rnd() * TAU, px = cx + Math.cos(a) * ringR, py = cy + Math.sin(a) * ringR, tx = -Math.sin(a), ty = Math.cos(a), l = ringR * (0.7 + rnd() * 0.5)
      cons.push({ l: [px - tx * l, py - ty * l, px + tx * l, py + ty * l] })
    }
    for (let i = 0; i < 3; i++) {   // rays from the centre on 30° steps, from the drawing out to the sheet edge
      const a = Math.floor(rnd() * 12) / 12 * TAU + TAU / 24, r0 = R * (core ? 1.5 : 0.6), r1 = M * 0.62
      cons.push({ l: [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1] })
    }
    for (let i = 0; i < 5; i++) {   // compass arcs struck from major grid nodes
      const ax = snap(W * (0.08 + rnd() * 0.84), cx), ay = snap(H * (0.12 + rnd() * 0.76), cy), r = major * (1 + Math.floor(rnd() * 3)), a0 = rnd() * TAU
      cons.push({ a: [ax, ay, r, a0, a0 + (0.35 + rnd() * 0.5) * Math.PI] })
    }
    cons.forEach((c, i) => { c.per = 38 + rnd() * 26; c.ph = i / cons.length })
    // a small sail plan beside the title block, under the lowest orbit label (hull, mast, boom, main and jib; waterline drawn dashed), in sheet coordinates
    const boat = new Path2D(), wl = new Path2D(), bk = 0.68, ox = 610, oy = H - 30
    const P = (x, y) => [ox + x * bk, oy + y * bk], mv = (x, y) => boat.moveTo(...P(x, y)), ln = (x, y) => boat.lineTo(...P(x, y)), qd = (qx, qy, x, y) => boat.quadraticCurveTo(...P(qx, qy), ...P(x, y))
    mv(8, -13); qd(60, -10, 110, -16); qd(64, 6, 12, -4); ln(8, -13)                     // hull: sheer, bottom, transom
    mv(54, -1); ln(57, 14); ln(67, 14); ln(68, -2)                                           // keel
    mv(62, -12); ln(62, -112); mv(62, -22); ln(18, -22)                                     // mast, boom
    mv(62, -108); qd(36, -60, 20, -24); mv(62, -102); ln(108, -16)                          // mainsail leech, forestay
    mv(63, -92); ln(104, -19); ln(67, -24); ln(63, -92)                                      // jib
    wl.moveTo(...P(0, -6)); wl.lineTo(...P(120, -6))
    S = { gMinor, gMajor, ruler, centre, rings, arcs, rr, M, cons, boat, wl, boatX: ox + 126 * bk, boatY: oy - 6 * bk }
    return S
  }

  const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
  // each line: drawn in over 30% of its cycle, held, rubbed out from its start, then a pause
  function construction(g, s, t, a) {
    const ink = new Path2D(), tips = new Path2D()
    for (const c of s.cons) {
      const u = (t / c.per + c.ph) % 1, e = ease(u / 0.3), st = ease((u - 0.58) / 0.3)
      if (e - st < 0.002) continue
      let hx, hy
      if (c.l) {
        const [x1, y1, x2, y2] = c.l, ax = x1 + (x2 - x1) * st, ay = y1 + (y2 - y1) * st
        hx = x1 + (x2 - x1) * e; hy = y1 + (y2 - y1) * e
        ink.moveTo(ax, ay); ink.lineTo(hx, hy)
        if (u >= 0.58) { hx = ax; hy = ay }
      } else {
        const [x, y, r, a0, a1] = c.a, b0 = a0 + (a1 - a0) * st, b1 = a0 + (a1 - a0) * e
        ink.moveTo(x + Math.cos(b0) * r, y + Math.sin(b0) * r); ink.arc(x, y, r, b0, b1)
        const at = u >= 0.58 ? b0 : b1; hx = x + Math.cos(at) * r; hy = y + Math.sin(at) * r
        ink.moveTo(x - 4, y); ink.lineTo(x + 4, y); ink.moveTo(x, y - 4); ink.lineTo(x, y + 4)   // the compass point
      }
      if ((u < 0.3) || (u > 0.58 && u < 0.88)) { tips.moveTo(hx + 1.8, hy); tips.arc(hx, hy, 1.8, 0, TAU) }   // the pencil point while it moves
    }
    g.lineWidth = 0.9; g.strokeStyle = `rgba(${INK},${0.2 * a})`; g.stroke(ink)
    g.fillStyle = `rgba(${INK},${0.5 * a})`; g.fill(tips)
  }

  function backdrop(g, b) {
    const { W, H, t, cx, cy, R, low, core, saver } = b
    const s = buildSheet(W, H, cx, cy, R, core), lift = saver ? 1.35 : 1
    // paper: blueprint blue, a touch lighter where the drawing is, the light point wandering slowly
    const gx = cx + Math.sin(t / 97) * W * 0.05, gy = cy + Math.cos(t / 113) * H * 0.05
    const base = g.createRadialGradient(gx, gy, 0, gx, gy, s.M * 0.8)
    base.addColorStop(0, '#104473'); base.addColorStop(0.45, '#0d3b66'); base.addColorStop(1, '#0a2f52')
    g.fillStyle = base; g.fillRect(0, 0, W, H)

    // parallax: the fine grid sits behind and drifts a little, the major grid and its construction lines in front drift more
    const br = (1 + 0.14 * Math.sin(t / 67)) * lift
    const dx = Math.sin(t / 47) * 0.8 + Math.sin(t / 113) * 0.4, dy = Math.cos(t / 59) * 0.8 + Math.sin(t / 89 + 2) * 0.4   // -1.2..1.2
    const sx = (W + 280) * ((t / 56) % 1) - 140   // the scan line, crossing the sheet once a minute
    g.lineWidth = 1
    g.save(); g.translate(dx * 7, dy * 7)
    g.strokeStyle = `rgba(${INK},${0.045 * br})`; g.stroke(s.gMinor)
    g.restore()
    g.save(); g.translate(dx * 18, dy * 18)
    g.strokeStyle = `rgba(${INK},${0.1 * br})`; g.stroke(s.gMajor)
    if (!low) {   // the scan lights the grid it passes over, fading behind it
      const hl = g.createLinearGradient(sx - dx * 18 - 220, 0, sx - dx * 18 + 3, 0)
      hl.addColorStop(0, `rgba(${INK},0)`); hl.addColorStop(0.97, `rgba(${INK},${0.16 * lift})`); hl.addColorStop(1, `rgba(${INK},0)`)
      g.strokeStyle = hl; g.stroke(s.gMajor)
    }
    construction(g, s, t, lift)
    g.restore()
    g.strokeStyle = `rgba(${INK},${0.22 * lift})`; g.stroke(s.ruler)

    // centre lines (long dash, short dash) creeping a pixel a second
    g.setLineDash([26, 6, 4, 6]); g.lineDashOffset = -t * 0.9
    g.strokeStyle = `rgba(${INK},${0.12 * lift})`; g.stroke(s.centre)
    g.setLineDash([]); g.lineDashOffset = 0

    // construction circles, breathing by about one per cent
    const k = 1 + 0.012 * Math.sin(t / 53)
    g.save(); g.translate(cx, cy); g.scale(k, k)
    g.setLineDash([3, 7]); g.strokeStyle = `rgba(${INK},${0.13 * lift})`; g.stroke(s.rings); g.setLineDash([])
    if (!low) {
      // a compass radius sweeping the outer circle once every two minutes, with its point marked
      const a = t * TAU / 120, r = R * s.rr[s.rr.length - 1]
      g.strokeStyle = `rgba(${INK},${0.1 * lift})`; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      g.moveTo(Math.cos(a) * r + 5, Math.sin(a) * r); g.arc(Math.cos(a) * r, Math.sin(a) * r, 5, 0, TAU); g.stroke()
    }
    g.restore()
    if (!low) {
      g.strokeStyle = `rgba(${INK},${0.07 * lift})`
      const k2 = 1 + 0.015 * Math.sin(t / 71 + 1)
      g.save(); g.translate(0, H); g.scale(k2, k2); g.stroke(s.arcs); g.restore()
      g.save(); g.translate(W, 0); g.scale(2 - k2, 2 - k2); g.stroke(s.arcs); g.restore()
    }

    // the web view gets a dimension across its outer circle
    if (!core) {
      const r = R * s.rr[1] * k, y = Math.max(104, cy - r - 30)   // above the web, clear of the header
      g.strokeStyle = `rgba(${INK},.18)`; g.beginPath(); g.moveTo(cx - r, cy - 4); g.lineTo(cx - r, y - 6); g.moveTo(cx + r, cy - 4); g.lineTo(cx + r, y - 6); g.stroke()
      dimension(g, cx - r, y, cx + r, y, `Ø ${Math.round(2 * r)}`, 0.34 * lift)
    }

    // the scan line: a thin line of light with a soft wash trailing behind it
    {
      const bw = 200, sc = g.createLinearGradient(sx - bw, 0, sx, 0)
      sc.addColorStop(0, `rgba(${INK},0)`); sc.addColorStop(1, `rgba(${INK},${0.045 * lift})`)
      g.fillStyle = sc; g.fillRect(sx - bw, 0, bw, H)
      g.fillStyle = `rgba(${INK},${0.2 * lift})`; g.fillRect(sx, 0, 1, H)
    }

    // the sail plan, faint, right of the title block
    if (W > 860) {
      g.lineWidth = 0.8; g.strokeStyle = `rgba(${INK},${0.13 * lift})`; g.stroke(s.boat)
      g.setLineDash([5, 4]); g.stroke(s.wl); g.setLineDash([])
      g.font = `8px ${F.mono}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = `rgba(${INK},${0.16 * lift})`; g.fillText('DWG L-E-O 01', s.boatX, s.boatY)
    }

    // title block, bottom, just right of the activity log
    const tw = 236, th = 38, tx = 344.5, ty = H - 12.5 - th
    if (W > tx + tw + 40 && !saver) {
      g.fillStyle = 'rgba(10,47,82,.72)'; g.fillRect(tx, ty, tw, th)
      g.strokeStyle = `rgba(${INK},.38)`; g.lineWidth = 1; g.strokeRect(tx, ty, tw, th)
      g.beginPath(); g.moveTo(tx, ty + 20); g.lineTo(tx + tw, ty + 20); g.moveTo(tx + 150, ty + 20); g.lineTo(tx + 150, ty + th); g.stroke()
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = C.muted
      g.font = `600 10px ${F.mono}`; g.fillText(`AGENT WEB · ${core ? 'CORE VIEW' : 'WEB VIEW'}`, tx + 8, ty + 10.5)
      g.font = `9px ${F.mono}`; g.fillText('GRID 16 · MAJOR 80', tx + 8, ty + 29.5); g.fillText('HOLO PRINT', tx + 158, ty + 29.5)
    }
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
    id: 'holoprint',
    name: 'Holo blueprint',
    light: false,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
    fonts: { mono: '"JetBrains Mono", ui-monospace, monospace', head: 'Rajdhani, "Helvetica Neue", sans-serif' },
    webSilk: true,
    css: {
      '--bg': '#0b355d', '--panel': 'rgba(4,20,40,.9)', '--panel2': '#051a33', '--line': '#2a6a94',
      '--cyan': '#3fdcff', '--yellow': '#ffc454', '--red': '#ff4d5e', '--green': '#5ef0a0', '--purple': '#e09cff',
      '--amber': '#ff9a3c', '--blue': '#a3b8ff', '--dim': '#93b9d4', '--text': '#e4f7ff', '--muted': '#a9cfe3',
      '--mono': "'JetBrains Mono', ui-monospace, Menlo, monospace", '--head': "Rajdhani, 'Helvetica Neue', sans-serif",
      '--radius': '4px', '--clip': 'none',
    },
    colors: {
      bg: '#0b355d', cyan: '#3fdcff', yellow: '#ffc454', red: '#ff4d5e', green: '#5ef0a0', purple: '#e09cff', amber: '#ff9a3c', blue: '#a3b8ff',
      dim: '#93b9d4', line: '#2a6a94', text: '#e4f7ff',
      muted: '#a9cfe3', todo: '#86accb', doneInk: '#b8f7d2', ink2: '#f2fdff', nodeFill: '#06213f', chip: 'rgba(4,20,40,.82)', labelBg: 'rgba(4,20,40,.94)',
      link: 'rgba(0,210,255,.2)', neuron: '#7fe9ff', shell: 'rgba(127,233,255,.55)', wire: 'rgba(0,210,255,.14)', packet: '#f2fdff',
      accentRGB: '63,220,255', goalRGB: '255,196,84', tickRGB: '127,233,255', glow0: '127,233,255', glow1: '0,210,255', glow2: '0,60,110',
    },
    backdrop, sphere, coreUnder, coreOver, link, neuron, coreCenter,
  })
})()
