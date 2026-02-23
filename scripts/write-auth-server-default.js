/**
 * Writes electron/build-config.generated.ts with AUTH_SERVER_DEFAULT from env.
 * Run before electron build when you want to bake in the default auth server URL:
 *   set JOBRAVEN_AUTH_SERVER_DEFAULT=https://your-app.up.railway.app
 *   npm run electron:build
 */
const path = require('path')
const fs = require('fs')

const url = (process.env.JOBRAVEN_AUTH_SERVER_DEFAULT || 'https://zonal-truth-production-207a.up.railway.app').trim().replace(/\/+$/, '')
const escaped = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const outPath = path.join(__dirname, '..', 'electron', 'build-config.generated.ts')
const content = `/**
 * Generated at build time by scripts/write-auth-server-default.js
 * Do not edit manually. Set JOBRAVEN_AUTH_SERVER_DEFAULT when building to bake in the default auth server URL.
 */
export const AUTH_SERVER_DEFAULT = '${escaped}'
`

fs.writeFileSync(outPath, content, 'utf8')
console.log('[write-auth-server-default] AUTH_SERVER_DEFAULT =', url)
