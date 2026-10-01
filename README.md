# Attribution Helper

Rozszerzenie do Chrome, które na żywo pokazuje, skąd GA4 policzy ruch i w którym miejscu ścieżki gubi się atrybucja. Działa na dowolnej stronie, śledzi przejścia między domenami i zapisuje całą ścieżkę do raportu.

Typowy przypadek: użytkownik przychodzi z kampanii, przechodzi między domenami serwisu i po drodze staje się nowym użytkownikiem ze źródłem `referral`. Zakładka Network to pokazuje, ale w setkach żądań trzeba wiedzieć, czego szukać. Panel mówi wprost, co się stało i w którym kroku.

## Instalacja

Rozszerzenia nie ma w Chrome Web Store, instaluje się je lokalnie jako rozpakowane.

1. Pobierz to repozytorium. Najwygodniej przez git, bo aktualizacja to potem jedno `git pull`:
   ```bash
   git clone https://github.com/kon-mat/attribution-helper-dist.git
   ```
   Bez gita: **Code → Download ZIP** i rozpakuj.
2. Otwórz `chrome://extensions`.
3. Włącz **Tryb dewelopera** (przełącznik w prawym górnym rogu).
4. Kliknij **Załaduj rozpakowane** i wskaż folder z tym repozytorium, ten z plikiem `manifest.json` w środku.
5. Przypnij ikonę: układanka na pasku Chrome, potem pinezka przy Attribution Helper.

Po instalacji nie przenoś folderu i nie zmieniaj jego nazwy, bo Chrome zapamiętuje ścieżkę, a nie zawartość. Przy starcie przeglądarka może zapytać, czy wyłączyć rozszerzenia w trybie dewelopera. To normalne przy rozszerzeniach rozpakowanych, a **Anuluj** zostawia je włączone.

## Aktualizacja

1. W folderze repozytorium uruchom `git pull` (przy ZIP-ie pobierz nowe archiwum i podmień zawartość folderu).
2. W `chrome://extensions` kliknij odświeżanie (↻) przy Attribution Helper.
3. Otwórz nową kartę. Chrome nie wstrzykuje skryptów ponownie do kart otwartych przed aktualizacją, a samo przeładowanie takiej karty nie wystarcza.

## Jak używać

Rozszerzenie domyślnie nic nie robi na żadnej stronie. Żeby przechwycić zdarzenia GA4, sonda podmienia `sendBeacon` i `fetch`, więc działa tylko w trakcie świadomie rozpoczętej sesji, a nie w tle na wszystkim, co odwiedzasz.

1. Wejdź na stronę, od której zaczyna się badana ścieżka.
2. Kliknij ikonę rozszerzenia i wybierz **Rozpocznij sesję**. Panel pojawia się od razu, bez przeładowania strony.
3. Chodź po serwisie normalnie, także między domenami. Sesja obejmuje wszystkie odwiedzane strony i przeżywa przeładowania, przejścia między domenami oraz restart przeglądarki.
4. Ikona rozszerzenia otwiera oś czasu i listę przejść.
5. Na koniec **Zakończ sesję**: panel znika, wstrzykiwanie się wyłącza.

### Co pokazuje panel

| Sekcja | Odpowiada na pytanie |
|---|---|
| Pomiar | Czy kontener GTM się załadował, czy działa Preview mode, czy zdarzenia trafią do DebugView |
| Atrybucja | Jakie source/medium i Channel group przypisze GA4, policzone z UTM, identyfikatorów kliknięć i odsyłającego |
| Sesja | Czy w tej odsłonie wypadł `session_start`, bo wtedy GA4 przypisuje źródło |
| Między domenami | Czy `client_id` przetrwał przejście, czy nie doszło do samoodesłania, czy linki nie niosą wewnętrznych UTM |
| Zgoda | Stan Consent Mode, decyzja zapisana przez CMP i to, czy przeszła między domenami |

Przy każdym wierszu jest przycisk „?” z wyjaśnieniem, czym dana rzecz jest i jak powinna działać.

Wierszy jest 23 i rzadko potrzeba wszystkich naraz. Ikona ⚙ w pasku panelu, a w niej **Zestaw wierszy**, przełącza gotowe układy: Podstawowy, Wszystkie, Ciągłość między domenami, Zgoda i Consent Mode, Kontener i wysyłka zdarzeń, Oznaczenie ruchu. Własny układ zapisujesz pod nazwą przyciskiem **Zapisz**.

