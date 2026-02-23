/**
 * Prepare app icons for all platforms.
 * 1) If assets/logo-1024.png exists: run electron-icon-builder → assets/icons/{win,mac,png},
 *    then ensure build/icon.ico exists (copy from assets/icons/win/icon.ico) for electron-builder.
 * 2) Else: fallback to png-to-ico from server/public/landing/logo_trans_no_text.png → build/icon.ico.
 * Run before electron-builder (called from electron:build).
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const logo1024 = path.join(root, 'assets', 'logo-1024.png')
const iconsOut = path.join(root, 'assets', 'icons')
// electron-icon-builder puts icons in <output>/icons/win|mac|png/
const winIco = path.join(root, 'assets', 'icons', 'win', 'icon.ico')
const winIcoNested = path.join(root, 'assets', 'icons', 'icons', 'win', 'icon.ico')
const buildIco = path.join(root, 'build', 'icon.ico')

if (fs.existsSync(logo1024)) {
  console.log('[prepare-icons] Używam assets/logo-1024.png → electron-icon-builder')
  try {
    execSync(`npx electron-icon-builder --input=assets/logo-1024.png --output=assets`, {
      cwd: root,
      stdio: 'inherit'
    })
  } catch (e) {
    console.error('[prepare-icons] Błąd electron-icon-builder:', e.message)
    process.exit(1)
  }
  const icoPath = fs.existsSync(winIco) ? winIco : winIcoNested
  if (fs.existsSync(icoPath)) {
    if (!fs.existsSync(path.dirname(buildIco))) fs.mkdirSync(path.dirname(buildIco), { recursive: true })
    fs.copyFileSync(icoPath, buildIco)
    console.log('[prepare-icons] Skopiowano', path.relative(root, icoPath), '→ build/icon.ico')
  }
} else {
  console.log('[prepare-icons] Brak assets/logo-1024.png, fallback: logo_trans_no_text.png → build/icon.ico')
  require('child_process').execSync('node scripts/png-to-ico.js', { cwd: root, stdio: 'inherit' })
}
