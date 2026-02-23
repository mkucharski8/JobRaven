# Wdrożenie landingu i pomocy na własny serwer (np. dhosting)

Jak wrzucić landing i stronę pomocy na np. **www.jobraven.ravenquant.com**, żeby:
- strona główna pokazywała landing,
- przycisk „Pomoc” otwierał stronę pomocy (`help.html`).

---

## 1. Jakie pliki musisz mieć przed wgraniem

Potrzebujesz folderu z taką zawartością:

- **index.html** – strona główna (landing)
- **help.html** – strona pomocy (HTML wygenerowany z treści pomocy)
- **logo-horizontal_transp.png** – logo
- **screenshots/** – folder ze zrzutami ekranu (pliki .png)

**Skąd to wziąć:**

- **index.html** – w projekcie: `server/public/landing/index.html`
- **help.html** – w projekcie trzeba go wygenerować. Otwórz terminal w katalogu głównym projektu i wpisz:  
  `npm run landing:build-help`  
  Plik pojawi się w `server/public/landing/help.html`.
- **logo** – skopiuj z `src/assets/logo-horizontal_transp.png` do `server/public/landing/` (ten sam folder co index.html).
- **screenshots** – skopiuj zdjęcia z folderu `screenshots/` w projekcie do `server/public/landing/screenshots/`. Nazwy plików mogą być np. ksiega-zwykla.png, repertorium.png, baza-faktur.png itd.

Wszystko ma leżeć w jednym folderze, np. `server/public/landing/` – to ten folder (jego **zawartość**) wgrasz potem na serwer.

---

## 2. Link do pomocy na hostingu statycznym

Na zwykłym hostingu (bez serwera Node) nie ma adresu `/help`, tylko pliki. Dlatego w **index.html** link do pomocy musi prowadzić do pliku.

Otwórz **index.html** w edytorze i zamień:

- **szukaj:** `href="/help"`
- **zamień na:** `href="./help.html"`

Zrób to dla wszystkich wystąpień (np. przycisk „Pomoc” na górze i w stopce). Zapisz plik.

---

## 3. Subdomena w dhosting (dPanel)

1. Zaloguj się do **dPanelu** dhosting.
2. Wejdź w **Strony WWW** → **+ Dodaj**.
3. Jako adres wpisz np. **www.jobraven.ravenquant.com**.
4. Wybierz **pusta strona** (bez WordPressa itd.).
5. Dokończ dodawanie. Po utworzeniu strony wejdź w **Pokaż dane dostępowe** i zapisz:
   - host FTP (np. `twoj_login.ftp.dhosting.pl`),
   - login i hasło FTP,
   - ścieżkę do katalogu strony (np. `public_html` lub `public_html/www.jobraven.ravenquant.com`).

Propagacja DNS może potrwać do ok. 24 h.

---

## 4. Wgranie plików przez FTP

1. Użyj programu do FTP (np. **FileZilla**, **WinSCP**, **Total Commander**).
2. Połącz się z hostem z punktu 3 (port 21 dla FTP lub 22 dla SFTP), login i hasło z dPanelu.
3. Po stronie serwera przejdź do **katalogu tej subdomeny** (ta ścieżka, którą zapisałeś w punkcie 3).
4. Wgraj **zawartość** folderu z landingu (np. `server/public/landing/`), tak żeby w katalogu na serwerze znalazły się:
   - **index.html**
   - **help.html**
   - **logo-horizontal_transp.png**
   - **folder screenshots/** (w środku pliki .png)

Czyli wgrywasz pliki i folder tak, żeby nie było jednego nadmiarowego folderu „landing” – tylko od razu index, help, logo i folder screenshots w katalogu docelowym.

Przykład struktury na serwerze:

```
[katalog subdomeny]
├── index.html
├── help.html
├── logo-horizontal_transp.png
└── screenshots/
    ├── ksiega-zwykla.png
    ├── repertorium.png
    └── …
```

---

## 5. Sprawdzenie

- Wejdź na adres strony (np. https://www.jobraven.ravenquant.com) – powinien się załadować landing.
- Kliknij **Pomoc** – powinna otworzyć się strona pomocy.

Jeśli „Pomoc” nie działa: sprawdź, czy w wgranym **index.html** jest `href="./help.html"`, a nie `href="/help"`, i czy plik **help.html** jest w tym samym katalogu co index.html.

---

## 6. Późniejsze zmiany

- **Zmiana treści landingu** – edytujesz `index.html` lokalnie (w folderze, z którego wgrywasz), potem wgrywasz ten sam plik na serwer w to samo miejsce (nadpisujesz stary).
- **Zmiana treści pomocy** – edytujesz w projekcie plik `server/help.md`, potem ponownie uruchamiasz `npm run landing:build-help`, bierzesz nowy `help.html` z `server/public/landing/` i wgrywasz go na serwer (nadpisujesz stary help.html).
- **Nowe screenshoty** – dodajesz pliki do folderu `screenshots/` (lokalnie w tym samym zestawie co landing), potem wgrywasz cały folder `screenshots/` na serwer (możesz nadpisać).
