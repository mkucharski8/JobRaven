#!/usr/bin/env node
/**
 * Podgląd tabeli orders w bazie JobRaven (id, order_number, rate_currency, amount).
 * Użycie: node scripts/inspect-orders-db.mjs [ścieżka-do-pliku.db]
 * Domyślna ścieżka (Windows): %LOCALAPPDATA%\\JobRaven\\jobraven.db
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultPath = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'),
  'JobRaven',
  'jobraven.db'
)
const dbPath = process.argv[2] || defaultPath

if (!fs.existsSync(dbPath)) {
  console.error('Baza nie znaleziona:', dbPath)
  console.error('Podaj ścieżkę: node scripts/inspect-orders-db.mjs <ścieżka.db>')
  process.exit(1)
}

const initSqlJs = (await import('sql.js')).default
const SQL = await initSqlJs()
const buf = fs.readFileSync(dbPath)
const db = new SQL.Database(new Uint8Array(buf))

function all(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

console.log('=== Orders (id, order_number, invoice_number, invoice_provider_source, rate_currency, amount) ===\n')
const orders = all('SELECT id, order_number, invoice_number, invoice_provider_source, rate_currency, amount FROM orders ORDER BY id')
for (const o of orders) {
  const rc = o.rate_currency
  const rcRepr = rc === null ? 'NULL' : rc === '' ? "''" : JSON.stringify(rc)
  const inv = o.invoice_number == null || String(o.invoice_number).trim() === '' ? 'NULL' : JSON.stringify(o.invoice_number)
  const src = o.invoice_provider_source == null || String(o.invoice_provider_source).trim() === '' ? 'NULL' : JSON.stringify(o.invoice_provider_source)
  console.log(`id=${o.id} order_number=${o.order_number ?? 'NULL'} invoice_number=${inv} source=${src} rate_currency=${rcRepr} amount=${o.amount}`)
}
console.log('\n=== Raw rate_currency values (hex) for non-null ===')
for (const o of orders.filter(x => x.rate_currency != null && x.rate_currency !== '')) {
  const s = String(o.rate_currency)
  const hex = Buffer.from(s, 'utf8').toString('hex')
  console.log(`id=${o.id} rate_currency="${s}" (hex: ${hex})`)
}

db.close()
