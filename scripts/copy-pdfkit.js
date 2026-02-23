const path = require('path')
const fs = require('fs')
const pdfkitData = path.join(__dirname, '..', 'node_modules', 'pdfkit', 'js', 'data')
const dest = path.join(__dirname, '..', 'dist-electron', 'data')
if (fs.existsSync(pdfkitData)) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(pdfkitData)) {
    const srcFile = path.join(pdfkitData, name)
    const destFile = path.join(dest, name)
    if (fs.statSync(srcFile).isFile()) fs.copyFileSync(srcFile, destFile)
  }
  console.log('[copy-pdfkit] Wgrano bazowe fonty PDFKit do dist-electron/data')
}

// Noto Sans (polskie znaki) z paczki notosans-fontface
const notoSansDir = path.join(__dirname, '..', 'node_modules', 'notosans-fontface', 'fonts')
if (fs.existsSync(notoSansDir)) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const name of ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']) {
    const srcFile = path.join(notoSansDir, name)
    const destFile = path.join(dest, name)
    if (fs.existsSync(srcFile)) fs.copyFileSync(srcFile, destFile)
  }
  console.log('[copy-pdfkit] Skopiowano Noto Sans (PL) do dist-electron/data')
}

// Dodatkowe fonty użytkownika – assets/fonts/*.ttf (opcjonalnie)
const extraFonts = path.join(__dirname, '..', 'assets', 'fonts')
if (fs.existsSync(extraFonts)) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(extraFonts)) {
    if (!name.toLowerCase().endsWith('.ttf')) continue
    const srcFile = path.join(extraFonts, name)
    const destFile = path.join(dest, name)
    if (fs.statSync(srcFile).isFile()) fs.copyFileSync(srcFile, destFile)
  }
  console.log('[copy-pdfkit] Skopiowano dodatkowe fonty z assets/fonts do dist-electron/data')
}
