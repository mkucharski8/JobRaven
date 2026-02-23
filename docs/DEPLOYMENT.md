# Wdrożenie serwera JobRaven (real-world)

Serwer auth/licencji można postawić na dowolnym VPS lub hostingu z Node.js (np. Ubuntu, Debian, Railway, Render). Aplikacja desktop łączy się z nim przez adres URL – użytkownik podaje go w Ustawieniach lub wbudowujesz domyślny URL w aplikację.

---

## dhosting (elastyczny hosting)

Na **elastycznym hostingu dhosting** (shared) **nie ma Node.js** – oficjalnie nie ma tam środowiska uruchomieniowego Node.js. Backendu JobRaven (Express) nie uruchomisz na tym hostingu w normalny sposób.

**Co możesz zrobić:**

1. **VPS u dhosting** – jeśli masz lub wykupisz VPS u dhosting, na nim instalujesz Node.js i postępujesz według kroków poniżej (jak na dowolnym VPS).
2. **Zapytaj dhosting** – czy od czasu artykułu w bazie wiedzy (2020) dodali Node.js albo czy polecają konkretną usługę pod aplikacje Node.
3. **Inna usługa z Node.js** – postaw backend tam, a domenę z dhosting możesz skierować na ten serwer (DNS: A/CNAME na IP nowego hosta). Przykłady:
   - **Railway**, **Render**, **Fly.io** – wrzucasz repo lub folder `server/`, dostajesz URL (np. `https://twoja-app.railway.app`); często darmowy tier.
   - **VPS** (np. OVH, Hetzner, DigitalOcean, Contabo) – pełna kontrola, instalujesz Node, reverse proxy, PM2 – krok po kroku poniżej.

Domenę możesz zostawić w dhosting i w ustawieniach DNS ustawić rekord A na IP serwera, gdzie faktycznie działa Node (np. Railway lub VPS).

---

## Railway – krok po kroku

