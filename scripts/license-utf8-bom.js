/**
 * Re-save build/license.txt with UTF-8 BOM so NSIS installer displays Polish characters correctly.
 */
const fs = require('fs')
const path = require('path')

const licensePath = path.join(__dirname, '..', 'build', 'license.txt')
const content = fs.readFileSync(licensePath, 'utf8')
const BOM = '\uFEFF'
if (content.charCodeAt(0) === 0xFEFF) {
  console.log('[license-utf8-bom] Plik ma już BOM.')
  process.exit(0)
}
fs.writeFileSync(licensePath, BOM + content, 'utf8')
console.log('[license-utf8-bom] Zapisano build/license.txt z UTF-8 BOM.')
