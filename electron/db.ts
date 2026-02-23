/// <reference path="./sql.js.d.ts" />
import initSqlJs from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any
let dbPath: string

function saveDb() {
  try {
    const data = db.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  } catch (e) {
    console.error('saveDb', e)
  }
}

function run(sql: string, ...params: unknown[]) {
  if (params.length) {
    const stmt = db.prepare(sql)
    stmt.bind(params as (string | number | null)[])
    stmt.step()
    stmt.free()
  } else {
    db.run(sql)
  }
  saveDb()
}

function getLastId(): number {
  const result = db.exec('SELECT last_insert_rowid() as id')
  if (result.length && result[0].values.length) return result[0].values[0][0] as number
  return 0
}

function get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  const stmt = db.prepare(sql)
  stmt.bind(params as (string | number | null)[])
  if (stmt.step()) {
    const row = stmt.getAsObject() as T
    stmt.free()
    return row
  }
  stmt.free()
  return undefined
}

function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  const stmt = db.prepare(sql)
  stmt.bind(params as (string | number | null)[])
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

function cleanupInvisibleOrders(): number {
  const invisible = all<{ id: number }>(`
    SELECT o.id
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN units u ON o.unit_id = u.id
    WHERE c.id IS NULL OR u.id IS NULL
  `)
  if (!invisible.length) return 0
  for (const row of invisible) {
    run('DELETE FROM subcontracts WHERE order_id = ?', row.id)
    run('DELETE FROM custom_column_values WHERE order_id = ?', row.id)
    run('DELETE FROM orders WHERE id = ?', row.id)
  }
  return invisible.length
}

function cleanupEmptyOrders(): number {
  const emptyRows = all<{ id: number }>(`
    SELECT o.id
    FROM orders o
    WHERE COALESCE(o.quantity, 0) <= 0
      AND COALESCE(o.amount, 0) <= 0
      AND COALESCE(o.oral_duration, 0) <= 0
      AND COALESCE(o.oral_net, 0) <= 0
      AND COALESCE(o.oral_gross, 0) <= 0
      AND (o.invoice_number IS NULL OR TRIM(o.invoice_number) = '')
      AND (o.invoice_date IS NULL OR TRIM(o.invoice_date) = '')
  `)
  if (!emptyRows.length) return 0
  for (const row of emptyRows) {
    run('DELETE FROM subcontracts WHERE order_id = ?', row.id)
    run('DELETE FROM custom_column_values WHERE order_id = ?', row.id)
    run('DELETE FROM orders WHERE id = ?', row.id)
  }
  return emptyRows.length
}

const schema = `
  CREATE TABLE IF NOT EXISTS languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS language_pairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_lang_id INTEGER NOT NULL,
    target_lang_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    bidirectional INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (source_lang_id) REFERENCES languages(id),
    FOREIGN KEY (target_lang_id) REFERENCES languages(id)
  );
  CREATE TABLE IF NOT EXISTS unit_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    base_rate REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PLN',
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    multiplier_to_base REAL NOT NULL DEFAULT 1,
    is_base INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    street TEXT,
    building TEXT,
    local TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT,
    address_extra TEXT,
    nip TEXT,
    notes TEXT,
    email TEXT,
    website TEXT,
    phone TEXT,
    contact_person TEXT,
    default_payment_days INTEGER DEFAULT 14,
    country_code TEXT,
    client_kind TEXT NOT NULL DEFAULT 'company',
    vat_eu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    received_at TEXT NOT NULL,
    deadline_at TEXT,
    specialization TEXT,
    language_pair_id INTEGER,
    unit_id INTEGER NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    rate_per_unit REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    order_status TEXT NOT NULL DEFAULT 'to_do',
    invoice_status TEXT NOT NULL DEFAULT 'to_issue',
    invoice_number TEXT,
    invoice_provider_source TEXT,
    invoice_date TEXT,
    invoice_sale_date TEXT,
    payment_due_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (language_pair_id) REFERENCES language_pairs(id),
    FOREIGN KEY (unit_id) REFERENCES units(id)
  );
  CREATE TABLE IF NOT EXISTS contractors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS specializations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    vat_rate REAL NOT NULL DEFAULT 23
  );
  CREATE TABLE IF NOT EXISTS client_unit_rates (
    client_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    rate REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PLN',
    PRIMARY KEY (client_id, unit_id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (unit_id) REFERENCES units(id)
  );
  CREATE TABLE IF NOT EXISTS client_default_unit_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    language_pair_id INTEGER NULL,
    argument_key TEXT,
    argument_value TEXT,
    argument2_key TEXT,
    argument2_value TEXT,
    argument3_key TEXT,
    argument3_value TEXT,
    rate REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PLN',
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (unit_id) REFERENCES units(id),
    FOREIGN KEY (language_pair_id) REFERENCES language_pairs(id)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS service_vat_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    client_segment TEXT NOT NULL,
    country_code TEXT,
    value_type TEXT NOT NULL DEFAULT 'rate',
    rate_value REAL,
    code_value TEXT,
    FOREIGN KEY (service_id) REFERENCES services(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_service_vat_rules_unique
    ON service_vat_rules(service_id, client_segment, COALESCE(country_code, ''));
  CREATE TABLE IF NOT EXISTS order_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    view_type TEXT NOT NULL DEFAULT 'simplified',
    sort_order INTEGER NOT NULL DEFAULT 0,
    repertorium_oral_unit_id INTEGER REFERENCES units(id),
    repertorium_page_unit_id INTEGER REFERENCES units(id)
  );
  CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  );
`
const DEFAULT_ADMIN_EMAIL = 'mkucharski8@gmail.com'
const DEFAULT_ADMIN_PASSWORD = '123456'

/** Wersja schemy bazy – zwiększ przy każdej nowej migracji. */
export const CURRENT_SCHEMA_VERSION = 1

function getSchemaVersion(): number | null {
  const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'schema_version')
  if (row?.value == null) return null
  const n = parseInt(String(row.value), 10)
  return Number.isFinite(n) ? n : null
}

function setSchemaVersion(v: number): void {
  run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'schema_version', String(v))
}

/**
 * Lista migracji po wersji. Migracja N uruchamiana tylko gdy currentVersion < N.
 * Jak dodać nową migrację:
 * 1. Zwiększ CURRENT_SCHEMA_VERSION (np. na 2).
 * 2. Dopisz schemaMigrations[2] = () => { ... ALTER TABLE / CREATE / UPDATE ... }.
 * 3. Przy starcie aplikacji stare bazy dostaną uruchomione tylko brakujące migracje.
 */
type MigrationFn = () => void
const schemaMigrations: Record<number, MigrationFn> = {
  1: () => { /* Stan bieżący – wszystkie ALTERy już wykonane wyżej w initDb */ }
}

function runSchemaMigrations(): void {
  const current = getSchemaVersion() ?? 0
  for (let v = 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    if (current < v && schemaMigrations[v]) {
      try {
        schemaMigrations[v]()
        setSchemaVersion(v)
        saveDb()
      } catch (e) {
        console.error(`Schema migration ${v} failed:`, e)
        throw e
      }
    }
  }
}

