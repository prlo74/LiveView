/* Deep ocean: real-looking water rendered in WebGL (caustics on the surface and the sea floor, light shafts, depth fog),
   schools of fish swimming past at several depths, marine snow and kelp; the agent is a bioluminescent jellyfish. */
;(() => {
  const TAU = Math.PI * 2
  let seed = 4021
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const layer = (w, h) => { const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')] }

  // ---- caustic tile: tileable warped cell edges, painted once ----
  let caustic = null
  function causticPattern(g) {
    if (caustic) return caustic
    const S = 256, N = 16, [c, x] = layer(S, S), im = x.createImageData(S, S), d = im.data
    seed = 77
    const pts = Array.from({ length: N }, () => [rnd() * S, rnd() * S])
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      // integer-frequency warp keeps the tile seamless and bends the straight cell edges into caustic curves
      const sx = px + 7 * Math.sin(TAU * py / S * 2) + 4 * Math.sin(TAU * (px + py) / S * 3), sy = py + 7 * Math.sin(TAU * px / S * 3)
      let f1 = 1e9, f2 = 1e9
      for (const [qx, qy] of pts) {
        let dx = Math.abs(((sx - qx) % S + S) % S); dx = Math.min(dx, S - dx)
        let dy = Math.abs(((sy - qy) % S + S) % S); dy = Math.min(dy, S - dy)
        const dd = Math.sqrt(dx * dx + dy * dy)
        if (dd < f1) { f2 = f1; f1 = dd } else if (dd < f2) f2 = dd
      }
      const v = Math.pow(Math.max(0, 1 - (f2 - f1) / 13), 3), o = (py * S + px) * 4
      d[o] = 150; d[o + 1] = 236; d[o + 2] = 255; d[o + 3] = v * 255
    }
    x.putImageData(im, 0, 0)
    caustic = g.createPattern(c, 'repeat')
    return caustic
  }

  // ---- water in WebGL: an offscreen canvas at reduced size, scaled up each frame ----
  // Caustics are animated Worley cell edges under a sine warp (a cheap stand-in for Evan Wallace's refracted-area caustics);
  // shafts are 1D noise in the angle from a point above the surface; depth fog darkens toward the floor.
  const FS = `precision highp float;
uniform vec2 R; uniform float T, L;
vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float cell(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 b = vec2(float(x), float(y)), o = 0.5 + 0.42 * sin(t + 6.2831 * h2(i + b));
    float d = length(b + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
float caus(vec2 p, float t) {
  p += 0.32 * vec2(sin(p.y * 1.9 + t * 0.4), sin(p.x * 1.6 - t * 0.33));
  float a = cell(p, t), b = cell(p * 1.41 + vec2(4.1, 1.7), t * 1.13 + 2.0);
  return exp(-a * 10.0) * 0.8 + exp(-b * 13.0) * 0.55;
}
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(fract(sin(i * 91.7) * 4375.5), fract(sin((i + 1.0) * 91.7) * 4375.5), f); }
void main() {
  vec2 uv = gl_FragCoord.xy / R; float x = uv.x, y = 1.0 - uv.y, a = R.x / R.y;
  vec3 col = mix(vec3(0.035, 0.180, 0.265), vec3(0.014, 0.078, 0.145), smoothstep(0.0, 0.5, y));
  col = mix(col, vec3(0.007, 0.034, 0.068), smoothstep(0.45, 1.0, y));
  // the surface seen from below: rippling light, squeezed by perspective toward the top edge
  float sy = y + 0.09;
  float s = caus(vec2((x - 0.5) * a * 0.9 / sy + T * 0.02, 0.55 / sy), T * 0.32);
  col += vec3(0.30, 0.62, 0.72) * s * 0.30 * smoothstep(0.26, 0.0, y) * L;
  col += vec3(0.05, 0.14, 0.17) * smoothstep(0.18, 0.0, y) * L;
  // light shafts fanning down from above, swaying slowly
  float ang = (x - 0.5 - 0.07 * sin(T / 41.0)) * a / (y + 0.75);
  float sh = n1(ang * 7.0 + T * 0.018) * n1(ang * 17.0 - T * 0.027 + 5.0) * n1(ang * 3.0 + T * 0.01 + 11.0);
  col += vec3(0.16, 0.36, 0.42) * smoothstep(0.05, 0.5, sh) * exp(-y * 2.4) * 0.42 * L;
  // a far ridge in the haze, then the sea floor with caustics playing on it
  float fx = x * a;
  float rh = 0.80 + 0.030 * sin(fx * 2.1 + 1.3) + 0.016 * sin(fx * 5.3 + 0.4) + 0.006 * sin(fx * 13.0);
  col = mix(col, vec3(0.016, 0.070, 0.110), smoothstep(rh, rh + 0.004, y) * 0.75);
  float fh = 0.875 + 0.022 * sin(fx * 1.7 + 4.0) + 0.012 * sin(fx * 4.4 + 2.0) + 0.004 * sin(fx * 15.0 + 1.0);
  if (y > fh) {
    float z = 1.0 / (y - 0.6);
    float c = caus(vec2((x - 0.5) * a * z * 1.4, z * 1.9), T * 0.32);
    vec3 fc = vec3(0.022, 0.062, 0.080) + vec3(0.22, 0.50, 0.54) * c * 0.20 * L;
    fc = mix(fc, vec3(0.014, 0.060, 0.095), exp(-(y - fh) * 28.0) * 0.6);
    col = mix(col, fc, smoothstep(fh, fh + 0.004, y));
  }
  // a soft vignette, and static dither against banding
  vec2 v = uv - 0.5; col *= 1.0 - 0.35 * dot(v, v);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`
  let gl = null, glc = null, glFail = false, uR, uT, uL
  function initGL() {
    if (gl || glFail) return gl
    glc = document.createElement('canvas')   // never attached to the page
    gl = glc.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false })
    if (!gl) { glFail = true; return null }
    const sh = (type, txt) => { const s = gl.createShader(type); gl.shaderSource(s, txt); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('ocean shader:', gl.getShaderInfoLog(s)); return s }
    const pr = gl.createProgram()
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'))
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(pr)
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('ocean shader link failed, using the 2D water'); gl = null; glFail = true; return null }
    gl.useProgram(pr)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)   // one triangle covering the screen
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    uR = gl.getUniformLocation(pr, 'R'); uT = gl.getUniformLocation(pr, 'T'); uL = gl.getUniformLocation(pr, 'L')
    return gl
  }
  function waterGL(g, b, lift) {
    if (!initGL() || gl.isContextLost()) return false
    const div = b.low ? 5 : 3, w = Math.max(2, Math.ceil(b.W / div)), h = Math.max(2, Math.ceil(b.H / div))
    if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; gl.viewport(0, 0, w, h) }
    gl.uniform2f(uR, w, h); gl.uniform1f(uT, b.t % 7200); gl.uniform1f(uL, lift)   // wrap every 2 h to keep float precision
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
    g.drawImage(glc, 0, 0, b.W, b.H)
    return true
  }

  // ---- scenery, built once per window size ----
  let key = '', ridges = [], kelp = [], snow = [], motes = [], schools = [], lastT = -1
  function build(W, H, low) {
    const k = W + 'x' + H + (low ? 'l' : '')
    if (k === key) return
    key = k; seed = 9133
    const ridge = (base, amp, n) => {
      const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU]
      return { base, amp, pts: Float32Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return 0.5 * Math.sin(u * TAU * 1.3 + ph[0]) + 0.3 * Math.sin(u * TAU * 3.1 + ph[1]) + 0.15 * Math.sin(u * TAU * 7.3 + ph[2]) + 0.06 * Math.sin(u * TAU * 17 + ph[3]) }) }
    }
    ridges = [ridge(0.83, 0.07, 64), ridge(0.92, 0.05, 64)]
    kelp = Array.from({ length: low ? 4 : 9 }, (_, i) => {
      const left = i % 2 === 0, x = left ? 0.02 + rnd() * 0.18 : 0.8 + rnd() * 0.18
      return { x, h: 0.22 + rnd() * 0.26, w: 3 + rnd() * 3, per: 40 + rnd() * 45, ph: rnd() * TAU, amp: 0.05 + rnd() * 0.05, a: 0.3 + rnd() * 0.25 }
    })
    snow = Array.from({ length: low ? 60 : 170 }, () => ({ x: rnd(), y: rnd(), vy: 3 + rnd() * 6, amp: 6 + rnd() * 18, per: 25 + rnd() * 50, ph: rnd() * TAU, r: 0.5 + rnd() * 1.2, k: rnd() * 3 | 0 }))
    const MC = ['62,230,201', '155,123,255', '79,195,255']
    motes = Array.from({ length: low ? 3 : 6 }, (_, i) => ({ x: 0.1 + rnd() * 0.8, y: 0.15 + rnd() * 0.6, r: 90 + rnd() * 140, px: 70 + rnd() * 50, py: 85 + rnd() * 35, ph: rnd() * TAU, c: MC[i % 3], a: 0.025 + rnd() * 0.02 }))
    // schools of fish, far to near: z sets size, speed and how much the haze swallows them
    const S = [[0.3, 34, 1], [0.45, 26, -1], [0.62, 20, 1], [0.8, 14, -1], [1, 6, 1]]
    schools = S.map(([z, n, dir], j) => {
      n = low ? Math.ceil(n / 2) : n
      const r = 18 + n * 2.6 * (0.5 + z)
      const fish = Array.from({ length: n }, () => { const a = rnd() * TAU, d = Math.sqrt(rnd()) * r; return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.6, vx: 0, vy: 0, ph: rnd() * TAU, fq: 0.15 + rnd() * 0.2, s: 0.8 + rnd() * 0.4, wf: 1 + rnd() * 0.5 } })
      const shade = [Math.round(28 - 26 * z), Math.round(74 - 62 * z), Math.round(96 - 76 * z)].join(',')
      return { z, dir, r, fish, v: 9 + 26 * z, len: 4 + 14 * z, off: rnd(), ph: rnd() * TAU, col: `rgba(${shade},${0.5 + 0.35 * z})` }
    })
    lastT = -1
  }

  // boids in each school's own frame: drift toward a wandering point, keep apart, match neighbours
  function stepSchools(t) {
    const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t
    if (!dt) return
    for (const S of schools) {
      const tx = Math.sin(t / 19 + S.ph) * S.r * 0.4, ty = Math.cos(t / 23 + S.ph) * S.r * 0.3, sep = S.len * 2.2, vmax = 4 + 8 * S.z
      let mvx = 0, mvy = 0
      for (const f of S.fish) { mvx += f.vx; mvy += f.vy }
      mvx /= S.fish.length; mvy /= S.fish.length
      for (const f of S.fish) {
        let ax = (tx - f.x) * 0.06 + (mvx - f.vx) * 0.4 + Math.sin(t * f.fq + f.ph) * 1.2, ay = (ty - f.y) * 0.08 + (mvy - f.vy) * 0.4 + Math.cos(t * f.fq * 1.3 + f.ph) * 0.8
        for (const o of S.fish) {
          const dx = f.x - o.x, dy = f.y - o.y, d2 = dx * dx + dy * dy
          if (o !== f && d2 < sep * sep) { const d = Math.sqrt(d2) + 0.1; ax += dx / d * (sep - d) * 0.9; ay += dy / d * (sep - d) * 0.9 }
        }
        f.vx += ax * dt; f.vy += ay * dt
        const sp = Math.hypot(f.vx, f.vy); if (sp > vmax) { f.vx *= vmax / sp; f.vy *= vmax / sp }
        f.x += f.vx * dt; f.y += f.vy * dt
      }
    }
  }

  // one fish silhouette: body, then a forked tail that sways
  function fishPath(g, x, y, c, s, L, w) {
    const P = (u, v) => [x + (u * c - v * s) * L, y + (u * s + v * c) * L]
    let p = P(1, 0); g.moveTo(p[0], p[1])
    let q = P(0.3, -0.5); p = P(-0.6, -0.07 + w * 0.3); g.quadraticCurveTo(q[0], q[1], p[0], p[1])
    p = P(-1.05, -0.4 + w); g.lineTo(p[0], p[1])
    q = P(-0.85, w * 0.7); p = P(-1.05, 0.4 + w); g.quadraticCurveTo(q[0], q[1], p[0], p[1])
    p = P(-0.6, 0.07 + w * 0.3); g.lineTo(p[0], p[1])
    q = P(0.3, 0.46); p = P(1, 0); g.quadraticCurveTo(q[0], q[1], p[0], p[1])
    g.closePath()
  }
  function drawSchool(g, S, W, H, t) {
    const M = S.r + 80, span = W + 2 * M, d = t * S.v + S.off * span, cyc = Math.floor(d / span)
    const u = d - cyc * span, cx = S.dir > 0 ? u - M : W + M - u
    // each crossing takes a new depth band, picked from the crossing number
    const hy = ((Math.sin(cyc * 12.9898 + S.ph * 7.1) * 43758.5453) % 1 + 1) % 1, cy = H * (0.14 + 0.62 * hy) + Math.sin(t / 29 + S.ph) * H * 0.04
    if (cx < -M || cx > W + M) return
    g.fillStyle = S.col; g.beginPath()
    for (const f of S.fish) {
      const vx = S.dir * S.v + f.vx, vy = f.vy + Math.cos(t / 29 + S.ph) * H * 0.04 / 29, sp = Math.hypot(vx, vy)
      fishPath(g, cx + f.x, cy + f.y, vx / sp, vy / sp, S.len * f.s, 0.13 * Math.sin(TAU * t * 0.9 * f.wf + f.ph))
    }
    g.fill()
  }

  // the 2D water, used when WebGL is unavailable
  function water2D(g, b, lift) {
    const { W, H, t, low } = b
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#04213a'); sky.addColorStop(0.55, '#031629'); sky.addColorStop(1, '#020b16')
    g.fillStyle = sky; g.fillRect(0, 0, W, H)
    const pat = causticPattern(g), M = new DOMMatrix()
    const layers = low ? [[1.9, 0.35, 3.2, 1.6, 47, 0]] : [[1.9, 0.35, 3.2, 1.6, 47, 0], [2.6, -0.6, -2.4, 1.2, 61, 2]]
    g.globalCompositeOperation = 'lighter'
    for (const [s, rot, vx, vy, per, ph] of layers) {
      pat.setTransform(M.translate(t * vx + Math.sin(t / 37 + ph) * 14, t * vy + Math.cos(t / 43 + ph) * 10).rotate(rot * 57.3 + Math.sin(t / 90 + ph) * 4).scale(s))
      g.globalAlpha = (0.045 + 0.025 * Math.sin(TAU * t / per + ph)) * lift
      g.fillStyle = pat; g.fillRect(0, 0, W, H)
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
    const deep = g.createLinearGradient(0, H * 0.25, 0, H)
    deep.addColorStop(0, 'rgba(2,11,22,0)'); deep.addColorStop(1, 'rgba(2,11,22,.85)')
    g.fillStyle = deep; g.fillRect(0, H * 0.25, W, H * 0.75)
    ridges.forEach((rg, j) => {
      const n = rg.pts.length - 1, sh = Math.sin(t / (110 + j * 23) + j) * 14, sc = 1 + 0.08 * Math.sin(t / (73 + j * 19) + j * 2)
      g.beginPath(); g.moveTo(-20, H)
      for (let i = 0; i <= n; i++) g.lineTo(-20 + (W + 40) * i / n + sh, H * (rg.base - rg.amp * sc * rg.pts[i]))
      g.lineTo(W + 20, H); g.closePath()
      g.fillStyle = j ? 'rgba(1,6,12,.92)' : 'rgba(5,26,44,.55)'; g.fill()
    })
  }

  // a small sailing yacht seen from below, its hull and fin keel a faint silhouette against the bright surface; unit length, bow to +x
  let hull = null
  function drawHull(g, W, H, t) {
    if (!hull) {
      hull = new Path2D()
      hull.moveTo(-0.47, 0); hull.lineTo(0.5, 0); hull.quadraticCurveTo(0.36, 0.085, 0.1, 0.09)
      hull.lineTo(0.05, 0.27); hull.quadraticCurveTo(0.07, 0.3, -0.02, 0.3); hull.quadraticCurveTo(-0.09, 0.3, -0.05, 0.27); hull.lineTo(-0.04, 0.088)
      hull.quadraticCurveTo(-0.24, 0.08, -0.36, 0.06); hull.lineTo(-0.38, 0.19); hull.lineTo(-0.42, 0.18); hull.lineTo(-0.42, 0.045)
      hull.quadraticCurveTo(-0.46, 0.03, -0.47, 0); hull.closePath()
    }
    const L = Math.max(60, Math.min(110, W * 0.06)), span = W * 1.7 + 2 * L, x = ((t * 5 + W * 0.66) % span) - L
    if (x > W + L) return   // out of sight for part of each slow crossing
    g.save(); g.translate(x, Math.max(86, H * 0.09) + Math.sin(TAU * t / 11) * 1.2); g.rotate(0.012 * Math.sin(TAU * t / 13)); g.scale(L, L)
    g.fillStyle = 'rgba(1,12,24,.3)'; g.fill(hull); g.restore()
  }

  function backdrop(g, b) {
    const { W, H, t, low } = b, lift = b.saver ? 1.3 : 1
    build(W, H, low)
    if (!waterGL(g, b, lift)) water2D(g, b, lift)
    stepSchools(t)
    drawHull(g, W, H, t)
    // far bioluminescent glows
    g.globalCompositeOperation = 'lighter'
    for (const m of motes) {
      const x = W * m.x + Math.sin(t / m.px + m.ph) * W * 0.06, y = H * m.y + Math.cos(t / m.py + m.ph) * H * 0.05
      const a = m.a * 0.6 * (0.7 + 0.3 * Math.sin(t / 53 + m.ph)) * lift, gr = g.createRadialGradient(x, y, 0, x, y, m.r)
      gr.addColorStop(0, `rgba(${m.c},${a})`); gr.addColorStop(1, `rgba(${m.c},0)`)
      g.fillStyle = gr; g.fillRect(x - m.r, y - m.r, m.r * 2, m.r * 2)
    }
    g.globalCompositeOperation = 'source-over'
    // far schools, then the far marine snow, then nearer schools: parallax by depth
    for (let i = 0; i < 2; i++) drawSchool(g, schools[i], W, H, t)
    const flake = c => {
      g.fillStyle = `rgba(200,235,245,${(0.12 + c * 0.1) * lift})`; g.beginPath()
      for (const s of snow) {
        if (s.k !== c) continue
        const y = ((s.y * (H + 20) + t * s.vy * (0.6 + 0.3 * c)) % (H + 20)) - 10, x = s.x * W + Math.sin(TAU * t / s.per + s.ph) * s.amp
        g.moveTo(x + s.r * (0.7 + 0.3 * c), y); g.arc(x, y, s.r * (0.7 + 0.3 * c), 0, TAU)
      }
      g.fill()
    }
    flake(0); flake(1)
    for (let i = 2; i < schools.length; i++) drawSchool(g, schools[i], W, H, t)
    // kelp at the edges, swaying slowly
    g.fillStyle = 'rgba(4,30,36,1)'
    for (const k of kelp) {
      const x0 = W * k.x, y0 = H * 1.01, h = H * k.h, sw = Math.sin(TAU * t / k.per + k.ph), N = low ? 8 : 14, L = [], Rr = []
      for (let i = 0; i <= N; i++) {
        const u = i / N, x = x0 + sw * h * k.amp * u * u + Math.sin(u * 5 + k.ph + t / 29) * 4 * u, y = y0 - h * u, w = k.w * (1 - u * 0.75)
        L.push(x - w, y); Rr.push(x + w, y)
      }
      g.globalAlpha = (k.a + 0.2) * lift; g.beginPath(); g.moveTo(L[0], L[1])
      for (let i = 2; i < L.length; i += 2) g.lineTo(L[i], L[i + 1])
      for (let i = Rr.length - 2; i >= 0; i -= 2) g.lineTo(Rr[i], Rr[i + 1])
      g.closePath(); g.fill()
    }
    g.globalAlpha = 1
    flake(2)
  }

  // ---- core view: the jellyfish ----
  const TENT = Array.from({ length: 16 }, (_, i) => ({ u: (i + 0.5) / 16 * 2 - 1, len: 0.45 + ((i * 0.618) % 1) * 0.5, per: 13 + ((i * 0.37) % 1) * 9, ph: i * 1.9 }))
  const RIM = 30
  function sphere(g, cc) {
    const { cx, cy, R, t, flare, jitter, kind, low } = cc
    const pulse = Math.sin(TAU * t / 9), Rb = R * 1.05 * (1 + 0.012 * pulse), phi = 0.72
    const mx = Rb * Math.sin(phi) * (1 - 0.015 * pulse), my = cy + Rb * Math.cos(phi)
    // a soft glow round the bell, gold for a moment when the goal is reached
    const gl = g.createRadialGradient(cx, cy - R * 0.15, 0, cx, cy, R * 1.6)
    gl.addColorStop(0, `rgba(62,230,201,${0.1 + 0.02 * pulse})`); gl.addColorStop(0.55, 'rgba(79,195,255,.04)'); gl.addColorStop(1, 'rgba(79,195,255,0)')
    g.fillStyle = gl; g.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2)
    if (flare > 0) { const fg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.3); fg.addColorStop(0, `rgba(255,209,102,${0.25 * flare})`); fg.addColorStop(1, 'rgba(255,209,102,0)'); g.fillStyle = fg; g.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6) }

    // tentacles: thin, fading, swaying slowly
    const tg = g.createLinearGradient(0, my, 0, my + R * 1.05)
    tg.addColorStop(0, 'rgba(120,240,225,.32)'); tg.addColorStop(1, 'rgba(120,240,225,0)')
    g.strokeStyle = tg; g.lineWidth = 1; g.beginPath()
    for (const tn of (low ? TENT.filter((_, i) => i % 2) : TENT)) {
      const x = cx + tn.u * mx * 0.92, y = my - Rb * 0.06 * (1 - tn.u * tn.u), L = R * tn.len, s = Math.sin(TAU * t / tn.per + tn.ph) * R * 0.08
      g.moveTo(x, y); g.bezierCurveTo(x + s * 0.3, y + L * 0.35, x - s * 0.5, y + L * 0.7, x + s, y + L)
    }
    g.stroke()
    // oral arms: three soft violet ribbons from the middle
    g.strokeStyle = 'rgba(155,123,255,.13)'; g.lineWidth = low ? 3 : 5; g.lineCap = 'round'; g.beginPath()
    for (let k = -1; k <= 1; k++) {
      const x = cx + k * R * 0.12, y = my - Rb * 0.08, L = R * (0.75 - Math.abs(k) * 0.15), s = Math.sin(TAU * t / 17 + k) * R * 0.06
      g.moveTo(x, y); g.bezierCurveTo(x + s, y + L * 0.3, x - s + k * R * 0.05, y + L * 0.65, x + s * 0.6 + k * R * 0.08, y + L)
    }
    g.stroke(); g.lineCap = 'butt'

    // the bell: a translucent dome with a scalloped margin
    const bell = () => {
      g.beginPath(); g.arc(cx, cy, Rb, Math.PI / 2 + phi, Math.PI / 2 - phi + TAU)
      const n = 8
      for (let k = 0; k < n; k++) {
        const u0 = 1 - 2 * k / n, u1 = 1 - 2 * (k + 1) / n, um = (u0 + u1) / 2
        const yb = u => my - Rb * 0.06 * (1 - u * u)
        g.quadraticCurveTo(cx + um * mx, yb(um) + Rb * 0.07, cx + u1 * mx, yb(u1))
      }
      g.closePath()
    }
    const fill = g.createRadialGradient(cx, cy - Rb * 0.5, Rb * 0.05, cx, cy - Rb * 0.1, Rb * 1.15)
    fill.addColorStop(0, 'rgba(160,255,240,.13)'); fill.addColorStop(0.5, 'rgba(62,200,220,.06)'); fill.addColorStop(1, 'rgba(60,120,220,.035)')
    bell(); g.fillStyle = fill; g.fill()
    g.strokeStyle = jitter ? C.red : 'rgba(110,240,225,.5)'; g.lineWidth = 1.4; g.shadowColor = jitter ? C.red : '#3ee6c9'; g.shadowBlur = 12; g.stroke(); g.shadowBlur = 0
    // inner dome and radial canals
    g.strokeStyle = 'rgba(62,230,201,.1)'; g.lineWidth = 1; g.beginPath()
    g.arc(cx, cy + Rb * 0.08, Rb * 0.8, Math.PI / 2 + phi + 0.12, Math.PI / 2 - phi - 0.12 + TAU)
    for (let k = -3; k <= 3; k++) { const u = k / 3.4; g.moveTo(cx, cy - Rb * 0.96); g.quadraticCurveTo(cx + u * mx * 1.35, cy - Rb * 0.2, cx + u * mx, my - Rb * 0.06 * (1 - u * u)) }
    g.stroke()
    // lights along the margin: a slow wave travelling round; they take the colour of the work in progress
    g.fillStyle = jitter ? C.red : kind ? cc.fire : '#7ff5e0'
    for (let i = 0; i < RIM; i++) {
      const u = 1 - 2 * (i + 0.5) / RIM, x = cx + u * mx, y = my - Rb * 0.06 * (1 - u * u) + Rb * 0.035
      g.globalAlpha = 0.25 + 0.6 * Math.max(0, Math.cos(i * 0.55 - t * 0.5)) ** 3
      g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill()
    }
    g.globalAlpha = 1
  }

  // faint filaments that sway a little; lit ones glow in the action's colour
  function link(g, x1, y1, x2, y2, color, b, i, cc) {
    const k = (((i * 7919) % 13) - 6) / 6 * 0.12 + 0.04 * Math.sin(cc.t * 0.25 + i), mx = (x1 + x2) / 2 - (y2 - y1) * k, my = (y1 + y2) / 2 + (x2 - x1) * k
    if (color) { g.strokeStyle = color; g.globalAlpha = 0.3 + 0.7 * b; g.lineWidth = 0.8 + b * 1.6; if (b > 0.5) { g.shadowColor = color; g.shadowBlur = 10 } }
    else { g.strokeStyle = C.link; g.lineWidth = 0.7 }
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(mx, my, x2, y2); g.stroke()
  }
  // plankton: soft teal, cyan and violet points that twinkle slowly
  const PLK = ['#3ee6c9', '#3ee6c9', '#4fc3ff', '#4fc3ff', '#9b7bff']
  function neuron(g, x, y, r, color, b, i, cc) {
    if (color) {
      g.fillStyle = color; g.globalAlpha = 0.22 * b; g.beginPath(); g.arc(x, y, r * 3, 0, TAU); g.fill()
      g.globalAlpha = 1; if (b > 0.4) { g.shadowColor = color; g.shadowBlur = 12 }
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); return
    }
    g.fillStyle = PLK[i % 5]; g.globalAlpha = 0.45 + 0.3 * Math.sin(cc.t * 0.5 + i * 1.7)
    g.beginPath(); g.arc(x, y, r * 0.9, 0, TAU); g.fill()
  }

  // the agent: a glowing pearl at the bell's heart, ringed in the colour of the current work
  function coreCenter(g, cc) {
    const { cx, cy, t, flare, kind } = cc, br = 0.85 + 0.15 * Math.sin(TAU * t / 9) + flare * 0.4
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, 46)
    halo.addColorStop(0, `rgba(127,245,224,${0.4 * br})`); halo.addColorStop(1, 'rgba(127,245,224,0)')
    g.fillStyle = halo; g.fillRect(cx - 46, cy - 46, 92, 92)
    const core = g.createRadialGradient(cx - 3, cy - 3, 0, cx, cy, 11)
    core.addColorStop(0, '#f2fffd'); core.addColorStop(0.6, '#7ff5e0'); core.addColorStop(1, '#1f8f8a')
    g.fillStyle = core; g.beginPath(); g.arc(cx, cy, 11, 0, TAU); g.fill()
    g.strokeStyle = kind ? cc.fire : C.yellow; g.globalAlpha = kind ? 0.85 : 0.6; g.lineWidth = 1.6
    g.shadowColor = g.strokeStyle; g.shadowBlur = 10; g.beginPath(); g.arc(cx, cy, 19, 0, TAU); g.stroke(); g.shadowBlur = 0; g.globalAlpha = 1
  }

  registerTheme({
    id: 'ocean',
    name: 'Deep ocean',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    fonts: { mono: '"JetBrains Mono", ui-monospace, monospace', head: 'Outfit, system-ui, sans-serif' },
    css: {
      '--bg': '#020b16', '--panel': 'rgba(4,22,38,.88)', '--panel2': '#031423', '--line': '#17425e',
      '--cyan': '#3ee6c9', '--yellow': '#ffd166', '--red': '#ff4d5e', '--green': '#9be36a', '--purple': '#b58cff', '--amber': '#ff8a3d', '--blue': '#5d9dff',
      '--dim': '#86a5b8', '--text': '#e4f3fa', '--muted': '#a3bfcd',
      '--mono': '"JetBrains Mono", ui-monospace, Menlo, monospace', '--head': 'Outfit, system-ui, sans-serif',
      '--radius': '12px', '--clip': 'none',
    },
    colors: {
      bg: '#020b16', cyan: '#3ee6c9', yellow: '#ffd166', red: '#ff4d5e', green: '#9be36a', purple: '#b58cff', amber: '#ff8a3d', blue: '#5d9dff',
      dim: '#86a5b8', line: '#17425e', text: '#e4f3fa',
      muted: '#a3bfcd', todo: '#4d6a80', doneInk: '#cdf0b4', ink2: '#eafffb', nodeFill: '#031423', chip: 'rgba(2,11,22,.76)', labelBg: 'rgba(2,12,24,.92)',
      link: 'rgba(79,195,255,.16)', neuron: 'rgba(62,230,201,.6)', shell: 'rgba(62,230,201,.45)', wire: 'rgba(79,195,255,.1)', packet: '#eafffb',
      accentRGB: '62,230,201', goalRGB: '255,209,102', tickRGB: '79,195,255', glow0: '160,255,235', glow1: '62,200,190', glow2: '10,50,80',
    },
    backdrop, sphere, link, neuron, coreCenter,
  })
})()
