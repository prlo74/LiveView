// The site being built: finding its local dev server, and taking small snapshots of it with headless Chrome.
import type { EngineInterface } from 'claude-code'

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
/** Snapshot size: the page is drawn 1280×800, then shrunk to this width. */
export const THUMB_W = 480
export const THUMB_RATIO = 800 / 1280

// Only addresses on this machine: a snapshot never loads a page from the network.
const LOCAL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})/i

/** The first local dev-server address in `text`, as its origin http://localhost:PORT/ (one site per server); undefined when none. */
export function findLocalUrl(text: string): string | undefined {
  const m = LOCAL.exec(text)
  if (!m) return undefined
  const port = Number(m[1])
  if (!(port > 0 && port < 65536)) return undefined
  return `http://localhost:${port}/`
}

/** The snapshot as an SVG document holding the JPEG, for the desktop pane's `Svg`. */
export function thumbSvg(jpegBase64: string, width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<image href="data:image/jpeg;base64,${jpegBase64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMin slice"/>` +
    `</svg>`
  )
}

/**
 * Photographs `url` with headless Chrome into `dir` and shrinks it: a JPEG (base64) for desktop
 * and a PNG file for the terminal. `generation` picks which of two PNG names to write, so the
 * terminal sees a new file each time. Resolves `{ error }` in plain words when a step fails.
 */
export async function takeSnapshot(
  $: EngineInterface,
  url: string,
  dir: string,
  generation: number,
): Promise<{ jpeg: string; png: string } | { error: string }> {
  const full = `${dir}/full.png`
  const png = `${dir}/thumb-${generation % 2}.png`
  const jpg = `${dir}/thumb.jpg`
  try {
    const shot = await $.process.run(
      [
        CHROME,
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${dir}/profile`,
        '--window-size=1280,800',
        '--virtual-time-budget=3000',
        `--screenshot=${full}`,
        url,
      ],
      { timeoutMs: 30_000 },
    )
    if (shot.exitCode !== 0) return { error: "Chrome couldn't load the page" }
    const small = await $.process.run(['sips', '-Z', String(THUMB_W), '-s', 'format', 'jpeg', '-s', 'formatOptions', '55', full, '--out', jpg])
    const smallPng = await $.process.run(['sips', '-Z', String(THUMB_W), full, '--out', png])
    if (small.exitCode !== 0 || smallPng.exitCode !== 0) return { error: "Couldn't shrink the snapshot" }
    const bytes = await $.fs.read(jpg, { as: 'bytes' })
    return { jpeg: bytes.base64, png }
  } catch {
    return { error: 'Google Chrome is needed for snapshots' }
  }
}
