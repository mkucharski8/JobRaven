# Wydanie wersji (release) – JobRaven

Procedura wydania nowej wersji aplikacji i serwera (np. v0.2.0): ustawienie wersji, build instalatorów, GitHub Release, wdrożenie serwera na Railway przez GitHub.

---

## 1. Wersja w projekcie

Ustaw **tę samą wersję** (np. `0.2.0`) w:

- **`package.json`** (główny) – pole `version`
- **`server/package.json`** – pole `version`
- **`_railway_deploy/package.json`** – pole `version` (jeśli używasz tego folderu do deployu)

Aplikacja Electron bierze wersję z głównego `package.json`; electron-builder generuje pliki z tą wersją w nazwie.

---

## 2. Wersjonowanie schemy bazy (migracje)

Baza danych ma **wersję schemy** w `electron/db.ts`:

- **`CURRENT_SCHEMA_VERSION`** – docelowa wersja (liczba).
- W tabeli `settings` pod kluczem `schema_version` zapisana jest aktualna wersja bazy użytkownika.
- Przy starcie aplikacji uruchamiane są **tylko migracje** o numerze większym niż zapisana wersja (`schemaMigrations[N]`).

**Jeśli w tej wersji zmieniałeś schemę** (nowa tabela, nowa kolumna, ALTER TABLE):

1. Zwiększ `CURRENT_SCHEMA_VERSION` (np. z `1` na `2`).
2. Dopisz w `electron/db.ts` nową funkcję migracji, np.  
   `schemaMigrations[2] = () => { ... ALTER TABLE / CREATE ... ; saveDb(); }`
3. Szczegóły: **`docs/MIGRATIONS.md`** oraz reguła w `.cursor/rules/db-schema-migrations.mdc`.

Dzięki temu stare bazy po aktualizacji aplikacji dostaną tylko brakujące migracje i będą działać z nową wersją.

---

## 3. Build instalatorów (Windows, Linux, macOS)

Konfiguracja w **`package.json`** w sekcji `build`:

- **Windows:** `nsis` (instalator .exe) – **bez** `portable`
- **macOS:** `dmg`
- **Linux:** `AppImage`

Budowanie (w katalogu głównym projektu):

```bash
npm run electron:build
```

Przed buildem można ustawić domyślny URL serwera auth (opcjonalnie):

```bash
set JOBRAVEN_AUTH_SERVER_DEFAULT=https://twoja-app.up.railway.app
npm run electron:build
```

Wyniki w folderze **`release/`**:

- Windows: `JobRaven Setup 0.2.0.exe` (+ `latest.yml` dla auto-update)
- macOS: `JobRaven-0.2.0.dmg` (+ `latest-mac.yml`)
- Linux: `JobRaven-0.2.0.AppImage` (+ `latest-linux.yml`)

---

## 4. GitHub Release (wrzucenie wersji i instalatorów)

1. **Commit i push** wszystkich zmian (wersja, ewentualne migracje).

2. **Tag wersji** (np. v0.2.0):
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. **Utworzenie Release na GitHubie:**
   - Repozytorium → **Releases** → **Draft a new release**
   - **Choose a tag:** `v0.2.0`
   - **Release title:** np. `v0.2.0`
   - W **Description** wpisz krótki opis zmian (changelog).

4. **Załączniki (installers):**
   - Przeciągnij do release’u pliki z `release/`:
     - `JobRaven Setup 0.2.0.exe` (Windows)
     - `JobRaven-0.2.0.dmg` (macOS)
     - `JobRaven-0.2.0.AppImage` (Linux)
   - Opcjonalnie do auto-update: `latest.yml`, `latest-mac.yml`, `latest-linux.yml` (wtedy electron-updater w aplikacji będzie mógł pobrać aktualizację).

5. **Publish release.**

Użytkownicy mogą pobrać instalatory z zakładki Releases; jeśli w `package.json` w `build.publish` jest ustawione `provider: "github"` i właściwe `owner`/`repo`, aplikacja może sama sprawdzać i oferować aktualizacje.

---

## 5. Serwer na Railway przez GitHub

Aby **najnowszy serwer** był wdrażany na Railway przy pushu do repo:

1. **Railway:** [railway.app](https://railway.app) → zaloguj przez GitHub.

2. **Projekt:**  
   **New Project** → **Deploy from GitHub repo** → wybierz repozytorium JobRaven.

3. **Usługa:**  
   Jedna usługa z tego repo. W ustawieniach serwisu:
   - **Root Directory:** `server`  
     (build i start z folderu `server/`, gdzie jest `package.json` i `index.js`)

4. **Zmienne, wolumen, domena:**  
   Jak w **`docs/DEPLOYMENT.md`** (sekcja Railway):  
   `JOBRAVEN_JWT_SECRET`, `BASE_URL`, `JOBRAVEN_ADMIN_PASSWORD_HASH`, SMTP/Mailgun, Volume (mount path `data`), Generate Domain.

5. **Automatyczny deploy:**  
   Przy każdym **pushu do głównej gałęzi** (np. `main`) Railway zbuduje i wdroży serwer z folderu `server/`. Nie musisz ręcznie wrzucać kodu – wystarczy `git push`.

**Ręczny redeploy z dysku** (bez GitHub):  
`npm run deploy:server` lub `.\scripts\deploy-railway.ps1` (z ustawionym `RAILWAY_TOKEN` w razie 403). Zob. `docs/DEPLOYMENT.md`.

---

## 6. Checklist wydania (np. v0.2.0)

- [ ] Wersja `0.2.0` w `package.json`, `server/package.json`, `_railway_deploy/package.json` (jeśli używany)
- [ ] Przy zmianie schemy: zwiększony `CURRENT_SCHEMA_VERSION` i nowa wpis w `schemaMigrations` w `electron/db.ts`
- [ ] `npm run electron:build` – build bez błędów
- [ ] Pliki w `release/`: Windows (nsis), macOS (dmg), Linux (AppImage)
- [ ] Commit + push, tag `v0.2.0`, push tag
- [ ] GitHub Release dla `v0.2.0` z opisem i załącznikami (instalatory + opcjonalnie latest-*.yml)
- [ ] Railway: deploy z GitHub (push na main) lub ręcznie `npm run deploy:server` – serwer z wersją 0.2.0 na Railway