/** Zwraca aktualną wersję schemy bazy (po initDb). Do wyświetlenia w UI / diagnostyce. */
export function getDbSchemaVersion(): number | null {
  if (!db) return null
  return getSchemaVersion()
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password: string, packedHash: string): boolean {
  const [algo, salt, expectedHash] = String(packedHash || '').split('$')
  if (algo !== 'scrypt' || !salt || !expectedHash) return false
  const candidate = scryptSync(password, salt, 64).toString('hex')
  const a = Buffer.from(candidate, 'hex')
  const b = Buffer.from(expectedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function initDb() {
  const locateFile = (file: string) => {
    const fromCwd = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
    if (fs.existsSync(fromCwd)) return fromCwd
    try {
      return path.join(path.dirname(require.resolve('sql.js/package.json')), 'dist', file)
    } catch {
      return fromCwd
    }
  }
  const SQL = await initSqlJs({ locateFile })
  const userData = app.getPath('userData')
  const dbFileName = process.env.JOBRAVEN_DB_FILE && process.env.JOBRAVEN_DB_FILE.trim()
    ? process.env.JOBRAVEN_DB_FILE.trim()
    : 'jobraven.db'
  dbPath = path.join(userData, dbFileName)

  const fileExisted = fs.existsSync(dbPath)
  if (fileExisted) {
    const buf = fs.readFileSync(dbPath)
    db = new SQL.Database(new Uint8Array(buf))
  } else {
    db = new SQL.Database()
  }

  db.run(schema)
  const expectedOrg = (process.env.JOBRAVEN_ORG_ID || '').trim() || 'admin'
  const expectedUserId = (process.env.JOBRAVEN_USER_ID || '').trim() || null
  const storedOrgRow = get<{ value: string | number }>('SELECT value FROM settings WHERE key = ?', 'db_organization_id')
  const storedUserRow = get<{ value: string | number }>('SELECT value FROM settings WHERE key = ?', 'db_user_id')
  const storedOrg = (storedOrgRow?.value != null ? String(storedOrgRow.value).trim() : '') || null
  const storedUserId = (storedUserRow?.value != null ? String(storedUserRow.value).trim() : '') || null

  if (fileExisted && storedOrg == null && (storedUserId == null || storedUserId === '')) {
    throw new Error('DB_NOT_LINKED')
  }
  if (storedOrg != null && storedOrg !== expectedOrg) {
    throw new Error('DB_ORGANIZATION_MISMATCH')
  }
  if (expectedUserId != null && storedUserId != null && storedUserId !== expectedUserId) {
    throw new Error('DB_ORGANIZATION_MISMATCH')
  }
  if (storedOrg == null) {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'db_organization_id', expectedOrg)
  }
  if (storedUserId == null && expectedUserId != null) {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'db_user_id', expectedUserId)
  }
  try {
    const usersCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM app_users')?.c ?? 0
    if (usersCount === 0) {
      run(
        'INSERT INTO app_users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
        DEFAULT_ADMIN_EMAIL,
        hashPassword(DEFAULT_ADMIN_PASSWORD),
        'Admin',
        'owner'
      )
    }
  } catch { /* nop */ }
  try { db.run('ALTER TABLE orders ADD COLUMN invoice_number TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN invoice_date TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN invoice_sale_date TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN contractor_id INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN order_number TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN specialization_id INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN book_id INTEGER DEFAULT 1') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN completed_at TEXT') } catch { /* already exists */ }
  try { db.run('UPDATE orders SET book_id = 1 WHERE book_id IS NULL') } catch { /* nop */ }
  try { db.run('ALTER TABLE clients ADD COLUMN country_code TEXT') } catch { /* already exists */ }
  try { db.run("ALTER TABLE clients ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'company'") } catch { /* already exists */ }
  try { db.run('ALTER TABLE clients ADD COLUMN vat_eu INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
  try { db.run('ALTER TABLE services ADD COLUMN vat_rate REAL NOT NULL DEFAULT 23') } catch { /* already exists */ }
  try { db.run('ALTER TABLE clients DROP COLUMN charge_vat') } catch { /* SQLite < 3.35 or already dropped */ }
  try { db.run('ALTER TABLE orders DROP COLUMN charge_vat') } catch { /* SQLite < 3.35 or already dropped */ }
  try { db.run("ALTER TABLE client_unit_rates ADD COLUMN currency TEXT NOT NULL DEFAULT 'PLN'") } catch { /* already exists */ }
  try { db.run("ALTER TABLE client_default_unit_rates ADD COLUMN argument_key TEXT") } catch { /* already exists */ }
  try { db.run("ALTER TABLE client_default_unit_rates ADD COLUMN argument_value TEXT") } catch { /* already exists */ }
  try { db.run("ALTER TABLE client_default_unit_rates ADD COLUMN argument2_key TEXT") } catch { /* already exists */ }
  try { db.run("ALTER TABLE client_default_unit_rates ADD COLUMN argument2_value TEXT") } catch { /* already exists */ }
  try { db.run("ALTER TABLE client_default_unit_rates ADD COLUMN argument3_key TEXT") } catch { /* already exists */ }
  try { db.run("ALTER TABLE client_default_unit_rates ADD COLUMN argument3_value TEXT") } catch { /* already exists */ }
  try { db.run("ALTER TABLE client_default_unit_rates ADD COLUMN currency TEXT NOT NULL DEFAULT 'PLN'") } catch { /* already exists */ }
  try {
    const legacyCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM client_unit_rates')?.c ?? 0
    const newCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM client_default_unit_rates')?.c ?? 0
    if (legacyCount > 0 && newCount === 0) {
      run(`
        INSERT INTO client_default_unit_rates (
          client_id, unit_id, language_pair_id,
          argument_key, argument_value,
          argument2_key, argument2_value,
          argument3_key, argument3_value,
          rate, currency
        )
        SELECT client_id, unit_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, rate, COALESCE(currency, 'PLN')
        FROM client_unit_rates
      `)
    }
  } catch { /* nop */ }
  try { db.run('ALTER TABLE orders ADD COLUMN order_vat_rate REAL') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN order_vat_code TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE order_books ADD COLUMN archived INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
  try { db.run('ALTER TABLE order_books ADD COLUMN order_number_format TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE order_books ADD COLUMN repertorium_oral_unit_id INTEGER REFERENCES units(id)') } catch { /* already exists */ }
  try { db.run('ALTER TABLE order_books ADD COLUMN repertorium_page_unit_id INTEGER REFERENCES units(id)') } catch { /* already exists */ }
  try {
    const globalOralUnit = get<{ value: string | null }>("SELECT value FROM settings WHERE key = 'repertorium_oral_unit_id'")
    const oralUnitId = parseInt(String(globalOralUnit?.value ?? ''), 10)
    if (!Number.isNaN(oralUnitId)) {
      run("UPDATE order_books SET repertorium_oral_unit_id = ? WHERE view_type = 'repertorium' AND repertorium_oral_unit_id IS NULL", oralUnitId)
    }
  } catch { /* nop */ }
  try {
    const globalPageUnit = get<{ value: string | null }>("SELECT value FROM settings WHERE key = 'repertorium_page_unit_id'")
    const pageUnitId = parseInt(String(globalPageUnit?.value ?? ''), 10)
    if (!Number.isNaN(pageUnitId)) {
      run("UPDATE order_books SET repertorium_page_unit_id = ? WHERE view_type = 'repertorium' AND repertorium_page_unit_id IS NULL", pageUnitId)
    }
  } catch { /* nop */ }
  try { db.run('ALTER TABLE orders ADD COLUMN name TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN repertorium_description TEXT') } catch { /* already exists */ }
  for (const col of ['document_author', 'document_name', 'document_date', 'document_number', 'document_form_remarks', 'repertorium_notes', 'repertorium_activity_type']) {
    try { db.run(`ALTER TABLE orders ADD COLUMN ${col} TEXT`) } catch { /* already exists */ }
  }
  try { db.run('ALTER TABLE orders ADD COLUMN extra_copies INTEGER DEFAULT 0') } catch { /* already exists */ }
  for (const col of ['oral_date', 'oral_place', 'oral_lang', 'oral_scope', 'oral_notes', 'refusal_date', 'refusal_organ', 'refusal_reason']) {
    try { db.run(`ALTER TABLE orders ADD COLUMN ${col} TEXT`) } catch { /* already exists */ }
  }
  for (const col of ['oral_duration', 'oral_rate', 'oral_net', 'oral_gross']) {
    try { db.run(`ALTER TABLE orders ADD COLUMN ${col} REAL`) } catch { /* already exists */ }
  }
  try { db.run('ALTER TABLE orders ADD COLUMN invoice_description TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN translation_type TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN service_id INTEGER REFERENCES services(id)') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN include_service_on_invoice INTEGER NOT NULL DEFAULT 1') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN include_language_pair_on_invoice INTEGER NOT NULL DEFAULT 1') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN include_invoice_description_on_invoice INTEGER NOT NULL DEFAULT 1') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN rate_currency TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN invoice_notes TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN invoice_bank_account_id INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE orders ADD COLUMN invoice_provider_source TEXT') } catch { /* already exists */ }
  try { run("UPDATE service_vat_rules SET code_value = 'NP' WHERE UPPER(TRIM(COALESCE(code_value, ''))) = 'O'") } catch { /* nop */ }
  try { run("UPDATE service_vat_rules SET code_value = 'ZW' WHERE UPPER(TRIM(COALESCE(code_value, ''))) = 'E'") } catch { /* nop */ }
  try { run("UPDATE orders SET order_vat_code = 'NP' WHERE UPPER(TRIM(COALESCE(order_vat_code, ''))) = 'O'") } catch { /* nop */ }
  try { run("UPDATE orders SET order_vat_code = 'ZW' WHERE UPPER(TRIM(COALESCE(order_vat_code, ''))) = 'E'") } catch { /* nop */ }
  try { run("UPDATE orders SET name = 'Zlecenie ' || COALESCE(order_number, '#' || id) WHERE name IS NULL OR TRIM(COALESCE(name,'')) = ''") } catch { /* nop */ }
  try { run("UPDATE orders SET invoice_status = 'to_issue' WHERE invoice_status IN ('issued', 'awaiting_payment', 'paid') AND (invoice_number IS NULL OR TRIM(COALESCE(invoice_number,'')) = '')") } catch { /* nop */ }
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS subcontracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        contractor_id INTEGER NOT NULL,
        subcontract_number TEXT NOT NULL,
        quantity REAL,
        rate_per_unit REAL,
        amount REAL,
        received_at TEXT,
        deadline_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (contractor_id) REFERENCES contractors(id)
      )
    `)
    const migrated = get<{ c: number }>('SELECT COUNT(*) AS c FROM subcontracts')
    if (migrated && migrated.c === 0) {
      const ordersWithContractor = all<{ id: number; contractor_id: number; quantity: number; rate_per_unit: number; amount: number; received_at: string; deadline_at: string | null }>('SELECT id, contractor_id, quantity, rate_per_unit, amount, received_at, deadline_at FROM orders WHERE contractor_id IS NOT NULL')
      for (const o of ordersWithContractor) {
        const num = nextSubcontractNumber()
        run('INSERT INTO subcontracts (order_id, contractor_id, subcontract_number, quantity, rate_per_unit, amount, received_at, deadline_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          o.id, o.contractor_id, num, o.quantity, o.rate_per_unit, o.amount, o.received_at, o.deadline_at)
      }
      for (const o of ordersWithContractor) {
        run('UPDATE orders SET contractor_id = NULL WHERE id = ?', o.id)
      }
    }
  } catch (e) {
    console.error('subcontracts init', e)
  }
  try { db.run('ALTER TABLE subcontracts ADD COLUMN name TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE subcontracts ADD COLUMN client_adds_vat INTEGER DEFAULT 0') } catch { /* already exists */ }
  try { db.run('ALTER TABLE subcontracts ADD COLUMN client_vat_code TEXT') } catch { /* already exists */ }
  try { run("UPDATE subcontracts SET name = 'Podzlecenie ' || COALESCE(subcontract_number, '#' || id) WHERE name IS NULL OR TRIM(COALESCE(name,'')) = ''") } catch { /* nop */ }
  try { db.run('ALTER TABLE subcontracts ADD COLUMN notes TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE subcontracts ADD COLUMN include_specialization INTEGER DEFAULT 1') } catch { /* already exists */ }
  try { db.run('ALTER TABLE subcontracts ADD COLUMN include_language_pair INTEGER DEFAULT 1') } catch { /* already exists */ }
  try { db.run('ALTER TABLE subcontracts ADD COLUMN include_service INTEGER DEFAULT 0') } catch { /* already exists */ }
  try { db.run('ALTER TABLE subcontracts ADD COLUMN description_custom_text TEXT') } catch { /* already exists */ }
  for (const col of ['street', 'building', 'local', 'postal_code', 'city', 'country', 'address_extra', 'nip', 'website', 'contact_person']) {
    try { db.run(`ALTER TABLE contractors ADD COLUMN ${col} TEXT`) } catch { /* already exists */ }
  }
  try { db.run('ALTER TABLE contractors ADD COLUMN country_code TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE contractors ADD COLUMN client_adds_vat INTEGER DEFAULT 0') } catch { /* already exists */ }
  try { db.run('ALTER TABLE contractors ADD COLUMN client_vat_code TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE contractors ADD COLUMN client_vat_rate REAL') } catch { /* already exists */ }
  try { db.run('ALTER TABLE contractors ADD COLUMN default_payment_days INTEGER DEFAULT 14') } catch { /* already exists */ }
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS contractor_unit_rates (
        contractor_id INTEGER NOT NULL,
        unit_id INTEGER NOT NULL,
        rate REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (contractor_id, unit_id),
        FOREIGN KEY (contractor_id) REFERENCES contractors(id),
        FOREIGN KEY (unit_id) REFERENCES units(id)
      )
    `)
    // Migrate to include language_pair_id (stawki zależne od kierunku języka)
    let hasLangPair = false
    try {
      const info = db.exec('PRAGMA table_info(contractor_unit_rates)')
      if (info.length > 0 && info[0].columns?.indexOf('name') >= 0) {
        const nameIdx = info[0].columns.indexOf('name')
        hasLangPair = (info[0].values as unknown[][]).some((row: unknown[]) => row[nameIdx] === 'language_pair_id')
      }
    } catch { /* ignore */ }
    if (!hasLangPair) {
      db.run(`
        CREATE TABLE contractor_unit_rates_new (
          contractor_id INTEGER NOT NULL,
          unit_id INTEGER NOT NULL,
          language_pair_id INTEGER NULL,
          rate REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (contractor_id, unit_id, language_pair_id),
          FOREIGN KEY (contractor_id) REFERENCES contractors(id),
          FOREIGN KEY (unit_id) REFERENCES units(id),
          FOREIGN KEY (language_pair_id) REFERENCES language_pairs(id)
        )
      `)
      db.run(`INSERT INTO contractor_unit_rates_new (contractor_id, unit_id, language_pair_id, rate) SELECT contractor_id, unit_id, NULL, rate FROM contractor_unit_rates`)
      db.run('DROP TABLE contractor_unit_rates')
      db.run('ALTER TABLE contractor_unit_rates_new RENAME TO contractor_unit_rates')
      saveDb()
    }
  } catch (e) {
    console.error('contractor_unit_rates init', e)
  }
  try {
    db.run('CREATE TABLE IF NOT EXISTS order_books (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, view_type TEXT NOT NULL DEFAULT \'simplified\', sort_order INTEGER NOT NULL DEFAULT 0)')
    // Nie dodajemy domyślnych ksiąg – użytkownik tworzy własne; lista kontrolna podpowie, gdy brak ksiąg.
  } catch { /* nop */ }
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS default_unit_rates (
        unit_id INTEGER NOT NULL,
        language_pair_id INTEGER NULL,
        rate REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'PLN',
        PRIMARY KEY (unit_id, language_pair_id),
        FOREIGN KEY (unit_id) REFERENCES units(id),
        FOREIGN KEY (language_pair_id) REFERENCES language_pairs(id)
      )
    `)
  } catch { /* nop */ }
  // Migracja: ta sama jednostka + para, różne waluty (id PK, UNIQUE(unit_id, language_pair_id, currency))
  try {
    let hasId = false
    const pragma = db.exec("PRAGMA table_info('default_unit_rates')")
    if (pragma.length > 0 && pragma[0].columns?.indexOf('name') >= 0) {
      const nameIdx = pragma[0].columns.indexOf('name')
      hasId = (pragma[0].values as unknown[][]).some((row: unknown[]) => row[nameIdx] === 'id')
    }
    if (!hasId) {
      db.run(`
        CREATE TABLE default_unit_rates_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          unit_id INTEGER NOT NULL,
          language_pair_id INTEGER NULL,
          rate REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'PLN',
          UNIQUE(unit_id, language_pair_id, currency),
          FOREIGN KEY (unit_id) REFERENCES units(id),
          FOREIGN KEY (language_pair_id) REFERENCES language_pairs(id)
        )
      `)
      db.run(`INSERT INTO default_unit_rates_new (unit_id, language_pair_id, rate, currency) SELECT unit_id, language_pair_id, rate, currency FROM default_unit_rates`)
      db.run('DROP TABLE default_unit_rates')
      db.run('ALTER TABLE default_unit_rates_new RENAME TO default_unit_rates')
      saveDb()
    }
  } catch (e) { console.error('default_unit_rates id migration', e) }
  try { db.run('ALTER TABLE default_unit_rates ADD COLUMN argument_key TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE default_unit_rates ADD COLUMN argument_value TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE default_unit_rates ADD COLUMN argument2_key TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE default_unit_rates ADD COLUMN argument2_value TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE default_unit_rates ADD COLUMN argument3_key TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE default_unit_rates ADD COLUMN argument3_value TEXT') } catch { /* already exists */ }
  try {
    db.run(`
      UPDATE default_unit_rates
      SET argument_key = 'language_pair',
          argument_value = (SELECT p.label FROM language_pairs p WHERE p.id = default_unit_rates.language_pair_id)
      WHERE language_pair_id IS NOT NULL
        AND (argument_key IS NULL OR TRIM(argument_key) = '')
    `)
  } catch (e) { console.error('default_unit_rates argument backfill', e) }

  try { db.run('ALTER TABLE language_pairs ADD COLUMN bidirectional INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
  // Usuń UNIQUE(source_lang_id, target_lang_id), żeby można było mieć np. EN<>PL i osobno EN>PL
  try {
    const info = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='language_pairs'")
    const sql = (info[0]?.values?.[0]?.[0] as string) ?? ''
    if (sql.includes('UNIQUE(source_lang_id')) {
      db.run(`
        CREATE TABLE language_pairs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_lang_id INTEGER NOT NULL,
          target_lang_id INTEGER NOT NULL,
          label TEXT NOT NULL,
          bidirectional INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (source_lang_id) REFERENCES languages(id),
          FOREIGN KEY (target_lang_id) REFERENCES languages(id)
        )
      `)
      db.run('INSERT INTO language_pairs_new (id, source_lang_id, target_lang_id, label, bidirectional) SELECT id, source_lang_id, target_lang_id, label, COALESCE(bidirectional, 0) FROM language_pairs')
      db.run('DROP TABLE language_pairs')
      db.run('ALTER TABLE language_pairs_new RENAME TO language_pairs')
      saveDb()
    }
  } catch (e) { console.error('language_pairs drop UNIQUE migration', e) }
  // W całej bazie: strzałki Unicode → ASCII (→ >, ↔ <>, ← <). Robimy w JS, żeby nie zależeć od sql.js bind + REPLACE.
  function arrowToAscii(s: string | null): string | null {
    if (s == null || typeof s !== 'string') return s
    return s.replace(/\u2192/g, '>').replace(/\u2194/g, '<>').replace(/\u2190/g, '<')
  }
  try {
    const pairs = all<{ id: number; label: string }>('SELECT id, label FROM language_pairs')
    for (const row of pairs) {
      const fixed = arrowToAscii(row.label)
      if (fixed !== row.label) run('UPDATE language_pairs SET label = ? WHERE id = ?', fixed, row.id)
    }
    const ordersOral = all<{ id: number; oral_lang: string }>('SELECT id, oral_lang FROM orders WHERE oral_lang IS NOT NULL')
    for (const row of ordersOral) {
      const fixed = arrowToAscii(row.oral_lang)
      if (fixed !== row.oral_lang) run('UPDATE orders SET oral_lang = ? WHERE id = ?', fixed, row.id)
    }
    const ordersInv = all<{ id: number; invoice_description: string }>('SELECT id, invoice_description FROM orders WHERE invoice_description IS NOT NULL')
    for (const row of ordersInv) {
      const fixed = arrowToAscii(row.invoice_description)
      if (fixed !== row.invoice_description) run('UPDATE orders SET invoice_description = ? WHERE id = ?', fixed, row.id)
    }
    const defRates = all<{ id: number; argument_value: string }>('SELECT id, argument_value FROM default_unit_rates WHERE argument_value IS NOT NULL')
    for (const row of defRates) {
      const fixed = arrowToAscii(row.argument_value)
      if (fixed !== row.argument_value) run('UPDATE default_unit_rates SET argument_value = ? WHERE id = ?', fixed, row.id)
    }
    const clientRates = all<{ id: number; argument_value: string }>('SELECT id, argument_value FROM client_default_unit_rates WHERE argument_value IS NOT NULL')
    for (const row of clientRates) {
      const fixed = arrowToAscii(row.argument_value)
      if (fixed !== row.argument_value) run('UPDATE client_default_unit_rates SET argument_value = ? WHERE id = ?', fixed, row.id)
    }
  } catch (e) { console.error('arrow-to-ascii migration', e) }
  try { db.run('ALTER TABLE units ADD COLUMN unit_category_id INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE unit_categories ADD COLUMN base_unit_id INTEGER REFERENCES units(id)') } catch { /* already exists */ }
  try { db.run('ALTER TABLE unit_categories ADD COLUMN oral_unit_id INTEGER REFERENCES units(id)') } catch { /* already exists */ }
  try { db.run('ALTER TABLE unit_categories ADD COLUMN page_unit_id INTEGER REFERENCES units(id)') } catch { /* already exists */ }
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS unit_category_units (
        unit_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (unit_id, category_id),
        FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES unit_categories(id) ON DELETE CASCADE
      )
    `)
  } catch { /* already exists */ }
  try {
    // Migracja: dotychczasowa relacja 1:N -> nowa tabela M:N
    db.run(`
      INSERT OR IGNORE INTO unit_category_units (unit_id, category_id)
      SELECT id, unit_category_id
      FROM units
      WHERE unit_category_id IS NOT NULL
    `)
  } catch { /* nop */ }

  // Custom columns for order books (view_type = 'custom')
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS custom_columns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        col_type TEXT NOT NULL DEFAULT 'text',
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (book_id) REFERENCES order_books(id) ON DELETE CASCADE
      )
    `)
    db.run(`
      CREATE TABLE IF NOT EXISTS custom_column_values (
        order_id INTEGER NOT NULL,
        column_id INTEGER NOT NULL,
        value TEXT,
        PRIMARY KEY (order_id, column_id),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (column_id) REFERENCES custom_columns(id) ON DELETE CASCADE
      )
    `)
  } catch { /* already exists */ }

  // Bank accounts for invoices
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_name TEXT NOT NULL DEFAULT '',
        bank_address TEXT DEFAULT '',
        account_number TEXT NOT NULL,
        swift TEXT DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'PLN',
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `)
  } catch { /* already exists */ }
  try { db.run('ALTER TABLE bank_accounts ADD COLUMN bank_address TEXT DEFAULT \'\'') } catch { /* column exists */ }

  const catCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM unit_categories')
  if (catCount && catCount.c === 0) {
    run("INSERT INTO unit_categories (name, base_rate, currency, sort_order) VALUES ('Ogólne', 0, 'PLN', 0)")
    saveDb()
  }

  const baseUnit = get<{ id: number }>('SELECT id FROM units WHERE is_base = 1')
  if (!baseUnit) {
    run("INSERT INTO units (name, multiplier_to_base, is_base) VALUES ('words', 1, 1)")
    run("INSERT INTO units (name, multiplier_to_base, is_base) VALUES ('pages', 250, 0)")
    run("INSERT INTO units (name, multiplier_to_base, is_base) VALUES ('characters_with_spaces', 0.2, 0)")
    saveDb()
  }

  const langCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM languages')
  if (langCount && langCount.c === 0) {
    const defaultLangs: [string, string, number][] = [
      ['EN', 'English', 1],
      ['PL', 'Polish', 2],
      ['DE', 'German', 3],
      ['FR', 'French', 4],
      ['ES', 'Spanish', 5],
      ['IT', 'Italian', 6],
      ['RU', 'Russian', 7],
      ['ZH', 'Chinese', 8],
      ['JA', 'Japanese', 9],
      ['AR', 'Arabic', 10],
      ['PT', 'Portuguese', 11],
      ['NL', 'Dutch', 12],
      ['UK', 'Ukrainian', 13],
      ['CS', 'Czech', 14],
      ['SK', 'Slovak', 15],
      ['HU', 'Hungarian', 16],
      ['SV', 'Swedish', 17],
      ['DA', 'Danish', 18],
      ['NO', 'Norwegian', 19],
      ['FI', 'Finnish', 20],
      ['EL', 'Greek', 21],
      ['TR', 'Turkish', 22],
      ['RO', 'Romanian', 23],
      ['BG', 'Bulgarian', 24],
      ['HR', 'Croatian', 25],
      ['SL', 'Slovenian', 26]
    ]
    for (const [code, name, sort_order] of defaultLangs) {
      run('INSERT INTO languages (code, name, sort_order) VALUES (?, ?, ?)', code, name, sort_order)
    }
    saveDb()
  }

  // Zostawiamy wyłącznie rekordy orders faktycznie widoczne na liście (JOIN clients + units).
  // Dzięki temu statystyki/płatności nie zaciągają "śmieciowych" rekordów z dawnych danych.
  const removedInvisibleOrders = cleanupInvisibleOrders()
  if (removedInvisibleOrders > 0) {
    console.warn(`cleanupInvisibleOrders: removed ${removedInvisibleOrders} invisible orders`)
  }
  const removedEmptyOrders = cleanupEmptyOrders()
  if (removedEmptyOrders > 0) {
    console.warn(`cleanupEmptyOrders: removed ${removedEmptyOrders} empty draft orders`)
  }

  runSchemaMigrations()
}

