import { readFile, readdir, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const assets = {}
for (const kind of ['posters', 'animated']) {
  for (const name of (await readdir(new URL(`assets/qibit-agent-hover/${kind}/`, root))).sort()) {
    const path = `qibit-agent-hover/${kind}/${name}`
    assets[`/${path}`] = `data:image/webp;base64,${(await readFile(new URL(`assets/${path}`, root))).toString('base64')}`
  }
}
assets['/wallpapers/01-unified-snowfield-3840x2160.png'] = `data:image/webp;base64,${(await readFile(new URL('assets/wallpapers/01-unified-snowfield-preview.webp', root))).toString('base64')}`
const output = new URL('src/client/visual-assets.json', root)
const next = JSON.stringify(assets)
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== next) throw new Error('Visual assets are stale; run node scripts/build-visual-assets.mjs')
} else await writeFile(output, next)
