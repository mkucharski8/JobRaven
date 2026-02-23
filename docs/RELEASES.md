# Jak wrzucać i publikować nowe wersje (release + auto-update)

## Jak to działa

1. **Wersja aplikacji** jest w `package.json` → `"version": "0.1.0"`. Z niej electron-builder bierze numer wersji (nazwa pliku, `latest.yml`).
2. **Auto-update** działa tylko w **zbudowanej** aplikacji (instalator / portable). W trybie dev (`npm run electron:dev`) nie sprawdza aktualizacji.
3. Aplikacja **sprawdza** aktualizacje ok. 12 s po starcie. Źródłem jest **GitHub Releases** w repozytorium z `build.publish` (owner + repo w `package.json`).
4. Electron-updater czyta plik **latest.yml** z release’u (albo odpowiedni dla systemu, np. na Windows: `JobRaven-Setup-X.Y.Z.exe` + `latest.yml`). Jeśli wersja w `latest.yml` jest wyższa niż zainstalowana – pobiera i przy zamknięciu instaluje.

---

## Krok po kroku: publikacja nowej wersji

### 1. Ustaw repozytorium (jednorazowo)

W `package.json` w `build.publish` zamień na **swoje** dane:

```json
"publish": [
  { "provider": "github", "owner": "TWOJ_USER_LUB_ORG", "repo": "JobRaven" }
]
```

Repo musi być na GitHubie (public lub private; przy private potrzebny jest token).

### 2. Podbij wersję

W `package.json`:

```json
"version": "0.2.0"
```

(Albo 0.1.1, 1.0.0 – ważne, żeby **większe** niż to, co mają użytkownicy.)

### 3. Zbuduj aplikację

```bash
npm run electron:build
```

W katalogu **release/** pojawią się m.in.:

- **Windows:** `JobRaven Setup 0.2.0.exe`, `latest.yml`
- (opcjonalnie) `JobRaven 0.2.0.exe` (portable) itd.

### 4. Opublikuj na GitHub Releases

**Opcja A – ręcznie**

1. GitHub → Twoje repo → **Releases** → **Create a new release**.
2. Tag: np. `v0.2.0` (zalecane: `v` + wersja z package.json).
3. Opis: np. „Wersja 0.2.0 – lista zmian…”
4. Do release’u **dołącz pliki** z `release/`:
   - `JobRaven Setup 0.2.0.exe`
   - `latest.yml`  
   (obowiązkowo – bez `latest.yml` updater nie wie, że jest nowa wersja.)
5. Opublikuj release.

**Opcja B – GitHub Actions (automatycznie przy tagu)**

Możesz dodać workflow, który przy pushu tagu `v*` buduje projekt i wrzuca artefakty do GitHub Release. Wtedy:

- Tworzysz tag: `git tag v0.2.0` i `git push origin v0.2.0`
- Action buduje i publikuje pliki z `release/` do release’u o tej samej nazwie.

(Szablon workflow dla electron-builder + publish do GitHub jest w dokumentacji electron-builder.)

### 5. Użytkownicy

- Mają zainstalowaną np. 0.1.0.
- Przy następnym uruchomieniu (gdy jest internet) po ~12 s aplikacja sprawdza release.
- Widzi 0.2.0 w `latest.yml`, pobiera w tle `JobRaven Setup 0.2.0.exe`.
- Po pobraniu pokazuje zielony pasek: „Aktualizacja pobrana – przy zamknięciu aplikacji zostanie zainstalowana.”
- Po zamknięciu aplikacji instalator się uruchamia i nadpisuje wersję; przy kolejnym starcie jest już 0.2.0.

---

## Jak przetestować auto-update (jest to trochę niewygodne)

Auto-update **nie działa** w trybie dev (`npm run electron:dev`), bo `app.isPackaged` jest wtedy `false`. Żeby przetestować cały flow, musisz mieć **dwie wersje**: starą zainstalowaną i nową na GitHub Release.

### Test „na żywo” (najbardziej realistyczny)

1. **Skonfiguruj** `build.publish` na **własne** repo (np. testowe).
2. **Zbuduj wersję „starą”** (np. 0.1.0), zainstaluj ją z `release/JobRaven Setup 0.1.0.exe` na swoim PC.
3. W projekcie **podbij wersję** na 0.2.0, zbuduj: `npm run electron:build`.
4. Na GitHubie **utwórz release** (np. tag `v0.2.0`) i **dołącz** z nowego `release/`:
   - `JobRaven Setup 0.2.0.exe`
   - `latest.yml`
5. **Uruchom** zainstalowaną wersję 0.1.0 (musi być połączenie z internetem).
6. Poczekaj ok. 15–20 s – w tle powinno pójść sprawdzenie i pobieranie.
7. Sprawdź, czy pojawia się zielony pasek „Aktualizacja pobrana…”.
8. Zamknij aplikację – powinien uruchomić się instalator 0.2.0; po instalacji i ponownym uruchomieniu wersja powinna być 0.2.0.

To jedyny pełny test flowu; wymaga zbudowania dwóch wersji i jednego release’u.

### Test „czy w ogóle sprawdza” (szybki sanity check)

- Zbuduj raz: `npm run electron:build`, zainstaluj z `release/JobRaven Setup 0.1.0.exe`.
- Uruchom i w konsoli deweloperskiej (jeśli ją masz) lub logach zobacz, czy po ~12 s nie ma błędu z updatera (np. 404 – brak release’u, to normalne przy pierwszej wersji).
- Możesz na GitHubie stworzyć release z **tą samą** wersją (0.1.0) i `latest.yml` – wtedy nie powinno być pobierania (wersja nie wyższa), ale sprawdzenie się wykona.

### Test migracji bazy (bez GitHub)

- Migracje i wersja schemy **nie zależą** od auto-update.
- Wystarczy: zmienić kod (np. dodać migrację 2), zbudować, **ręcznie** zainstalować nowy build nad starym (ten sam katalog userData). Przy pierwszym starcie nowej wersji uruchomi się migracja i w Ustawieniach zobaczysz wyższą „Wersja schemy bazy”.

---

## Podsumowanie

| Co chcesz zrobić | Działanie |
|------------------|-----------|
| **Wydać nową wersję** | Podbij `version` w package.json → `npm run electron:build` → wrzuć z `release/` pliki .exe + latest.yml do GitHub Release (tag np. vX.Y.Z). |
| **Przetestować auto-update** | Zainstaluj starą wersję (np. 0.1.0), opublikuj nową (0.2.0) na GitHub Release, uruchom starą i poczekaj na pobranie i zielony pasek; zamknij aplikację i sprawdź, czy instalator się instaluje. |
| **Przetestować migracje** | Dodaj migrację w `electron/db.ts`, zbuduj, zainstaluj nowy build ręcznie; przy starcie sprawdź Ustawienia → Wersja schemy bazy. |

Bez publikacji na GitHub Release auto-update nie ma skąd pobrać nowej wersji – więc pełny test wymaga jednego prawdziwego release’u z plikami z `release/`.
