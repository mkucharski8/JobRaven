/**
 * Generates build/icon.ico from server/public/landing/logo_trans.png for Windows app icon.
 * Run before electron-builder. Requires: npm install --save-dev png-to-ico
 */
const fs = require('fs')
const path = require('path')

const srcPng = path.join(__dirname, '..', 'server', 'public', 'landing', 'logo_trans_no_text.png')
const outIco = path.join(__dirname, '..', 'build', 'icon.ico')

if (!fs.existsSync(srcPng)) {
  console.warn('[png-to-ico] Brak pliku logo_trans_no_text.png, pomijam generowanie icon.ico')
  process.exit(0)
}

const pngToIcoModule = require('png-to-ico')
const pngToIco = typeof pngToIcoModule === 'function' ? pngToIcoModule : pngToIcoModule.default
const buildDir = path.dirname(outIco)
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true })

pngToIco(srcPng)
  .then(buf => {
    fs.writeFileSync(outIco, buf)
    console.log('[png-to-ico] Zapisano build/icon.ico')
  })
  .catch(err => {
    console.error('[png-to-ico] Błąd:', err.message)
    process.exit(1)
  })
