import path from 'path'
import fs from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

function copyPdfKitData() {
  return {
    name: 'copy-pdfkit-data',
    closeBundle() {
      const dest = path.join(__dirname, 'dist-electron', 'data')
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

      const pdfkitSrc = path.join(__dirname, 'node_modules', 'pdfkit', 'js', 'data')
      if (fs.existsSync(pdfkitSrc)) {
        for (const name of fs.readdirSync(pdfkitSrc)) {
          const srcFile = path.join(pdfkitSrc, name)
          if (fs.statSync(srcFile).isFile()) fs.copyFileSync(srcFile, path.join(dest, name))
        }
        console.log('[copy-pdfkit-data] Skopiowano pliki PDFKit do dist-electron/data')
      }

      const notoSansSrc = path.join(__dirname, 'node_modules', 'notosans-fontface', 'fonts')
      const notoSansFiles = ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']
      for (const name of notoSansFiles) {
        const srcFile = path.join(notoSansSrc, name)
        if (fs.existsSync(srcFile)) fs.copyFileSync(srcFile, path.join(dest, name))
      }
      console.log('[copy-pdfkit-data] Skopiowano NotoSans (PL) do dist-electron/data')

      const presetsSrc = path.join(__dirname, 'presets')
      const presetsDest = path.join(__dirname, 'dist-electron', 'presets')
      if (fs.existsSync(presetsSrc)) {
        if (!fs.existsSync(presetsDest)) fs.mkdirSync(presetsDest, { recursive: true })
        for (const name of fs.readdirSync(presetsSrc)) {
          const srcFile = path.join(presetsSrc, name)
          if (fs.statSync(srcFile).isFile() && name.endsWith('.json')) {
            fs.copyFileSync(srcFile, path.join(presetsDest, name))
          }
        }
        console.log('[copy-pdfkit-data] Skopiowano presety do dist-electron/presets')
      }
    }
  }
}

export default defineConfig({
  server: { port: 5173 },
  define: {
    'process.env.JOBRAVEN_AUTH_SERVER_DEFAULT': JSON.stringify(process.env.JOBRAVEN_AUTH_SERVER_DEFAULT || '')
  },
  plugins: [
    react(),
    copyPdfKitData(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['sql.js']
            }
          }
        }
      },
      { entry: 'electron/preload.ts', onstart(opts) { opts.reload() } }
    ]),
    renderer()
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
})
