// Dead channel: a phosphor terminal seen through CRT glass. Grey-blue TV static in the sky, a cyan grid floor running to a pink-lit horizon,
// wireframe shapes turning on the horizon, small cubes gliding over the floor. The glass adds pink phosphor bloom, fine scanlines,
// a slow rolling band, drifting interference bands and a curved vignette. Core: octagonal walls round the sphere and a pink drill toward the work (red-orange only on error).
'use strict'
;(() => {
  const BG = '#06060b', BGRGB = '6,6,11', ICE = '56,214,255', PINK = '255,110,199', SOFT = '255,155,216', ERR = '255,59,31'
  const TILE = 192
  let tiles = null, geo = null, glass = null, glassKey = ''
  // seeded random, so the far shapes stay put between reloads
  const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296

  /** Three static tiles and a scanline strip, made once; afterwards they are only drawn as patterns. */
  function makeTiles(g) {
    const r = rng(7)
    tiles = [0, 1, 2].map(() => {
      const c = document.createElement('canvas'); c.width = c.height = TILE
      const x = c.getContext('2d'), im = x.createImageData(TILE, TILE), d = im.data
      for (let y = 0; y < TILE; y++) {
        const row = 0.7 + 0.6 * r()                       // rows of uneven brightness, like a detuned set
        for (let i = 0; i < TILE; i++) {
          const v = r(), l = Math.min(255, (0.18 + 0.82 * v * v) * row * 255), p = (y * TILE + i) * 4
          d[p] = l * 0.78; d[p + 1] = l * 0.86; d[p + 2] = l; d[p + 3] = 255
        }
      }
      x.putImageData(im, 0, 0)
      return g.createPattern(c, 'repeat')
    })
  }

  /** The CRT glass (scanlines, curved vignette, a faint reflection), drawn once per window size, then blitted. */
  function makeGlass(W, H) {
    glassKey = W + 'x' + H
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    glass = document.createElement('canvas'); glass.width = Math.ceil(W * dpr); glass.height = Math.ceil(H * dpr)
    const o = glass.getContext('2d'); o.scale(dpr, dpr)
    o.fillStyle = 'rgba(0,0,0,.26)'
    for (let y = 0; y < H; y += 3) o.fillRect(0, y, W, 1)
    const M = Math.hypot(W, H) / 2, v = o.createRadialGradient(W / 2, H / 2, M * 0.5, W / 2, H / 2, M)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.7, 'rgba(0,0,0,.28)'); v.addColorStop(1, 'rgba(0,0,0,.7)')
    o.fillStyle = v; o.fillRect(0, 0, W, H)
    const r = o.createRadialGradient(W * 0.28, H * 0.16, 0, W * 0.28, H * 0.16, Math.max(W, H) * 0.42)
    r.addColorStop(0, 'rgba(255,200,235,.03)'); r.addColorStop(1, 'rgba(255,200,235,0)')
    o.fillStyle = r; o.fillRect(0, 0, W, H)
  }

  // a soft horizontal band of light centred at y, half-height h
  function band(g, W, y, h, rgb, a) {
    const gr = g.createLinearGradient(0, y - h, 0, y + h)
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.5, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr; g.fillRect(0, y - h, W, h * 2)
  }

  /** Far shapes on the horizon, rebuilt only when the window size changes. */
  function makeGeo(W, H) {
    const r = rng(1984), shapes = []
    const hy = H * 0.72
    const spots = [0.06, 0.15, 0.27, 0.73, 0.84, 0.94, 0.4, 0.6]
    spots.forEach((fx, i) => {
      const type = ['box', 'tower', 'pyr', 'box', 'pyr', 'tower', 'box', 'tower'][i]
      shapes.push({ type, x: W * fx, w: W * (0.015 + r() * 0.03), h: H * (0.025 + r() * (type === 'tower' ? 0.09 : 0.05)), ph: r() * 6.28,
        col: [ICE, PINK, '57,255,136'][i % 3], o: 0.07 + r() * 0.05 })
    })
    // data constructs: small wireframe cubes gliding sideways over the floor at fixed depths, each on its own slow loop
    const cubes = [0, 1, 2, 3, 4, 5].map(i => ({ z: 1.6 + i * 0.9 + r() * 0.5, per: 80 + r() * 60, ph: r(), dir: i % 2 ? 1 : -1, size: 0.3 + r() * 0.2,
      spin: (r() < 0.5 ? -1 : 1) / (7 + r() * 5), col: [ICE, '57,255,136', PINK][i % 3] }))
    // a faint node map in the upper sky: the stars of Leo (RA h, Dec °), east to the left; index 0 is Regulus
    const LEO = [[10.14, 11.97], [10.12, 16.76], [10.33, 19.84], [10.28, 23.42], [9.88, 26.01], [9.76, 23.77], [11.24, 20.52], [11.24, 15.43], [11.82, 14.57]]
    const sc = Math.min(W, H) * 0.0042, lx = W * 0.075, ly = H * 0.3
    const leo = { pts: LEO.map(([ra, de]) => [lx - (ra - 10.8) * 15 * 0.95 * sc, ly - (de - 19) * sc]),
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 8], [8, 7], [7, 0], [6, 7]] }
    geo = { W, H, hy, shapes, cubes, leo }
  }

  function backdrop(g, b) {
    const { W, H, t, low } = b
    if (!tiles) makeTiles(g)
    if (!geo || geo.W !== W || geo.H !== H) makeGeo(W, H)
    if (glassKey !== W + 'x' + H) makeGlass(W, H)
    const hy = geo.hy, skyH = H * 0.64
    g.fillStyle = BG; g.fillRect(0, 0, W, H)

    // the sky: static crossfading between three tiles on a 2-minute loop, each sliding a little
    const ph = t / 40, i0 = Math.floor(ph) % 3, f = ph - Math.floor(ph), k = f * f * (3 - 2 * f)
    const base = (b.saver ? 0.17 : 0.13) + 0.02 * Math.sin(t / 53)
    for (const [idx, a] of low ? [[i0, base]] : [[i0, base * (1 - k)], [(i0 + 1) % 3, base * k]]) {
      if (a < 0.004) continue
      g.save(); g.beginPath(); g.rect(0, 0, W, skyH); g.clip(); g.globalAlpha = a; g.imageSmoothingEnabled = false   // crisp grains on retina
      // a steady drift, each tile at its own pace, wrapped by the tile size so the pattern never jumps
      g.translate((t * (4 + idx * 1.5) + idx * 61) % TILE - TILE, (t * (1.6 + idx * 0.7) + idx * 37) % TILE - TILE)
      g.fillStyle = tiles[idx]; g.fillRect(0, 0, W + TILE * 2, skyH + TILE * 2)
      g.restore()
    }
    // static fades out toward the horizon
    let gr = g.createLinearGradient(0, 0, 0, skyH)
    gr.addColorStop(0, `rgba(${BGRGB},0)`); gr.addColorStop(0.45, `rgba(${BGRGB},.35)`); gr.addColorStop(1, `rgba(${BGRGB},1)`)
    g.fillStyle = gr; g.fillRect(0, 0, W, skyH + 1)
    // a grey-blue cast in the upper sky, breathing slowly
    gr = g.createLinearGradient(0, 0, 0, skyH)
    gr.addColorStop(0, `rgba(120,146,172,${0.06 + 0.02 * Math.sin(t / 37)})`); gr.addColorStop(1, 'rgba(120,146,172,0)')
    g.fillStyle = gr; g.fillRect(0, 0, W, skyH)

    // the Leo node map: dim ICE links and nodes drifting a few px, with a tiny coordinate tag by its brightest node
    const L = geo.leo, ldx = Math.sin(t / 97) * 5, ldy = Math.cos(t / 113) * 3, la = 0.07 + 0.02 * Math.sin(t / 61)
    g.strokeStyle = `rgba(${ICE},${la})`; g.lineWidth = 1; g.beginPath()
    for (const [p, q] of L.edges) { g.moveTo(L.pts[p][0] + ldx, L.pts[p][1] + ldy); g.lineTo(L.pts[q][0] + ldx, L.pts[q][1] + ldy) }
    g.stroke()
    g.fillStyle = `rgba(${ICE},${la * 2})`
    for (const [x, y] of L.pts) g.fillRect(x + ldx - 1, y + ldy - 1, 2, 2)
    if (!low) { g.font = '9px "IBM Plex Mono", monospace'; g.fillStyle = `rgba(${ICE},${la * 1.4})`; g.fillText('α LEO 10h08 +11°58', L.pts[0][0] + ldx + 6, L.pts[0][1] + ldy + 12) }

    // phosphor bloom round the core, breathing and wandering slowly
    const lift = b.saver ? 1.4 : 1, M = Math.max(W, H), bx = b.cx + Math.sin(t / 71) * W * 0.04, by = b.cy + Math.cos(t / 89) * H * 0.04
    gr = g.createRadialGradient(bx, by, 0, bx, by, M * (0.5 + 0.03 * Math.sin(t / 47)))
    gr.addColorStop(0, `rgba(${PINK},${(0.1 + 0.02 * Math.sin(t / 37)) * lift})`); gr.addColorStop(0.45, `rgba(${PINK},${0.025 * lift})`); gr.addColorStop(1, `rgba(${PINK},0)`)
    g.fillStyle = gr; g.fillRect(0, 0, W, H)

    // the horizon: pink phosphor glow above a thin cyan line of haze
    gr = g.createLinearGradient(0, hy - 90, 0, hy + 30)
    const ha = 0.05 + 0.015 * Math.sin(t / 47)
    gr.addColorStop(0, `rgba(${PINK},0)`); gr.addColorStop(0.6, `rgba(${PINK},${ha * 1.8})`); gr.addColorStop(0.78, `rgba(${ICE},${ha})`); gr.addColorStop(1, `rgba(${ICE},0)`)
    g.fillStyle = gr; g.fillRect(0, hy - 90, W, 120)

    // far shapes on the horizon: wireframe walls turning slowly on their own axes, rising and settling
    if (!low) {
      g.lineWidth = 1
      for (const s of geo.shapes) {
        const h = s.h * (1 + 0.12 * Math.sin(t / 51 + s.ph)), x = s.x, w = s.w, rot = s.ph + t / 26 * (s.ph > 3.14 ? 1 : -1)
        g.strokeStyle = `rgba(${s.col},${s.o})`; g.beginPath()
        // four corners of the footprint, seen from slightly above
        const cs = [0, 1, 2, 3].map(k => { const a = rot + k * Math.PI / 2; return [x + Math.cos(a) * w * 0.6, Math.sin(a) * w * 0.16] })
        if (s.type === 'pyr') for (const [px, py] of cs) { g.moveTo(px, hy + py); g.lineTo(x, hy - h) }
        else {
          const levels = s.type === 'tower' ? Math.max(1, Math.floor(h / 14)) : 1
          for (const [px, py] of cs) { g.moveTo(px, hy + py); g.lineTo(px, hy - h + py) }
          for (let l = 0; l <= levels; l++) { const y = hy - h * l / levels; cs.forEach(([px, py], k) => g[k ? 'lineTo' : 'moveTo'](px, y + py)); g.closePath() }
        }
        g.stroke()
      }
      // one slowly turning octahedron, high and far
      const ox = W * 0.2, oy = hy - H * 0.2, rr = Math.min(W, H) * 0.028, a = t / 40
      const pts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([x, y, z]) => {
        const xr = x * Math.cos(a) - z * Math.sin(a), zr = x * Math.sin(a) + z * Math.cos(a)
        return [ox + xr * rr, oy + (y * Math.cos(0.4) - zr * Math.sin(0.4)) * rr * 1.3]
      })
      g.strokeStyle = `rgba(${ICE},.1)`; g.beginPath()
      for (const [p, q] of [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]]) { g.moveTo(...pts[p]); g.lineTo(...pts[q]) }
      g.stroke()
    }

    // the grid floor: lines run to a vanishing point and roll toward the viewer, one row every 12 s
    const vx = b.cx + Math.sin(t / 110) * W * 0.03, fh = H - hy
    gr = g.createLinearGradient(0, hy, 0, H)
    gr.addColorStop(0, `rgba(${ICE},0)`); gr.addColorStop(0.25, `rgba(${ICE},.06)`); gr.addColorStop(1, `rgba(${ICE},.16)`)
    g.strokeStyle = gr; g.lineWidth = 1; g.beginPath()
    const cell = W / 12
    for (let i = -24; i <= 24; i++) { g.moveTo(vx, hy); g.lineTo(vx + i * cell * 1.6, H + fh * 0.6) }
    const drift = (t / 12) % 1
    for (let n = 0; n < (low ? 10 : 22); n++) {
      const z = 0.75 + n * 0.55 - drift * 0.55
      const y = hy + fh / z
      if (y > H + 1 || y < hy + 1) continue
      g.moveTo(0, y); g.lineTo(W, y)
    }
    g.stroke()

    // data constructs gliding over the floor (x = vx + X·cell/z, y = hy + fh/z, matching the grid)
    const span = W / cell + 4
    for (let ci = 0; ci < (low ? 2 : geo.cubes.length); ci++) {
      const c = geo.cubes[ci], u = (t / c.per + c.ph) % 1, X = c.dir * (u * 2 - 1) * span * c.z / 2
      const fade = Math.min(1, u * 8, (1 - u) * 8), x = vx + X * cell / c.z, yb = hy + fh / c.z, s = cell * c.size / c.z
      if (fade <= 0 || x < -s * 2 || x > W + s * 2) continue
      const a = t * c.spin + c.ph * 6.28, lift = s * (0.9 + 0.15 * Math.sin(t / 9 + c.ph * 6.28)), al = 0.26 * fade
      const cs = [0, 1, 2, 3].map(k => { const q = a + k * Math.PI / 2; return [x + Math.cos(q) * s * 0.7, Math.sin(q) * s * 0.25] })
      g.strokeStyle = `rgba(${c.col},${al})`; g.beginPath()
      for (const top of [0, 1]) { const y0 = yb - lift - (top ? s : 0); cs.forEach(([px, py], k) => g[k ? 'lineTo' : 'moveTo'](px, y0 + py)); g.closePath() }
      for (const [px, py] of cs) { g.moveTo(px, yb - lift + py); g.lineTo(px, yb - lift - s + py) }
      g.stroke()
      // its shadow on the floor
      g.fillStyle = `rgba(${c.col},${al * 0.35})`; g.beginPath(); g.ellipse(x, yb, s * 0.7, s * 0.2, 0, 0, Math.PI * 2); g.fill()
    }

    // interference bands: wide, faint, drifting slowly up and down; and one bright band rolling down every 60 s
    for (let i = 0; i < (low ? 1 : 3); i++) {
      const y = H * (0.5 + 0.42 * Math.sin(t / (53 + i * 29) + i * 2.1)), h = H * (0.08 + 0.04 * Math.sin(t / 41 + i))
      band(g, W, y, h, i % 2 ? SOFT : PINK, 0.022 * lift)
    }
    const roll = ((t / 60) % 1) * (H + 240) - 120
    band(g, W, roll, 110, SOFT, 0.035 * lift)
    if (!low) band(g, W, roll, 12, SOFT, 0.035 * lift)
    // the glass on top: scanlines, curved vignette, reflection
    g.drawImage(glass, 0, 0, W, H)
  }

  const octagon = (g, x, y, r, rot) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = rot + i * Math.PI / 4; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r) } g.closePath() }

  /** Three translucent octagonal walls round the sphere, turning very slowly. */
  function coreUnder(g, cc) {
    const { cx, cy, R, t } = cc, busy = Math.min(1, cc.recent / 12)
    octagon(g, cx, cy, R * 1.13, Math.PI / 8 + t / 60)
    g.fillStyle = `rgba(${ICE},.03)`; g.fill()
    g.strokeStyle = `rgba(${ICE},${0.3 + 0.08 * busy})`; g.lineWidth = 1.2; g.stroke()
    octagon(g, cx, cy, R * 1.27, -t / 80)
    g.setLineDash([40, 8, 4, 8]); g.strokeStyle = `rgba(${ICE},${0.2 + 0.06 * busy})`; g.lineWidth = 1; g.stroke()
    octagon(g, cx, cy, R * 1.43, Math.PI / 8 + t / 100)
    g.setLineDash([2, 6]); g.strokeStyle = `rgba(${ICE},.16)`; g.stroke(); g.setLineDash([])
    // corner marks on the inner wall
    g.fillStyle = `rgba(${ICE},.45)`
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + t / 60 + i * Math.PI / 4; g.fillRect(cx + Math.cos(a) * R * 1.13 - 2, cy + Math.sin(a) * R * 1.13 - 2, 4, 4) }
  }

  /** A dark glass sphere with a pink phosphor core, green latitude rings and a slowly turning frame. */
  function sphere(g, cc) {
    const { cx, cy, R, t, flare } = cc
    const br = 0.9 + 0.1 * Math.sin(t / 6) + flare * 0.6
    const gl = g.createRadialGradient(cx, cy - R * 0.1, 0, cx, cy, R * 1.08)
    gl.addColorStop(0, `rgba(${C.glow0},${0.2 * br})`); gl.addColorStop(0.45, `rgba(${C.glow1},${0.45 * br})`); gl.addColorStop(0.85, `rgba(${C.glow2},${0.55 * br})`); gl.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, R * 1.08, 0, Math.PI * 2); g.fill()
    g.strokeStyle = cc.jitter ? C.red : C.shell; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke()
    g.strokeStyle = C.wire; g.beginPath()
    for (const v of [-0.7, -0.38, 0, 0.38, 0.7]) { const rx = R * Math.cos(Math.asin(v)); g.moveTo(cx + rx, cy + v * R); g.ellipse(cx, cy + v * R, rx, rx * 0.22, 0, 0, Math.PI * 2) }
    g.stroke()
    g.beginPath()
    for (let i = 0; i < 3; i++) { g.moveTo(cx, cy - R); g.ellipse(cx, cy, Math.max(0.5, R * Math.abs(Math.cos(t / 20 + i * Math.PI / 3))), R, 0, -Math.PI / 2, Math.PI * 1.5) }
    g.stroke()
  }

  const link = (g, x1, y1, x2, y2, color, b) => {
    if (color) { g.strokeStyle = color; g.globalAlpha = 0.35 + 0.65 * b; g.lineWidth = (color === C.red ? 2 : 0.8) + b * 1.6;  /* errors draw heavier */ if (b > 0.6) { g.shadowColor = color; g.shadowBlur = 8 } }
    else { g.strokeStyle = C.link; g.lineWidth = 0.7 }
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
  }

  const neuron = (g, x, y, r, color, b) => {
    const s = Math.max(1.6, r * (color === C.red ? 2.2 : 1.7))
    if (color) { g.fillStyle = color; if (b > 0.4) { g.shadowColor = color; g.shadowBlur = 10 } } else g.fillStyle = C.neuron
    g.fillRect(x - s / 2, y - s / 2, s, s)
  }

  // the drill eases toward where the work is, so it swings instead of jumping; easing is by time, so 12 fps and 60 fps match
  let dA = 0, dEx = null, dEy = 0, dAng = 0, dT = 0
  /** A drill (pink phosphor, red-orange only on error) boring from beyond the walls toward the newest firing neurons. */
  function coreOver(g, cc) {
    const { cx, cy, R } = cc
    const step = cc.cur >= 0 && cc.cur < cc.steps.length ? cc.steps[cc.cur] : null
    const aim = cc.tip || step
    const on = !!(aim && !cc.complete && (cc.kind || cc.recent > 0))
    const dt = Math.min(1000, Math.max(0, cc.now - (dT || cc.now))); dT = cc.now
    const kA = 1 - Math.exp(-dt / 600), kP = 1 - Math.exp(-dt / 450)
    dA += ((on ? 1 : 0) - dA) * kA
    if (aim) {
      const ang = Math.atan2((step || aim).y - cy, (step || aim).x - cx)
      if (dEx === null) { dEx = aim.x; dEy = aim.y; dAng = ang }
      let da = ang - dAng; da = Math.atan2(Math.sin(da), Math.cos(da))
      dAng += da * kP; dEx += (aim.x - dEx) * kP; dEy += (aim.y - dEy) * kP
    }
    if (dA < 0.02 || dEx === null) return
    const sx = cx + Math.cos(dAng) * R * 1.62, sy = cy + Math.sin(dAng) * R * 1.62
    const ex = dEx, ey = dEy, len = Math.hypot(ex - sx, ey - sy) || 1, nx = -(ey - sy) / len, ny = (ex - sx) / len
    // about one turn per 34 px, sampled 10 times a turn so the coil never aliases into dashes
    // red stays reserved for errors, so normal work drills in pink
    const dc = cc.kind === 'error' ? ERR : PINK
    const spin = cc.kind === 'error' ? 0 : cc.t * 2.4, amp = R * 0.055, turns = Math.max(3, len / 34), N = Math.min(cc.low ? 90 : 160, Math.ceil(turns * 10))
    g.lineCap = 'round'; g.lineJoin = 'round'
    g.strokeStyle = `rgba(${dc},${0.22 * dA})`; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke()
    const er = cc.kind === 'error' ? 1.6 : 1
    for (const [off, al, w] of [[0, 0.85, 1.6 * er], [Math.PI, 0.35, er]]) {
      g.beginPath()
      for (let i = 0; i <= N; i++) {
        const k = i / N, o = amp * (0.25 + 0.75 * Math.pow(1 - k, 0.8)) * Math.sin(k * turns * Math.PI * 2 - spin + off)
        g[i ? 'lineTo' : 'moveTo'](sx + (ex - sx) * k + nx * o, sy + (ey - sy) * k + ny * o)
      }
      g.strokeStyle = `rgba(${dc},${al * dA})`; g.lineWidth = w
      if (!off) { g.shadowColor = `rgb(${dc})`; g.shadowBlur = 9 }
      g.stroke(); g.shadowBlur = 0
    }
    // the bit: a small square at the far end, and a short collar where the drill leaves the walls
    g.fillStyle = `rgba(${dc},${0.9 * dA})`; g.fillRect(ex - 2.5, ey - 2.5, 5, 5)
    g.strokeStyle = `rgba(${dc},${0.6 * dA})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(sx - nx * amp * 1.6, sy - ny * amp * 1.6); g.lineTo(sx + nx * amp * 1.6, sy + ny * amp * 1.6); g.stroke()
  }

  /** The agent at the centre: an octagon in goal gold. */
  function coreCenter(g, cc) {
    octagon(g, cc.cx, cc.cy, 22, Math.PI / 8 - cc.t / 90)
    g.fillStyle = C.chip; g.fill()
    g.strokeStyle = C.yellow; g.lineWidth = 1.6; g.shadowColor = C.yellow; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0
    g.fillStyle = C.yellow; g.fillRect(cc.cx - 3, cc.cy - 3, 6, 6)
  }

  registerTheme({
    id: 'deadchannel',
    name: 'Dead channel',
    fontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    fonts: { mono: '"IBM Plex Mono", ui-monospace, monospace', head: 'VT323, "IBM Plex Mono", monospace' },
    css: {
      '--bg': BG, '--panel': 'rgba(8,6,12,.9)', '--panel2': '#07050a', '--line': '#5a2348',
      '--cyan': '#38d6ff', '--yellow': '#ffd23f', '--red': '#ff3b1f', '--green': '#39ff88', '--purple': '#b48cff', '--amber': '#ff9a2e', '--blue': '#6f95ff',
      '--dim': '#6fae86', '--text': '#b9ffcc', '--muted': '#8cc9a2',
      '--mono': '"IBM Plex Mono", ui-monospace, Menlo, monospace', '--head': 'VT323, "IBM Plex Mono", monospace',
      '--radius': '0px', '--clip': 'none',
    },
    colors: {
      bg: BG, cyan: '#38d6ff', yellow: '#ffd23f', red: '#ff3b1f', green: '#39ff88', purple: '#b48cff', amber: '#ff9a2e', blue: '#6f95ff',
      dim: '#6fae86', line: '#4a1f3c', text: '#b9ffcc',
      muted: '#7fbf96', todo: '#4f8a6a', doneInk: '#8fe8b0', ink2: '#e6fff0', nodeFill: '#07050a', chip: 'rgba(6,4,10,.82)', labelBg: 'rgba(6,4,10,.92)',
      link: 'rgba(56,214,255,.17)', neuron: 'rgba(185,255,204,.72)', shell: 'rgba(255,110,199,.5)', wire: 'rgba(57,255,136,.13)', packet: '#fff0fa',
      accentRGB: ICE, goalRGB: '255,210,63', tickRGB: '140,235,180', glow0: SOFT, glow1: '60,16,50', glow2: '6,16,14',
    },
    backdrop, coreUnder, sphere, link, neuron, coreOver, coreCenter,
  })
})()
