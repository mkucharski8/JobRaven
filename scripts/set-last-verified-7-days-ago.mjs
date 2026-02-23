#!/usr/bin/env node
/**
 * Ustawia w pliku auth-meta.json (Electron userData) datę ostatniej weryfikacji
 * na 7 dni temu. Po następnym uruchomieniu aplikacji użytkownik zobaczy blokadę
 * i komunikat o konieczności połączenia z internetem.
 *
 * Uruchom: node scripts/set-last-verified-7-days-ago.mjs
 *
 * Ścieżka: Windows %APPDATA%\jobraven\auth-meta.json
 *          macOS ~/Library/Application Support/jobraven/auth-meta.json
 *          Linux ~/.config/jobraven/auth-meta.json
 */
import fs from 'fs'
import path from 'path'

const APP_NAME = 'jobraven'
const base =
  process.env.APPDATA ||
  (process.platform === 'darwin'
    ? path.join(process.env.HOME || '', 'Library', 'Application Support')
    : path.join(process.env.HOME || '', '.config'))
const authMetaPath = path.join(base, APP_NAME, 'auth-meta.json')

const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

if (!fs.existsSync(authMetaPath)) {
  console.error('Nie znaleziono pliku:', authMetaPath)
  console.error('Uruchom najpierw aplikację Electron i zaloguj się – wtedy powstanie auth-meta.json.')
  process.exit(1)
}

let meta
try {
  meta = JSON.parse(fs.readFileSync(authMetaPath, 'utf8'))
} catch (e) {
  console.error('Błąd odczytu auth-meta.json:', e.message)
  process.exit(1)
}

if (!meta.session) {
  console.error('Brak aktywnej sesji w auth-meta.json. Zaloguj się w aplikacji i uruchom skrypt ponownie.')
  process.exit(1)
}

meta.session.last_verified_at = sevenDaysAgo

try {
  fs.writeFileSync(authMetaPath, JSON.stringify(meta, null, 2), 'utf8')
  console.log('Ustawiono last_verified_at na 7 dni temu:', sevenDaysAgo)
  console.log('Plik:', authMetaPath)
  console.log('Przy następnym uruchomieniu aplikacji pojawi się blokada (wymóg połączenia z internetem).')
} catch (e) {
  console.error('Błąd zapisu:', e.message)
  process.exit(1)
}
