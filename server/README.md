# Serwer zarządzania użytkownikami i licencjami

**Wdrożenie na produkcję (real-world):** patrz **[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)** – VPS, HTTPS, PM2, .env, konfiguracja aplikacji.

Backend (na razie lokalny/wirtualny) do:
- rejestracji użytkowników,
- logowania i weryfikacji,
- licencji (domyślnie 30 dni trial po rejestracji).

## Uruchomienie

Z głównego folderu projektu:
```bash
npm run server
```
(lub w folderze `server`: `npm install` i `npm run start`)

Domyślnie nasłuchuje na **http://localhost:3000**.

## Testowanie na żywo (lokalnie)

1. **Uruchom serwer** (z głównego folderu projektu):
   ```bash
   npm run server
   ```
   Powinna pojawić się informacja o nasłuchu na `http://localhost:3000`. Przy pierwszym uruchomieniu serwer tworzy folder `server/data/` i **seeduje** dwóch użytkowników testowych (jeśli `data/users.json` nie istnieje).

2. **Uruchom aplikację** (w tym samym projekcie, w drugim terminalu):
   ```bash
   npm run electron:dev
   ```
   Aplikacja domyślnie łączy się z `http://localhost:3000` – nie musisz nic ustawiać w Ustawieniach.

3. **Zaloguj się** w aplikacji jednym z kont testowych (po seedzie):
   - **Email:** (patrz plik users.json po seedzie) **Hasło:** (domyślne hasło deweloperskie – zmień w produkcji)
   - **Email:** `admin2@localhost` **Hasło:** `123456`  
   Oba mają licencję bez daty wygaśnięcia.

4. **Panel admina** (opcjonalnie): w przeglądarce wejdź na **http://localhost:3000/admin**. Domyślne logowanie: użytkownik `admin`, hasło – patrz plik `.env` (zmienna `JOBRAVEN_ADMIN_PASSWORD_HASH`) lub domyślne hasło z kodu (w razie wątpliwości wygeneruj hash według `.env.example`).

**Uwaga:** Plik `.env` w folderze `server/` jest opcjonalny przy lokalnym teście. Bez SMTP nie działają maile (weryfikacja e-mail, reset hasła), ale logowanie i sprawdzanie licencji – tak.

## API

- `POST /api/auth/register` – body: `{ email, password, displayName? }` – rejestracja (dane trafiają do `data/users.json`).
- `POST /api/auth/login` – body: `{ email, password }` – logowanie, zwraca `user` i `license`.
- `GET /api/license/check` – nagłówek `Authorization: Bearer <email>` lub `?token=<email>` – sprawdzenie licencji.

## Konfiguracja w aplikacji

- Aplikacja szuka serwera pod adresem z ustawienia **auth_server_url** (w Ustawieniach) lub zmiennej środowiskowej **JOBRAVEN_SERVER_URL** / **AUTH_SERVER_URL**.
- Domyślnie: **http://localhost:3000**.

## Dane

- `server/data/users.json` – użytkownicy (hash hasła w formacie scrypt, jak w aplikacji).
- `server/data/licenses.json` – licencje (user_id, expires_at, plan).

Folder `data/` jest w `.gitignore`.
