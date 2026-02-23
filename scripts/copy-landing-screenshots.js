/**
 * Kopiuje screenshoty z screenshots/ do server/public/landing/screenshots/
 * pod nazwami ASCII, żeby uniknąć problemów z kodowaniem przy serwowaniu.
 */
const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, '..', 'screenshots')
const outDir = path.join(__dirname, '..', 'server', 'public', 'landing', 'screenshots')

// Mapowanie: fragment nazwy pliku (bez rozszerzenia) -> nazwa docelowa .png
const toSafeName = {
  'Analityka': 'analityka',
  'Baza faktur': 'baza-faktur',
  'Podzlecenia': 'podzlecenia',
  'Ustawienia faktur': 'ustawienia-faktur',
  'Ustawienia jednostek': 'ustawienia-jednostek',
  'Ustawienia': 'ustawienia',
  'Widok księgi zwykłej': 'ksiega-zwykla',
  'Widok repertorium': 'repertorium',
  'Wykresy': 'wykresy'
}

if (!fs.existsSync(srcDir)) {
  console.warn('Brak folderu screenshots/')
  process.exit(0)
}

fs.mkdirSync(outDir, { recursive: true })
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.png'))

function normalize (s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

for (const file of files) {
  const base = file.replace(/\.png$/i, '')
  let outName = toSafeName[base]
  if (!outName) {
    for (const [key, safe] of Object.entries(toSafeName)) {
      if (normalize(base) === normalize(key)) {
        outName = safe
        break
      }
    }
  }
  if (!outName) {
    outName = base.replace(/\s+/g, '-').replace(/[ęóąśłżźćń]/gi, c => ({ ę: 'e', ó: 'o', ą: 'a', ś: 's', ł: 'l', ż: 'z', ź: 'z', ć: 'c', ń: 'n' }[c.toLowerCase()] || c)).toLowerCase()
  }
  const dest = path.join(outDir, outName + '.png')
  fs.copyFileSync(path.join(srcDir, file), dest)
  console.log(file, '->', outName + '.png')
}

console.log('Screenshoty skopiowane do', outDir)