/** Zapisuje powiązanie pliku bazy z bieżącą organizacją i użytkownikiem (po potwierdzeniu DB_NOT_LINKED). */
export async function linkDatabaseFileToCurrentSession(): Promise<void> {
  const userData = app.getPath('userData')
  const dbFileName = (process.env.JOBRAVEN_DB_FILE || '').trim() || 'jobraven.db'
  const targetPath = path.join(userData, dbFileName)
  if (!fs.existsSync(targetPath)) return
  const expectedOrg = (process.env.JOBRAVEN_ORG_ID || '').trim() || 'admin'
  const expectedUserId = (process.env.JOBRAVEN_USER_ID || '').trim() || ''
  const locateFile = (file: string) => {
    const fromCwd = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
    if (fs.existsSync(fromCwd)) return fromCwd
    try {
      return path.join(path.dirname(require.resolve('sql.js/package.json')), 'dist', file)
    } catch {
      return fromCwd
    }
  }
  const SQL = await initSqlJs({ locateFile })
  const buf = fs.readFileSync(targetPath)
  const tempDb = new SQL.Database(new Uint8Array(buf))
  try {
    tempDb.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)')
    const run = (sql: string, ...params: (string | number)[]) => {
      const stmt = tempDb.prepare(sql)
      stmt.bind(params as (string | number | null)[])
      stmt.step()
      stmt.free()
    }
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'db_organization_id', expectedOrg)
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'db_user_id', expectedUserId)
    const data = tempDb.export()
    fs.writeFileSync(targetPath, Buffer.from(data))
  } finally {
    tempDb.close()
  }
}

const languages = {
  list: () => all('SELECT * FROM languages ORDER BY sort_order, code'),
  add: (row: { code: string; name: string; sort_order?: number }) => {
    run('INSERT INTO languages (code, name, sort_order) VALUES (?, ?, ?)', row.code, row.name, row.sort_order ?? 0)
    return getLastId()
  },
  update: (id: number, row: { code?: string; name?: string; sort_order?: number }) => {
    const prev = get<{ code: string; name: string; sort_order: number }>('SELECT * FROM languages WHERE id = ?', id)
    if (!prev) return
    run('UPDATE languages SET code = ?, name = ?, sort_order = ? WHERE id = ?', row.code ?? prev.code, row.name ?? prev.name, row.sort_order ?? prev.sort_order, id)
  },
  delete: (id: number) => { run('DELETE FROM languages WHERE id = ?', id) }
}

function normalizeLabelForApi(label: string | null | undefined): string {
  if (label == null || typeof label !== 'string') return label ?? ''
  return label.replace(/\u2192/g, '>').replace(/\u2194/g, '<>').replace(/\u2190/g, '<')
}

const languagePairs = {
  list: () => {
    const rows = all<Record<string, unknown> & { label: string }>(`
      SELECT p.*, s.code AS source_code, s.name AS source_name, t.code AS target_code, t.name AS target_name
      FROM language_pairs p
      JOIN languages s ON p.source_lang_id = s.id
      JOIN languages t ON p.target_lang_id = t.id
      ORDER BY p.label
    `)
    return rows.map((r) => ({ ...r, label: normalizeLabelForApi(r.label) }))
  },
  add: (row: { source_lang_id: number; target_lang_id: number; label?: string; bidirectional?: boolean }) => {
    let label = (row.label ?? '').trim()
    const bidirectional = row.bidirectional ? 1 : 0
    if (!label) {
      const s = get<{ code: string }>('SELECT code FROM languages WHERE id = ?', row.source_lang_id)
      const t = get<{ code: string }>('SELECT code FROM languages WHERE id = ?', row.target_lang_id)
      label = bidirectional ? `${s?.code ?? ''} <> ${t?.code ?? ''}` : `${s?.code ?? ''} > ${t?.code ?? ''}`
    }
    run('INSERT INTO language_pairs (source_lang_id, target_lang_id, label, bidirectional) VALUES (?, ?, ?, ?)', row.source_lang_id, row.target_lang_id, label, bidirectional)
    return getLastId()
  },
  update: (id: number, row: { source_lang_id?: number; target_lang_id?: number; label?: string; bidirectional?: boolean }) => {
    const prev = get<{ source_lang_id: number; target_lang_id: number; label: string; bidirectional: number }>('SELECT * FROM language_pairs WHERE id = ?', id)
    if (!prev) return
    const bidirectional = row.bidirectional !== undefined ? (row.bidirectional ? 1 : 0) : prev.bidirectional
    run('UPDATE language_pairs SET source_lang_id = ?, target_lang_id = ?, label = ?, bidirectional = ? WHERE id = ?', row.source_lang_id ?? prev.source_lang_id, row.target_lang_id ?? prev.target_lang_id, row.label ?? prev.label, bidirectional, id)
  },
  delete: (id: number) => { run('DELETE FROM language_pairs WHERE id = ?', id) }
}

function normalizeCategoryIds(ids?: Array<number | string | null | undefined>): number[] {
  if (!Array.isArray(ids)) return []
  const out: number[] = []
  for (const raw of ids) {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
    if (!Number.isNaN(n) && n > 0 && !out.includes(n)) out.push(n)
  }
  return out
}

function syncUnitCategoryLinks(unitId: number, categoryIds: number[]) {
  run('DELETE FROM unit_category_units WHERE unit_id = ?', unitId)
  for (const categoryId of categoryIds) {
    run('INSERT OR IGNORE INTO unit_category_units (unit_id, category_id) VALUES (?, ?)', unitId, categoryId)
  }
}

const unitCategories = {
  list: () => all(`
    SELECT c.id, c.name, c.base_rate, c.currency, c.sort_order, c.base_unit_id, c.oral_unit_id, c.page_unit_id,
      u.name AS base_unit_name
    FROM unit_categories c
    LEFT JOIN units u ON c.base_unit_id = u.id
    ORDER BY c.sort_order, c.name
  `),
  add: (row: { name: string; sort_order?: number }) => {
    run(
      'INSERT INTO unit_categories (name, base_rate, currency, sort_order) VALUES (?, 0, \'PLN\', ?)',
      row.name,
      row.sort_order ?? 0
    )
    return getLastId()
  },
  update: (id: number, row: { name?: string; base_unit_id?: number | null; oral_unit_id?: number | null; page_unit_id?: number | null }) => {
    const prev = get<{ name: string; base_unit_id: number | null; oral_unit_id: number | null; page_unit_id: number | null }>('SELECT name, base_unit_id, oral_unit_id, page_unit_id FROM unit_categories WHERE id = ?', id)
    if (!prev) return
    run(
      'UPDATE unit_categories SET name = ?, base_unit_id = ?, oral_unit_id = ?, page_unit_id = ? WHERE id = ?',
      row.name ?? prev.name,
      row.base_unit_id !== undefined ? row.base_unit_id : prev.base_unit_id,
      row.oral_unit_id !== undefined ? row.oral_unit_id : prev.oral_unit_id,
      row.page_unit_id !== undefined ? row.page_unit_id : prev.page_unit_id,
      id
    )
  },
  delete: (id: number) => {
    run('DELETE FROM unit_category_units WHERE category_id = ?', id)
    run('UPDATE units SET unit_category_id = NULL WHERE unit_category_id = ?', id)
    run(`
      UPDATE units
      SET unit_category_id = (
        SELECT MIN(link.category_id)
        FROM unit_category_units link
        WHERE link.unit_id = units.id
      )
      WHERE unit_category_id IS NULL
    `)
    run('DELETE FROM unit_categories WHERE id = ?', id)
  }
}

const units = {
  list: () => all<{
    id: number
    name: string
    multiplier_to_base: number
    is_base: number
    unit_category_id: number | null
    category_name: string | null
    category_base_rate: number | null
    category_currency: string | null
    unit_category_ids_csv: string | null
  }>(`
    SELECT u.id, u.name, u.multiplier_to_base, u.is_base, u.unit_category_id, c.name AS category_name, c.base_rate AS category_base_rate, c.currency AS category_currency,
      GROUP_CONCAT(link.category_id) AS unit_category_ids_csv
    FROM units u
    LEFT JOIN unit_categories c ON u.unit_category_id = c.id
    LEFT JOIN unit_category_units link ON link.unit_id = u.id
    GROUP BY u.id
    ORDER BY u.is_base DESC, c.sort_order, c.name, u.name
  `).map((row) => {
    const parsed = String(row.unit_category_ids_csv ?? '')
      .split(',')
      .map(v => parseInt(v, 10))
      .filter(v => !Number.isNaN(v))
    const unitCategoryIds = Array.from(new Set(parsed))
    return {
      ...row,
      unit_category_ids: unitCategoryIds
    }
  }),
  add: (row: { name: string; multiplier_to_base: number; is_base?: number; unit_category_id?: number | null; unit_category_ids?: number[] }) => {
    if (row.is_base) run('UPDATE units SET is_base = 0')
    const categoryIds = normalizeCategoryIds(Array.isArray(row.unit_category_ids) ? row.unit_category_ids : (row.unit_category_id != null ? [row.unit_category_id] : []))
    const primaryCategoryId = categoryIds[0] ?? (row.unit_category_id ?? null)
    run(
      'INSERT INTO units (name, multiplier_to_base, is_base, unit_category_id) VALUES (?, ?, ?, ?)',
      row.name,
      row.multiplier_to_base,
      row.is_base ?? 0,
      primaryCategoryId
    )
    const id = getLastId()
    syncUnitCategoryLinks(id, categoryIds)
    return id
  },
  update: (id: number, row: { name?: string; multiplier_to_base?: number; is_base?: number; unit_category_id?: number | null; unit_category_ids?: number[] }) => {
    const prev = get<{ name: string; multiplier_to_base: number; is_base: number; unit_category_id: number | null }>('SELECT * FROM units WHERE id = ?', id)
    if (!prev) return
    if (row.is_base) run('UPDATE units SET is_base = 0')
    const requestedCategoryIds = Array.isArray(row.unit_category_ids)
      ? normalizeCategoryIds(row.unit_category_ids)
      : null
    const primaryCategoryId = requestedCategoryIds
      ? (requestedCategoryIds[0] ?? null)
      : (row.unit_category_id !== undefined ? row.unit_category_id : prev.unit_category_id)
    run(
      'UPDATE units SET name = ?, multiplier_to_base = ?, is_base = ?, unit_category_id = ? WHERE id = ?',
      row.name ?? prev.name,
      row.multiplier_to_base ?? prev.multiplier_to_base,
      row.is_base ?? prev.is_base,
      primaryCategoryId,
      id
    )
    if (requestedCategoryIds) syncUnitCategoryLinks(id, requestedCategoryIds)
    else if (row.unit_category_id !== undefined) syncUnitCategoryLinks(id, row.unit_category_id == null ? [] : [row.unit_category_id])
  },
  delete: (id: number) => {
    run('DELETE FROM unit_category_units WHERE unit_id = ?', id)
    run('UPDATE unit_categories SET base_unit_id = NULL WHERE base_unit_id = ?', id)
    run('UPDATE unit_categories SET oral_unit_id = NULL WHERE oral_unit_id = ?', id)
    run('UPDATE unit_categories SET page_unit_id = NULL WHERE page_unit_id = ?', id)
    run('DELETE FROM units WHERE id = ?', id)
  },
  setBase: (id: number) => {
    run('UPDATE units SET is_base = 0')
    run('UPDATE units SET is_base = 1 WHERE id = ?', id)
    saveDb()
  }
}

