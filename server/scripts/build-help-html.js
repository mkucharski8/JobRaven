/**
 * Generuje server/public/landing/help.html z server/help.md (statyczna strona pomocy do wgrania na hosting).
 * Uruchom z katalogu server: node scripts/build-help-html.js
 */
const fs = require('fs')
const path = require('path')
const { marked } = require('marked')

const HELP_PATH = path.join(__dirname, '..', 'help.md')
const OUT_PATH = path.join(__dirname, '..', 'public', 'landing', 'help.html')

function slugify(text) {
  const pl = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }
  let s = String(text).trim().toLowerCase()
  s = s.replace(/[ąćęłńóśźż]/g, c => pl[c] || c)
  return s.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function addHeadingIds(html) {
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim()
    const id = slugify(text) || 'section'
    return `<h${level} id="${id}">${inner}</h${level}>`
  })
}

const md = fs.readFileSync(HELP_PATH, 'utf8')
let body = marked.parse(md)
body = addHeadingIds(body)

const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pomoc – JobRaven</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; max-width: 720px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #fff; }
    h1 { font-size: 1.5rem; margin-top: 0; border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; }
    h2 { font-size: 1.25rem; margin-top: 1.5rem; }
    h3 { font-size: 1.1rem; margin-top: 1rem; }
    h4 { font-size: 1rem; margin-top: 0.75rem; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul, ol { margin: 0.5rem 0; padding-left: 1.5rem; }
    table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
    th, td { border: 1px solid #e5e5e5; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 1.5rem 0; }
    p { margin: 0.5rem 0; }
    strong { font-weight: 600; }
  </style>
</head>
<body>
${body}
</body>
</html>`

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
fs.writeFileSync(OUT_PATH, html, 'utf8')
console.log('Zapisano:', OUT_PATH)
