import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(join(here, 'clive-icon.svg'), 'utf8')
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 }, background: 'rgba(0,0,0,0)' })
const img = resvg.render()
const png = img.asPng()
writeFileSync(join(here, 'app-icon.png'), png)
console.log(`app-icon.png → ${img.width}x${img.height}, ${png.length} bytes`)
