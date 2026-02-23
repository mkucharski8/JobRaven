#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const initSqlJs = (await import('sql.js')).default
const SQL = await initSqlJs()
const dbPath = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'),
  'JobRaven',
  'jobraven.db'
)
if (!fs.existsSync(dbPath)) {
  console.error('DB not found:', dbPath)
  process.exit(1)
}

const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
const settingsStmt = db.prepare(
  `SELECT key, value FROM settings WHERE key IN ('invoice_provider', 'invoice_number_format') ORDER BY key`
)
const settingsRows = []
while (settingsStmt.step()) settingsRows.push(settingsStmt.getAsObject())
settingsStmt.free()
const q = db.prepare(`
  SELECT id, invoice_number, invoice_provider_source
  FROM orders
  WHERE invoice_number IS NOT NULL AND TRIM(invoice_number) != ''
  ORDER BY id DESC
`)
const rows = []
while (q.step()) rows.push(q.getAsObject())
q.free()

const wanted = 'local'
let nextNr = 1
let usedRow = null
for (const r of rows) {
  const src = String(r.invoice_provider_source ?? '').trim().toLowerCase()
  if (src !== wanted) continue
  const s = String(r.invoice_number ?? '').trim()
  const m = s.match(/(\d+)\s*$/)
  if (m) {
    const nr = parseInt(m[1], 10)
    if (nr >= 1) nextNr = nr + 1
  }
  usedRow = r
  break
}

console.log('rows:', rows)
console.log('settings:', settingsRows)
console.log('usedRow:', usedRow)
console.log('nextNr(local):', nextNr)
db.close()
