# Pomoc – JobRaven

JobRaven to aplikacja do zarządzania zleceniami, klientami, wykonawcami i fakturami (np. dla biur tłumaczeń i freelancerów). Dane są przechowywane lokalnie w bazie SQLite.

---

## Spis treści

1. [Start i logowanie](#start-i-logowanie)
2. [Nawigacja i pasek](#nawigacja-i-pasek)
3. [Księgi zleceń](#księgi-zleceń)
4. [Księga podzleceń](#księga-podzleceń)
5. [Klienci](#klienci)
6. [Wykonawcy](#wykonawcy)
7. [Baza faktur](#baza-faktur)
8. [Analityka](#analityka)
9. [Ustawienia](#ustawienia)
10. [Lista kontrolna i ostrzeżenia](#lista-kontrolna-i-ostrzeżenia)

---

## Start i logowanie

### Zakładanie konta

1. Uruchom JobRaven i na ekranie logowania wybierz **Zarejestruj się** (lub link do rejestracji).
2. Wpisz **adres e-mail** (będzie używany do logowania), **hasło** (minimum zgodnie z wymaganiami serwera), **nazwę wyświetlaną** (opcjonalnie) oraz **organizację** (opcjonalnie – np. nazwa firmy lub „Freelancer”).
3. Zaakceptuj regulamin / EULA, jeśli aplikacja to wyświetla.
4. Kliknij **Zarejestruj**. Serwer auth wyśle na podany e-mail **link aktywacyjny**.
5. Wejdź na skrzynkę e-mail i **kliknij link w wiadomości**. Konto zostanie aktywowane.
6. Wróć do aplikacji i **zaloguj się** tym samym adresem e-mail i hasłem. Po pierwszym logowaniu możesz uzupełnić Ustawienia (adres serwera auth, jednostki, pary językowe itd.).

Jeśli link aktywacyjny nie przyszedł, sprawdź folder Spam. W razie problemów skontaktuj się z administratorem serwera auth (np. dostawcą hostingu JobRaven).

### Logowanie i serwer

- **Logowanie**: e-mail i hasło. Jeśli korzystasz z wielu organizacji, wybierz organizację z listy.
- **Weryfikacja e-mail**: dopóki konto nie jest aktywowane (kliknięty link z maila), logowanie może być zablokowane.
- **Nie pamiętasz hasła?** – użyj „Wyślij link do resetu hasła”; link przyjdzie na e-mail (wymaga skonfigurowanego serwera SMTP).
- **Serwer auth**: domyślnie aplikacja łączy się z adresem ustawionym w konfiguracji (np. wbudowany adres produkcji lub localhost:3000). Gdy serwer jest niedostępny, zobaczysz komunikat o błędzie logowania.

---

## Nawigacja i pasek

- **Górny pasek**: ikony prowadzą do głównych sekcji – **Księgi zleceń**, **Księga podzleceń**, **Klienci**, **Wykonawcy**, **Baza faktur**, **Analityka**, **Ustawienia**.
- **Wskaźnik wersji** (obok przycisku „Komunikaty”):
  - **Zielony** – masz aktualną wersję aplikacji.
  - **Czerwony** – dostępna jest nowsza wersja; zostanie pobrana w tle i zaproponowana przy zamknięciu aplikacji (w wersji instalowanej).
- **Zielony pasek** na górze ekranu: „Aktualizacja pobrana – przy zamknięciu aplikacji zostanie zainstalowana.” Zamknij aplikację, aby uruchomić instalator.
- **Komunikaty** – otwiera historię komunikatów z serwera (ogłoszenia, aktualizacje). Nieprzeczytane komunikaty mogą pojawić się też jako okno po zalogowaniu.
- **Wyloguj** – wylogowanie z bieżącego konta. Dane lokalne (baza) pozostają na dysku.
- **E-mail** w stopce – zalogowany użytkownik.

---

## Księgi zleceń

Główny moduł do rejestracji zleceń.

### Wybór księgi i widoku

- Na górze wybierz **księgę zleceń** (możesz mieć ich kilka – np. „Zlecenia 2025”, „Repertorium”).
- **Widok księgi**:
  - **Zwykły** – tabela z kolumnami (nr zlecenia, nazwa, klient, termin, kwoty, status itd.).
  - **Repertorium (MS)** – widok dostosowany do wymogów repertorium (m.in. opis dokumentu, zwrot, strony, stawki ustne).
  - **Niestandardowy** – jak zwykły, ale z dodatkowymi kolumnami zdefiniowanymi w Ustawieniach dla danej księgi.

### Lista zleceń

- Każdy wiersz to jedno zlecenie. Kliknięcie w wiersz (lub przycisk „Edytuj”) otwiera **formularz zlecenia**.
- **Filtry**: przycisk „Filtruj” / „Dodaj filtr” – możesz filtrować np. po kliencie, dacie, statusie, parze językowej. „Wyczyść filtry” resetuje.
- **Sortowanie**: „Sortuj według” – wybór kolumny i kierunku sortowania.
- **Widoczność kolumn**: w widoku zwykłym/niestandardowym możesz włączać i wyłączać kolumny.

### Formularz zlecenia

- **Klient** (wymagany), **usługa**, **jednostka**, **ilość**, **stawka** – podstawowe pola. Stawka może być podpowiadana z domyślnych stawek klienta.
- **Para językowa**, **specjalizacja**, **wykonawca** – opcjonalne.
- **Status zlecenia**: do zrobienia, w trakcie, zakończone, anulowane.
- **Status faktury**: do wystawienia, wystawiona, oczekująca na płatność, zaległa, opłacona.
- W widoku **repertorium** uzupełnij dodatkowe pola (opis dokumentu, zwrot, strony, stawki ustne itd.) zgodnie z podpowiedziami w formularzu.
- **Zapisz** – zapisuje zlecenie. **Duplikuj** – kopiuje zlecenie z nowym numerem/nazwą.

### Wystawianie faktury

- Dla zleceń ze statusem „do faktury” użyj **Wystaw fakturę** (pojedynczo lub zbiorczo). Ustaw numer faktury, datę, opcjonalnie termin płatności i uwagi.
- Jeśli w Ustawieniach włączona jest **integracja wFirma**, faktura może być tworzona w wFirma przez API (wybierz rachunek wFirma). **Integracja z wFirma zapewnia zgodność numeracji faktur w obu programach.** W JobRaven można nawet **drukować faktury bezpośrednio z wFirma.pl** (np. po wystawieniu przez API). W przeciwnym razie generowana jest **faktura lokalna** (PDF).
- **Termin płatności** jest liczony od daty faktury + domyślny termin płatności klienta (ustawiony w karcie klienta).

### Eksport

- **Eksport do CSV / XLS / PDF** – eksport listy zleceń (z widocznymi kolumnami i filtrami) do pliku.

---

## Księga podzleceń

Moduł do **podzleceń** przekazywanych wykonawcom.

- Lista podzleceń: każde podzlecenie jest powiązane z **zleceniem** i **wykonawcą**.
- **Dodaj podzlecenie** – wybierz zlecenie z księgi, wykonawcę, uzupełnij nazwę i szczegóły. Stawka może być podpowiedziana ze stawek wykonawcy (jednostka + opcjonalnie para językowa).
- **Potwierdzenie zlecenia (PDF)** – generuje dokument PDF do wydruku lub wysłania wykonawcy (na podstawie szablonu potwierdzenia zlecenia).
- **Edytuj** / **Usuń** – jak w innych modułach.

---

## Klienci

Baza **klientów** (zleceniodawców).

- **Dodaj klienta** – nazwa/skrót, typ (firma / osoba), adres, NIP, e-mail, telefon, osoba kontaktowa, notatki.
- **Domyślny termin płatności (dni)** – używany przy wystawianiu faktury (termin = data faktury + te dni).
- **Klient w UE (VAT UE)** – dla klienta typu „firma” możesz zaznaczyć, że klient jest z UE (wpływa na reguły VAT przy usługach).
- **Pobierz z baz publicznych** – dla polskiego NIP (10 cyfr) możesz uzupełnić nazwę i adres z rejestru VAT lub GUS. W razie błędu uzupełnij dane ręcznie.
- **Domyślne stawki za jednostkę** – stawki dla danego klienta i jednostki (i opcjonalnie waluty); służą do **podpowiadania stawki** przy dodawaniu zlecenia dla tego klienta.
- **Usuń klienta** – powiązane zlecenia pozostaną, ale bez przypisanego klienta (można je później edytować).

---

## Wykonawcy

Baza **wykonawców** (tłumaczy, podwykonawców).

- **Dodaj wykonawcę** – nazwa/skrót, adres, NIP, e-mail, telefon, notatki. Podobnie jak u klientów możesz **pobierać dane z NIP** (rejestr VAT/GUS).
- **Stawki wg jednostek i kierunku języka** – dla każdej jednostki (i opcjonalnie pary językowej) ustaw stawkę. Służy do **podpowiadania stawki** przy dodawaniu podzlecenia dla tego wykonawcy.
- **Usuń wykonawcę** – usuwa wykonawcę; podzlecenia z nim powiązane należy rozwiązać ręcznie lub edytować.

---

## Baza faktur

Przegląd **wystawionych faktur** (zleceń, które mają przypisany numer faktury).

- Lista zawiera zlecenia z uzupełnionym numerem faktury, datą itd.
- **Faktura (PDF)** – generuje lub pobiera PDF faktury (lokalnej lub z wFirma, jeśli zlecenie pochodzi z integracji).
- Można **edytować fakturę** (uwagi, konto bankowe itd.) w ramach edycji zlecenia.
- **Filtry** – np. po dacie, kliencie – zależą od widoku i dostępnych kolumn.

---

## Analityka

Podsumowania i raporty na podstawie zleceń z wybranej **księgi** (lub wszystkich ksiąg). Opcjonalnie możesz zawęzić wyniki do jednej **waluty**.

### Zasady ogólne

- **Księga** – wybór księgi zleceń lub „Wszystkie księgi”. Ustawienie dotyczy **statystyk**, **płatności** i **raportu zarobków**.
- **Waluta** – filtr „Wszystkie waluty” lub konkretna waluta (np. PLN). Gdy wybierzesz walutę, dane w pozostałych sekcjach są ograniczone do zleceń w tej walucie.
- **Zlecenia anulowane** – we wszystkich raportach i statystykach **nie są uwzględniane**. Liczone i sumowane są tylko zlecenia ze statusem innym niż „Anulowane”.

---

### Statystyki

- **Co pokazuje:** łączne ilości w **jednostce bazowej** (np. strony, znaki) wg kategorii jednostek oraz liczba zleceń i suma ilości wg każdej jednostki (strona, znak, godz. itd.).
- **Źródło:** zlecenia nieanulowane z wybranej księgi; ilości są przeliczane na jednostkę bazową kategorii (ustawienia: Kategorie jednostek → jednostka bazowa, Jednostki → przelicznik do bazy).
- **Dla zleceń ustnych** w statystykach używana jest **czas trwania** (np. godziny), a nie ilość stron.
- Wyniki są grupowane **per waluta** (o ile nie ustawiono filtra waluty).

---

### Płatności

- **Co pokazuje:** liczba zleceń i suma kwot (netto) wg **statusu faktury**: do faktury, wystawione, oczekujące na płatność, opłacone, zaległe. Osobno wyświetlana jest sekcja **Zaległe** – zlecenia z terminem płatności w przeszłości i statusem „wystawione” lub „oczekujące”.
- **Uwaga:** liczone są **zlecenia** (po jednym wierszu na zlecenie), nie dokumenty faktur – jedno zlecenie = jeden wpis w statusie faktury.
- **Kwoty:** dla zleceń pisemnych używana jest kwota netto z pola „Kwota”; dla ustnych – wynagrodzenie netto/brutto z pól repertorium (oral_net / oral_gross). Zlecenia z kwotą 0 nie wchodzą do podsumowania płatności.
- Wyniki są **per waluta**.

---

### Raport zarobków (tabela przestawna i wykres)

Raport pozwala grupować zlecenia według wybranych pól, sumować lub uśredniać kwoty i oglądać wynik w tabeli oraz na wykresie.

#### Data, po której grupowane są wiersze

- **Data zlecenia** – do grupowania (np. rok, miesiąc) używana jest data przyjęcia zlecenia (*received_at*).
- **Termin płatności** – używana jest data terminu płatności (*payment_due_at*). Zlecenia bez ustawionego terminu nie pojawią się w raporcie przy tym ustawieniu.

#### Poziomy wierszy (grupowanie)

- Możesz ustawić **kilka poziomów** (np. najpierw rok, potem miesiąc, potem klient). Pierwszy poziom = grupa zewnętrzna, kolejne – zagnieżdżone.
- **Dostępne pola** zależą od widoku księgi (zwykły vs repertorium). Przykłady: rok, miesiąc, klient, usługa, specjalizacja, para językowa, jednostka, status zlecenia, status faktury, termin płatności, nr zlecenia, data przyjęcia/zakończenia, kwota netto/brutto, a w widoku repertorium także m.in. autor dokumentu, nazwa dokumentu, data dokumentu, typ aktywności, dane ustne (data, miejsce, język, czas trwania, stawka, netto/brutto) itd.
- Domyślnie pierwszy poziom to **klient**.

#### Kolumna kwoty i agregacja

- **Kolumna (kwota):** Netto / VAT / Brutto / Ilość. Dla „Ilość” w zleceniach ustnych używany jest czas trwania, w pisemnych – ilość jednostek.
- **Agregacja:** Suma / Średnia / Wartość maks. – określa, jak wartości w danej grupie są łączone (np. suma netto po klientach, średnia kwota per miesiąc).

#### Filtry

- **Filtry** zawężają zestaw zleceń przed zbudowaniem tabeli i wykresu. Wybierasz **pole** (np. specjalizacja, para językowa) i **wartość** (np. „Prawo”, „EN → PL”). Możesz dodać kilka filtrów; zlecenia muszą spełniać wszystkie.
- Filtry działają jak w tabeli przestawnej: najpierw ograniczasz dane, potem grupowanie i agregacja liczą się już na przefiltrowanym zbiorze.

#### Wykres i eksport

- **Wykres** – słupki wg wybranej kolumny (netto, VAT, brutto lub ilość). Opcja **„Wykres przestawny (netto + VAT)”** pokazuje na jednym słupku netto i VAT (bez brutto jako osobnej kolumny).
- **Eksport raportu (XLS)** – zapisuje do pliku arkusz z tabelą przestawną oraz arkusz „Dane wykresu” (dane do wizualizacji). Etykiety kolumn zależą od języka interfejsu.

#### Jak używać raportu w praktyce

- **Przychody wg miesięcy:** ustaw „Data według” = Data zlecenia, poziomy wierszy = Rok, Miesiąc; kolumna = Netto; agregacja = Suma.
- **Przychody wg klientów:** poziomy = Klient; kolumna = Netto; agregacja = Suma. Opcjonalnie dodaj filtr np. po parze językowej.
- **Średnia wartość zlecenia wg roku:** poziomy = Rok; kolumna = Netto; agregacja = Średnia.
- **Terminy płatności:** „Data według” = Termin płatności, poziomy = Rok, Miesiąc (lub Klient); kolumna = Brutto; agregacja = Suma – zobaczysz, jakie kwoty są planowane do zapłaty w danym okresie.

---

### Podsumowanie

| Sekcja        | Co liczy / grupuje                          | Wykluczenia              |
|---------------|---------------------------------------------|--------------------------|
| Statystyki    | Ilości w jednostce bazowej, liczba zleceń   | Zlecenia anulowane       |
| Płatności     | Zlecenia wg statusu faktury, zaległe        | Zlecenia anulowane, kwota = 0 |
| Raport zarobków | Tabela przestawna + wykres po wybranych polach | Zlecenia anulowane (w UI) |

---

## Ustawienia

Ustawienia są podzielone na sekcje (rozwijane). Uzupełnij je według **listy kontrolnej** (patrz niżej), aby uniknąć ostrzeżeń i błędów przy pracy.

### Ustawienia programu

- **Stan licencji** – informacja o koncie i weryfikacji licencji (gdy używasz serwera auth).
- **Język interfejsu** – Polski / English.
- **Wygląd** – domyślny lub duży kontrast.
- **Skalowanie ikon** / **skalowanie interfejsu** – rozmiar ikon w górnym pasku i zoom całego UI.
- **Folder danych** – gdzie przechowywana jest baza i ustawienia (domyślnie katalog aplikacji w AppData). Zmiana może wymagać ponownego uruchomienia.

### Dane użytkownika

- **Organizacja**, **login (nazwa wyświetlana)**, **e-mail**.
- **Zmień hasło** – aktualne hasło, nowe, potwierdzenie.
- **Zmień login** – nowa nazwa wyświetlana (wymaga hasła).

### Dane podmiotu (personal / firma)

- **Nazwa firmy** (opcjonalnie), **imię**, **nazwisko**, **NIP**.
- **Czy jesteś płatnikiem VAT?** – Tak / Nie. Przy integracji wFirma musi być spójne z ustawieniami w panelu wFirma.
- **Adres** – ulica, nr, kod, miasto, kraj. **Kraj podatnika** – używany do ustalenia segmentu klienta (krajowy/UE/świat) przy VAT.
- **Logo firmy na fakturze** – wybór pliku obrazka.

### Księgi zleceń

- **Dodaj księgę** – nazwa, **widok** (zwykły, repertorium, niestandardowy), format numeru zlecenia.
- Dla księgi **repertorium**: ustaw **jednostkę jako godz.** i **jednostkę jako strona** (do repertorium MS).
- Dla **niestandardowego** – dodaj/ukryj kolumny w sekcji „Kolumny” dla tej księgi.

### Podzlecenia

- **Format numeru podzlecenia** – np. `PZ/{YYYY}/{NR}`.

### Specjalizacje i usługi

- **Specjalizacje** – lista (np. prawo, medycyna); do wyboru w zleceniach.
- **Usługi** – np. tłumaczenie pisemne, ustne. **VAT według usługi** – dla każdej usługi ustaw stawki lub kody VAT w zależności od segmentu klienta (firma/osoba, kraj/UE/świat). Opcjonalnie override dla konkretnego kraju.

### Faktury

- **Format numeru faktury** – np. `FV/{YYYY}/{NR}`.
- **Źródło numeru faktury** – wewnętrzne lub **wFirma** (wtedy numery mogą być z wFirma).
- **Integracja wFirma**: **Access key**, **Secret key**, **App key**, **Company ID** (z panelu wFirma: Ustawienia → Bezpieczeństwo → Aplikacje → Klucze API). **Test połączenia** – sprawdza klucze. **Rachunek firmy** – wybierz rachunek do wystawiania faktur przez API.
- **Konta bankowe** – lista kont (nazwa, numer, SWIFT, waluta); jedno można ustawić jako domyślne na fakturze.

### Języki i pary językowe

- **Języki** – dodaj kody (EN, PL, DE …) i nazwy. „Dodaj z listy” uzupełnia zestaw popularnych języków.
- **Pary językowe** – np. EN → PL, PL → EN. **Dwukierunkowa** – np. EN↔PL (tłum. ustne środowiskowe). **Etykieta pary** – wyświetlana w zleceniach.

### Kategorie jednostek i jednostki

- **Kategorie jednostek** – np. „Pisemne”, „Ustne”. Dla każdej kategorii ustaw **jednostkę bazową** (do przeliczania i statystyk).
- **Jednostki** – np. strona, znak ze spacjami, godzina. **Przelicznik do bazy** – ile jednostek bazowych stanowi dana jednostka. Jedną jednostkę ustaw jako **bazową** (★).
- Dla repertorium: w ustawieniach księgi wybierz **jednostkę jako godz.** i **jednostkę jako strona**.

### Kody VAT i reguły VAT

- **Kody VAT** – definicje kodów (np. NP, ZW) z etykietami PL/EN (na fakturze używana jest etykieta w wybranym języku).
- **VAT według usługi** (w sekcji Usługi) – dla każdej usługi i segmentu klienta (firma kraj, firma UE, osoba kraj itd.) ustaw **stawkę %** lub **kod** (np. ZW).

### Waluty i stawki domyślne

- **Waluta domyślna** – np. PLN.
- **Waluty** – lista kodów (PLN, EUR, USD …); używane przy stawkach w zleceniach i u klientów/wykonawców.
- **Stawki domyślne** – stawki wg jednostki (i opcjonalnie argumentów, np. para językowa, waluta). Służą do **podpowiadania stawek** w zleceniach, gdy klient nie ma własnych stawek.

### Debug (tylko wersja deweloperska)

- W wersji **niepakowanej** (np. `npm run electron:dev`) na dole Ustawień pojawia się sekcja **Debug: Auto-update (GitHub)**. Przycisk **Sprawdź połączenie z GitHub** – testuje dostęp do release’ów (liczba release’ów, najnowsza wersja, tagi). Przydatne przy diagnozie aktualizacji.

---

## Lista kontrolna i ostrzeżenia

Aplikacja pokazuje **listę kontrolną konfiguracji** (żółty blok z ostrzeżeniami), gdy czegoś brakuje. Zalecane kroki:

1. **Dane podmiotu** – imię i nazwisko lub nazwa firmy, ulica, miasto, kraj (potrzebne do faktur i potwierdzeń).
2. **Co najmniej jedna księga zleceń**.
3. **Co najmniej jedna waluta** (Ustawienia → Waluty).
4. **Co najmniej jeden rodzaj usługi** (Ustawienia → Usługi).
5. **Kategorie jednostek i jednostki** – co najmniej jedna kategoria i jedna jednostka.
6. **Jednostki dla repertorium** – jeśli używasz księgi w widoku repertorium, ustaw w ustawieniach księgi jednostkę „jako godz.” i „jako strona”.
7. **Stawki domyślne** – aby podpowiadały się w zleceniach (Ustawienia → Stawki domyślne).
8. **VAT dla usług** – dla każdej usługi ustaw reguły VAT (Ustawienia → Usługi → VAT według usługi).
9. **Waluta domyślna** (Ustawienia → Waluty).
10. **Kraj podatnika** – aby VAT był naliczany poprawnie (Ustawienia → Dane podmiotu).
11. **wFirma** – jeśli używasz integracji: klucze API, płatnik VAT, rachunek firmy (Ustawienia → Faktury).

Kliknięcie **„Przejdź do ustawień”** w ostrzeżeniu przenosi do Ustawień. Po uzupełnieniu brakujących elementów ostrzeżenia znikają.

---

*Dokument pomocy dla frontendu JobRaven. Wersja: 0.1.2.*