const contractors = {
  list: () => all('SELECT id, name, short_name, street, building, local, postal_code, city, country, country_code, nip, default_payment_days, email, phone, address_extra, website, contact_person, notes, client_adds_vat, client_vat_code, client_vat_rate FROM contractors ORDER BY short_name'),
  get: (id: number) => get('SELECT * FROM contractors WHERE id = ?', id),
  add: (row: Record<string, unknown>) => {
    run(
      `INSERT INTO contractors (name, short_name, email, phone, notes, street, building, local, postal_code, city, country, country_code, address_extra, nip, website, contact_person, default_payment_days, client_adds_vat, client_vat_code, client_vat_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.name, row.short_name ?? row.name, row.email ?? null, row.phone ?? null, row.notes ?? null,
      row.street ?? null, row.building ?? null, row.local ?? null, row.postal_code ?? null, row.city ?? null, row.country ?? null, row.country_code ?? null,
      row.address_extra ?? null, row.nip ?? null, row.website ?? null, row.contact_person ?? null, row.default_payment_days ?? 14,
      (row.client_adds_vat as number) ? 1 : 0, (row.client_vat_code as string) ?? null, row.client_vat_rate != null ? Number(row.client_vat_rate) : null
    )
    return getLastId()
  },
  update: (id: number, row: Record<string, unknown>) => {
    const prev = get<Record<string, unknown>>('SELECT * FROM contractors WHERE id = ?', id)
    if (!prev) return
    const merge = (key: string) => (row[key] !== undefined ? row[key] : prev[key])
    run(
      `UPDATE contractors SET name = ?, short_name = ?, email = ?, phone = ?, notes = ?, street = ?, building = ?, local = ?, postal_code = ?, city = ?, country = ?, country_code = ?, address_extra = ?, nip = ?, website = ?, contact_person = ?, default_payment_days = ?, client_adds_vat = ?, client_vat_code = ?, client_vat_rate = ? WHERE id = ?`,
      merge('name'), merge('short_name'), merge('email'), merge('phone'), merge('notes'),
      merge('street'), merge('building'), merge('local'), merge('postal_code'), merge('city'), merge('country'), merge('country_code'),
      merge('address_extra'), merge('nip'), merge('website'), merge('contact_person'), (Number(merge('default_payment_days')) || 14),
      (merge('client_adds_vat') as number) ? 1 : 0, merge('client_vat_code') ?? null, merge('client_vat_rate') != null ? Number(merge('client_vat_rate')) : null, id
    )
  },
  delete: (id: number) => { run('DELETE FROM contractors WHERE id = ?', id) }
}

const specializations = {
  list: () => all('SELECT * FROM specializations ORDER BY sort_order, name'),
  add: (row: { name: string; sort_order?: number }) => {
    run('INSERT INTO specializations (name, sort_order) VALUES (?, ?)', row.name, row.sort_order ?? 0)
    return getLastId()
  },
  update: (id: number, row: { name?: string; sort_order?: number }) => {
    const prev = get<{ name: string; sort_order: number }>('SELECT * FROM specializations WHERE id = ?', id)
    if (!prev) return
    run('UPDATE specializations SET name = ?, sort_order = ? WHERE id = ?', row.name ?? prev.name, row.sort_order ?? prev.sort_order, id)
  },
  delete: (id: number) => { run('DELETE FROM specializations WHERE id = ?', id) }
}

const services = {
  list: () => all<{ id: number; name: string; vat_rate: number }>('SELECT * FROM services ORDER BY name'),
  add: (row: { name: string; vat_rate?: number }) => {
    const vatRate = typeof row.vat_rate === 'number' && Number.isFinite(row.vat_rate) ? row.vat_rate : 23
    run('INSERT INTO services (name, vat_rate) VALUES (?, ?)', row.name, vatRate)
    return getLastId()
  },
  update: (id: number, row: { name?: string; vat_rate?: number }) => {
    const prev = get<{ name: string; vat_rate: number }>('SELECT name, vat_rate FROM services WHERE id = ?', id)
    if (!prev) return
    const vatRate = typeof row.vat_rate === 'number' && Number.isFinite(row.vat_rate) ? row.vat_rate : prev.vat_rate
    run('UPDATE services SET name = ?, vat_rate = ? WHERE id = ?', row.name ?? prev.name, vatRate, id)
  },
  delete: (id: number) => {
    run('DELETE FROM service_vat_rules WHERE service_id = ?', id)
    run('DELETE FROM services WHERE id = ?', id)
  }
}

const serviceVatRules = {
  listByService: (serviceId: number) => all<{ id: number; service_id: number; client_segment: string; country_code: string | null; value_type: 'rate' | 'code'; rate_value: number | null; code_value: string | null }>(
    'SELECT * FROM service_vat_rules WHERE service_id = ? ORDER BY client_segment, country_code IS NOT NULL DESC, country_code, id',
    serviceId
  ),
  upsert: (row: { service_id: number; client_segment: string; country_code?: string | null; value_type: 'rate' | 'code'; rate_value?: number | null; code_value?: string | null }) => {
    const normalizedCountry = (row.country_code ?? '').trim().toUpperCase() || null
    const existing = get<{ id: number }>(
      "SELECT id FROM service_vat_rules WHERE service_id = ? AND client_segment = ? AND COALESCE(country_code, '') = COALESCE(?, '')",
      row.service_id, row.client_segment, normalizedCountry
    )
    if (existing) {
      run(
        'UPDATE service_vat_rules SET value_type = ?, rate_value = ?, code_value = ? WHERE id = ?',
        row.value_type, row.rate_value ?? null, row.code_value ?? null, existing.id
      )
      return existing.id
    }
    run(
      'INSERT INTO service_vat_rules (service_id, client_segment, country_code, value_type, rate_value, code_value) VALUES (?, ?, ?, ?, ?, ?)',
      row.service_id, row.client_segment, normalizedCountry, row.value_type, row.rate_value ?? null, row.code_value ?? null
    )
    return getLastId()
  },
  delete: (id: number) => { run('DELETE FROM service_vat_rules WHERE id = ?', id) }
}

const clients = {
  list: () => all('SELECT id, name, short_name, street, building, local, postal_code, city, country, country_code, nip, default_payment_days, client_kind, vat_eu FROM clients ORDER BY short_name'),
  get: (id: number) => get('SELECT * FROM clients WHERE id = ?', id),
  add: (row: Record<string, unknown>) => {
    run(
      `INSERT INTO clients (name, short_name, street, building, local, postal_code, city, country, country_code, address_extra, nip, notes, email, website, phone, contact_person, default_payment_days, client_kind, vat_eu) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.name, row.short_name ?? row.name, row.street ?? null, row.building ?? null, row.local ?? null,
      row.postal_code ?? null, row.city ?? null, row.country ?? null, row.country_code ?? null, row.address_extra ?? null,
      row.nip ?? null, row.notes ?? null, row.email ?? null, row.website ?? null, row.phone ?? null,
      row.contact_person ?? null, row.default_payment_days ?? 14, row.client_kind ?? 'company', row.vat_eu ?? 0
    )
    return getLastId()
  },
  update: (id: number, row: Record<string, unknown>) => {
    const prev = get<Record<string, unknown>>('SELECT * FROM clients WHERE id = ?', id)
    if (!prev) return
    const merge = (key: string) => (row[key] !== undefined ? row[key] : prev[key])
    const vatEu = row.vat_eu !== undefined ? (Number(row.vat_eu) ? 1 : 0) : (prev.vat_eu !== undefined ? Number(prev.vat_eu) : 0)
    run(
      `UPDATE clients SET name = ?, short_name = ?, street = ?, building = ?, local = ?, postal_code = ?, city = ?, country = ?, country_code = ?, address_extra = ?, nip = ?, notes = ?, email = ?, website = ?, phone = ?, contact_person = ?, default_payment_days = ?, client_kind = ?, vat_eu = ?, updated_at = datetime('now') WHERE id = ?`,
      merge('name'), merge('short_name'), merge('street'), merge('building'), merge('local'),
      merge('postal_code'), merge('city'), merge('country'), merge('country_code'), merge('address_extra'), merge('nip'), merge('notes'),
      merge('email'), merge('website'), merge('phone'), merge('contact_person'), merge('default_payment_days'), merge('client_kind'), vatEu, id
    )
  },
  delete: (id: number) => { run('DELETE FROM clients WHERE id = ?', id) }
}

function nextOrderNumber(bookId?: number): string {
  const bid = bookId ?? 1
  const book = get<{ order_number_format: string | null }>('SELECT order_number_format FROM order_books WHERE id = ?', bid)
  const format = (book?.order_number_format?.trim() || settings.get('order_number_format') || 'Z/{YYYY}/{NR}')
  const rows = all<{ order_number: string | null }>("SELECT order_number FROM orders WHERE book_id = ? AND order_number IS NOT NULL AND TRIM(order_number) != ''", bid)
  let nextNr = 1
  if (rows.length > 0) {
    const numbers = rows.map(r => {
      const s = String(r.order_number ?? '').trim()
      const m = s.match(/(\d+)\s*$/)
      return m ? parseInt(m[1], 10) : 0
    }).filter(n => n > 0)
    if (numbers.length > 0) nextNr = Math.max(...numbers) + 1
  }
  const y = new Date().getFullYear()
  const m = String(new Date().getMonth() + 1).padStart(2, '0')
  return format
    .replace('{YYYY}', String(y))
    .replace('{YY}', String(y).slice(-2))
    .replace('{MM}', m)
    .replace('{NR}', String(nextNr))
    .replace('{nr}', String(nextNr).padStart(4, '0'))
}

function nextSubcontractNumber(): string {
  const format = settings.get('subcontract_number_format') ?? 'PZ/{YYYY}/{NR}'
  const rows = all<{ subcontract_number: string }>("SELECT subcontract_number FROM subcontracts WHERE subcontract_number IS NOT NULL AND TRIM(subcontract_number) != ''")
  let nextNr = 1
  if (rows.length > 0) {
    const numbers = rows.map(r => {
      const s = String(r.subcontract_number ?? '').trim()
      const m = s.match(/(\d+)\s*$/)
      return m ? parseInt(m[1], 10) : 0
    }).filter(n => n > 0)
    if (numbers.length > 0) nextNr = Math.max(...numbers) + 1
  }
  const y = new Date().getFullYear()
  const m = String(new Date().getMonth() + 1).padStart(2, '0')
  return format
    .replace('{YYYY}', String(y))
    .replace('{YY}', String(y).slice(-2))
    .replace('{MM}', m)
    .replace('{NR}', String(nextNr))
    .replace('{nr}', String(nextNr).padStart(4, '0'))
}

