/* Blueprint: a drafting sheet in blueprint blue with a fine grid, centre lines, construction circles and lines that are drawn and rubbed out, a sweeping scan line, dimension lines
   and a small title block; the core is a technical drawing of a sphere, and firing chains are coloured pen strokes. */
;(() => {
  const TAU = Math.PI * 2
  const INK = '207,232,255'   // #cfe8ff, the line-work

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
      g.font = `9px ${F.mono}`; g.fillText('GRID 16 · MAJOR 80', tx + 8, ty + 29.5); g.fillText('BLUEPRINT', tx + 158, ty + 29.5)
    }
  }

  // ---- core view ----
  let coreKey = -1, Q = null
  function coreGeo(R) {
    if ((R | 0) === coreKey) return Q
    coreKey = R | 0
    const wall = new Path2D(), hatch = new Path2D(), inner = new Path2D(), ticks = new Path2D(), centre = new Path2D()
    wall.arc(0, 0, R, 0, TAU); wall.moveTo(R * 0.9, 0); wall.arc(0, 0, R * 0.9, 0, TAU)
    for (let d = -2 * R; d <= 2 * R; d += 7) { hatch.moveTo(d - R, R); hatch.lineTo(d + R, -R) }
    for (const k of [0.34, 0.66]) { inner.moveTo(R * k, 0); inner.arc(0, 0, R * k, 0, TAU) }
    for (let i = 0; i < 120; i++) {
      const a = i / 120 * TAU, l = i % 10 ? (i % 5 ? 4 : 7) : 11, r0 = R * 1.045
      ticks.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ticks.lineTo(Math.cos(a) * (r0 + l), Math.sin(a) * (r0 + l))
    }
    centre.moveTo(-R * 1.42, 0.5); centre.lineTo(R * 1.42, 0.5); centre.moveTo(0.5, -R * 1.36); centre.lineTo(0.5, R * 1.36)
    Q = { wall, hatch, inner, ticks, centre }
    return Q
  }

  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter, recent, low } = cc, q = coreGeo(R)
    // inside the drawing the sheet is a little lighter
    const fill = g.createRadialGradient(cx, cy - R * 0.25, 0, cx, cy, R)
    fill.addColorStop(0, `rgba(36,104,160,${0.3 + flare * 0.3})`); fill.addColorStop(1, `rgba(20,78,128,${0.16 + flare * 0.2})`)
    g.fillStyle = fill; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill()
    g.translate(cx, cy)
    // the shell wall in section, hatched
    g.save(); g.clip(q.wall, 'evenodd'); g.strokeStyle = `rgba(${INK},.22)`; g.lineWidth = 0.8; g.stroke(q.hatch); g.restore()
    g.lineWidth = 1
    g.strokeStyle = `rgba(${INK},.32)`; g.beginPath(); g.arc(0, 0, R * 0.9, 0, TAU); g.stroke()
    g.setLineDash([3, 6]); g.strokeStyle = `rgba(${INK},.2)`; g.stroke(q.inner)
    g.setLineDash([2, 7]); g.strokeStyle = `rgba(${INK},.22)`; g.beginPath(); g.arc(0, 0, R * 1.3, 0, TAU); g.stroke()
    // centre lines through the middle
    g.setLineDash([24, 5, 4, 5]); g.lineDashOffset = -t * 0.9; g.strokeStyle = `rgba(${INK},.34)`; g.stroke(q.centre)
    g.setLineDash([]); g.lineDashOffset = 0
    // a protractor scale that turns slowly, a little faster when the agent is busy
    g.save(); g.rotate(t * (0.004 + Math.min(0.03, recent * 0.002))); g.strokeStyle = `rgba(${INK},.38)`; g.stroke(q.ticks); g.restore()
    // the outline
    g.strokeStyle = jitter ? C.red : C.shell; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke()
    if (low) return
    // its diameter, dimensioned on the left
    const x = -R * 1.2
    g.strokeStyle = `rgba(${INK},.22)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-10, -R); g.lineTo(x - 6, -R); g.moveTo(-10, R); g.lineTo(x - 6, R); g.stroke()
    dimension(g, x, -R, x, R, `Ø ${Math.round(2 * R)}`, 0.5)
  }

  // links are thin construction lines; a firing chain is a coloured pen stroke
  function link(g, x1, y1, x2, y2, color, b) {
    if (color) { g.strokeStyle = color; g.globalAlpha = 0.4 + 0.6 * b; g.lineWidth = 1.1 + b * 1.4; g.lineCap = 'round' }
    else { g.strokeStyle = C.link; g.lineWidth = 0.7 }
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
  }
  // neurons are small drafted circles: hollow when idle, inked when lit
  function neuron(g, x, y, r, color, b) {
    g.beginPath(); g.arc(x, y, r + 0.6, 0, TAU)
    g.fillStyle = color || C.nodeFill; g.fill()
    g.strokeStyle = color || C.neuron; g.lineWidth = 0.9; g.stroke()
    if (color && b > 0.5) { g.globalAlpha = b - 0.4; g.beginPath(); g.arc(x, y, r + 4, 0, TAU); g.stroke() }
  }

  // plan steps read as dimension callouts: a radial line from the drawing out to each step
  function coreOver(g, cc) {
    const { cx, cy, R, steps, cur, goal, complete } = cc
    const list = steps.map((p, i) => ({ x: p.x, y: p.y, col: p.s.status === 'completed' ? C.green : p.s.status === 'failed' ? C.red : i === cur ? cc.fire : null, a: i === cur ? 0.6 : 0.45 }))
    if (steps.length && goal) list.push({ x: goal.x, y: goal.y, col: complete ? C.green : C.yellow, a: 0.4, goal: true })
    g.lineWidth = 0.9
    for (const p of list) {
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d, r0 = R * 1.12, r1 = d - (p.goal ? 42 : 15)
      if (r1 - r0 < 18) continue
      const ex = cx + ux * r1, ey = cy + uy * r1, sx = cx + ux * r0, sy = cy + uy * r0
      g.strokeStyle = g.fillStyle = p.col || `rgba(${INK},.3)`; g.globalAlpha = p.col ? p.a : 1
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey)
      g.moveTo(sx - uy * 5, sy + ux * 5); g.lineTo(sx + uy * 5, sy - ux * 5); g.stroke()   // a tick where it leaves the drawing
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - ux * 8 - uy * 2.4, ey - uy * 8 + ux * 2.4); g.lineTo(ex - ux * 8 + uy * 2.4, ey - uy * 8 - ux * 2.4); g.fill()
    }
    g.globalAlpha = 1
  }

  // the agent: a centre mark, ringed in the colour of what it is doing
  function coreCenter(g, cc) {
    const { cx, cy, t, kind, flare } = cc
    g.translate(cx, cy)
    g.fillStyle = '#0a2f52'; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill()
    g.strokeStyle = kind === 'error' ? C.red : '#cfe8ff'; g.lineWidth = 1.5; g.stroke()
    g.beginPath(); g.moveTo(-26, 0); g.lineTo(-17, 0); g.moveTo(17, 0); g.lineTo(26, 0); g.moveTo(0, -26); g.lineTo(0, -17); g.moveTo(0, 17); g.lineTo(0, 26); g.moveTo(-5, 0); g.lineTo(5, 0); g.moveTo(0, -5); g.lineTo(0, 5); g.stroke()
    g.fillStyle = C.yellow; g.globalAlpha = 0.85 + 0.15 * flare; g.beginPath(); g.arc(0, 0, 2.2, 0, TAU); g.fill(); g.globalAlpha = 1
    if (kind) { g.rotate(t * 0.25); g.strokeStyle = cc.fire; g.lineWidth = 1.6; g.setLineDash([7, 5]); g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.stroke(); g.setLineDash([]) }
  }

  registerTheme({
    id: 'blueprint',
    name: 'Blueprint',
    light: false,
    fontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap',
    fonts: { mono: '"IBM Plex Mono", ui-monospace, monospace', head: '"Space Mono", "IBM Plex Mono", monospace' },
    css: {
      '--bg': '#0b355d', '--panel': 'rgba(8,40,72,.9)', '--panel2': '#082a4a', '--line': '#3d6d9e',
      '--cyan': '#62d6ff', '--yellow': '#ffdf6b', '--red': '#ff5a5f', '--green': '#7ee8a0', '--purple': '#e09cff',
      '--amber': '#ffa64d', '--blue': '#8aa6ff', '--dim': '#92b5dc', '--text': '#eaf4ff', '--muted': '#b4cdea',
      '--mono': "'IBM Plex Mono', ui-monospace, Menlo, monospace", '--head': "'Space Mono', 'IBM Plex Mono', monospace",
      '--radius': '2px', '--clip': 'none',
    },
    colors: {
      bg: '#0b355d', cyan: '#62d6ff', yellow: '#ffdf6b', red: '#ff5a5f', green: '#7ee8a0', purple: '#e09cff', amber: '#ffa64d', blue: '#8aa6ff',
      dim: '#92b5dc', line: '#3d6d9e', text: '#eaf4ff',
      muted: '#b4cdea', todo: '#7a9cc4', doneInk: '#c3f0d0', ink2: '#ffffff', nodeFill: '#0b3a63', chip: 'rgba(8,38,68,.8)', labelBg: 'rgba(8,38,68,.95)',
      link: 'rgba(207,232,255,.17)', neuron: 'rgba(207,232,255,.72)', shell: 'rgba(207,232,255,.78)', wire: 'rgba(207,232,255,.1)', packet: '#ffffff',
      accentRGB: '98,214,255', goalRGB: '255,223,107', tickRGB: '207,232,255', glow0: '120,190,240', glow1: '40,110,170', glow2: '13,59,102',
    },
    webSilk: false,
    backdrop, sphere, link, neuron, coreOver, coreCenter,
  })
})()