### Raport

W popupie są dwa przyciski. **Kopiuj raport** daje tekst do wklejenia w notatkę albo zgłoszenie, **Pobierz JSON** zapisuje pełne dane sesji: każdy krok z `client_id`, `session_id`, źródłem, kanałem, kontenerami i zgodą. Liczniki u góry popupu pokazują liczbę kroków, przejść, zerwanych tożsamości i nowych sesji, a ikona rozszerzenia dostaje czerwoną odznakę z liczbą problemów.

## Profile projektów

Profil jest opcjonalny. Bez niego narzędzie działa wszędzie i pokazuje, co widzi, a za domeny projektu uznaje hosty odwiedzone w bieżącej sesji. Nie ocenia wtedy zgodności kontenera ani strumienia.

Profil mówi panelowi, jakiego kontenera i strumienia oczekiwać na danej domenie oraz które domeny należą do projektu. Bez tej drugiej informacji nie da się odróżnić samoodesłania od zwykłego ruchu z zewnątrz.

Domenę najprościej dodać z panelu w trakcie badania. Gdy bieżąca domena nie należy do aktywnego profilu, pasek nad treścią panelu ma przycisk **Dodaj tę domenę**, a bez aktywnego profilu **Utwórz profil z tej domeny**. Pełna edycja jest pod ikoną rozszerzenia, w zakładce **Profile**: wiersz na domenę z polami na kontener GTM, measurement ID i property. Wymagana jest tylko domena, subdomeny są obejmowane automatycznie (`sklep.pl` pokrywa też `koszyk.sklep.pl`).

Profile przenosi się przyciskami **Eksportuj profile** i **Importuj z pliku**. Import scala profile z już zapisanymi, niczego nie nadpisuje. Plik do importu wygląda tak:

```json
{
  "profile": {
    "nazwa-projektu": {
      "domeny": [
        { "domena": "sklep.pl", "kontener": "GTM-XXXXXXX", "measurementId": "G-XXXXXXXXXX", "property": "000000000" },
        { "domena": "sklep-partner.pl" }
      ]
    }
  }
}
```

## Dwie rzeczy, które trzeba wiedzieć o atrybucji

GA4 nie wysyła source ani medium w zdarzeniu. W payloadzie są `tid`, `cid`, `sid`, `sct`, `seg`, `gcs`, `dl` i `en`, źródła nie ma: GA4 wylicza je po swojej stronie z adresu, odsyłającego i identyfikatorów kliknięć. Wiersz „Source / medium” odtwarza tę regułę, więc jest przewidywaniem. Ostateczny werdykt zawsze sprawdzaj w raportach GA4.

Źródło przypisywane jest przy starcie sesji. Gdy sesja już trwa, znaczniki w adresie go nie nadpiszą. Jeśli `session_start` wypadł w środku ścieżki, źródło sesji pochodzi z tamtego miejsca.

Kanał liczony jest według opublikowanych reguł Google (*Default channel group*), w ich kolejności. Dla ruchu z Google Ads ostateczny kanał zależy od typu kampanii, którego nie widać w przeglądarce. Performance Max trafi do Cross-network, nie do Paid Search, i panel dopisuje to zastrzeżenie przy `gclid`.

## Uprawnienia i dane

| Uprawnienie | Po co |
|---|---|
| `<all_urls>` | Rozszerzenie ma działać na dowolnej badanej stronie, nie na zamkniętej liście |
| `scripting` | Wstrzykiwanie skryptów na czas sesji i wycofywanie ich po zakończeniu |
| `storage` | Profile, zestawy wierszy, ustawienia panelu i ślad sesji |

Rozszerzenie nie wysyła danych nigdzie na zewnątrz. Wszystko zostaje w pamięci przeglądarki i wychodzi wyłącznie wtedy, gdy sam klikniesz eksport.

## Zgłaszanie błędów

Do zgłoszenia dołącz plik z **Pobierz JSON** albo wynik **Kopiuj stan** z panelu (odczyt wszystkich wierszy dla bieżącej strony), do tego adres wejścia i wersję Chrome. Bez zrzutu stanu zgłoszenie „panel pokazuje źle” jest nieodtwarzalne.

## Wymagania

Chrome 111 lub nowszy.

---

To repozytorium zawiera wyłącznie gotowe rozszerzenie i aktualizuje się automatycznie. Zmiany wprowadzone bezpośrednio tutaj zostaną nadpisane przy następnej aktualizacji.