const subcontracts = {
  list: () => {
    const rows = all(`
      SELECT s.id, s.order_id, s.contractor_id, s.subcontract_number, s.name, s.notes, s.include_specialization, s.include_language_pair, s.include_service, s.description_custom_text, s.quantity, s.rate_per_unit, s.amount, s.received_at, s.deadline_at,
        o.order_number, o.rate_currency, o.received_at AS order_received_at, o.quantity AS order_quantity, o.rate_per_unit AS order_rate_per_unit, o.amount AS order_amount,
        c.short_name AS client_short_name, ct.short_name AS contractor_short_name,
        u.name AS unit_name, p.label AS language_pair_label, sp.name AS specialization_name
      FROM subcontracts s
      JOIN orders o ON s.order_id = o.id
      JOIN clients c ON o.client_id = c.id
      JOIN units u ON o.unit_id = u.id
      LEFT JOIN contractors ct ON s.contractor_id = ct.id
      LEFT JOIN language_pairs p ON o.language_pair_id = p.id
      LEFT JOIN specializations sp ON o.specialization_id = sp.id
      ORDER BY s.id DESC
    `) as (Record<string, unknown>)[]
    return rows.map(r => ({
      ...r,
      received_at: r.received_at ?? r.order_received_at,
      quantity: r.quantity ?? r.order_quantity ?? 0,
      rate_per_unit: r.rate_per_unit ?? r.order_rate_per_unit ?? 0,
      amount: r.amount ?? r.order_amount ?? 0
    }))
  },
  get: (id: number) => {
    const row = get(`
      SELECT s.*, o.order_number, o.rate_currency, o.received_at AS order_received_at, o.quantity AS order_quantity, o.rate_per_unit AS order_rate_per_unit, o.amount AS order_amount,
        c.short_name AS client_short_name, ct.short_name AS contractor_short_name,
        u.name AS unit_name, p.label AS language_pair_label, sp.name AS specialization_name
      FROM subcontracts s
      JOIN orders o ON s.order_id = o.id
      JOIN clients c ON o.client_id = c.id
      JOIN units u ON o.unit_id = u.id
      LEFT JOIN contractors ct ON s.contractor_id = ct.id
      LEFT JOIN language_pairs p ON o.language_pair_id = p.id
      LEFT JOIN specializations sp ON o.specialization_id = sp.id
      WHERE s.id = ?
    `, id) as Record<string, unknown> | undefined
    if (!row) return undefined
    return {
      ...row,
      received_at: row.received_at ?? row.order_received_at,
      quantity: row.quantity ?? row.order_quantity ?? 0,
      rate_per_unit: row.rate_per_unit ?? row.order_rate_per_unit ?? 0,
      amount: row.amount ?? row.order_amount ?? 0
    }
  },
  add: (row: Record<string, unknown>) => {
    const orderId = row.order_id as number
    const order = get<{ received_at: string; quantity: number; rate_per_unit: number; amount: number }>('SELECT received_at, quantity, rate_per_unit, amount FROM orders WHERE id = ?', orderId)
    const num = nextSubcontractNumber()
    run(
      `INSERT INTO subcontracts (order_id, contractor_id, subcontract_number, name, notes, include_specialization, include_language_pair, include_service, description_custom_text, quantity, rate_per_unit, amount, received_at, deadline_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderId, row.contractor_id, num, row.name ?? null, (row.notes as string) ?? null,
      (row.include_specialization as number) ?? 1, (row.include_language_pair as number) ?? 1, (row.include_service as number) ?? 0, (row.description_custom_text as string) ?? null,
      row.quantity ?? order?.quantity ?? 0, row.rate_per_unit ?? order?.rate_per_unit ?? 0, row.amount ?? order?.amount ?? 0,
      (row.received_at as string) ?? order?.received_at ?? null, row.deadline_at ?? null
    )
    return getLastId()
  },
  update: (id: number, row: Record<string, unknown>) => {
    const prev = get<Record<string, unknown>>('SELECT * FROM subcontracts WHERE id = ?', id)
    if (!prev) return
    const merge = (key: string) => (row[key] !== undefined ? row[key] : prev[key])
    run(
      `UPDATE subcontracts SET contractor_id = ?, name = ?, notes = ?, include_specialization = ?, include_language_pair = ?, include_service = ?, description_custom_text = ?, quantity = ?, rate_per_unit = ?, amount = ?, deadline_at = ? WHERE id = ?`,
      merge('contractor_id'), merge('name'), merge('notes') ?? null,
      (row.include_specialization !== undefined ? (row.include_specialization ? 1 : 0) : (prev.include_specialization ? 1 : 0)),
      (row.include_language_pair !== undefined ? (row.include_language_pair ? 1 : 0) : (prev.include_language_pair ? 1 : 0)),
      (row.include_service !== undefined ? (row.include_service ? 1 : 0) : (prev.include_service ? 1 : 0)),
      merge('description_custom_text') ?? null, merge('quantity'), merge('rate_per_unit'), merge('amount'), merge('deadline_at'), id
    )
  },
  delete: (id: number) => { run('DELETE FROM subcontracts WHERE id = ?', id) },
  listByOrderId: (orderId: number) => all(`
    SELECT s.id, s.order_id, s.contractor_id, s.subcontract_number, s.name, s.notes, s.include_specialization, s.include_language_pair, s.include_service, s.description_custom_text, s.quantity, s.rate_per_unit, s.amount, s.deadline_at, ct.short_name AS contractor_short_name, o.rate_currency
    FROM subcontracts s
    LEFT JOIN contractors ct ON s.contractor_id = ct.id
    LEFT JOIN orders o ON s.order_id = o.id
    WHERE s.order_id = ?
    ORDER BY s.id
  `, orderId),
  nextSubcontractNumber
}

function normalizeRateCurrency(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

const orders = {
  list: (bookId?: number) => {
    const base = `
    SELECT o.*, c.short_name AS client_short_name, c.name AS client_name, c.street AS client_street, c.building AS client_building, c.local AS client_local, c.postal_code AS client_postal_code, c.city AS client_city, c.country AS client_country,
      u.name AS unit_name, u.multiplier_to_base, u.is_base, p.label AS language_pair_label,
      ls.name AS source_lang_name, lt.name AS target_lang_name, ls.code AS source_lang_code, lt.code AS target_lang_code,
      ct.short_name AS contractor_short_name, s.name AS specialization_name, sv.name AS service_name
    FROM orders o
    JOIN clients c ON o.client_id = c.id
    JOIN units u ON o.unit_id = u.id
    LEFT JOIN language_pairs p ON o.language_pair_id = p.id
    LEFT JOIN languages ls ON p.source_lang_id = ls.id
    LEFT JOIN languages lt ON p.target_lang_id = lt.id
    LEFT JOIN contractors ct ON o.contractor_id = ct.id
    LEFT JOIN specializations s ON o.specialization_id = s.id
    LEFT JOIN services sv ON o.service_id = sv.id
    `
    const orderBy = ' ORDER BY o.received_at DESC, o.id DESC'
    if (bookId != null) return all(base + ' WHERE o.book_id = ?' + orderBy, bookId)
    return all(base + orderBy)
  },
  get: (id: number) => get(`
    SELECT o.*, c.short_name AS client_short_name, c.name AS client_name, c.street AS client_street, c.building AS client_building, c.local AS client_local, c.postal_code AS client_postal_code, c.city AS client_city, c.country AS client_country, c.default_payment_days, u.name AS unit_name, u.multiplier_to_base, u.is_base, p.label AS language_pair_label, p.source_lang_id, p.target_lang_id,
      ls.name AS source_lang_name, lt.name AS target_lang_name, ls.code AS source_lang_code, lt.code AS target_lang_code,
      ct.short_name AS contractor_short_name, ct.name AS contractor_name, s.name AS specialization_name, sv.name AS service_name
    FROM orders o
    JOIN clients c ON o.client_id = c.id
    JOIN units u ON o.unit_id = u.id
    LEFT JOIN language_pairs p ON o.language_pair_id = p.id
    LEFT JOIN languages ls ON p.source_lang_id = ls.id
    LEFT JOIN languages lt ON p.target_lang_id = lt.id
    LEFT JOIN contractors ct ON o.contractor_id = ct.id
    LEFT JOIN specializations s ON o.specialization_id = s.id
    LEFT JOIN services sv ON o.service_id = sv.id
    WHERE o.id = ?
  `, id),
  add: (row: Record<string, unknown>) => {
    const bookId = (row.book_id as number) ?? 1
    const orderNumber = (row.order_number as string) ?? nextOrderNumber(bookId)
    const cols = ['client_id', 'received_at', 'deadline_at', 'specialization', 'specialization_id', 'language_pair_id', 'unit_id', 'quantity', 'rate_per_unit', 'amount', 'order_status', 'invoice_status', 'contractor_id', 'order_number', 'book_id', 'completed_at', 'order_vat_rate', 'order_vat_code', 'name', 'repertorium_description', 'invoice_description', 'translation_type', 'document_author', 'document_name', 'document_date', 'document_number', 'document_form_remarks', 'extra_copies', 'repertorium_notes', 'repertorium_activity_type', 'payment_due_at', 'oral_date', 'oral_place', 'oral_lang', 'oral_duration', 'oral_scope', 'oral_rate', 'oral_net', 'oral_gross', 'oral_notes', 'refusal_date', 'refusal_organ', 'refusal_reason', 'service_id', 'include_service_on_invoice', 'include_language_pair_on_invoice', 'include_invoice_description_on_invoice', 'rate_currency', 'invoice_notes', 'invoice_bank_account_id', 'invoice_provider_source']
    const raw: Record<string, unknown> = { ...row, order_number: orderNumber, book_id: bookId }
    const defaults: Record<string, unknown> = { extra_copies: 0, quantity: 0, rate_per_unit: 0, amount: 0, order_vat_rate: null, order_vat_code: null, order_status: 'to_do', invoice_status: 'to_issue', include_service_on_invoice: 1, include_language_pair_on_invoice: 1, include_invoice_description_on_invoice: 1 }
    const values = cols.map(c => c === 'rate_currency' ? normalizeRateCurrency(raw[c] ?? defaults[c] ?? null) : (raw[c] ?? defaults[c] ?? null))
    run(`INSERT INTO orders (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...values)
    return getLastId()
  },
  update: (id: number, row: Record<string, unknown>) => {
    const prev = get<Record<string, unknown>>('SELECT * FROM orders WHERE id = ?', id)
    if (!prev) return
    const merge = (key: string) => (row[key] !== undefined ? row[key] : prev[key])
    const invNum = merge('invoice_number')
    const hasInvoiceNumber = invNum != null && String(invNum).trim() !== ''
    const requestedStatus = merge('invoice_status') as string
    const invoiceStatus = (!hasInvoiceNumber && ['issued', 'awaiting_payment', 'paid'].includes(requestedStatus)) ? 'to_issue' : requestedStatus
    const newContractorId = merge('contractor_id') as number | null
    if (newContractorId != null) {
      subcontracts.add({ order_id: id, contractor_id: newContractorId, quantity: merge('quantity'), rate_per_unit: merge('rate_per_unit'), amount: merge('amount'), received_at: merge('received_at'), deadline_at: merge('deadline_at'), name: merge('name') })
      run(
        `UPDATE orders SET client_id = ?, received_at = ?, deadline_at = ?, specialization = ?, specialization_id = ?, language_pair_id = ?, unit_id = ?, quantity = ?, rate_per_unit = ?, amount = ?, order_status = ?, invoice_status = ?, invoice_number = ?, invoice_date = ?, invoice_sale_date = ?, payment_due_at = ?, contractor_id = NULL, order_number = ?, book_id = ?, completed_at = ?, name = ?, repertorium_description = ?, invoice_description = ?, translation_type = ?, document_author = ?, document_name = ?, document_date = ?, document_number = ?, document_form_remarks = ?, extra_copies = ?, repertorium_notes = ?, repertorium_activity_type = ?, oral_date = ?, oral_place = ?, oral_lang = ?, oral_duration = ?, oral_scope = ?, oral_rate = ?, oral_net = ?, oral_gross = ?, oral_notes = ?, refusal_date = ?, refusal_organ = ?, refusal_reason = ?, service_id = ?, include_service_on_invoice = ?, include_language_pair_on_invoice = ?, include_invoice_description_on_invoice = ?, rate_currency = ?, order_vat_rate = ?, order_vat_code = ?, invoice_notes = ?, invoice_bank_account_id = ?, updated_at = datetime('now') WHERE id = ?`,
        merge('client_id'), merge('received_at'), merge('deadline_at'), merge('specialization'), merge('specialization_id'), merge('language_pair_id'),
        merge('unit_id'), merge('quantity'), merge('rate_per_unit'), merge('amount'),
        merge('order_status'), invoiceStatus, merge('invoice_number'), merge('invoice_date'), merge('invoice_sale_date'), merge('payment_due_at'),
        merge('order_number'), merge('book_id'), merge('completed_at'), merge('name'), merge('repertorium_description'), merge('invoice_description'), merge('translation_type'),
        merge('document_author'), merge('document_name'), merge('document_date'), merge('document_number'), merge('document_form_remarks'), merge('extra_copies'), merge('repertorium_notes'), merge('repertorium_activity_type'),
        merge('oral_date'), merge('oral_place'), merge('oral_lang'), merge('oral_duration'), merge('oral_scope'), merge('oral_rate'), merge('oral_net'), merge('oral_gross'), merge('oral_notes'), merge('refusal_date'), merge('refusal_organ'), merge('refusal_reason'),
        merge('service_id'), merge('include_service_on_invoice'), merge('include_language_pair_on_invoice'), merge('include_invoice_description_on_invoice'), normalizeRateCurrency(merge('rate_currency')), merge('order_vat_rate'), merge('order_vat_code'), merge('invoice_notes'), merge('invoice_bank_account_id'), id
      )
    } else {
      run(
        `UPDATE orders SET client_id = ?, received_at = ?, deadline_at = ?, specialization = ?, specialization_id = ?, language_pair_id = ?, unit_id = ?, quantity = ?, rate_per_unit = ?, amount = ?, order_status = ?, invoice_status = ?, invoice_number = ?, invoice_date = ?, invoice_sale_date = ?, payment_due_at = ?, contractor_id = ?, order_number = ?, book_id = ?, completed_at = ?, name = ?, repertorium_description = ?, invoice_description = ?, translation_type = ?, document_author = ?, document_name = ?, document_date = ?, document_number = ?, document_form_remarks = ?, extra_copies = ?, repertorium_notes = ?, repertorium_activity_type = ?, oral_date = ?, oral_place = ?, oral_lang = ?, oral_duration = ?, oral_scope = ?, oral_rate = ?, oral_net = ?, oral_gross = ?, oral_notes = ?, refusal_date = ?, refusal_organ = ?, refusal_reason = ?, service_id = ?, include_service_on_invoice = ?, include_language_pair_on_invoice = ?, include_invoice_description_on_invoice = ?, rate_currency = ?, order_vat_rate = ?, order_vat_code = ?, invoice_notes = ?, invoice_bank_account_id = ?, updated_at = datetime('now') WHERE id = ?`,
        merge('client_id'), merge('received_at'), merge('deadline_at'), merge('specialization'), merge('specialization_id'), merge('language_pair_id'),
        merge('unit_id'), merge('quantity'), merge('rate_per_unit'), merge('amount'),
        merge('order_status'), invoiceStatus, merge('invoice_number'), merge('invoice_date'), merge('invoice_sale_date'), merge('payment_due_at'),
        merge('contractor_id'), merge('order_number'), merge('book_id'), merge('completed_at'), merge('name'), merge('repertorium_description'), merge('invoice_description'), merge('translation_type'),
        merge('document_author'), merge('document_name'), merge('document_date'), merge('document_number'), merge('document_form_remarks'), merge('extra_copies'), merge('repertorium_notes'), merge('repertorium_activity_type'),
        merge('oral_date'), merge('oral_place'), merge('oral_lang'), merge('oral_duration'), merge('oral_scope'), merge('oral_rate'), merge('oral_net'), merge('oral_gross'), merge('oral_notes'), merge('refusal_date'), merge('refusal_organ'), merge('refusal_reason'),
        merge('service_id'), merge('include_service_on_invoice'), merge('include_language_pair_on_invoice'), merge('include_invoice_description_on_invoice'), normalizeRateCurrency(merge('rate_currency')), merge('order_vat_rate'), merge('order_vat_code'), merge('invoice_notes'), merge('invoice_bank_account_id'), id
      )
    }
  },
  delete: (id: number) => { run('DELETE FROM orders WHERE id = ?', id) },
  /** Usuwa wszystkie zlecenia w księdze oprócz pierwszego (najmniejszy id). */
  deleteAllButFirstInBook: (bookId: number) => {
    const first = get<{ id: number }>('SELECT id FROM orders WHERE book_id = ? ORDER BY id LIMIT 1', bookId)
    if (!first) return 0
    const rows = all<{ id: number }>('SELECT id FROM orders WHERE book_id = ? AND id != ?', bookId, first.id)
    for (const r of rows) run('DELETE FROM orders WHERE id = ?', r.id)
    return rows.length
  },
  issueInvoice: (id: number, invoice_number: string, invoice_date: string, opts?: { invoice_sale_date?: string | null; payment_due_at?: string | null; invoice_notes?: string | null; invoice_bank_account_id?: number | null; invoice_provider_source?: string | null }) => {
    const order = get<{ client_id: number }>('SELECT client_id FROM orders WHERE id = ?', id)
    if (!order) return
    let payment_due_at = opts?.payment_due_at ?? null
    if (payment_due_at == null && invoice_date) {
      const client = get<{ default_payment_days: number }>('SELECT default_payment_days FROM clients WHERE id = ?', order.client_id)
      const days = client?.default_payment_days ?? 14
      const due = new Date(invoice_date)
      due.setDate(due.getDate() + days)
      payment_due_at = due.toISOString().slice(0, 10)
    }
    const saleDate = opts?.invoice_sale_date ?? null
    const notes = opts?.invoice_notes ?? null
    const bankId = opts?.invoice_bank_account_id ?? null
    const providerSource = opts?.invoice_provider_source ?? null
    run('UPDATE orders SET invoice_number = ?, invoice_date = ?, invoice_sale_date = ?, payment_due_at = ?, invoice_notes = ?, invoice_bank_account_id = ?, invoice_provider_source = ?, invoice_status = ?, updated_at = datetime(\'now\') WHERE id = ?', invoice_number, invoice_date, saleDate, payment_due_at, notes, bankId, providerSource, 'issued', id)
  },
  issueInvoices: (orderIds: number[], invoice_number: string, invoice_date: string, opts?: { invoice_sale_date?: string | null; payment_due_at?: string | null; invoice_notes?: string | null; invoice_bank_account_id?: number | null; invoice_provider_source?: string | null }) => {
    for (const id of orderIds) orders.issueInvoice(id, invoice_number, invoice_date, opts)
  },
  clearInvoice: (id: number) => {
    run('UPDATE orders SET invoice_number = NULL, invoice_date = NULL, invoice_sale_date = NULL, payment_due_at = NULL, invoice_notes = NULL, invoice_bank_account_id = NULL, invoice_provider_source = NULL, invoice_status = ?, updated_at = datetime(\'now\') WHERE id = ?', 'to_issue', id)
  },
  nextOrderNumber: (bookId?: number) => nextOrderNumber(bookId),
  nextInvoiceNumber: (providerSource: 'local' | 'wfirma' = 'local') => {
    const format = settings.get('invoice_number_format') ?? 'FV/{YYYY}/{NR}'
    const y = new Date().getFullYear()
    const m = String(new Date().getMonth() + 1).padStart(2, '0')
    const wanted = providerSource === 'wfirma' ? 'wfirma' : 'local'
    const row = get<{ invoice_number: string | null }>(
      `SELECT invoice_number FROM orders
       WHERE invoice_provider_source = ?
         AND invoice_number IS NOT NULL
         AND TRIM(invoice_number) != ''
       ORDER BY id DESC
       LIMIT 1`,
      wanted
    )
    let nextNr = 1
    if (row) {
      const s = String(row.invoice_number ?? '').trim()
      const match = s.match(/(\d+)\s*$/)
      if (match) {
        const nr = parseInt(match[1], 10)
        if (nr >= 1) nextNr = nr + 1
      }
    }
    return format
      .replace('{YYYY}', String(y))
      .replace('{YY}', String(y).slice(-2))
      .replace('{MM}', m)
      .replace('{NR}', String(nextNr))
      .replace('{nr}', String(nextNr).padStart(4, '0'))
  }
}

const clientUnitRates = {
  list: (clientId: number) => all<{ unit_id: number; rate: number; currency: string }>('SELECT unit_id, rate, currency FROM client_unit_rates WHERE client_id = ?', clientId),
  get: (clientId: number, unitId: number, preferredCurrency?: string | null) => {
    const currency = preferredCurrency && preferredCurrency.trim() ? preferredCurrency.trim() : null
    if (currency) {
      const exact = get<{ rate: number; currency: string }>('SELECT rate, currency FROM client_unit_rates WHERE client_id = ? AND unit_id = ? AND currency = ?', clientId, unitId, currency)
      if (exact) return exact
    }
    return get<{ rate: number; currency: string }>('SELECT rate, currency FROM client_unit_rates WHERE client_id = ? AND unit_id = ?', clientId, unitId)
  },
  set: (clientId: number, unitId: number, rate: number, currency?: string | null) => {
    const curr = (currency && currency.trim()) || (settings.get('default_currency') ?? 'PLN')
    run('INSERT OR REPLACE INTO client_unit_rates (client_id, unit_id, rate, currency) VALUES (?, ?, ?, ?)', clientId, unitId, rate, curr)
  }
}

function normalizeArgumentsList (listRaw: { key: string; value?: string | null }[]): { key: string; value: string }[] {
  const entries: [string, { key: string; value: string }][] = listRaw
    .map(a => [String(a?.key ?? '').trim().toLowerCase(), { key: String(a?.key ?? '').trim(), value: String(a?.value ?? '').trim() }] as [string, { key: string; value: string }])
    .filter(([, a]) => a.key && a.value)
  return Array.from(new Map(entries).values()).slice(0, 3).sort((a, b) => `${a.key}:${a.value}`.localeCompare(`${b.key}:${b.value}`))
}

const clientDefaultUnitRates = {
  list: (clientId: number) => all<{
    id: number
    client_id: number
    unit_id: number
    unit_name: string
    language_pair_id: number | null
    language_pair_label: string | null
    argument_key: string | null
    argument_value: string | null
    argument2_key: string | null
    argument2_value: string | null
    argument3_key: string | null
    argument3_value: string | null
    rate: number
    currency: string
  }>(`
    SELECT r.id, r.client_id, r.unit_id, u.name AS unit_name, r.language_pair_id, p.label AS language_pair_label,
           r.argument_key, r.argument_value, r.argument2_key, r.argument2_value, r.argument3_key, r.argument3_value,
           r.rate, r.currency
    FROM client_default_unit_rates r
    JOIN units u ON u.id = r.unit_id
    LEFT JOIN language_pairs p ON p.id = r.language_pair_id
    WHERE r.client_id = ?
    ORDER BY u.name,
             COALESCE(r.argument_key, 'zzzz'), COALESCE(r.argument_value, ''),
             COALESCE(r.argument2_key, 'zzzz'), COALESCE(r.argument2_value, ''),
             COALESCE(r.argument3_key, 'zzzz'), COALESCE(r.argument3_value, ''),
             r.currency, r.id DESC
  `, clientId),
  get: (clientId: number, unitId: number, argumentCandidates?: { key: string; value?: string | null }[] | null, preferredCurrency?: string | null) => {
    const orderCurrency = preferredCurrency && preferredCurrency.trim() ? preferredCurrency.trim() : null
    const candidates = new Map<string, string>()
    for (const c of (argumentCandidates ?? [])) {
      const key = (c.key ?? '').trim()
      const value = (c.value ?? '').trim()
      if (!key || !value) continue
      if (!candidates.has(key)) candidates.set(key, value)
    }
    const rows = all<{
      rate: number
      currency: string
      language_pair_label: string | null
      argument_key: string | null
      argument_value: string | null
      argument2_key: string | null
      argument2_value: string | null
      argument3_key: string | null
      argument3_value: string | null
    }>(
      `SELECT r.rate, r.currency, p.label AS language_pair_label,
              r.argument_key, r.argument_value, r.argument2_key, r.argument2_value, r.argument3_key, r.argument3_value
       FROM client_default_unit_rates r
       LEFT JOIN language_pairs p ON p.id = r.language_pair_id
       WHERE r.client_id = ?
         AND r.unit_id = ?
         ${orderCurrency != null ? 'AND r.currency = ?' : ''}
       ORDER BY r.id DESC`,
      ...(orderCurrency != null ? [clientId, unitId, orderCurrency] : [clientId, unitId])
    )
    let best: { rate: number; currency: string; score: number } | undefined
    for (const row of rows) {
      const required: { key: string; value: string }[] = []
      const pushReq = (k: string | null, v: string | null) => {
        const key = (k ?? '').trim()
        const value = (v ?? '').trim()
        if (!key || !value) return
        required.push({ key, value })
      }
      pushReq(row.argument_key, row.argument_value)
      pushReq(row.argument2_key, row.argument2_value)
      pushReq(row.argument3_key, row.argument3_value)
      if (required.length === 0 && row.language_pair_label) required.push({ key: 'language_pair', value: row.language_pair_label })
      let ok = true
      for (const req of required) {
        const val = candidates.get(req.key)
        if (!val || val.toLowerCase() !== req.value.toLowerCase()) { ok = false; break }
      }
      if (!ok) continue
      const score = required.length
      if (!best || score > best.score) best = { rate: row.rate, currency: row.currency, score }
    }
    if (!best) return undefined
    return { rate: best.rate, currency: best.currency }
  },
  set: (clientId: number, unitId: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => {
    const listRaw = Array.isArray(argumentsList) ? argumentsList : (argumentsList ? [argumentsList] : [])
    const normalized = normalizeArgumentsList(listRaw)
    const [a1, a2, a3] = [normalized[0], normalized[1], normalized[2]]
    const ccy = currency || 'PLN'
    run(
      `DELETE FROM client_default_unit_rates
       WHERE client_id = ?
         AND unit_id = ?
         AND currency = ?
         AND COALESCE(argument_key, '') = COALESCE(?, '')
         AND LOWER(COALESCE(argument_value, '')) = LOWER(COALESCE(?, ''))
         AND COALESCE(argument2_key, '') = COALESCE(?, '')
         AND LOWER(COALESCE(argument2_value, '')) = LOWER(COALESCE(?, ''))
         AND COALESCE(argument3_key, '') = COALESCE(?, '')
         AND LOWER(COALESCE(argument3_value, '')) = LOWER(COALESCE(?, ''))`,
      clientId, unitId, ccy,
      a1?.key ?? null, a1?.value ?? null,
      a2?.key ?? null, a2?.value ?? null,
      a3?.key ?? null, a3?.value ?? null
    )
    run(
      `INSERT INTO client_default_unit_rates (
        client_id, unit_id, language_pair_id,
        argument_key, argument_value,
        argument2_key, argument2_value,
        argument3_key, argument3_value,
        rate, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      clientId, unitId, null,
      a1?.key ?? null, a1?.value ?? null,
      a2?.key ?? null, a2?.value ?? null,
      a3?.key ?? null, a3?.value ?? null,
      rate, ccy
    )
  },
  update: (id: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => {
    const listRaw = Array.isArray(argumentsList) ? argumentsList : (argumentsList ? [argumentsList] : [])
    const normalized = normalizeArgumentsList(listRaw)
    const [a1, a2, a3] = [normalized[0], normalized[1], normalized[2]]
    run(
      `UPDATE client_default_unit_rates
       SET rate = ?, currency = ?, language_pair_id = ?,
           argument_key = ?, argument_value = ?,
           argument2_key = ?, argument2_value = ?,
           argument3_key = ?, argument3_value = ?
       WHERE id = ?`,
      rate, currency || 'PLN', null,
      a1?.key ?? null, a1?.value ?? null,
      a2?.key ?? null, a2?.value ?? null,
      a3?.key ?? null, a3?.value ?? null,
      id
    )
  },
  delete: (id: number) => {
    run('DELETE FROM client_default_unit_rates WHERE id = ?', id)
  }
}

const contractorUnitRates = {
  list: (contractorId: number) => all<{ unit_id: number; language_pair_id: number | null; rate: number }>('SELECT unit_id, language_pair_id, rate FROM contractor_unit_rates WHERE contractor_id = ?', contractorId),
  get: (contractorId: number, unitId: number, languagePairId?: number | null) => {
    if (languagePairId != null) {
      const row = get<{ rate: number }>('SELECT rate FROM contractor_unit_rates WHERE contractor_id = ? AND unit_id = ? AND language_pair_id = ?', contractorId, unitId, languagePairId)
      if (row) return row
    }
    return get<{ rate: number }>('SELECT rate FROM contractor_unit_rates WHERE contractor_id = ? AND unit_id = ? AND language_pair_id IS NULL', contractorId, unitId)
  },
  set: (contractorId: number, unitId: number, rate: number, languagePairId?: number | null) => {
    run(
      'INSERT OR REPLACE INTO contractor_unit_rates (contractor_id, unit_id, language_pair_id, rate) VALUES (?, ?, ?, ?)',
      contractorId, unitId, languagePairId ?? null, rate
    )
  }
}

const defaultUnitRates = {
  list: () => all<{ id: number; unit_id: number; unit_name: string; language_pair_id: number | null; language_pair_label: string | null; argument_key: string | null; argument_value: string | null; argument2_key: string | null; argument2_value: string | null; argument3_key: string | null; argument3_value: string | null; rate: number; currency: string }>(`
    SELECT r.id, r.unit_id, u.name AS unit_name, r.language_pair_id, p.label AS language_pair_label,
           r.argument_key, r.argument_value, r.argument2_key, r.argument2_value, r.argument3_key, r.argument3_value,
           r.rate, r.currency
    FROM default_unit_rates r
    JOIN units u ON u.id = r.unit_id
    LEFT JOIN language_pairs p ON p.id = r.language_pair_id
    ORDER BY u.name,
             COALESCE(r.argument_key, 'zzzz'), COALESCE(r.argument_value, ''),
             COALESCE(r.argument2_key, 'zzzz'), COALESCE(r.argument2_value, ''),
             COALESCE(r.argument3_key, 'zzzz'), COALESCE(r.argument3_value, ''),
             r.currency
  `),
  get: (unitId: number, argumentCandidates?: { key: string; value?: string | null }[] | null, preferredCurrency?: string | null) => {
    const orderCurrency = preferredCurrency && preferredCurrency.trim() ? preferredCurrency.trim() : null
    const candidates = new Map<string, string>()
    for (const c of (argumentCandidates ?? [])) {
      const key = (c.key ?? '').trim()
      const value = (c.value ?? '').trim()
      if (!key || !value) continue
      if (!candidates.has(key)) candidates.set(key, value)
    }
    const rows = all<{
      rate: number
      currency: string
      language_pair_label: string | null
      argument_key: string | null
      argument_value: string | null
      argument2_key: string | null
      argument2_value: string | null
      argument3_key: string | null
      argument3_value: string | null
    }>(
      `SELECT r.rate, r.currency, p.label AS language_pair_label,
              r.argument_key, r.argument_value, r.argument2_key, r.argument2_value, r.argument3_key, r.argument3_value
       FROM default_unit_rates r
       LEFT JOIN language_pairs p ON p.id = r.language_pair_id
       WHERE r.unit_id = ?
         ${orderCurrency != null ? 'AND r.currency = ?' : ''}
       ORDER BY r.id DESC`,
      ...(orderCurrency != null ? [unitId, orderCurrency] : [unitId])
    )
    let best: { rate: number; currency: string; score: number } | undefined
    for (const row of rows) {
      const required: { key: string; value: string }[] = []
      const pushReq = (k: string | null, v: string | null) => {
        const key = (k ?? '').trim()
        const value = (v ?? '').trim()
        if (!key || !value) return
        required.push({ key, value })
      }
      pushReq(row.argument_key, row.argument_value)
      pushReq(row.argument2_key, row.argument2_value)
      pushReq(row.argument3_key, row.argument3_value)
      if (required.length === 0 && row.language_pair_label) required.push({ key: 'language_pair', value: row.language_pair_label })
      let ok = true
      for (const req of required) {
        const val = candidates.get(req.key)
        if (!val || val.toLowerCase() !== req.value.toLowerCase()) { ok = false; break }
      }
      if (!ok) continue
      const score = required.length
      if (!best || score > best.score) best = { rate: row.rate, currency: row.currency, score }
    }
    if (!best) return undefined
    return { rate: best.rate, currency: best.currency }
  },
  set: (unitId: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => {
    const listRaw = Array.isArray(argumentsList) ? argumentsList : (argumentsList ? [argumentsList] : [])
    const normalized = normalizeArgumentsList(listRaw)
    const [a1, a2, a3] = [normalized[0], normalized[1], normalized[2]]
    const ccy = currency || 'PLN'
    run(
      `DELETE FROM default_unit_rates
       WHERE unit_id = ?
         AND currency = ?
         AND COALESCE(argument_key, '') = COALESCE(?, '')
         AND LOWER(COALESCE(argument_value, '')) = LOWER(COALESCE(?, ''))
         AND COALESCE(argument2_key, '') = COALESCE(?, '')
         AND LOWER(COALESCE(argument2_value, '')) = LOWER(COALESCE(?, ''))
         AND COALESCE(argument3_key, '') = COALESCE(?, '')
         AND LOWER(COALESCE(argument3_value, '')) = LOWER(COALESCE(?, ''))`,
      unitId, ccy,
      a1?.key ?? null, a1?.value ?? null,
      a2?.key ?? null, a2?.value ?? null,
      a3?.key ?? null, a3?.value ?? null
    )
    run(
      `INSERT INTO default_unit_rates (
        unit_id, language_pair_id,
        argument_key, argument_value,
        argument2_key, argument2_value,
        argument3_key, argument3_value,
        rate, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      unitId, null,
      a1?.key ?? null, a1?.value ?? null,
      a2?.key ?? null, a2?.value ?? null,
      a3?.key ?? null, a3?.value ?? null,
      rate, ccy
    )
  },
  update: (id: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => {
    const listRaw = Array.isArray(argumentsList) ? argumentsList : (argumentsList ? [argumentsList] : [])
    const normalized = normalizeArgumentsList(listRaw)
    const [a1, a2, a3] = [normalized[0], normalized[1], normalized[2]]
    run(
      `UPDATE default_unit_rates
       SET rate = ?, currency = ?, language_pair_id = ?,
           argument_key = ?, argument_value = ?,
           argument2_key = ?, argument2_value = ?,
           argument3_key = ?, argument3_value = ?
       WHERE id = ?`,
      rate, currency || 'PLN', null,
      a1?.key ?? null, a1?.value ?? null,
      a2?.key ?? null, a2?.value ?? null,
      a3?.key ?? null, a3?.value ?? null,
      id
    )
  },
  delete: (id: number) => {
    run('DELETE FROM default_unit_rates WHERE id = ?', id)
  }
}

function parseRateCurrenciesList(raw: string | null): string[] {
  if (raw == null || typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    return []
  } catch {
    return []
  }
}

const settings = {
  get: (key: string) => {
    const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)
    return row?.value ?? null
  },
  set: (key: string, value: string | number) => {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, String(value))
  },
  /** Czy jest co najmniej jedna waluta (lista walut niepusta LUB ustawiona waluta domyślna). */
  hasRateCurrencies: (): boolean => {
    const rateCurrenciesRaw = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'rate_currencies')?.value ?? null
    const defaultCurrencyRaw = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'default_currency')?.value ?? null
    const list = parseRateCurrenciesList(rateCurrenciesRaw)
    const defaultCurrency = typeof defaultCurrencyRaw === 'string' ? defaultCurrencyRaw.trim() : ''
    return list.length > 0 || defaultCurrency.length > 0
  }
}

