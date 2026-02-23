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
const q = (sql, params = []) => {
  const st = db.prepare(sql)
  st.bind(params)
  const out = []
  while (st.step()) out.push(st.getAsObject())
  st.free()
  return out
}

const latest = q(`
  SELECT id, client_id, service_id, order_number, invoice_number, invoice_provider_source,
         order_vat_code, order_vat_rate, rate_currency
  FROM orders
  ORDER BY id DESC
  LIMIT 3
`)
console.log('latest orders:', latest)

if (latest[0]?.client_id) {
  const c = q(`SELECT id, short_name, country_code, country, client_kind, vat_eu FROM clients WHERE id = ?`, [latest[0].client_id])
  console.log('client for latest order:', c)
}

if (latest[0]?.service_id) {
  const r = q(`
    SELECT id, service_id, client_segment, country_code, value_type, rate_value, code_value
    FROM service_vat_rules
    WHERE service_id = ?
    ORDER BY client_segment, id
  `, [latest[0].service_id])
  console.log('service VAT rules for latest order service:', r)
}

const s = q(`SELECT key, value FROM settings WHERE key IN ('invoice_provider', 'personal_country') ORDER BY key`)
console.log('settings:', s)

db.close()