1. **Konto:** wejdź na [railway.app](https://railway.app), zaloguj się (np. przez GitHub).

2. **Nowy projekt:**  
   **New Project** → wybierz **Deploy from GitHub repo**.  
   Połącz konto GitHub i wskaż repozytorium z JobRaven (musi zawierać folder `server/`).

3. **Jedna usługa z tego repo:**  
   Railway wykryje repo. Dodaj ** jedną usługę**:
   - **Add Service** → **GitHub Repo** → wybierz to samo repo (albo jeśli już dodane: kliknij w serwis).
   - W ustawieniach serwisu ustaw **Root Directory**: `server` (żeby build i start były z folderu `server/`, gdzie jest `package.json` i `index.js`).

4. **Zmienne środowiskowe:**  
   W serwisie: **Variables** (zakładka lub przycisk). Dodaj:
   - `JOBRAVEN_JWT_SECRET` = długi losowy string (min. 32 znaki).
   - `BASE_URL` = później wstawisz tutaj URL serwisu (np. `https://twoja-nazwa.up.railway.app`) – możesz to zrobić po pierwszym deployu, gdy Railway pokaże domenę.
   - `JOBRAVEN_ADMIN_PASSWORD_HASH` = hash hasła do panelu admina (wygeneruj lokalnie:  
     `node -e "const c=require('crypto'); const s='jobraven-admin-2025'; console.log(c.scryptSync('TWOJE_HASLO', s, 64).toString('hex'))"`).
   - **SMTP** (żeby rejestracja wysyłała mail weryfikacyjny): `JOBRAVEN_SMTP_HOST`, `JOBRAVEN_SMTP_PORT`, `JOBRAVEN_SMTP_USER`, `JOBRAVEN_SMTP_PASS`, `JOBRAVEN_MAIL_FROM`. Bez SMTP rejestracja się nie uda (błąd wysyłki maila).  
     **Gmail na Railway:** ustaw zmienne jak w sekcji „SMTP Gmail (Railway)” poniżej; przy Gmailu **nie ustawiaj** `MAILGUN_API_KEY` ani `MAILGUN_DOMAIN`, żeby serwer użył SMTP.

   **PORT** nie ustawiaj – Railway ustawia go automatycznie.

5. **Wolumen (dane użytkowników):**  
   Żeby pliki `server/data/*.json` nie znikały przy każdym redeployu:
   - W serwisie: **Settings** → **Volumes** → **Add Volume**.
   - **Mount Path:** ustaw na `data` (względem katalogu roboczego serwisu, czyli `server/` → katalog `data` wewnątrz niego).  
     (Na Railway przy Root Directory = `server` katalog roboczy to zawartość `server/`, więc mount path `data` daje trwały folder `data` obok `index.js`.)
   - Zapisz. Przy pierwszym uruchomieniu serwer utworzy tam pliki (seed), a przy kolejnych deployach dane zostaną.

6. **Domena publiczna:**  
   W serwisie: **Settings** → **Networking** → **Generate Domain**. Railway nada adres w stylu `nazwa.up.railway.app`.  
   Skopiuj ten URL (z `https://`) i w **Variables** ustaw `BASE_URL=https://nazwa.up.railway.app` (bez ukośnika na końcu).

7. **Deploy:**  
   Przy pierwszym deployu Railway zbuduje i uruchomi (`npm install` + `npm start`). Sprawdź **Deployments** i logi.  
   Test: w przeglądarce `https://twoja-domena.up.railway.app/health` → powinno być `{"ok":true,"service":"jobraven-auth"}`.  
   Panel admina: `https://twoja-domena.up.railway.app/admin`.

8. **W aplikacji desktop:**  
   W **Ustawieniach** wpisz adres serwera auth: `https://twoja-domena.up.railway.app` (bez `/` na końcu). Zaloguj się (po seedzie: np. konto z `server/store.js` lub zarejestruj nowe).

**Podsumowanie – co utworzyć na Railway:** jeden **Project**, w nim jedna **Service** z GitHub repo; w serwisie: Root Directory = `server`, Variables (JWT, BASE_URL, ADMIN_PASSWORD_HASH), Volume (mount path `data`), wygenerowana domena.

### Redeploy z lokalnego folderu (bez GitHub)

**Źródło kodu tylko z Railway CLI** – nie używaj GitHub do deployu; wgraj build z dysku:

1. Zainstaluj Railway CLI: `npm i -g @railway/cli` (albo użyj `npx`).
2. W katalogu głównym projektu: `railway login` (jednorazowo), potem w folderze `server/`: `railway link` i wybierz projekt/serwis (jeśli jeszcze nie połączony).
3. **Force redeploy** z aktualną zawartością `server/` – uruchom **lokalnie w PowerShell** (z katalogu głównego projektu):
   ```powershell
   npm run deploy:server
   ```
   albo:
   ```powershell
   .\scripts\deploy-railway.ps1
   ```
   lub z folderu `server/`: `npx railway up`.

**Przy 403 Forbidden:** Railway wymaga do uploadu **Project Token** (logowanie przeglądarką nie wystarcza w niektórych środowiskach). W Railway Dashboard: **Project (zonal-truth) → Settings → Tokens → Generate Project Token**. W PowerShell przed deployem: `$env:RAILWAY_TOKEN = "wklej-token"`. Potem `npm run deploy:server` lub `.\scripts\deploy-railway.ps1`. Deploy z automatu (np. Cursor) często dostaje 403 – uruchom skrypt **w swoim terminalu** z ustawionym `RAILWAY_TOKEN`.

Pliki z `server/` (w tym `public/admin/`, landing) są pakowane i wysyłane na Railway; build i start jak zwykle (`npm install`, `npm start`). Działa ten sam serwis co przy deployu z GitHub – tylko źródło kodu jest lokalne.

### SMTP Gmail (Railway)

Żeby na Railway wysyłać maile przez Gmail (np. tymczasowo zamiast Mailgun), w **Variables** serwisu ustaw:

| Zmienna | Wartość |
|--------|---------|
| `JOBRAVEN_SMTP_HOST` | `smtp.gmail.com` |
| `JOBRAVEN_SMTP_PORT` | `587` |
| `JOBRAVEN_SMTP_USER` | adres Gmail (np. `twoj@gmail.com`) |
| `JOBRAVEN_SMTP_PASS` | hasło aplikacji Gmail (Konto Google → Bezpieczeństwo → Hasła aplikacji) |
| `JOBRAVEN_MAIL_FROM` | ten sam adres co `JOBRAVEN_SMTP_USER` |

**Nie ustawiaj** `MAILGUN_API_KEY` ani `MAILGUN_DOMAIN` – wtedy serwer użyje SMTP zamiast Mailgun.

---

## 1. Co jest potrzebne

- **Node.js** 18+ (LTS)
- **Domena** wskazująca na serwer (zalecane – HTTPS i maile z poprawnymi linkami)
- **HTTPS** – aplikacja i przeglądarka łączą się z API; w produkcji używaj wyłącznie `https://`
- **SMTP** – potrzebne do rejestracji (mail weryfikacyjny) i resetu hasła. Bez SMTP rejestracja zwraca błąd „wysyłka maila nie powiodła się”, a użytkownik nie jest tworzony.

---

## 2. Pliki serwera na serwerze

Na maszynie (VPS / kontener):

- Skopiuj cały folder **`server/`** z projektu (wraz z `package.json`, `index.js`, `store.js`, `mail.js`, `mailTemplates.js`, `public/`).
- Nie kopiuj `server/data/` z lokalnego komputera, chyba że celowo przenosisz istniejących użytkowników – na czystym wdrożeniu folder `data/` powstanie przy pierwszym uruchomieniu (seed użytkowników, jeśli brak plików).

```bash
# Na serwerze, w katalogu z projektem
cd server
npm install --production
```

---

## 3. Konfiguracja (.env w produkcji)

W folderze `server/` utwórz plik **`.env`** (nie commituj go do repo). Minimalna konfiguracja produkcyjna:

```env
# Obowiązkowe w produkcji – inaczej każdy może podrobić tokeny
JOBRAVEN_JWT_SECRET=twoj-bardzo-dlugil-losowy-sekret-min-32-znaki

# Adres serwera (linki w mailach: weryfikacja, reset hasła). Bez końcowego /
BASE_URL=https://twoja-domena.pl

# Panel admina – hasło. Wygeneruj hash (podstaw TWOJE_HASLO):
# node -e "const c=require('crypto'); const s='jobraven-admin-2025'; console.log(c.scryptSync('TWOJE_HASLO', s, 64).toString('hex'))"
JOBRAVEN_ADMIN_PASSWORD_HASH=wygenerowany_hex

# Port wewnętrzny (za reverse proxy zwykle 3000)
PORT=3000
```

Opcjonalnie – **SMTP** (maile):

```env
JOBRAVEN_SMTP_HOST=smtp.twoja-domena.pl
JOBRAVEN_SMTP_PORT=587
JOBRAVEN_SMTP_USER=twoj@email.com
JOBRAVEN_SMTP_PASS=haslo
JOBRAVEN_MAIL_FROM=noreply@twoja-domena.pl
# Dla SMTP z certyfikatem self-signed (np. dpoczta.pl):
# JOBRAVEN_SMTP_INSECURE=1
```

Opcjonalnie – **klucz API do panelu admina** (zamiast logowania użytkownik/hasło):

```env
JOBRAVEN_ADMIN_SECRET=losowy-sekret-do-naglowka-X-Admin-Key
```

---

## 4. HTTPS (reverse proxy)

Serwer Express nasłuchuje na HTTP (np. `PORT=3000`). W produkcji przed nim stawiasz reverse proxy, który kończy HTTPS (certyfikat) i przekazuje ruch na localhost:3000.

### Caddy (najprostszy – automatyczny certyfikat)

```bash
# Instalacja Caddy (np. Ubuntu/Debian)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Konfiguracja: /etc/caddy/Caddyfile
twoja-domena.pl {
    reverse_proxy localhost:3000
}
```

`sudo systemctl reload caddy` – Caddy sam weźmie certyfikat Let's Encrypt.

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name twoja-domena.pl;
    ssl_certificate     /etc/letsencrypt/live/twoja-domena.pl/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/twoja-domena.pl/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Certyfikat: `certbot` (np. `certbot certonly --nginx -d twoja-domena.pl`).

---

## 5. Uruchamianie i autostart (PM2)

Żeby proces nie kończył się po zamknięciu sesji i po restarcie serwera:

```bash
# Instalacja PM2 (globalnie)
npm install -g pm2

# W folderze server/
cd /sciezka/do/server
pm2 start index.js --name jobraven-server

# Zapisanie konfiguracji pod autostart
pm2 save
pm2 startup
```

Przydatne: `pm2 logs jobraven-server`, `pm2 restart jobraven-server`.

---

## 6. Po wdrożeniu

- **Health check:** `https://twoja-domena.pl/health` lub `https://twoja-domena.pl/api/health` – powinno zwrócić `{"ok":true,"service":"jobraven-auth"}`.
- **Panel admina:** `https://twoja-domena.pl/admin` – logowanie: użytkownik `admin`, hasło ustawione przez `JOBRAVEN_ADMIN_PASSWORD_HASH`.
- **Backup:** regularnie kopiuj folder `server/data/` (użytkownicy, licencje, organizacje, ogłoszenia).

---

## 7. Aplikacja desktop – adres serwera

- **Użytkownik** może wpisać URL w **Ustawieniach** (pole adresu serwera auth). Wprowadź tam np. `https://twoja-domena.pl` (bez końcowego `/`).
- **Zaszycie domyślnego URL w buildzie:** żeby po instalacji aplikacja od razu łączyła się z Twoim serwerem (np. Railway), przy budowaniu ustaw zmienną środowiskową. Skrypt `scripts/write-auth-server-default.js` zapisze ten adres do `electron/build-config.generated.ts`, który jest kompilowany do aplikacji:
  ```bash
  set JOBRAVEN_AUTH_SERVER_DEFAULT=https://twoja-app.up.railway.app
  npm run electron:build
  ```
  (W PowerShell: `$env:JOBRAVEN_AUTH_SERVER_DEFAULT="https://..."; npm run electron:build`.)  
  Wtedy nowi użytkownicy nie muszą wpisywać adresu – mogą go ewentualnie zmienić w Ustawieniach.

---

## 8. Checklist wdrożenia

| Krok | Opis |
|------|------|
| Domena | DNS A/CNAME na IP serwera |
| Node 18+ | `node -v` na serwerze |
| Pliki | `server/` + `npm install --production` |
| .env | `JWT_SECRET`, `BASE_URL`, `ADMIN_PASSWORD_HASH`, opcjonalnie SMTP |
| Reverse proxy | Caddy lub Nginx + HTTPS (Let's Encrypt) |
| PM2 | `pm2 start index.js --name jobraven-server`, `pm2 save`, `pm2 startup` |
| Backup | Cron/kopia `server/data/` |

Po spełnieniu powyższego możesz testować na żywo: w aplikacji ustaw adres `https://twoja-domena.pl` i zaloguj się (po seedzie lub po rejestracji).
