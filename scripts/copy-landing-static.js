/**
 * Kopiuje server/public/landing do deploy/landing-static z index.html,
 * w którym href="/help" jest zamienione na href="./help.html" (dla hostingu statycznego).
 * Uruchom po: npm run landing:prepare-static
 */
const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, '..', 'server', 'public', 'landing')
const outDir = path.join(__dirname, '..', 'deploy', 'landing-static')

function copyRecursive(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name))
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

// kopiuj cały landing
if (!fs.existsSync(srcDir)) {
  console.error('Brak folderu:', srcDir, '- uruchom najpierw: npm run landing:prepare-static')
  process.exit(1)
}

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true })
copyRecursive(srcDir, outDir)

// w skopiowanym index.html zamień /help na ./help.html
const indexPath = path.join(outDir, 'index.html')
let index = fs.readFileSync(indexPath, 'utf8')
index = index.replace(/href="\/help"/g, 'href="./help.html"')
fs.writeFileSync(indexPath, index, 'utf8')

console.log('Skopiowano do:', outDir)
console.log('Wgraj ZAWARTOŚĆ tego folderu na serwer (FTP).')
