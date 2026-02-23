# Ikony aplikacji (wszystkie platformy)

## Struktura (na przyszłość)

```
assets/
  logo-1024.png          # Źródło: kwadrat 1024×1024 px (bez tekstu – tarcza)
  icons/                 # Generowane przez electron-icon-builder (--output=assets)
    win/
      icon.ico           # Windows (exe, instalator, pasek zadań)
    mac/
      icon.icns          # macOS
    png/
      16x16.png … 1024x1024.png   # Linux i inne rozmiary
build/
  icon.ico               # Używane przez electron-builder (kopia z assets/icons/win lub z png-to-ico)
```

## Przygotowanie ikon

### Opcja A: Pełna generacja (wszystkie platformy)

1. Umieść plik **`assets/logo-1024.png`** (1024×1024 px, przezroczyste tło).
2. Uruchom:
   ```bash
   npm run icons:generate
   ```
   To wywołuje `electron-icon-builder` i tworzy `assets/icons/win/icon.ico`, `assets/icons/mac/icon.icns`, `assets/icons/png/*.png`.
3. Przed buildem uruchamiany jest `npm run icons:prepare` (w ramach `electron:build`), który kopiuje `assets/icons/win/icon.ico` → `build/icon.ico` dla instalatora.

### Opcja B: Fallback (bez logo-1024.png)

Jeśli nie ma `assets/logo-1024.png`, skrypt `prepare-icons.js` używa `server/public/landing/logo_trans_no_text.png` i generuje tylko `build/icon.ico` (przez `png-to-ico`). Wystarczy do Windows.

## Ikona w dev (npm run electron:dev)

W `electron/main.ts` funkcja `getAppIconPath()` wybiera ikonę według platformy:

- **Windows:** `assets/icons/win/icon.ico` lub `build/icon.ico` lub `logo_trans_no_text.png`
- **Linux:** `assets/icons/png/1024x1024.png` lub fallbacki
- **macOS:** `assets/icons/mac/icon.icns` lub fallback (okno może ignorować w dev)

Dzięki temu w devie w pasku zadań / docku widać własną ikonę.

## Build (electron-builder)

- `package.json` → `build.icon` i `build.win.icon` wskazują na **`build/icon.ico`**.
- `electron:build` uruchamia `prepare-icons.js`, który uzupełnia `build/icon.ico` (z logo-1024 albo z logo_trans_no_text).
- Dla macOS/Linux w przyszłości można dodać w `package.json` np. `build.mac.icon`, `build.linux.icon` wskazujące na `assets/icons/...`.
