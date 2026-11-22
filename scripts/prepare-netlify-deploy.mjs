import fs from 'fs'
import path from 'path'

const root = path.resolve('.')
const dist = path.join(root, 'dist')
const out = path.join(root, 'DEPLOY-TO-NETLIFY')

if (!fs.existsSync(dist)) {
  console.error('Run npm run build first — dist/ not found.')
  process.exit(1)
}

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(dist, out, { recursive: true })
console.log(`Copied dist → ${out}`)