const auth = {
  getSession: () => {
    const usersCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM app_users')?.c ?? 0
    const currentUserIdStr = settings.get('auth_current_user_id')
    const currentUserId = parseInt(String(currentUserIdStr ?? ''), 10)
    if (Number.isNaN(currentUserId)) return { hasAnyUser: usersCount > 0, user: null }
    const user = get<{ id: number; email: string; display_name: string | null; role: string }>('SELECT id, email, display_name, role FROM app_users WHERE id = ?', currentUserId)
    if (!user) {
      settings.set('auth_current_user_id', '')
      return { hasAnyUser: usersCount > 0, user: null }
    }
    return {
      hasAnyUser: usersCount > 0,
      user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role }
    }
  },
  register: (email: string, password: string, displayName?: string | null) => {
    const normalizedEmail = normalizeEmail(email)
    const name = (displayName ?? '').trim() || null
    if (!normalizedEmail || !password || password.length < 6) {
      return { ok: false, error: 'INVALID_INPUT' }
    }
    const existing = get<{ id: number }>('SELECT id FROM app_users WHERE email = ?', normalizedEmail)
    if (existing) return { ok: false, error: 'EMAIL_TAKEN' }
    const usersCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM app_users')?.c ?? 0
    const role = usersCount === 0 ? 'owner' : 'user'
    run('INSERT INTO app_users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)', normalizedEmail, hashPassword(password), name, role)
    const id = getLastId()
    settings.set('auth_current_user_id', id)
    return { ok: true, user: { id, email: normalizedEmail, display_name: name, role } }
  },
  login: (email: string, password: string) => {
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail || !password) return { ok: false, error: 'INVALID_INPUT' }
    const user = get<{ id: number; email: string; password_hash: string; display_name: string | null; role: string }>('SELECT id, email, password_hash, display_name, role FROM app_users WHERE email = ?', normalizedEmail)
    if (!user) return { ok: false, error: 'INVALID_CREDENTIALS' }
    if (!verifyPassword(password, user.password_hash)) return { ok: false, error: 'INVALID_CREDENTIALS' }
    settings.set('auth_current_user_id', user.id)
    return { ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role } }
  },
  logout: () => {
    settings.set('auth_current_user_id', '')
  }
}

