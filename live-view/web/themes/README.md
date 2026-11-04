# Agent Web styles

Each file here is a plain script that calls `registerTheme({...})` once. The page loads every style file listed in its `<script src="themes/…">` tags after its own script (add a tag when you add a file), so everything below is in scope (globals: `C`, `F`, `KIND`, `hexPath`, `LOW`). The built-in look is `neon` (in `index.html`). The Style menu lists every registered theme; `?theme=<id>` in the URL forces one.

A style changes **how things look, never what they say**: labels, text, alerts, the orange "you are needed" pulse and the layout stay the same in every style.

## The object

```js
registerTheme({
  id: 'starry',                 // stable id, used in ?theme= and saved in localStorage
  name: 'Starry Night',         // shown in the Style menu
  light: false,                 // true for a light theme (sets color-scheme)
  fontUrl: 'https://fonts.googleapis.com/css2?family=…&display=swap',   // optional Google Fonts stylesheet
  fonts: { mono: '"IBM Plex Mono", monospace', head: '"Cormorant Garamond", serif' },  // canvas fonts
  css: { '--bg': '…', '--panel': '…', '--panel2': '…', '--line': '…', '--cyan': '…', '--yellow': '…', '--red': '…', '--green': '…',
         '--purple': '…', '--amber': '…', '--blue': '…', '--dim': '…', '--text': '…', '--muted': '…', '--mono': '…', '--head': '…',
         '--radius': '10px', '--clip': 'none' },                       // HTML chrome (header, panels, guide, log, cards)
  colors: { … },                // canvas palette: any key of C (see below)
  kind: { edit: '…', read: '…', search: '…', run: '…', browse: '…', agent: '…', other: '…' },  // optional; default from colors
  webSilk: true,                // false hides the web view's default sagging rings (draw your own in backdrop)
  backdrop(g, b) {},            // REQUIRED: paint the whole window background
  coreUnder(g, cc) {}, sphere(g, cc) {}, link(g, x1, y1, x2, y2, color, b, i, cc) {}, neuron(g, x, y, r, color, b, i, cc) {},
  coreOver(g, cc) {}, coreCenter(g, cc) {},   // optional core-view hooks
})
```

### `C` keys (canvas palette)
`bg cyan yellow red green purple amber blue dim line text` — the semantic colours. **cyan** = read / working / accent, **yellow** = search and the goal, **green** = edit / done, **amber** = run, **blue** = web, **purple** = helper, **red** = errors. Keep these distinguishable from each other and from the background, and keep red unmistakably "error".
`muted todo doneInk ink2 nodeFill chip labelBg` — soft text, queued steps, done-step text, bright text, node fill, dark pill behind text, live-step label box.
`link neuron shell wire packet` — idle network link, idle neuron, sphere outline, globe frame lines, the bright head of a firing chain.
`accentRGB goalRGB tickRGB glow0 glow1 glow2` — `"r,g,b"` strings used where alpha varies: accent rings, goal rings, tick marks, the sphere's three glow stops.

### `backdrop(g, b)` — required, and it is also the screensaver
`b = { W, H, now, t, cx, cy, R, low, core, saver }`. Paint the full `W×H` window (CSS pixels; the transform is already set for device pixels). `t` is seconds and is **0 when the person asked for reduced motion** — drive every motion from `t`, never from `now`, so reduced motion freezes it. `cx, cy, R` are where the core (or the web's centre) is; `core` is true in the one-agent view; `saver` is true in screensaver mode (the agents are drawn faintly over your backdrop, so it carries the screen).

**Motion rule (a hard requirement):** the background must *constantly and slightly morph* — on cycles of roughly 30–120 s, with small amplitudes and low contrast. It must never flash, strobe, scroll fast, or compete with the agent drawing for attention. Someone working beside it should barely notice it moving; someone looking at it as a screensaver should find it alive.

**Budget:** the backdrop runs every frame (up to 60 fps). Keep it under ~2 ms on a laptop: precompute geometry once (module-level, rebuilt only when `W/H` change), avoid per-pixel work and huge loops, prefer a few gradients and a few hundred cheap strokes. When `b.low` is true (battery or background window) draw a cheaper version. Never use `getImageData`/`putImageData` per frame.

### Core-view hooks (one agent working)
`cc = { cx, cy, R, now, t, kind, fire, steps, cur, goal, complete, flare, recent, low, jitter, tip, net, P }`
- `kind`: what the agent is doing now (`edit read search run browse agent other error` or null); `fire`: its colour.
- `steps`: plan steps on the orbit `{ s: {text,status}, x, y, deg }`, `cur`: index of the current step, `goal`: `{x,y}` of the goal marker, `complete`: every step done.
- `tip`: `{x,y}` where the newest chain of firing neurons ends (or null). `flare` 0–1 when the goal was just reached. `recent`: actions in the last 30 s.
- `net`: `{ ns: [{x,y,s}] (unit disc), links: [{a,b}] }`, `P(u,v)` → `[x,y]` in pixels.
- `sphere(g, cc)` replaces the default sphere glow/outline/globe/ticks. `coreUnder` draws behind it, `coreOver` above the network and effects (good for swarms, drills), `coreCenter` replaces the hexagon at the centre.
- `link(g, x1, y1, x2, y2, color, b, i, cc)`: draw one link. `color` is the firing colour when lit (`b` 0–1 brightness) or **null when idle** (use your idle style). `neuron(g, x, y, r, color, b, i, cc)`: same for a neuron. These run for ~110 neurons and ~200 links per frame: keep them to a few canvas calls each.
- The orbit, step labels, alerts, banners, fireworks and text are drawn by the page with your palette. Do not redraw them.

### Rules
- No network calls besides `fontUrl`. No `localStorage`. No DOM changes. No timers. Only draw in the hooks.
- Offscreen canvases (2D or WebGL) that are never attached to the page are allowed, made once and reused. A WebGL effect must fall back to a 2D drawing when WebGL is unavailable, and must render at a reduced size (then `drawImage` it scaled) to stay within budget.
- Motion level: every style except Neon and Focus has a background that is always visibly moving (flowing, drifting, swimming), while staying calm enough to work beside. Focus stays still.
- Wrap nothing in try/catch to hide errors; a hook that throws breaks the frame.
- Contrast: text colours (`--text`, `--muted`, `C.text`, `C.muted`) must stay readable on `--panel`, `--bg` and your backdrop (aim for WCAG AA 4.5:1 for body text).
- Plain words only in anything you name. No role-play wording.
