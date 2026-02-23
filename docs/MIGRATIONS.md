# Migracje bazy danych i aktualizacje

## Zasada obowiązkowa (AI i developer)

**Przy każdej zmianie schemy bazy** (nowa tabela, nowa kolumna, zmiana struktury w `electron/db.ts` lub w `initDb`) **trzeba dodać migrację**. Inaczej użytkownicy z istniejącą bazą po aktualizacji aplikacji dostaną błąd lub brak danych.

- Zmiana schemy = jakakolwiek modyfikacja tworzenia tabel/kolumn (CREATE TABLE, ALTER TABLE, nowe pola w initDb).
- Zawsze: (1) zwiększ `CURRENT_SCHEMA_VERSION`, (2) dopisz `schemaMigrations[N]` z kodem migracji (ALTER/CREATE itd.), (3) zapisz wersję i `saveDb()` w migracji.

---

## Wersjonowanie schemy bazy

- Wersja schemy jest trzymana w tabeli `settings` pod kluczem `schema_version` (liczba).
- Stała `CURRENT_SCHEMA_VERSION` w `electron/db.ts` określa docelową wersję.
- Przy każdym starcie aplikacji uruchamiane są tylko migracje z numerem **większym** niż aktualna wersja bazy.

### Jak dodać nową migrację

1. W `electron/db.ts` zwiększ `CURRENT_SCHEMA_VERSION` (np. z `1` na `2`).
2. Dopisz do obiektu `schemaMigrations` nową funkcję, np.:
   ```ts
   schemaMigrations[2] = () => {
     try { db.run('ALTER TABLE orders ADD COLUMN nowa_kolumna TEXT') } catch { /* już istnieje */ }
     saveDb()
   }
   ```
3. Przy następnym starcie aplikacji użytkownicy z bazą w wersji 1 dostaną uruchomioną tylko migrację 2.

### Gdzie zobaczyć wersję bazy

- Wersja schemy nie jest pokazywana użytkownikowi; służy tylko do uruchamiania migracji przy starcie aplikacji.

---

## Auto-update aplikacji

- Przy starcie (w wersji paczkowanej) aplikacja po ok. 12 s sprawdza w tle, czy jest nowa wersja.
- Jeśli jest – pobiera ją w tle (bez pytania).
- Po pobraniu pokazuje zielony pasek: „Aktualizacja pobrana – przy zamknięciu aplikacji zostanie zainstalowana.”
- Przy zamknięciu aplikacji nowa wersja instaluje się automatycznie; przy następnym uruchomieniu użytkownik ma już nową wersję.

### Konfiguracja (skąd pobierać aktualizacje)

W `package.json` w sekcji `build.publish` ustaw **własne** dane repozytorium:

```json
"publish": [
  { "provider": "github", "owner": "TWOJ_ORG_LUB_USER", "repo": "JobRaven" }
]
```

Aktualizacje muszą być opublikowane jako **GitHub Releases** (pliki z builda electron-builder, np. `JobRaven-Setup-X.Y.Z.exe` i `latest.yml`). Można wrzucać je ręcznie lub użyć np. GitHub Actions do budowania i publikowania przy tagu.

Po zmianie schemy (nowa migracja) użytkownicy po aktualizacji przez auto-update przy pierwszym starcie nowej wersji dostaną uruchomione brakujące migracje – nie trzeba nic robić ręcznie.