const orderBooks = {
  list: () => {
    const rows = all<{ id: number; name: string; view_type: string; sort_order: number; archived: number; order_number_format: string | null; repertorium_oral_unit_id: number | null; repertorium_page_unit_id: number | null }>('SELECT id, name, view_type, sort_order, COALESCE(archived, 0) AS archived, order_number_format, repertorium_oral_unit_id, repertorium_page_unit_id FROM order_books ORDER BY COALESCE(archived, 0), sort_order, id')
    for (const row of rows) {
      if (row.view_type === 'repertorium') {
        const oralKey = `order_book_${row.id}_repertorium_oral_unit_id`
        const pageKey = `order_book_${row.id}_repertorium_page_unit_id`
        const oralVal = settings.get(oralKey)
        const pageVal = settings.get(pageKey)
        if (oralVal != null && oralVal !== '') {
          const n = parseInt(oralVal, 10)
          if (!Number.isNaN(n)) row.repertorium_oral_unit_id = n
        } else if (row.repertorium_oral_unit_id != null) {
          settings.set(oralKey, String(row.repertorium_oral_unit_id))
        }
        if (pageVal != null && pageVal !== '') {
          const n = parseInt(pageVal, 10)
          if (!Number.isNaN(n)) row.repertorium_page_unit_id = n
        } else if (row.repertorium_page_unit_id != null) {
          settings.set(pageKey, String(row.repertorium_page_unit_id))
        }
      }
    }
    return rows
  },
  get: (id: number) => {
    const row = get<{ id: number; name: string; view_type: string; sort_order: number; archived: number; order_number_format: string | null; repertorium_oral_unit_id: number | null; repertorium_page_unit_id: number | null }>('SELECT id, name, view_type, sort_order, COALESCE(archived, 0) AS archived, order_number_format, repertorium_oral_unit_id, repertorium_page_unit_id FROM order_books WHERE id = ?', id)
    if (row?.view_type === 'repertorium') {
      const oralKey = `order_book_${id}_repertorium_oral_unit_id`
      const pageKey = `order_book_${id}_repertorium_page_unit_id`
      const oralVal = settings.get(oralKey)
      const pageVal = settings.get(pageKey)
      if (oralVal != null && oralVal !== '') {
        const n = parseInt(oralVal, 10)
        if (!Number.isNaN(n)) row.repertorium_oral_unit_id = n
      } else if (row.repertorium_oral_unit_id != null) {
        settings.set(oralKey, String(row.repertorium_oral_unit_id))
      }
      if (pageVal != null && pageVal !== '') {
        const n = parseInt(pageVal, 10)
        if (!Number.isNaN(n)) row.repertorium_page_unit_id = n
      } else if (row.repertorium_page_unit_id != null) {
        settings.set(pageKey, String(row.repertorium_page_unit_id))
      }
    }
    return row
  },
  add: (row: { name: string; view_type?: string; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }) => {
    const viewType = row.view_type ?? 'simplified'
    const fmt = row.order_number_format?.trim() || null
    const maxOrder = get<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM order_books')
    run('INSERT INTO order_books (name, view_type, sort_order, order_number_format, repertorium_oral_unit_id, repertorium_page_unit_id) VALUES (?, ?, ?, ?, ?, ?)', row.name, viewType, (maxOrder?.m ?? 0) + 1, fmt, row.repertorium_oral_unit_id ?? null, row.repertorium_page_unit_id ?? null)
    return getLastId()
  },
  update: (id: number, row: { name?: string; view_type?: string; archived?: number; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }) => {
    const prev = get<{ name: string; view_type: string; archived: number; order_number_format: string | null; repertorium_oral_unit_id: number | null; repertorium_page_unit_id: number | null }>('SELECT name, view_type, COALESCE(archived, 0) AS archived, order_number_format, repertorium_oral_unit_id, repertorium_page_unit_id FROM order_books WHERE id = ?', id)
    if (!prev) return
    const name = row.name ?? prev.name
    const viewType = row.view_type ?? prev.view_type
    const archived = row.archived !== undefined ? row.archived : prev.archived
    const orderNumberFormat = row.order_number_format !== undefined ? row.order_number_format : prev.order_number_format
    const toNum = (v: unknown): number | null => {
      if (v == null) return null
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      return Number.isNaN(n) ? null : n
    }
    const storedOralUnitId = toNum(settings.get(`order_book_${id}_repertorium_oral_unit_id`))
    const storedPageUnitId = toNum(settings.get(`order_book_${id}_repertorium_page_unit_id`))
    const fallbackOralUnitId = storedOralUnitId ?? prev.repertorium_oral_unit_id
    const fallbackPageUnitId = storedPageUnitId ?? prev.repertorium_page_unit_id
    const repertoriumOralUnitId = row.repertorium_oral_unit_id !== undefined ? toNum(row.repertorium_oral_unit_id) : fallbackOralUnitId
    const repertoriumPageUnitId = row.repertorium_page_unit_id !== undefined ? toNum(row.repertorium_page_unit_id) : fallbackPageUnitId
    settings.set(`order_book_${id}_repertorium_oral_unit_id`, repertoriumOralUnitId != null ? String(repertoriumOralUnitId) : '')
    settings.set(`order_book_${id}_repertorium_page_unit_id`, repertoriumPageUnitId != null ? String(repertoriumPageUnitId) : '')
    run('UPDATE order_books SET name = ?, view_type = ?, archived = ?, order_number_format = ?, repertorium_oral_unit_id = ?, repertorium_page_unit_id = ? WHERE id = ?', name, viewType, archived, orderNumberFormat ?? null, repertoriumOralUnitId ?? null, repertoriumPageUnitId ?? null, id)
  },
  delete: (id: number) => {
    const count = get<{ c: number }>('SELECT COUNT(*) AS c FROM orders WHERE book_id = ?', id)
    if (count && count.c > 0) {
      run('UPDATE orders SET book_id = 1 WHERE book_id = ?', id)
    }
    run('DELETE FROM order_books WHERE id = ?', id)
  }
}

const customColumns = {
  listByBook: (bookId: number) => all<{ id: number; book_id: number; name: string; col_type: string; sort_order: number }>('SELECT * FROM custom_columns WHERE book_id = ? ORDER BY sort_order, id', bookId),
  add: (row: { book_id: number; name: string; col_type?: string }) => {
    const maxOrder = get<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM custom_columns WHERE book_id = ?', row.book_id)
    run('INSERT INTO custom_columns (book_id, name, col_type, sort_order) VALUES (?, ?, ?, ?)',
      row.book_id, row.name, row.col_type ?? 'text', (maxOrder?.m ?? 0) + 1)
    return getLastId()
  },
  update: (id: number, row: { name?: string; col_type?: string; sort_order?: number }) => {
    const prev = get<{ name: string; col_type: string; sort_order: number }>('SELECT name, col_type, sort_order FROM custom_columns WHERE id = ?', id)
    if (!prev) return
    run('UPDATE custom_columns SET name = ?, col_type = ?, sort_order = ? WHERE id = ?',
      row.name ?? prev.name, row.col_type ?? prev.col_type, row.sort_order ?? prev.sort_order, id)
  },
  delete: (id: number) => {
    run('DELETE FROM custom_column_values WHERE column_id = ?', id)
    run('DELETE FROM custom_columns WHERE id = ?', id)
  }
}

const customColumnValues = {
  getByOrder: (orderId: number) => {
    const rows = all<{ column_id: number; value: string | null }>('SELECT column_id, value FROM custom_column_values WHERE order_id = ?', orderId)
    const map: Record<number, string | null> = {}
    for (const r of rows) map[r.column_id] = r.value
    return map
  },
  set: (orderId: number, columnId: number, value: string | null) => {
    if (value === null || value === '') {
      run('DELETE FROM custom_column_values WHERE order_id = ? AND column_id = ?', orderId, columnId)
    } else {
      run('INSERT OR REPLACE INTO custom_column_values (order_id, column_id, value) VALUES (?, ?, ?)', orderId, columnId, value)
    }
  },
  bulkSet: (orderId: number, values: Record<number, string | null>) => {
    for (const [colId, val] of Object.entries(values)) {
      const cid = parseInt(colId, 10)
      if (val === null || val === '') {
        run('DELETE FROM custom_column_values WHERE order_id = ? AND column_id = ?', orderId, cid)
      } else {
        run('INSERT OR REPLACE INTO custom_column_values (order_id, column_id, value) VALUES (?, ?, ?)', orderId, cid, val)
      }
    }
  }
}

