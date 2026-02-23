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
const st = db.prepare(`
  SELECT key, value
  FROM settings
  WHERE key IN ('wfirma_access_key','wfirma_secret_key','wfirma_app_key','wfirma_company_id')
`)
const settings = {}
while (st.step()) {
  const r = st.getAsObject()
  settings[String(r.key)] = String(r.value ?? '')
}
st.free()
db.close()

const accessKey = String(settings.wfirma_access_key ?? '').trim()
const secretKey = String(settings.wfirma_secret_key ?? '').trim()
const appKey = String(settings.wfirma_app_key ?? '').trim()
const companyId = String(settings.wfirma_company_id ?? '').trim()

if (!accessKey || !secretKey) {
  console.error('Missing wfirma_access_key / wfirma_secret_key in settings.')
  process.exit(2)
}

function buildUrl(modulePath) {
  const url = new URL(`https://api2.wfirma.pl/${modulePath}`)
  url.searchParams.set('inputFormat', 'json')
  url.searchParams.set('outputFormat', 'json')
  if (companyId) url.searchParams.set('company_id', companyId)
  return url.toString()
}

const headers = {
  Accept: 'application/json',
  accessKey,
  secretKey
}
if (appKey) headers.appKey = appKey

async function callGet(modulePath) {
  const res = await fetch(buildUrl(modulePath), { method: 'GET', headers })
  const text = await res.text()
  return { status: res.status, text }
}

async function callPost(modulePath, payload) {
  const res = await fetch(buildUrl(modulePath), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const text = await res.text()
  return { status: res.status, text }
}

const targets = [
  { name: 'vat_codes/find [GET]', run: () => callGet('vat_codes/find') },
  { name: 'vat_codes/find [POST]', run: () => callPost('vat_codes/find', [{ vat_codes: { parameters: { page: 1, limit: 200 } } }]) },
  { name: 'vat_contents/find [GET]', run: () => callGet('vat_contents/find') },
  { name: 'vat_contents/find [POST]', run: () => callPost('vat_contents/find', [{ vat_contents: { parameters: { page: 1, limit: 200 } } }]) }
]

for (const t of targets) {
  try {
    const out = await t.run()
    console.log(`\n=== ${t.name} ===`)
    console.log('status:', out.status)
    console.log('body:', out.text.slice(0, 2500))
    if (t.name.startsWith('vat_codes/find') && out.status === 200) {
      try {
        const data = JSON.parse(out.text)
        const list = []
        const group = data?.vat_codes ?? {}
        if (Array.isArray(group)) {
          for (const row of group) {
            const v = row?.vat_code
            if (v) list.push({ id: v.id, code: v.code, label: v.label, rate: v.rate, type: v.type })
          }
        } else if (group && typeof group === 'object') {
          for (const key of Object.keys(group)) {
            const v = group[key]?.vat_code
            if (v) list.push({ id: v.id, code: v.code, label: v.label, rate: v.rate, type: v.type })
          }
        }
        console.log('vat_codes summary:', list)
      } catch {
        // ignore parse errors
      }
    }
  } catch (e) {
    console.log(`\n=== ${t.name} ===`)
    console.log('error:', e instanceof Error ? e.message : String(e))
  }
}