const bankAccounts = {
  list: () => all<{ id: number; bank_name: string; bank_address: string; account_number: string; swift: string; currency: string; is_default: number; sort_order: number }>('SELECT * FROM bank_accounts ORDER BY sort_order, id'),
  add: (row: { bank_name?: string; bank_address?: string; account_number: string; swift?: string; currency?: string; is_default?: number }) => {
    const maxOrder = get<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM bank_accounts')
    run('INSERT INTO bank_accounts (bank_name, bank_address, account_number, swift, currency, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      row.bank_name ?? '', row.bank_address ?? '', row.account_number, row.swift ?? '', row.currency ?? 'PLN', row.is_default ?? 0, (maxOrder?.m ?? 0) + 1)
    return getLastId()
  },
  update: (id: number, row: { bank_name?: string; bank_address?: string; account_number?: string; swift?: string; currency?: string; is_default?: number }) => {
    const prev = get<{ bank_name: string; bank_address: string; account_number: string; swift: string; currency: string; is_default: number }>('SELECT * FROM bank_accounts WHERE id = ?', id)
    if (!prev) return
    run('UPDATE bank_accounts SET bank_name = ?, bank_address = ?, account_number = ?, swift = ?, currency = ?, is_default = ? WHERE id = ?',
      row.bank_name ?? prev.bank_name, row.bank_address ?? prev.bank_address ?? '', row.account_number ?? prev.account_number, row.swift ?? prev.swift, row.currency ?? prev.currency, row.is_default ?? prev.is_default, id)
  },
  delete: (id: number) => { run('DELETE FROM bank_accounts WHERE id = ?', id) },
  setDefault: (id: number) => {
    run('UPDATE bank_accounts SET is_default = 0')
    run('UPDATE bank_accounts SET is_default = 1 WHERE id = ?', id)
  },
  get: (id: number) => get<{ id: number; bank_name: string; bank_address: string; account_number: string; swift: string; currency: string; is_default: number; sort_order: number }>('SELECT * FROM bank_accounts WHERE id = ?', id)
}

const analytics = {
  totals: (bookId?: number) => {
    const bookFilter = bookId != null ? ' AND o.book_id = ?' : ''
    const bookArgs = bookId != null ? [bookId] : []
    const globalBase = get<{ id: number; name: string; multiplier_to_base: number }>('SELECT id, name, multiplier_to_base FROM units WHERE is_base = 1')
    const qtyExpr = `(CASE WHEN o.translation_type = 'oral' THEN COALESCE(o.oral_duration, o.quantity, 0) ELSE COALESCE(o.quantity, 0) END)`

    type UnitRow = {
      id: number
      name: string
      multiplier_to_base: number
      unit_category_id: number | null
      category_name: string | null
      base_unit_name: string | null
      base_unit_multiplier: number | null
      currency: string
      order_count: number
      total: number
    }
    const currencyExpr = `UPPER(COALESCE(NULLIF(TRIM(o.rate_currency), ''), 'PLN'))`
    const rows = all<UnitRow>(
      `SELECT u.id, u.name, u.multiplier_to_base, u.unit_category_id,
        c.name AS category_name, base_u.name AS base_unit_name, base_u.multiplier_to_base AS base_unit_multiplier,
        ${currencyExpr} AS currency,
        SUM(CASE WHEN ${qtyExpr} > 0 THEN 1 ELSE 0 END) AS order_count,
        COALESCE(SUM(${qtyExpr}), 0) AS total
      FROM units u
      LEFT JOIN unit_categories c ON u.unit_category_id = c.id
      LEFT JOIN units base_u ON c.base_unit_id = base_u.id
      INNER JOIN orders o ON o.unit_id = u.id AND o.order_status != 'cancelled'${bookFilter}
      INNER JOIN clients cl ON o.client_id = cl.id
      GROUP BY u.id, ${currencyExpr}
      HAVING COALESCE(SUM(${qtyExpr}), 0) > 0`,
      ...bookArgs
    )
    const byCurrency = new Map<string, Map<number | 'uncategorized', { categoryId: number | null; categoryName: string; baseUnitName: string; totalInBaseUnit: number; byUnit: { id: number; name: string; multiplier_to_base: number; order_count: number; total: number }[] }>>()
    for (const r of rows) {
      if (!byCurrency.has(r.currency)) byCurrency.set(r.currency, new Map())
      const byCategory = byCurrency.get(r.currency)!
      const catKey = r.unit_category_id ?? 'uncategorized'
      const baseUnitName = r.unit_category_id ? (r.base_unit_name ?? globalBase?.name ?? '') : (globalBase?.name ?? '')
      const categoryName = r.unit_category_id ? (r.category_name ?? '') : 'Bez kategorii'
      if (!byCategory.has(catKey)) {
        byCategory.set(catKey, { categoryId: r.unit_category_id ?? null, categoryName, baseUnitName, totalInBaseUnit: 0, byUnit: [] })
      }
      const entry = byCategory.get(catKey)!
      entry.byUnit.push({ id: r.id, name: r.name, multiplier_to_base: r.multiplier_to_base, order_count: r.order_count, total: r.total })
      const baseMult = r.unit_category_id && r.base_unit_multiplier != null && r.base_unit_multiplier !== 0
        ? r.base_unit_multiplier
        : 1
      entry.totalInBaseUnit += r.total * (r.multiplier_to_base / baseMult)
    }
    const byCurrencyList = Array.from(byCurrency.entries()).map(([currency, byCategory]) => {
      const list = Array.from(byCategory.values())
      list.sort((a, b) => (a.categoryName === 'Bez kategorii' ? 1 : b.categoryName === 'Bez kategorii' ? -1 : a.categoryName.localeCompare(b.categoryName)))
      return { currency, byCategory: list }
    }).sort((a, b) => a.currency.localeCompare(b.currency))
    return { byCurrency: byCurrencyList }
  },
  paymentSummary: (bookId?: number) => {
    const bookFilter = bookId != null ? ' AND book_id = ?' : ''
    const bookArgs = bookId != null ? [bookId] : []
    const now = new Date().toISOString().slice(0, 10)
    const amountExpr = `(CASE WHEN o.translation_type = 'oral' THEN COALESCE(o.oral_net, 0) ELSE COALESCE(o.amount, 0) END)`
    const currencyExprPay = `UPPER(COALESCE(NULLIF(TRIM(o.rate_currency), ''), 'PLN'))`
    const rows = all<{ currency: string; invoice_status: string; count: number; total: number }>(
      `SELECT ${currencyExprPay} AS currency, o.invoice_status, COUNT(*) AS count, COALESCE(SUM(${amountExpr}), 0) AS total
      FROM orders o
      INNER JOIN clients cl ON o.client_id = cl.id
      INNER JOIN units u ON o.unit_id = u.id
      WHERE o.order_status != 'cancelled' AND ${amountExpr} > 0${String(bookFilter).replace(/book_id/g, 'o.book_id')}
      GROUP BY ${currencyExprPay}, o.invoice_status`,
      ...bookArgs
    )
    const overdueRows = all<{ currency: string; count: number; total: number }>(
      `SELECT ${currencyExprPay} AS currency, COUNT(*) AS count, COALESCE(SUM(${amountExpr}), 0) AS total
      FROM orders o
      INNER JOIN clients cl ON o.client_id = cl.id
      INNER JOIN units u ON o.unit_id = u.id
      WHERE o.order_status != 'cancelled' AND ${amountExpr} > 0 AND o.invoice_status IN ('issued', 'awaiting_payment') AND o.payment_due_at < ?${String(bookFilter).replace(/book_id/g, 'o.book_id')}`,
      now, ...bookArgs
    )
    const overdueByCurrency = new Map<string, { count: number; total: number }>()
    for (const row of overdueRows) overdueByCurrency.set(row.currency, { count: row.count, total: row.total })
    const byCurrencyMap = new Map<string, { currency: string; byStatus: { invoice_status: string; count: number; total: number }[]; overdue: { count: number; total: number } }>()
    for (const row of rows) {
      if (!byCurrencyMap.has(row.currency)) byCurrencyMap.set(row.currency, {
        currency: row.currency,
        byStatus: [],
        overdue: overdueByCurrency.get(row.currency) ?? { count: 0, total: 0 }
      })
      byCurrencyMap.get(row.currency)!.byStatus.push({ invoice_status: row.invoice_status, count: row.count, total: row.total })
    }
    // Include currencies that have only overdue rows.
    for (const [currency, overdue] of Array.from(overdueByCurrency.entries())) {
      if (!byCurrencyMap.has(currency)) byCurrencyMap.set(currency, { currency, byStatus: [], overdue })
    }
    return { byCurrency: Array.from(byCurrencyMap.values()).sort((a, b) => a.currency.localeCompare(b.currency)) }
  }
}

/** Reguła VAT w presecie (bez service_id – dopasowanie po nazwie usługi). */
export type PresetVatRule = { client_segment: string; country_code?: string | null; value_type: 'rate' | 'code'; rate_value?: number | null; code_value?: string | null }

/** Typ danych presetu (jednostki, kategorie, usługi, siatka VAT). */
export type UnitsServicesPresetData = {
  uiLocale: string
  exportedAt: string
  unitCategories: { name: string; sort_order: number; base_unit_name: string | null; oral_unit_name?: string | null; page_unit_name?: string | null }[]
  units: { name: string; multiplier_to_base: number; is_base: number; category_names: string[] }[]
  services: { name: string; vat_rate: number; vat_rules?: PresetVatRule[] }[]
}

/** Preset danych: jednostki (z kategoriami), kategorie (base/oral/page), usługi i siatka VAT – do zapisu jako plik JSON. */
export function getUnitsServicesPresetData(uiLocale: string): UnitsServicesPresetData {
  const catList = all<{ id: number; name: string; sort_order: number; base_unit_name: string | null; oral_unit_name: string | null; page_unit_name: string | null }>(`
    SELECT c.id, c.name, c.sort_order,
      base_u.name AS base_unit_name, oral_u.name AS oral_unit_name, page_u.name AS page_unit_name
    FROM unit_categories c
    LEFT JOIN units base_u ON c.base_unit_id = base_u.id
    LEFT JOIN units oral_u ON c.oral_unit_id = oral_u.id
    LEFT JOIN units page_u ON c.page_unit_id = page_u.id
    ORDER BY c.sort_order, c.name
  `)
  const catIdToName: Record<number, string> = {}
  for (const c of catList) catIdToName[c.id] = c.name
  const unitsList = units.list() as { name: string; multiplier_to_base: number; is_base: number; unit_category_ids?: number[] }[]
  const servicesList = services.list() as { id: number; name: string; vat_rate: number }[]
  return {
    uiLocale,
    exportedAt: new Date().toISOString(),
    unitCategories: catList.map(c => ({
      name: c.name,
      sort_order: c.sort_order ?? 0,
      base_unit_name: c.base_unit_name ?? null,
      oral_unit_name: c.oral_unit_name ?? null,
      page_unit_name: c.page_unit_name ?? null
    })),
    units: unitsList.map(u => ({
      name: u.name,
      multiplier_to_base: u.multiplier_to_base,
      is_base: u.is_base,
      category_names: (u.unit_category_ids || []).map((id: number) => catIdToName[id]).filter(Boolean) as string[]
    })),
    services: servicesList.map(s => {
      const rules = serviceVatRules.listByService(s.id) as { client_segment: string; country_code: string | null; value_type: 'rate' | 'code'; rate_value: number | null; code_value: string | null }[]
      return {
        name: s.name,
        vat_rate: s.vat_rate,
        vat_rules: rules.map(r => ({
          client_segment: r.client_segment,
          country_code: r.country_code ?? null,
          value_type: r.value_type,
          rate_value: r.rate_value ?? null,
          code_value: r.code_value ?? null
        }))
      }
    })
  }
}

/** Ładuje preset z pliku (presets/jobraven-preset-{locale}.json). Szuka w cwd i w __dirname. */
export function loadPresetFromFile(locale: string): UnitsServicesPresetData | null {
  const name = `jobraven-preset-${(locale || 'pl').toLowerCase().slice(0, 2)}.json`
  const candidates = [
    path.join(process.cwd(), 'presets', name),
    path.join(__dirname, 'presets', name)
  ]
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8')
        const data = JSON.parse(raw) as UnitsServicesPresetData
        if (data?.unitCategories && data?.units && data?.services) return data
      }
    } catch { /* next */ }
  }
  return null
}

/** Stosuje preset do bazy. Kolejność: 1) jednostki, 2) kategorie, 3) przypisania jednostek do kategorii, 4) jednostki bazowe w kategoriach, 5) usługi i siatka VAT. */
export function applyPresetData(data: UnitsServicesPresetData): void {
  const unitByName: Record<string, number> = {}
  for (const u of data.units) {
    units.add({
      name: u.name,
      multiplier_to_base: u.multiplier_to_base,
      is_base: u.is_base ? 1 : 0,
      unit_category_id: undefined,
      unit_category_ids: undefined
    })
    const row = get<{ id: number }>('SELECT id FROM units WHERE name = ?', u.name)
    if (row?.id) unitByName[u.name] = row.id
  }

  const catByName: Record<string, number> = {}
  for (const c of data.unitCategories) {
    unitCategories.add({ name: c.name, sort_order: c.sort_order ?? 0 })
    const row = get<{ id: number }>('SELECT id FROM unit_categories WHERE name = ?', c.name)
    if (row?.id) catByName[c.name] = row.id
  }

  for (const u of data.units) {
    const unitId = unitByName[u.name]
    if (unitId == null || unitId <= 0) continue
    const categoryIds = (u.category_names || [])
      .map((n: string) => catByName[n])
      .filter((id: number) => id != null && id > 0) as number[]
    if (categoryIds.length === 0) continue
    const primaryId = categoryIds[0]
    run('UPDATE units SET unit_category_id = ? WHERE id = ?', primaryId, unitId)
    syncUnitCategoryLinks(unitId, categoryIds)
  }

  for (const c of data.unitCategories) {
    const catId = catByName[c.name]
    if (catId == null || catId <= 0) continue
    const baseUnitName = (c.base_unit_name != null && String(c.base_unit_name).trim() !== '') ? String(c.base_unit_name).trim() : null
    const oralName = (c as { oral_unit_name?: string | null }).oral_unit_name
    const pageName = (c as { page_unit_name?: string | null }).page_unit_name
    const oralUnitName = (oralName != null && String(oralName).trim() !== '') ? String(oralName).trim() : null
    const pageUnitName = (pageName != null && String(pageName).trim() !== '') ? String(pageName).trim() : null
    const baseId = baseUnitName ? (get<{ id: number }>('SELECT id FROM units WHERE name = ?', baseUnitName)?.id) : undefined
    const oralId = oralUnitName ? (get<{ id: number }>('SELECT id FROM units WHERE name = ?', oralUnitName)?.id) : undefined
    const pageId = pageUnitName ? (get<{ id: number }>('SELECT id FROM units WHERE name = ?', pageUnitName)?.id) : undefined
    unitCategories.update(catId, {
      base_unit_id: (baseId != null && baseId > 0) ? baseId : null,
      oral_unit_id: (oralId != null && oralId > 0) ? oralId : null,
      page_unit_id: (pageId != null && pageId > 0) ? pageId : null
    })
  }

  for (const s of data.services) {
    services.add({ name: s.name, vat_rate: s.vat_rate ?? 23 })
    const serviceRow = get<{ id: number }>('SELECT id FROM services WHERE name = ?', s.name)
    const serviceId = serviceRow?.id
    const rules = (s as { vat_rules?: PresetVatRule[] }).vat_rules
    if (Array.isArray(rules) && serviceId != null && serviceId > 0) {
      for (const r of rules) {
        serviceVatRules.upsert({
          service_id: serviceId,
          client_segment: r.client_segment,
          country_code: r.country_code ?? null,
          value_type: r.value_type ?? 'rate',
          rate_value: r.rate_value ?? null,
          code_value: r.code_value ?? null
        })
      }
    }
  }
}

/** Czyści jednostki, kategorie jednostek i usługi. Zwraca błąd, jeśli istnieją zlecenia. */
export function clearUnitsServicesCategories(): { ok: boolean; error?: string } {
  const ordersCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM orders')?.c ?? 0
  if (ordersCount > 0) {
    return { ok: false, error: 'ORDERS_EXIST' }
  }
  run('DELETE FROM default_unit_rates')
  run('DELETE FROM client_default_unit_rates')
  run('DELETE FROM client_unit_rates')
  run('DELETE FROM contractor_unit_rates')
  run('DELETE FROM unit_category_units')
  run('DELETE FROM service_vat_rules')
  run('UPDATE unit_categories SET base_unit_id = NULL, oral_unit_id = NULL, page_unit_id = NULL')
  run('UPDATE order_books SET repertorium_oral_unit_id = NULL, repertorium_page_unit_id = NULL')
  const orderBookIds = all<{ id: number }>('SELECT id FROM order_books')
  for (const row of orderBookIds) {
    settings.set(`order_book_${row.id}_repertorium_oral_unit_id`, '')
    settings.set(`order_book_${row.id}_repertorium_page_unit_id`, '')
  }
  run('DELETE FROM units')
  run('DELETE FROM unit_categories')
  run('DELETE FROM services')
  return { ok: true }
}

/** Weryfikuje hasło bieżącego użytkownika (do potwierdzenia krytycznych akcji). */
export function verifyCurrentUserPassword(password: string): boolean {
  const currentUserIdStr = settings.get('auth_current_user_id')
  const currentUserId = parseInt(String(currentUserIdStr ?? ''), 10)
  if (Number.isNaN(currentUserId)) return false
  const user = get<{ password_hash: string }>('SELECT password_hash FROM app_users WHERE id = ?', currentUserId)
  if (!user?.password_hash) return false
  return verifyPassword(password, user.password_hash)
}

/** Wgrywa preset tylko przy całkowicie pustej bazie (brak kategorii, usług i zleceń). Zmiana języka przy kolejnym logowaniu nie nadpisuje danych – unikamy uszkodzenia istniejących zleceń. */
export function ensurePredefinedSettings(uiLocale: string): void {
  const catCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM unit_categories')?.c ?? 0
  const servCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM services')?.c ?? 0
  const ordersCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM orders')?.c ?? 0
  if (catCount > 0 || servCount > 0 || ordersCount > 0) return
  const locale = (uiLocale || 'pl').toLowerCase().slice(0, 2)
  let preset = loadPresetFromFile(locale)
  if (!preset && locale !== 'en') preset = loadPresetFromFile('en')
  if (!preset && locale !== 'pl') preset = loadPresetFromFile('pl')
  if (preset) applyPresetData(preset)
}

export const dbApi = {
  auth,
  languages,
  languagePairs,
  unitCategories,
  units,
  contractors,
  specializations,
  services,
  serviceVatRules,
  clients,
  orders,
  orderBooks,
  subcontracts,
  clientUnitRates,
  clientDefaultUnitRates,
  contractorUnitRates,
  defaultUnitRates,
  customColumns,
  customColumnValues,
  bankAccounts,
  settings,
  analytics
}
