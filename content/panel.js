/**
 * panel.js — panel Attribution Helper. Warstwa izolowana rozszerzenia.
 *
 * Panel siedzi w Shadow DOM, więc style badanej strony go nie deformują.
 * Dwa widoki: podstawowy (to, co trzeba widzieć zawsze) i rozszerzony (komplet).
 * Każdy wiersz ma przycisk pomocy wyjaśniający, czym jest dana rzecz i jak powinna działać.
 */
(() => {
  'use strict';

  const KANAL = '__attribution_helper';

  /**
   * Konfiguracja projektu. Pusta oznacza tryb uniwersalny: panel pokazuje,
   * co widzi na stronie, ale nie ocenia zgodnosci z oczekiwaniami.
   * Wypelniana z profilu zapisanego w ustawieniach — patrz start().
   */
  const konfiguracja = {
    nazwaProfilu: null,
    /** [{domena, kontener?, measurementId?, property?}] */
    domeny: [],
    /** Hosty odwiedzone w tej sesji — uzupelniaja liste domen projektu, gdy nie ma profilu. */
    domenySesji: []
  };

  const czasStartu = Date.now();

  /** Czy host nalezy do podanej domeny (sama domena albo jej subdomena). */
  const naleziDoDomeny = (host, domena) => {
    if (!host || !domena) return false;
    const h = String(host).toLowerCase();
    const d = String(domena).toLowerCase().replace(/^\./, '');
    return h === d || h.endsWith('.' + d);
  };

  /** Wpis konfiguracji dla podanego hosta albo null. */
  const wpisDomeny = (host) =>
    konfiguracja.domeny.find((w) => naleziDoDomeny(host, w.domena)) || null;

  /** Oczekiwania dla biezacej strony — null w trybie uniwersalnym. */
  const oczekiwanieDla = () => wpisDomeny(location.hostname);

  /**
   * Identyfikatory kliknięć reklamowych.
   * Rozpoznawane przez GA4 (auto-tagowanie Google) są oznaczone flagą ga4.
   * Reszta trafia do innych systemów — GA4 ich nie czyta i użyje UTM albo odsyłającego.
   */
  const IDENTYFIKATORY = [
    { nazwa: 'gclid',     system: 'Google Ads',        ga4: true },
    { nazwa: 'gbraid',    system: 'Google Ads (iOS)',  ga4: true },
    { nazwa: 'wbraid',    system: 'Google Ads (web)',  ga4: true },
    { nazwa: 'dclid',     system: 'Display & Video',   ga4: true },
    { nazwa: 'msclkid',   system: 'Microsoft Ads',     ga4: false },
    { nazwa: 'fbclid',    system: 'Meta',              ga4: false },
    { nazwa: 'ttclid',    system: 'TikTok',            ga4: false },
    { nazwa: 'li_fat_id', system: 'LinkedIn',          ga4: false },
    { nazwa: 'twclid',    system: 'X / Twitter',       ga4: false },
    { nazwa: 'epik',      system: 'Pinterest',         ga4: false }
  ];

  const POLA_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];

  /* ------------------------------------------------------------------ *
   *  Opisy pomocy — treść pod przyciskiem „?" przy każdym wierszu.
   * ------------------------------------------------------------------ */
  const POMOC = {
    kontener: {
      tytul: 'Kontener GTM',
      tresc: 'Który kontener Google Tag Managera faktycznie wczytał się na tej stronie, zestawiony z tym, którego oczekujemy na tej domenie. Żółty kolor znaczy, że doszedł kontener spoza inwentarza — sam w sobie nie psuje pomiaru, ale warto sprawdzić, czy oba nie wysyłają tych samych zdarzeń podwójnie.'
    },
    podglad: {
      tytul: 'Preview mode',
      tresc: 'Czy kanał do Tag Assistant faktycznie stoi na tej stronie. „PODŁĄCZONY" znaczy, że w kodzie strony jest kanał debugowania. Sam parametr gtm_debug w adresie to za mało — mówi tylko, jak tu weszliśmy. Gdy podgląd nie działa, kliknij „Enable" w oknie Tag Assistant i odśwież stronę.'
    },
    ga4: {
      tytul: 'Data stream (GA4)',
      tresc: 'Identyfikator pomiaru (Measurement ID) odczytany z ostatniego wysłanego zdarzenia, porównany z tym, którego oczekujemy na tej domenie. Rozjazd oznacza, że dane trafiają do innej usługi niż zakładamy.'
    },
    debugview: {
      tytul: 'Widoczność w DebugView',
      tresc: 'Czy wysyłane zdarzenia niosą znacznik debugowania. Bez niego nie zobaczysz ich w GA4 DebugView, nawet jeśli tag odpalił poprawnie. Zwykła przyczyna: kontener nie został włączony przyciskiem „Debug \'Live\' version" w Tag Assistant.'
    },

    zrodlo: {
      tytul: 'Source / medium (przewidywane)',
      tresc: 'Co GA4 najpewniej przypisze temu wejściu — wyliczone ze wszystkich sygnałów: identyfikator kliknięcia Google ma pierwszeństwo przed UTM, UTM przed odsyłającym, a bez żadnego sygnału wychodzi wejście bezpośrednie. Odsyłający z wyszukiwarki dostaje medium organic, jak w GA4. To przewidywanie, nie odczyt: GA4 nie wysyła source ani medium w zdarzeniu, wylicza je po swojej stronie i dokłada reguły property (wykluczenia odsyłające). Pamiętaj też, że źródło przypisuje się przy starcie sesji — gdy sesja trwa, obowiązuje to sprzed wejścia. Werdykt ostateczny: raporty GA4.'
    },
    kanal: {
      tytul: 'Przewidywany kanał (Default channel group)',
      tresc: 'Grupa kanałów, do której GA4 wrzuci przewidywane źródło i medium — policzona według opublikowanych reguł Google (dokumentacja „Default channel group"), z zachowaniem ich kolejności: Direct, kanały płatne, Display, kanały organiczne, Email, Affiliates, Referral i pozostałe. Medium pasujące do wzorca cp/ppc/paid daje kanały płatne; źródło z listy wyszukiwarek lub serwisów społecznościowych decyduje między Search a Social. Zastrzeżenie: dla ruchu Google Ads (gclid) ostateczny kanał zależy od typu kampanii, którego nie widać w przeglądarce — Performance Max wyląduje w Cross-network, nie w Paid Search.'
    },
    utm: {
      tytul: 'Parametry UTM',
      tresc: 'Znaczniki kampanii doklejone do adresu. To one mówią GA4, skąd przyszedł użytkownik. Dla poprawnej atrybucji potrzebne są co najmniej utm_source i utm_medium — sam utm_campaign bez nich nie wystarcza.'
    },
    identyfikatory: {
      tytul: 'Identyfikatory kliknięć',
      tresc: 'Znaczniki doklejane automatycznie przez systemy reklamowe. GA4 rozpoznaje wyłącznie te od Google: gclid, gbraid, wbraid i dclid — one mają pierwszeństwo przed UTM. Pozostałe (msclkid, fbclid, ttclid) obsługują inne systemy; dla GA4 są niewidoczne i źródło wyliczy z UTM albo odsyłającego.'
    },
    odsylajacy: {
      tytul: 'Odsyłający',
      tresc: 'Strona, z której użytkownik tu przyszedł. Gdy brakuje UTM i identyfikatora kliknięcia, to właśnie odsyłający decyduje o źródle. Odsyłający z własnej domeny to sygnał alarmowy — patrz wiersz „Samoodesłanie".'
    },
    trwalosc: {
      tytul: 'Trwałość sygnału',
      tresc: 'Czy znaczniki, z którymi weszliśmy na tę domenę, przetrwały wędrówkę po podstronach. Przekierowania po stronie serwera potrafią uciąć wszystko po znaku zapytania — kampania znika, a ruch ląduje w raportach jako bezpośredni. Panel pamięta sygnał wejścia w tej karcie i porównuje go z bieżącym adresem.'
    },

    startSesji: {
      tytul: 'session_start',
      tresc: 'Najważniejszy moment całej atrybucji: GA4 przypisuje źródło dokładnie wtedy, gdy zaczyna się sesja. Jeżeli start sesji wypadnie w środku ścieżki, a nie przy wejściu z kampanii, źródło zostanie wzięte z tego miejsca. Zdarzenie ze znacznikiem startu ma parametr _ss.'
    },
    pierwszaWizyta: {
      tytul: 'first_visit',
      tresc: 'Znacznik _fv oznacza, że GA4 widzi tę przeglądarkę po raz pierwszy. Pojawia się razem ze zdarzeniem first_visit. Przy testach po wyczyszczeniu ciasteczek jest to oczekiwane; w zwykłej sesji powrotnej — nie.'
    },
    sesja: {
      tytul: 'Identyfikator i numer sesji',
      tresc: 'session_id (parametr sid) i numer sesji (sct). Zmiana identyfikatora w środku ścieżki oznacza, że GA4 rozpoczął nową sesję — a więc przypisał źródło od nowa. To najczęstszy powód, dla którego konwersja trafia do złego kanału.'
    },
    zaangazowanie: {
      tytul: 'Engaged session',
      tresc: 'Parametr seg. GA4 uznaje sesję za zaangażowaną, gdy trwała ponad 10 sekund, miała zdarzenie konwersji albo co najmniej dwie odsłony. Sesje niezaangażowane liczą się do współczynnika odrzuceń.'
    },

    clientId: {
      tytul: 'Tożsamość użytkownika',
      tresc: 'client_id z ciasteczka _ga — tym GA4 rozpoznaje przeglądarkę. Sedno testu cross-domain: po przejściu na drugą domenę identyfikator musi zostać ten sam. Jeśli się zmieni, GA4 policzy tę samą osobę jako dwóch użytkowników, a ścieżka rozpadnie się na dwie sesje.'
    },
    gl: {
      tytul: 'Parametr _gl w adresie wejścia',
      tresc: 'Parametr, którym Google przenosi tożsamość między domenami. Dokleja go tak zwany linker, gdy obie domeny są wpisane na listę domen powiązanych. Jego brak przy przejściu między domenami projektu wskazuje na konfigurację domen powiązanych albo na sam link, nie na GA4.'
    },
    samoodeslanie: {
      tytul: 'Samoodesłanie',
      tresc: 'Najdroższy błąd w konfiguracji wielu domen. Powstaje, gdy przejście z jednej domeny projektu na drugą rozpoczyna nową sesję z odsyłającym wskazującym Twoją własną domenę. Skutek: użytkownik przyprowadzony przez kampanię nagle ma źródło „sklep.pl / referral", a pierwotna kampania znika z raportu. Lekarstwo: domeny powiązane albo wykluczenia odsyłające w ustawieniach strumienia.'
    },
    wewnetrzneUtm: {
      tytul: 'Wewnętrzne znaczniki UTM',
      tresc: 'Znaczniki UTM na linkach prowadzących między własnymi domenami projektu. Wyglądają niewinnie, a robią dokładnie to, przed czym chroni cross-domain: wymuszają nową sesję i nadpisują pierwotne źródło własną domeną. Kampania, która przyprowadziła użytkownika, przestaje istnieć w raportach. UTM służą do oznaczania ruchu z zewnątrz, nigdy wewnątrz serwisu.'
    },
    porownanie: {
      tytul: 'Porównanie przed i po przejściu',
      tresc: 'Zestawienie tego, co panel zapamiętał na poprzedniej domenie, z tym, co widzi tutaj. Pokazuje na raz cztery rzeczy, które przejście może zepsuć: tożsamość, sesję, źródło i zgodę. Pełną oś czasu znajdziesz w oknie pod ikoną rozszerzenia.'
    },

    gcs: {
      tytul: 'Sygnał zgody w zdarzeniu',
      tresc: 'Parametr gcs opisuje stan zgody w chwili wysyłki. Zapis G1 plus dwie cyfry: pierwsza to zgoda reklamowa, druga analityczna, gdzie 1 oznacza udzieloną, a 0 odmowę. Przy odmowie GA4 nie zapisuje ciasteczek, a dane uzupełnia modelowaniem — liczby nie są wtedy wprost porównywalne z testem.'
    },
    zgodaDomyslna: {
      tytul: 'Zgoda domyślna i personalizacja',
      tresc: 'Parametr gcd opisuje ustawienia domyślne trybu zgody zadeklarowane przed decyzją użytkownika, a npa mówi, czy reklamy mają być niepersonalizowane. Razem pokazują, w jakim trybie ruszył pomiar, zanim ktokolwiek kliknął baner.'
    },
    decyzjaCmp: {
      tytul: 'Decyzja zapisana przez baner',
      tresc: 'Co Cookiebot zapisał w ciasteczku CookieConsent na tej konkretnej domenie: które kategorie włączono, w jaki sposób i o której godzinie. To osobna rzecz od sygnału gcs, który mówi tylko, z czym poleciało pojedyncze zdarzenie.'
    },
    zgodaPrzejscie: {
      tytul: 'Zgoda przy przejściu między domenami',
      tresc: 'Zgoda nie przechodzi między domenami. Parametr _gl przenosi identyfikatory Google Analytics, ale ciasteczka banera nie dotyka — Cookiebot zapisuje decyzję osobno dla każdej domeny. Panel porównuje odcisk decyzji: ten sam oznacza zgodę współdzieloną, inny to dwie niezależne decyzje.'
    },
    przedZgoda: {
      tytul: 'Zdarzenia wysłane przed zgodą',
      tresc: 'Ile zdarzeń poleciało, zanim sygnał zgody zmienił się na udzieloną. Ma znaczenie dla atrybucji: jeżeli w tym oknie znalazł się start sesji, źródło zostało przypisane w trybie ograniczonym i może różnić się od tego, co widać po kliknięciu banera.'
    }
  };

  /* ------------------------------------------------------------------ *
   *  Stan
   * ------------------------------------------------------------------ */
  const stan = {
    kontenery: [],
    debugGroupId: null,
    bootstrapPodgladu: false,
    hitOstatni: null,
    hitStartuSesji: null,
    zdarzenia: [],
    liczbaHitow: 0,
    hitowPrzedZgoda: 0,
    banerWidoczny: false,
    clientIdPoprzedni: null,
    domenaPoprzednia: null,
    stampPoprzedni: null,
    sesjaPoprzednia: null,
    sidPierwszy: null,
    sidZmienil: false,
    pomocOtwarta: null,
    ustawieniaOtwarte: false
  };

  const ustawienia = {
    motyw: 'jasny',
    // Lista kluczy wierszy do ukrycia. null oznacza „jeszcze nieustawione" —
    // przy pierwszym uruchomieniu wypełniamy ją zestawem podstawowym.
    ukryte: null,
    // Nazwa zestawu, z którego pochodzi układ. null = układ własny, bez nazwy.
    zestaw: null,
    pokazZdarzenia: true,
    doklejanie: false,
    skala: 1,
    // Pozycja i zwinięcie trzymane w ustawieniach, a nie w stanie strony:
    // przeżywają przeładowanie i przejście na inną domenę, więc panel odbudowuje się
    // dokładnie tam, gdzie go zostawiłeś. chrome.storage jest wspólny dla wszystkich
    // domen rozszerzenia — localStorage byłby osobny dla każdej.
    pozycja: null,
    zwiniety: false
  };

  /** Dostępne stopnie powiększenia, jak w przeglądarce. */
  const SKALE = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

  /* ------------------------------------------------------------------ *
   *  Odczyty pomocnicze
   * ------------------------------------------------------------------ */

  const ciasteczko = (nazwa) => {
    const czesci = document.cookie.split('; ');
    for (const c of czesci) {
      const i = c.indexOf('=');
      if (i > 0 && c.slice(0, i) === nazwa) return decodeURIComponent(c.slice(i + 1));
    }
    return null;
  };

  const ciasteczkoZPrefiksem = (prefiks) => {
    const czesci = document.cookie.split('; ');
    for (const c of czesci) {
      const i = c.indexOf('=');
      if (i > 0 && c.slice(0, i).indexOf(prefiks) === 0) {
        return { nazwa: c.slice(0, i), wartosc: decodeURIComponent(c.slice(i + 1)) };
      }
    }
    return null;
  };

  const clientIdZCiasteczka = () => {
    const surowe = ciasteczko('_ga');
    if (!surowe) return null;
    const czesci = surowe.split('.');
    return czesci.length >= 4 ? czesci.slice(-2).join('.') : null;
  };

  /**
   * Ciasteczko _ga_<SUFIKS> występuje w dwóch formatach:
   *   GS2 — GS2.1.s<sessionId>$o<numer>$g<zaangażowanie>$t<ostatnia aktywność>...
   *   GS1 — GS1.1.<sessionId>.<numer>...
   * Format potwierdzony odczytem żywego ruchu 2026-08-28: GS2.
   */
  const sesjaZCiasteczka = () => {
    const wpis = ciasteczkoZPrefiksem('_ga_');
    if (!wpis) return null;
    const czesci = wpis.wartosc.split('.');
    const ogon = czesci.slice(2).join('.');
    if (ogon.indexOf('$') !== -1) {
      const pola = {};
      ogon.split('$').forEach((p) => { if (p) pola[p.charAt(0)] = p.slice(1); });
      return { sessionId: pola.s || null, numer: pola.o || null, zaangazowana: pola.g === '1' };
    }
    return { sessionId: czesci[2] || null, numer: czesci[3] || null };
  };

  /**
   * Decyzja zapisana przez CMP (Cookiebot). Zawartość nie jest poprawnym JSON-em
   * — klucze bez cudzysłowów, teksty w apostrofach — więc czytamy ją wyrażeniami regularnymi.
   * Kluczowe jest pole stamp: różny odcisk na dwóch domenach znaczy, że zgoda nie została
   * przeniesiona, tylko wyrażona osobno.
   */
  const zgodaCmp = () => {
    const surowe = ciasteczko('CookieConsent');
    if (!surowe) return null;
    const tekst = decodeURIComponent(surowe);
    const flaga = (nazwa) => {
      const m = tekst.match(new RegExp(nazwa + ':(true|false)'));
      return m ? m[1] === 'true' : null;
    };
    const znak = tekst.match(/stamp:'([^']*)'/);
    const sposob = tekst.match(/method:'([^']*)'/);
    const czas = tekst.match(/utc:(\d+)/);
    return {
      stamp: znak ? znak[1] : null,
      preferencje: flaga('preferences'),
      statystyka: flaga('statistics'),
      marketing: flaga('marketing'),
      sposob: sposob ? sposob[1] : null,
      czas: czas ? Number(czas[1]) : null
    };
  };

  const opiszKategorie = (z) => {
    const wybrane = [];
    if (z.preferencje) wybrane.push('preferencje');
    if (z.statystyka) wybrane.push('statystyka');
    if (z.marketing) wybrane.push('marketing');
    return wybrane.length ? wybrane.join(' + ') : 'tylko konieczne';
  };

  const godzina = (znacznik) => {
    if (!znacznik) return '?';
    const d = new Date(znacznik);
    const dwie = (n) => String(n).padStart(2, '0');
    return dwie(d.getHours()) + ':' + dwie(d.getMinutes());
  };

  const skroc = (t, ile) => {
    const limit = ile || 16;
    return (t && t.length > limit) ? t.slice(0, Math.ceil(limit / 2)) + '…' + t.slice(-4) : (t || '—');
  };

  const domenaGlowna = (host) => {
    const wpis = wpisDomeny(host);
    return wpis ? wpis.domena : host;
  };

  /**
   * Czy host nalezy do badanego projektu. Z profilem — lista domen z profilu.
   * Bez profilu — hosty odwiedzone w tej sesji, dzieki czemu wykrywanie przejsc
   * miedzy wlasnymi domenami dziala takze bez wczesniejszej konfiguracji.
   */
  const wlasnaDomena = (host) => {
    if (!host) return false;
    if (konfiguracja.domeny.some((w) => naleziDoDomeny(host, w.domena))) return true;
    return konfiguracja.domenySesji.some((h) => h === host || naleziDoDomeny(host, h));
  };

  const parametrWejscia = (nazwa) => new URLSearchParams(location.search).get(nazwa);

  /** Wszystkie obecne w adresie znaczniki UTM. */
  const obecneUtm = () => {
    const pytania = new URLSearchParams(location.search);
    const wynik = {};
    POLA_UTM.forEach((p) => { if (pytania.get(p)) wynik[p] = pytania.get(p); });
    return wynik;
  };

  /** Wszystkie obecne w adresie identyfikatory kliknięć. */
  const obecneIdentyfikatory = () => {
    const pytania = new URLSearchParams(location.search);
    return IDENTYFIKATORY
      .filter((i) => pytania.get(i.nazwa))
      .map((i) => Object.assign({}, i, { wartosc: pytania.get(i.nazwa) }));
  };

  /**
   * client_id przeniesiony przez linkera w parametrze _gl.
   * Budowa: 1*<suma>*<nazwa>*<wartość base64url>*... — wartości kodowane base64url
   * z kropką zamiast znaku wyrównania. Niezależne od ciasteczka źródło prawdy o tym,
   * co linker faktycznie przekazał.
   */
  const clientIdZLinkera = () => {
    const gl = parametrWejscia('_gl');
    if (!gl) return null;
    const czesci = gl.split('*');
    const i = czesci.indexOf('_ga');
    if (i === -1 || !czesci[i + 1]) return null;
    try {
      const surowe = czesci[i + 1].replace(/\./g, '=').replace(/-/g, '+').replace(/_/g, '/');
      const odkodowane = atob(surowe);
      return /^\d+\.\d+$/.test(odkodowane) ? odkodowane : null;
    } catch (e) {
      return null;
    }
  };

  /** Host odsyłającego, jeśli da się go odczytać. */
  const hostOdsylajacego = () => {
    if (!document.referrer) return null;
    try { return new URL(document.referrer).hostname; } catch (e) { return null; }
  };

  /**
   * Czy na tę stronę weszliśmy z INNEJ domeny z listy — tylko wtedy ocena ciągłości ma sens.
   * Bez tego rozróżnienia zwykłe wejście bezpośrednie wyglądało jak zerwana ciągłość.
   */
  const przejscieZDomeny = () => {
    if (clientIdZLinkera()) return stan.domenaPoprzednia || 'poprzedniej domeny';
    const host = hostOdsylajacego();
    if (!host || !wlasnaDomena(host)) return null;
    const skad = domenaGlowna(host);
    return skad === domenaGlowna(location.hostname) ? null : skad;
  };

  /* ------------------------------------------------------------------ *
   *  Atrybucja
   * ------------------------------------------------------------------ */

  /**
   * Skrócone listy kategorii źródeł Google (pełne żyją w arkuszu podlinkowanym
   * w dokumentacji Default channel group). Tu podzbiór realnie spotykany w PL.
   */
  const KATEGORIE_ZRODEL = {
    search: ['google', 'bing', 'yahoo', 'duckduckgo', 'ecosia', 'baidu', 'yandex', 'seznam', 'qwant', 'startpage', 'ask', 'aol', 'msn'],
    social: ['facebook', 'instagram', 'linkedin', 'tiktok', 'twitter', 'x.com', 't.co', 'pinterest', 'reddit', 'snapchat', 'threads', 'whatsapp', 'messenger', 'wykop'],
    video: ['youtube', 'vimeo', 'twitch', 'dailymotion'],
    shopping: ['amazon', 'ebay', 'etsy', 'aliexpress', 'alibaba', 'allegro', 'shopping.google']
  };

  const wKategorii = (zrodlo, kategoria) =>
    !!zrodlo && KATEGORIE_ZRODEL[kategoria].some((s) => zrodlo.indexOf(s) !== -1);

  /** Sprowadza host odsyłającego do nazwy źródła, jak robi to GA4 (bez www itp.). */
  const zrodloZHosta = (host) => {
    if (!host) return null;
    const czysty = host.replace(/^(www|m|l|lm)\./, '');
    for (const kategoria of ['search', 'social', 'video', 'shopping']) {
      const trafienie = KATEGORIE_ZRODEL[kategoria].find((s) => czysty.indexOf(s) !== -1);
      if (trafienie) return trafienie === 'x.com' || trafienie === 't.co' ? 'twitter' : trafienie;
    }
    return czysty;
  };

  /**
   * Przypisanie do domyślnej grupy kanałów — odwzorowanie reguł z dokumentacji
   * „[GA4] Default channel group" (support.google.com/analytics/answer/9756891),
   * pobranej 2026-08-28. Kolejność sprawdzania jak w dokumentacji; reguły nie
   * rozróżniają wielkości liter. Ograniczenie: reguły dla ruchu z platformy
   * Google Ads zależą od typu kampanii, którego nie widać w przeglądarce —
   * przy identyfikatorze kliknięcia dodajemy więc zastrzeżenie.
   */
  const REGEX_PLATNY = /^(.*cp.*|ppc|retargeting|paid.*)$/;
  const REGEX_ZAKUPY = /^(.*(([^a-df-z]|^)shop|shopping).*)$/;

  const kanalGa4 = (zrodloWe, mediumWe, kampaniaWe, maGoogleClickId) => {
    const zrodlo = String(zrodloWe || '').toLowerCase();
    const medium = String(mediumWe || '').toLowerCase();
    const kampania = String(kampaniaWe || '').toLowerCase();
    const platny = REGEX_PLATNY.test(medium);

    let kanal;
    if ((zrodlo === '(direct)') && (medium === '(none)' || medium === '(not set)')) kanal = 'Direct';
    else if ((wKategorii(zrodlo, 'shopping') || REGEX_ZAKUPY.test(kampania)) && platny) kanal = 'Paid Shopping';
    else if (wKategorii(zrodlo, 'search') && platny) kanal = 'Paid Search';
    else if (wKategorii(zrodlo, 'social') && platny) kanal = 'Paid Social';
    else if (wKategorii(zrodlo, 'video') && platny) kanal = 'Paid Video';
    else if (['display', 'banner', 'expandable', 'interstitial', 'cpm'].indexOf(medium) !== -1) kanal = 'Display';
    else if (platny) kanal = 'Paid Other';
    else if (wKategorii(zrodlo, 'shopping') || REGEX_ZAKUPY.test(kampania)) kanal = 'Organic Shopping';
    else if (wKategorii(zrodlo, 'social') || ['social', 'social-network', 'social-media', 'sm'].indexOf(medium) !== -1) kanal = 'Organic Social';
    else if (wKategorii(zrodlo, 'video') || /.*video.*/.test(medium)) kanal = 'Organic Video';
    else if (wKategorii(zrodlo, 'search') || medium === 'organic') kanal = 'Organic Search';
    else if (/^(email|e-mail|e_mail|e mail)$/.test(zrodlo) || /^(email|e-mail|e_mail|e mail)$/.test(medium)) kanal = 'Email';
    else if (medium === 'affiliate') kanal = 'Affiliates';
    else if (['referral', 'app', 'link'].indexOf(medium) !== -1) kanal = 'Referral';
    else if (medium === 'audio') kanal = 'Audio';
    else if (zrodlo === 'sms' || medium === 'sms') kanal = 'SMS';
    else if (/push$/.test(medium) || medium.indexOf('mobile') !== -1 || medium.indexOf('notification') !== -1 || zrodlo === 'firebase') kanal = 'Mobile Push Notifications';
    else kanal = 'Unassigned';

    return {
      kanal,
      uwaga: maGoogleClickId
        ? 'ruch Google Ads — ostateczny kanał zależy od typu kampanii (Search / PMax / Display…)'
        : null
    };
  };

  /**
   * Odtworzenie reguły pierwszeństwa GA4. To PRZEWIDYWANIE, nie odczyt —
   * w zdarzeniu GA4 nie ma source ani medium, usługa wylicza je po swojej stronie
   * i uwzględnia jeszcze wykluczenia odsyłające oraz grupy kanałów z ustawień property.
   */
  /**
   * Przewidywanie source / medium z kompletu sygnałów — reguła pierwszeństwa GA4:
   * identyfikator kliknięcia Google → UTM → odsyłający → wejście bezpośrednie.
   * Odsyłający z wyszukiwarki dostaje medium organic, nie referral — tak jak w GA4.
   */
  const przewidzZrodloZ = (utm, nazwyIdentyfikatorow, hostOdsylacza) => {
    const maGoogleClickId = (nazwyIdentyfikatorow || [])
      .some((n) => ['gclid', 'gbraid', 'wbraid', 'dclid'].indexOf(n) !== -1);

    if (maGoogleClickId) {
      return {
        zrodlo: 'google', medium: 'cpc', kampania: utm.utm_campaign || null,
        maGoogleClickId: true,
        przeslanka: 'z auto-tagowania (' + nazwyIdentyfikatorow.join(', ') + ')',
        klasa: 'ok',
        uwaga: Object.keys(utm).length
          ? 'w adresie są też UTM — o pierwszeństwie decyduje ustawienie property'
          : null
      };
    }

    if (utm.utm_source || utm.utm_medium) {
      const wlasne = utm.utm_source && wlasnaDomena(utm.utm_source);
      return {
        zrodlo: utm.utm_source || '(nie podano)',
        medium: utm.utm_medium || '(nie podano)',
        kampania: utm.utm_campaign || null,
        maGoogleClickId: false,
        przeslanka: 'z parametrów UTM',
        klasa: wlasne ? 'blad' : (utm.utm_source && utm.utm_medium ? 'ok' : 'ostrzezenie'),
        uwaga: wlasne
          ? 'źródło wskazuje własną domenę projektu — nadpisuje pierwotną kampanię'
          : (!utm.utm_source || !utm.utm_medium ? 'do poprawnej atrybucji potrzebne są oba parametry' : null)
      };
    }

    if (hostOdsylacza) {
      if (wlasnaDomena(hostOdsylacza)) {
        if (domenaGlowna(hostOdsylacza) !== domenaGlowna(location.hostname)) {
          return {
            zrodlo: hostOdsylacza, medium: 'referral', kampania: null, maGoogleClickId: false,
            przeslanka: 'z odsyłającego — WŁASNA domena',
            klasa: 'blad',
            uwaga: 'jeśli powstanie nowa sesja, to jest samoodesłanie'
          };
        }
        return { zrodlo: '(direct)', medium: '(none)', kampania: null, maGoogleClickId: false, przeslanka: 'ruch w obrębie domeny', klasa: 'nieznany', uwaga: null };
      }
      const zrodlo = zrodloZHosta(hostOdsylacza);
      const organiczne = wKategorii(zrodlo, 'search');
      return {
        zrodlo,
        medium: organiczne ? 'organic' : 'referral',
        kampania: null, maGoogleClickId: false,
        przeslanka: organiczne ? 'z odsyłającego — wyszukiwarka' : 'z odsyłającego',
        klasa: 'ok', uwaga: null
      };
    }

    return { zrodlo: '(direct)', medium: '(none)', kampania: null, maGoogleClickId: false, przeslanka: 'brak sygnału w adresie i odsyłającym', klasa: 'nieznany', uwaga: null };
  };

  /** Wariant dla bieżącego adresu — używany przy zapisie śladu. */
  const przewidzZrodlo = () =>
    przewidzZrodloZ(obecneUtm(), obecneIdentyfikatory().map((i) => i.nazwa), hostOdsylajacego());

  /**
   * Wariant dla WEJŚCIA na domenę: liczony z sygnałów zapamiętanych przy pierwszym
   * wczytaniu w tej karcie, więc nie znika po przejściu na podstronę bez znaczników.
   * To jest to, co GA4 przypisze sesji, jeżeli sesja zaczęła się tym wejściem.
   */
  const przewidzZrodloWejscia = () => {
    const wejscie = sygnalWejscia();
    if (!wejscie) return przewidzZrodlo();
    return przewidzZrodloZ(wejscie.utm || {}, wejscie.identyfikatory || [], wejscie.odsylajacy || null);
  };

  /** Sygnał wejścia zapamiętany dla tej karty — do oceny, czy przetrwał wędrówkę. */
  const KLUCZ_WEJSCIA = '__attribution_helper_wejscie';

  const zapamietajSygnalWejscia = () => {
    try {
      const juz = sessionStorage.getItem(KLUCZ_WEJSCIA);
      if (juz) {
        const dane = JSON.parse(juz);
        if (dane.domena === domenaGlowna(location.hostname)) return dane;
      }
      const utm = obecneUtm();
      const identyfikatory = obecneIdentyfikatory().map((i) => i.nazwa);
      const dane = {
        domena: domenaGlowna(location.hostname),
        adres: location.href,
        utm,
        identyfikatory,
        // Odsyłający z chwili wejścia — po przejściu na podstronę document.referrer
        // wskazuje już własną domenę, więc bez tego zapisu przewidywanie by się psuło.
        odsylajacy: hostOdsylajacego(),
        maSygnal: !!(Object.keys(utm).length || identyfikatory.length),
        czas: Date.now()
      };
      sessionStorage.setItem(KLUCZ_WEJSCIA, JSON.stringify(dane));
      return dane;
    } catch (e) {
      return null;
    }
  };

  const sygnalWejscia = () => {
    try {
      const surowe = sessionStorage.getItem(KLUCZ_WEJSCIA);
      return surowe ? JSON.parse(surowe) : null;
    } catch (e) {
      return null;
    }
  };

  /* ------------------------------------------------------------------ *
   *  Oceny wierszy
   * ------------------------------------------------------------------ */

  const ocenKontener = () => {
    const oczekiwanie = oczekiwanieDla();
    if (!oczekiwanie || !oczekiwanie.kontener) {
      // Tryb uniwersalny: pokazujemy, co widzimy, bez oceny zgodnosci.
      if (!stan.kontenery.length) {
        return (Date.now() - czasStartu < 15000)
          ? { klasa: 'nieznany', tekst: 'ładowanie…' }
          : { klasa: 'ostrzezenie', tekst: 'nie wykryto kontenera GTM' };
      }
      return { klasa: 'ok', tekst: stan.kontenery.join(', ') };
    }
    if (!stan.kontenery.length) {
      return (Date.now() - czasStartu < 15000)
        ? { klasa: 'nieznany', tekst: 'ładowanie…' }
        : { klasa: 'blad', tekst: 'nie wykryto kontenera' };
    }
    if (stan.kontenery.indexOf(oczekiwanie.kontener) !== -1) {
      const dodatkowe = stan.kontenery.filter((k) => k !== oczekiwanie.kontener);
      return dodatkowe.length
        ? { klasa: 'ostrzezenie', tekst: oczekiwanie.kontener + ' + ' + dodatkowe.join(', ') }
        : { klasa: 'ok', tekst: oczekiwanie.kontener };
    }
    return { klasa: 'blad', tekst: stan.kontenery.join(', ') + ' (oczekiwano ' + oczekiwanie.kontener + ')' };
  };

  const podgladPodlaczony = () => !!(stan.debugGroupId || stan.bootstrapPodgladu);

  const sygnalyPodgladu = () => {
    const s = [];
    if (stan.debugGroupId) s.push('kanał');
    if (stan.bootstrapPodgladu) s.push('skrypt');
    if (new URLSearchParams(location.search).has('gtm_debug')) s.push('parametr');
    if (document.referrer.indexOf('tagassistant.google.com') !== -1) s.push('odsyłający');
    if (stan.hitOstatni && stan.hitOstatni.trybDebug) s.push('znacznik');
    return s;
  };

  const ocenPodglad = () => {
    const s = sygnalyPodgladu();
    return podgladPodlaczony()
      ? { klasa: 'ok', tekst: 'PODŁĄCZONY (' + s.join(', ') + ')' }
      : s.length
        ? { klasa: 'ostrzezenie', tekst: 'sygnał jest, kanał nie stoi' }
        : { klasa: 'blad', tekst: 'WYŁĄCZONY' };
  };

  const ocenGa4 = () => {
    if (!stan.hitOstatni) return { klasa: 'nieznany', tekst: 'brak zdarzenia — odśwież lub kliknij' };
    const id = stan.hitOstatni.measurementId || '?';
    const oczekiwanie = oczekiwanieDla();
    const zgodny = !oczekiwanie || !oczekiwanie.measurementId || id === oczekiwanie.measurementId;
    return { klasa: zgodny ? 'ok' : 'blad', tekst: id + (zgodny ? '' : ' (oczekiwano ' + oczekiwanie.measurementId + ')') };
  };

  const ocenDebugView = () => {
    if (!stan.hitOstatni) return { klasa: 'nieznany', tekst: 'brak zdarzenia' };
    return stan.hitOstatni.trybDebug
      ? { klasa: 'ok', tekst: 'tak — zdarzenia widoczne' }
      : { klasa: 'blad', tekst: 'NIE — nie zobaczysz ich w DebugView' };
  };

  const ocenZrodlo = () => {
    const z = przewidzZrodloWejscia();
    const czesci = [z.przeslanka];
    if (z.uwaga) czesci.push(z.uwaga);
    // Źródło przypisuje się przy starcie sesji. Gdy start nie wypadł w tej odsłonie,
    // przewidywanie dotyczy wejścia — sesja mogła dostać źródło wcześniej.
    if (stan.hitOstatni && !stan.hitStartuSesji) {
      czesci.push('sesja trwa — jeśli zaczęła się wcześniej, obowiązuje tamto źródło');
    }
    return { klasa: z.klasa, tekst: z.zrodlo + ' / ' + z.medium, dopisek: czesci.join(' · ') };
  };

  /** Przewidywany kanał domyślnej grupy — z tych samych sygnałów co źródło. */
  const ocenKanal = () => {
    const z = przewidzZrodloWejscia();
    const k = kanalGa4(z.zrodlo, z.medium, z.kampania, z.maGoogleClickId);
    return {
      klasa: k.kanal === 'Unassigned' ? 'ostrzezenie' : (z.klasa === 'blad' ? 'blad' : 'ok'),
      tekst: k.kanal,
      dopisek: k.uwaga || null
    };
  };

  const ocenUtm = () => {
    const utm = obecneUtm();
    const klucze = Object.keys(utm);
    if (!klucze.length) return { klasa: 'nieznany', tekst: 'brak w adresie' };
    return {
      klasa: (utm.utm_source && utm.utm_medium) ? 'ok' : 'ostrzezenie',
      tekst: klucze.map((k) => k.replace('utm_', '') + '=' + utm[k]).join(' · ')
    };
  };

  const ocenIdentyfikatory = () => {
    const lista = obecneIdentyfikatory();
    if (!lista.length) return { klasa: 'nieznany', tekst: 'brak w adresie' };
    return {
      klasa: 'ok',
      tekst: lista.map((i) => i.nazwa + (i.ga4 ? '' : ' (poza GA4)')).join(' · '),
      dopisek: lista.map((i) => i.system).join(', ')
    };
  };

  const ocenOdsylajacy = () => {
    const host = hostOdsylajacego();
    if (!host) return { klasa: 'nieznany', tekst: 'brak — wejście bezpośrednie lub nowa karta' };
    if (wlasnaDomena(host)) {
      const ten = domenaGlowna(host) === domenaGlowna(location.hostname);
      return ten
        ? { klasa: 'ok', tekst: host + ' (ta sama domena)' }
        : { klasa: 'ostrzezenie', tekst: host + ' — inna domena projektu' };
    }
    return { klasa: 'ok', tekst: host };
  };

  const ocenTrwalosc = () => {
    const wejscie = sygnalWejscia();
    if (!wejscie) return { klasa: 'nieznany', tekst: 'brak zapisu wejścia' };
    if (!wejscie.maSygnal) return { klasa: 'nieznany', tekst: 'wejście bez znaczników — nie ma czego gubić' };
    const teraz = obecneUtm();
    const terazId = obecneIdentyfikatory().map((i) => i.nazwa);
    const bylo = Object.keys(wejscie.utm).length + wejscie.identyfikatory.length;
    const jest = Object.keys(teraz).length + terazId.length;
    if (location.href === wejscie.adres) {
      return { klasa: 'ok', tekst: 'strona wejścia — sygnał obecny (' + bylo + ')' };
    }
    return jest >= bylo
      ? { klasa: 'ok', tekst: 'zachowany po nawigacji' }
      : { klasa: 'ostrzezenie', tekst: 'zgubiony po wejściu (' + bylo + ' → ' + jest + ')', dopisek: 'sprawdź przekierowania po stronie serwera' };
  };

  const ocenStartSesji = () => {
    if (!stan.hitOstatni) return { klasa: 'nieznany', tekst: 'brak zdarzenia' };
    if (stan.hitStartuSesji) {
      return { klasa: 'ok', tekst: 'tak — źródło przypisane tutaj', dopisek: 'zdarzenie: ' + (stan.hitStartuSesji.zdarzenie || '?') };
    }
    return { klasa: 'nieznany', tekst: 'nie w tej odsłonie — sesja trwa' };
  };

  const ocenPierwszaWizyta = () => {
    if (!stan.hitOstatni) return { klasa: 'nieznany', tekst: 'brak zdarzenia' };
    const byla = stan.hitStartuSesji && stan.hitStartuSesji.pierwszaWizyta;
    return byla
      ? { klasa: 'ok', tekst: 'tak — GA4 widzi tę przeglądarkę pierwszy raz' }
      : { klasa: 'nieznany', tekst: 'nie — użytkownik powracający' };
  };

  const ocenSesja = () => {
    const s = sesjaZCiasteczka();
    const zHitu = stan.hitOstatni;
    const sid = (zHitu && zHitu.sessionId) || (s && s.sessionId);
    const numer = (zHitu && zHitu.numerSesji) || (s && s.numer);
    if (!sid) return { klasa: 'nieznany', tekst: 'brak danych sesji' };
    if (stan.sidZmienil) {
      return { klasa: 'blad', tekst: sid + ' · nr ' + (numer || '?'), dopisek: 'sesja zmieniła się w trakcie ścieżki — źródło przypisane od nowa' };
    }
    return { klasa: 'ok', tekst: sid + ' · nr ' + (numer || '?') };
  };

  const ocenZaangazowanie = () => {
    const zHitu = stan.hitOstatni;
    const s = sesjaZCiasteczka();
    const tak = (zHitu && zHitu.sesjaZaangazowana) || (s && s.zaangazowana);
    return tak
      ? { klasa: 'ok', tekst: 'tak' }
      : { klasa: 'nieznany', tekst: 'jeszcze nie' };
  };

  const ocenCiaglosc = () => {
    const biezacy = clientIdZCiasteczka();
    const zLinkera = clientIdZLinkera();
    if (!biezacy) return { klasa: 'nieznany', tekst: 'brak ciasteczka _ga' };

    if (zLinkera) {
      if (biezacy === zLinkera) return { klasa: 'ok', tekst: skroc(biezacy) + ' — przejęty z _gl' };
      // Dopóki nie poleciało żadne zdarzenie, tag jeszcze nie wystartował i nie miał
      // czym nadpisać ciasteczka. W trybie podglądu trwa to kilkanaście sekund.
      const czekamy = !stan.hitOstatni
        ? (Date.now() - czasStartu < 40000)
        : (Date.now() - czasStartu < 15000);
      return czekamy
        ? { klasa: 'ostrzezenie', tekst: 'trwa przejmowanie z _gl' }
        : { klasa: 'blad', tekst: skroc(biezacy) + ' — ZERWANY', dopisek: '_gl niósł ' + skroc(zLinkera) };
    }

    if (!przejscieZDomeny()) return { klasa: 'nieznany', tekst: skroc(biezacy) + ' — wejście bezpośrednie' };
    if (!stan.clientIdPoprzedni) return { klasa: 'nieznany', tekst: skroc(biezacy) + ' — brak punktu odniesienia' };
    return biezacy === stan.clientIdPoprzedni
      ? { klasa: 'ok', tekst: skroc(biezacy) + ' — zachowany z ' + stan.domenaPoprzednia }
      : { klasa: 'blad', tekst: skroc(biezacy) + ' — ZERWANY', dopisek: 'na ' + stan.domenaPoprzednia + ' było ' + skroc(stan.clientIdPoprzedni) };
  };

  const ocenGl = () => {
    const gl = parametrWejscia('_gl');
    if (!gl) {
      return przejscieZDomeny()
        ? { klasa: 'blad', tekst: 'BRAK przy przejściu między domenami', dopisek: 'sprawdź listę domen powiązanych' }
        : { klasa: 'nieznany', tekst: 'brak — wejście bez przejścia' };
    }
    const cid = clientIdZLinkera();
    return cid
      ? { klasa: 'ok', tekst: 'niesie client_id ' + skroc(cid) }
      : { klasa: 'ostrzezenie', tekst: 'obecny, ale bez client_id' };
  };

  /**
   * Samoodesłanie: nowa sesja rozpoczęta na tej domenie, a odsyłający wskazuje inną
   * domenę projektu. Wtedy GA4 nadpisuje pierwotną kampanię własną domeną jako źródłem.
   */
  const ocenSamoodeslanie = () => {
    const host = hostOdsylajacego();
    const zInnejWlasnej = host && wlasnaDomena(host) && domenaGlowna(host) !== domenaGlowna(location.hostname);
    if (!zInnejWlasnej) return { klasa: 'ok', tekst: 'nie dotyczy tego wejścia' };
    if (stan.hitStartuSesji) {
      return {
        klasa: 'blad',
        tekst: 'WYKRYTE — nowa sesja z ' + host,
        dopisek: 'pierwotne źródło zostało nadpisane; sprawdź domeny powiązane i wykluczenia odsyłające'
      };
    }
    return {
      klasa: 'ok',
      tekst: 'nie — sesja przeszła z ' + domenaGlowna(host),
      dopisek: 'cross-domain zadziałał: przejście nie rozpoczęło nowej sesji'
    };
  };

  /** UTM na linku między własnymi domenami — wymusza nową sesję i nadpisuje źródło. */
  const ocenWewnetrzneUtm = () => {
    const utm = obecneUtm();
    if (!utm.utm_source) return { klasa: 'ok', tekst: 'brak znaczników UTM' };
    const wskazujeWlasna = wlasnaDomena(utm.utm_source);
    const host = hostOdsylajacego();
    const zWlasnej = host && wlasnaDomena(host);
    if (wskazujeWlasna || (zWlasnej && Object.keys(utm).length)) {
      return {
        klasa: 'blad',
        tekst: 'WYKRYTE — utm_source=' + utm.utm_source,
        dopisek: 'link wewnętrzny ze znacznikami kampanii nadpisuje pierwotne źródło'
      };
    }
    return { klasa: 'ok', tekst: 'znaczniki z zewnątrz — poprawnie' };
  };

  const ocenPorownanie = () => {
    if (!stan.domenaPoprzednia) return { klasa: 'nieznany', tekst: 'brak poprzedniej domeny w tej sesji' };
    const czesci = [];
    const biezacy = clientIdZCiasteczka();
    czesci.push(biezacy === stan.clientIdPoprzedni ? 'tożsamość: ta sama' : 'tożsamość: inna');
    const s = sesjaZCiasteczka();
    if (s && stan.sesjaPoprzednia) {
      czesci.push(s.sessionId === stan.sesjaPoprzednia ? 'sesja: ta sama' : 'sesja: nowa');
    }
    const z = zgodaCmp();
    if (z && stan.stampPoprzedni) {
      czesci.push(z.stamp === stan.stampPoprzedni ? 'zgoda: ta sama' : 'zgoda: osobna');
    }
    const zle = czesci.some((c) => /inna|nowa/.test(c));
    return { klasa: zle ? 'ostrzezenie' : 'ok', tekst: 'z ' + stan.domenaPoprzednia, dopisek: czesci.join(' · ') };
  };

  /** gcs ma postać G1<reklama><analityka>, np. G111 = obie zgody udzielone. */
  const ocenGcs = () => {
    const gcs = stan.hitOstatni && stan.hitOstatni.zgoda;
    if (!gcs) return { klasa: 'nieznany', tekst: 'brak zdarzenia' };
    const nazwij = (z) => (z === '1' ? 'tak' : z === '0' ? 'nie' : '?');
    const reklama = gcs.charAt(2);
    const analityka = gcs.charAt(3);
    const pelna = reklama === '1' && analityka === '1';
    return {
      klasa: pelna ? 'ok' : 'ostrzezenie',
      tekst: gcs + ' · reklama: ' + nazwij(reklama) + ' · analityka: ' + nazwij(analityka),
      dopisek: pelna ? null : 'przy odmowie GA4 uzupełnia dane modelowaniem'
    };
  };

  const ocenZgodaDomyslna = () => {
    const h = stan.hitOstatni;
    if (!h) return { klasa: 'nieznany', tekst: 'brak zdarzenia' };
    const czesci = [];
    if (h.zgodaDomyslna) czesci.push('gcd=' + h.zgodaDomyslna);
    czesci.push(h.bezPersonalizacji ? 'reklamy niepersonalizowane' : 'reklamy personalizowane');
    return { klasa: 'nieznany', tekst: czesci.join(' · ') };
  };

  const ocenDecyzjaCmp = () => {
    const z = zgodaCmp();
    if (!z) {
      return stan.banerWidoczny
        ? { klasa: 'ostrzezenie', tekst: 'brak decyzji — baner czeka' }
        : { klasa: 'ostrzezenie', tekst: 'brak ciasteczka CookieConsent' };
    }
    const pelna = z.preferencje && z.statystyka && z.marketing;
    return { klasa: pelna ? 'ok' : 'ostrzezenie', tekst: opiszKategorie(z) + ' · ' + (z.sposob || '?') + ' · ' + godzina(z.czas) };
  };

  const ocenZgodaPrzejscie = () => {
    const skad = przejscieZDomeny();
    if (!skad) return { klasa: 'nieznany', tekst: 'wejście bezpośrednie — nie dotyczy' };
    if (!stan.domenaPoprzednia) return { klasa: 'nieznany', tekst: 'brak punktu odniesienia' };
    const z = zgodaCmp();
    if (!z) return { klasa: 'blad', tekst: 'NIE przeszła z ' + stan.domenaPoprzednia, dopisek: 'do kliknięcia banera pomiar jest ograniczony' };
    if (!stan.stampPoprzedni) return { klasa: 'nieznany', tekst: 'brak zapisu z ' + stan.domenaPoprzednia };
    return z.stamp === stan.stampPoprzedni
      ? { klasa: 'ok', tekst: 'ta sama decyzja co na ' + stan.domenaPoprzednia }
      : { klasa: 'ostrzezenie', tekst: 'nowa, osobna decyzja', dopisek: 'na ' + stan.domenaPoprzednia + ' była inna — zgody nie są współdzielone' };
  };

  const ocenPrzedZgoda = () => {
    if (!stan.liczbaHitow) return { klasa: 'nieznany', tekst: 'brak zdarzeń' };
    if (!stan.hitowPrzedZgoda) return { klasa: 'ok', tekst: 'żadne — zgoda była od początku' };
    const startWOknie = stan.hitStartuSesji && stan.hitStartuSesji.zgoda &&
      stan.hitStartuSesji.zgoda.charAt(3) === '0';
    return {
      klasa: startWOknie ? 'blad' : 'ostrzezenie',
      tekst: stan.hitowPrzedZgoda + ' z ' + stan.liczbaHitow,
      dopisek: startWOknie ? 'w tym START SESJI — źródło przypisane bez zgody' : 'start sesji poza tym oknem'
    };
  };

  /* ------------------------------------------------------------------ *
   *  Definicja wierszy — kolejność, sekcje, widoczność
   * ------------------------------------------------------------------ */
  const SEKCJE = [
    { klucz: 'pomiar', tytul: 'Pomiar' },
    { klucz: 'atrybucja', tytul: 'Atrybucja' },
    { klucz: 'sesja', tytul: 'Sesja' },
    { klucz: 'cross', tytul: 'Między domenami' },
    { klucz: 'zgoda', tytul: 'Zgoda' }
  ];

  const WIERSZE = [
    { sekcja: 'pomiar', klucz: 'kontener', etykieta: 'Kontener', ocena: ocenKontener, wazny: true },
    { sekcja: 'pomiar', klucz: 'podglad', etykieta: 'Preview mode', ocena: ocenPodglad, wazny: true },
    { sekcja: 'pomiar', klucz: 'ga4', etykieta: 'Data stream', ocena: ocenGa4, wazny: false },
    { sekcja: 'pomiar', klucz: 'debugview', etykieta: 'DebugView', ocena: ocenDebugView, wazny: true },

    { sekcja: 'atrybucja', klucz: 'zrodlo', etykieta: 'Source / medium', ocena: ocenZrodlo, wazny: true, glowny: true },
    { sekcja: 'atrybucja', klucz: 'kanal', etykieta: 'Channel group', ocena: ocenKanal, wazny: true, glowny: true },
    { sekcja: 'atrybucja', klucz: 'utm', etykieta: 'UTM', ocena: ocenUtm, wazny: true },
    { sekcja: 'atrybucja', klucz: 'identyfikatory', etykieta: 'Kliknięcia', ocena: ocenIdentyfikatory, wazny: false },
    { sekcja: 'atrybucja', klucz: 'odsylajacy', etykieta: 'Odsyłający', ocena: ocenOdsylajacy, wazny: false },
    { sekcja: 'atrybucja', klucz: 'trwalosc', etykieta: 'Trwałość sygnału', ocena: ocenTrwalosc, wazny: false },

    { sekcja: 'sesja', klucz: 'startSesji', etykieta: 'session_start', ocena: ocenStartSesji, wazny: true },
    { sekcja: 'sesja', klucz: 'sesja', etykieta: 'Sesja', ocena: ocenSesja, wazny: true },
    { sekcja: 'sesja', klucz: 'pierwszaWizyta', etykieta: 'first_visit', ocena: ocenPierwszaWizyta, wazny: false },
    { sekcja: 'sesja', klucz: 'zaangazowanie', etykieta: 'Engaged session', ocena: ocenZaangazowanie, wazny: false },

    { sekcja: 'cross', klucz: 'clientId', etykieta: 'client_id', ocena: ocenCiaglosc, wazny: true },
    { sekcja: 'cross', klucz: 'samoodeslanie', etykieta: 'Samoodesłanie', ocena: ocenSamoodeslanie, wazny: true },
    { sekcja: 'cross', klucz: 'wewnetrzneUtm', etykieta: 'Wewnętrzne UTM', ocena: ocenWewnetrzneUtm, wazny: true },
    { sekcja: 'cross', klucz: 'gl', etykieta: 'Parametr _gl', ocena: ocenGl, wazny: false },
    { sekcja: 'cross', klucz: 'porownanie', etykieta: 'Przed / po', ocena: ocenPorownanie, wazny: false },

    { sekcja: 'zgoda', klucz: 'gcs', etykieta: 'Sygnał gcs', ocena: ocenGcs, wazny: true },
    { sekcja: 'zgoda', klucz: 'zgodaPrzejscie', etykieta: 'Zgoda po przejściu', ocena: ocenZgodaPrzejscie, wazny: true },
    { sekcja: 'zgoda', klucz: 'decyzjaCmp', etykieta: 'Decyzja banera', ocena: ocenDecyzjaCmp, wazny: false },
    { sekcja: 'zgoda', klucz: 'przedZgoda', etykieta: 'Przed zgodą', ocena: ocenPrzedZgoda, wazny: false },
    { sekcja: 'zgoda', klucz: 'zgodaDomyslna', etykieta: 'Ustawienia domyślne', ocena: ocenZgodaDomyslna, wazny: false }
  ];

  /* ------------------------------------------------------------------ *
   *  Zestawy wierszy
   *
   *  Panel ma 23 wiersze i prawie nigdy nie potrzeba wszystkich naraz. Zestaw to
   *  nazwany uklad widocznych wierszy. Wbudowane odpowiadaja typowym badaniom;
   *  wlasne zapisuje uzytkownik i wbudowane ich nie kasuja — dlatego jedne i drugie
   *  siedza w osobnych miejscach: wbudowane w kodzie, wlasne w chrome.storage.local
   *  pod kluczem „zestawy", wspolnie dla wszystkich domen.
   * ------------------------------------------------------------------ */

  const ZESTAWY_WBUDOWANE = [
    { klucz: 'podstawowy', nazwa: 'Podstawowy' },
    { klucz: 'wszystko', nazwa: 'Wszystkie' },
    {
      klucz: 'cross',
      nazwa: 'Ciągłość między domenami',
      widoczne: ['zrodlo', 'kanal', 'startSesji', 'sesja', 'clientId', 'samoodeslanie', 'wewnetrzneUtm', 'gl', 'porownanie']
    },
    {
      klucz: 'zgoda',
      nazwa: 'Zgoda i Consent Mode',
      widoczne: ['startSesji', 'gcs', 'zgodaPrzejscie', 'decyzjaCmp', 'przedZgoda', 'zgodaDomyslna']
    },
    {
      klucz: 'wysylka',
      nazwa: 'Kontener i wysyłka zdarzeń',
      widoczne: ['kontener', 'podglad', 'ga4', 'debugview', 'startSesji']
    },
    {
      klucz: 'oznaczenie',
      nazwa: 'Oznaczenie ruchu',
      widoczne: ['zrodlo', 'kanal', 'utm', 'identyfikatory', 'odsylajacy', 'trwalosc']
    }
  ];

  /** Wlasne zestawy: nazwa -> lista ukrytych kluczy. Wczytywane w start(). */
  let zestawy = {};

  const wszystkieKlucze = () => WIERSZE.map((w) => w.klucz);

  /** Lista ukrytych kluczy dla zestawu wbudowanego. */
  const ukryteZestawuWbudowanego = (klucz) => {
    if (klucz === 'wszystko') return [];
    if (klucz === 'podstawowy') return WIERSZE.filter((w) => !w.wazny).map((w) => w.klucz);
    const def = ZESTAWY_WBUDOWANE.find((z) => z.klucz === klucz);
    if (!def || !def.widoczne) return null;
    return wszystkieKlucze().filter((k) => def.widoczne.indexOf(k) === -1);
  };

  const odcisk = (lista) => (lista || []).slice().sort().join('|');

  /**
   * Ktory zestaw odpowiada biezacemu ukladowi. Uzywane po wczytaniu ustawien
   * zapisanych przez starsza wersje, ktora nazw zestawow jeszcze nie znala —
   * bez tego uklad „Podstawowy" pokazywalby sie jako uklad wlasny.
   */
  const rozpoznajZestaw = () => {
    const teraz = odcisk(ustawienia.ukryte);
    const wbudowany = ZESTAWY_WBUDOWANE
      .find((z) => odcisk(ukryteZestawuWbudowanego(z.klucz)) === teraz);
    if (wbudowany) return wbudowany.klucz;
    const wlasny = Object.keys(zestawy).find((n) => odcisk(zestawy[n]) === teraz);
    return wlasny || null;
  };

  const zastosujZestaw = (klucz) => {
    const wbudowany = ukryteZestawuWbudowanego(klucz);
    const ukryte = wbudowany !== null ? wbudowany : zestawy[klucz];
    if (!Array.isArray(ukryte)) return false;
    // Kopia, nie referencja: inaczej odznaczenie wiersza po przelaczeniu
    // modyfikowaloby zapisany zestaw w pamieci.
    ustawienia.ukryte = ukryte.slice();
    ustawienia.zestaw = klucz;
    zapiszUstawienia();
    return true;
  };

  const zapiszZestawy = () => chrome.storage.local.set({ zestawy: zestawy });

  /* ------------------------------------------------------------------ *
   *  Interfejs
   * ------------------------------------------------------------------ */

  let cien = null;
  let korzen = null;

  const STYL = `
    :host, * { box-sizing: border-box; }

    .panel {
      width: 372px;
      display: flex;
      flex-direction: column;
      font: 12px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif;
      border-radius: 10px;
      overflow: hidden;
      background: var(--tlo);
      color: var(--tekst);
      border: 1px solid var(--ramka);
      box-shadow: 0 10px 34px var(--cien);
    }

    .panel.jasny {
      --tlo: #FFFFFF;
      --tlo-pas: #F4F6FA;
      --tlo-sekcja: #FAFBFD;
      --ramka: #D3DAE5;
      --ramka-slaba: #E8ECF3;
      --linia-wiersza: #F0F3F8;
      --tekst: #16202E;
      --tekst-slaby: #5C6B80;
      --cien: rgba(20, 32, 51, .16);
      /*
       * Zieleń NASYCONA, nie ciemna. Wcześniejsze przyciemnianie szło w złą stronę:
       * im ciemniejszy odcień, tym bardziej upodabniał się do czarnego tekstu.
       * Dodatkowo każdy stan ma kropkę (patrz .wartosc::before), więc rozpoznanie
       * nie opiera się wyłącznie na kolorze.
       */
      --ok: #00854A;
      --ostrzezenie: #A96A00;
      --blad: #D02222;
      --akcent: #1F5FA8;
      --akcent-tlo: #EAF1FA;
    }

    .panel.ciemny {
      --tlo: #10182A;
      --tlo-pas: #1A2544;
      --tlo-sekcja: #16203A;
      --ramka: #2A3757;
      --ramka-slaba: #223052;
      --linia-wiersza: #1C2842;
      --tekst: #E8EDF7;
      --tekst-slaby: #93A4C4;
      --cien: rgba(0, 0, 0, .45);
      --ok: #5DDBA4;
      --ostrzezenie: #FFCF6B;
      --blad: #FF8A85;
      --akcent: #79ADEC;
      --akcent-tlo: #1B2A45;
    }

    .pas {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 11px;
      background: var(--tlo-pas);
      border-bottom: 1px solid var(--ramka-slaba);
      cursor: move;
      flex: 0 0 auto;
    }
    .kropka { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; background: var(--tekst-slaby); }
    .pas b { flex: 1; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ikona {
      border: 0; background: transparent; color: var(--tekst-slaby);
      cursor: pointer; font-size: 14px; line-height: 1; padding: 2px 4px; border-radius: 4px;
    }
    .ikona:hover { color: var(--tekst); background: var(--ramka-slaba); }
    .ikona:focus-visible { outline: 2px solid var(--akcent); outline-offset: 1px; }

    .tresc { overflow-y: auto; flex: 1 1 auto; }

    .naglowek-sekcji {
      padding: 8px 11px 3px;
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: .09em;
      text-transform: uppercase;
      color: var(--tekst-slaby);
      background: var(--tlo-sekcja);
      border-top: 1px solid var(--ramka-slaba);
      border-bottom: 1px solid var(--ramka-slaba);
      margin-top: 2px;
    }

    .rzad {
      display: flex; gap: 7px; padding: 6px 11px 5px; align-items: baseline;
      border-bottom: 1px solid var(--linia-wiersza);
    }
    .rzad:last-child { border-bottom: 0; }
    .etykieta { flex: 0 0 96px; color: var(--tekst-slaby); font-size: 10.5px; }
    .wartosc { flex: 1; font-size: 11.5px; word-break: break-word; }
    .dopisek { display: block; color: var(--tekst-slaby); font-size: 10px; margin-top: 1px; }

    .ok { color: var(--ok); font-weight: 600; }
    .blad { color: var(--blad); font-weight: 600; }
    .ostrzezenie { color: var(--ostrzezenie); font-weight: 600; }
    .nieznany { color: var(--tekst-slaby); }

    /*
     * Wiersze główne — źródło/medium i kanał to sedno testu atrybucji,
     * więc dostają większą czcionkę i tło zamiast pozycji szeregowej.
     */
    .rzad.glowny {
      background: var(--tlo-sekcja);
      padding-top: 8px;
      padding-bottom: 7px;
    }
    .rzad.glowny .etykieta { font-weight: 600; color: var(--tekst); }
    .rzad.glowny .wartosc { font-size: 13.5px; font-weight: 700; }
    .rzad.glowny .dopisek { font-weight: 400; font-size: 10px; }

    /*
     * Kropka przed wartością. Drugi, niezależny od odcienia sygnał stanu —
     * dzięki niej zielony wiersz rozpoznajesz nawet wtedy, gdy sam kolor
     * słabo odcina się od zwykłego tekstu.
     */
    .wartosc.ok::before,
    .wartosc.ostrzezenie::before,
    .wartosc.blad::before {
      content: '';
      display: inline-block;
      width: 6px; height: 6px;
      border-radius: 50%;
      margin-right: 6px;
      vertical-align: 1px;
      background: currentColor;
    }

    .pomoc-przycisk {
      flex: 0 0 auto; border: 1px solid var(--ramka); background: transparent;
      color: var(--tekst-slaby); border-radius: 50%; width: 15px; height: 15px;
      font-size: 9.5px; line-height: 1; cursor: pointer; padding: 0;
      display: flex; align-items: center; justify-content: center;
      align-self: flex-start; margin-top: 1px;
    }
    .pomoc-przycisk:hover { color: var(--akcent); border-color: var(--akcent); }
    .pomoc-przycisk:focus-visible { outline: 2px solid var(--akcent); outline-offset: 1px; }
    .pomoc-przycisk[aria-expanded="true"] { background: var(--akcent); border-color: var(--akcent); color: #fff; }

    .pomoc-tresc {
      margin: 2px 11px 8px;
      padding: 9px 11px;
      background: var(--akcent-tlo);
      border-left: 3px solid var(--akcent);
      border-radius: 0 5px 5px 0;
      font-size: 11px;
      line-height: 1.5;
      color: var(--tekst);
    }
    .pomoc-tresc b { display: block; margin-bottom: 3px; font-size: 11.5px; }

    .zdarzenia { padding: 7px 11px; border-top: 1px solid var(--ramka-slaba); }
    .zdarzenia span {
      display: inline-block; background: var(--tlo-sekcja); border: 1px solid var(--ramka-slaba);
      border-radius: 3px; padding: 1px 5px; margin: 0 3px 3px 0;
      font-size: 10px; color: var(--tekst-slaby);
    }

    .ustawienia { padding: 9px 11px; border-top: 1px solid var(--ramka-slaba); background: var(--tlo-sekcja); }
    .ustawienia-rzad { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
    .ustawienia-rzad:last-child { margin-bottom: 0; }
    .ustawienia-rzad span { flex: 0 0 96px; font-size: 10.5px; color: var(--tekst-slaby); }
    .przelacznik { display: flex; gap: 4px; flex: 1; }
    .przelacznik button {
      flex: 1; border: 1px solid var(--ramka); background: var(--tlo); color: var(--tekst-slaby);
      border-radius: 5px; padding: 4px 6px; font-size: 10.5px; cursor: pointer;
    }
    .przelacznik button[aria-pressed="true"] { background: var(--akcent); border-color: var(--akcent); color: #fff; font-weight: 600; }
    .przelacznik button:focus-visible { outline: 2px solid var(--akcent); outline-offset: 1px; }
    .przelacznik select, .przelacznik input {
      flex: 1; min-width: 0; font: inherit; font-size: 10.5px;
      border: 1px solid var(--ramka); border-radius: 5px; padding: 4px 6px;
      background: var(--tlo); color: var(--tekst);
    }
    .przelacznik select:focus-visible, .przelacznik input:focus-visible {
      outline: 2px solid var(--akcent); outline-offset: 1px;
    }
    .przelacznik button.usun { flex: 0 0 auto; color: var(--blad); }
    .przelacznik button.usun:hover { background: var(--blad); border-color: var(--blad); color: #fff; }
    .przelacznik button[data-akcja="zapisz-zestaw"] { flex: 0 0 auto; }

    .podpowiedz-zestawu { font-size: 9.5px; color: var(--tekst-slaby); margin: -3px 0 7px 104px; }

    .wybor-wierszy { margin-top: 9px; border-top: 1px solid var(--ramka); padding-top: 8px; }
    .wybor-naglowek { font-size: 10.5px; color: var(--tekst-slaby); margin-bottom: 6px; }
    .wybor-grupa {
      font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      color: var(--tekst-slaby); margin: 7px 0 3px;
    }
    .wybor-opcja {
      display: flex; align-items: center; gap: 6px; padding: 2px 0;
      font-size: 10.5px; cursor: pointer; color: var(--tekst);
    }
    .wybor-opcja input { margin: 0; cursor: pointer; accent-color: var(--akcent); }
    .wybor-opcja:hover { color: var(--akcent); }

    .stopka { flex: 0 0 auto; border-top: 1px solid var(--ramka-slaba); padding: 7px 11px; display: flex; gap: 6px; }
    .stopka button {
      flex: 1; background: var(--tlo-sekcja); border: 1px solid var(--ramka); color: var(--tekst-slaby);
      border-radius: 5px; padding: 4px 6px; font-size: 10.5px; cursor: pointer;
    }
    .stopka button:hover { color: var(--tekst); }
    .stopka button:focus-visible { outline: 2px solid var(--akcent); outline-offset: 1px; }

    /*
     * Pasek profilu. Odpowiada na pytanie „dlaczego panel nie ocenia zgodnosci":
     * bez domeny na liscie projektu nie ma czego z czym porownac, a samoodeslania
     * nie da sie odroznic od zwyklego ruchu z zewnatrz.
     */
    .pasek-profilu {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 11px;
      font-size: 10.5px;
      background: var(--tlo-sekcja);
      border-bottom: 1px solid var(--ramka-slaba);
      flex: 0 0 auto;
    }
    .pasek-profilu .opis { flex: 1; color: var(--tekst-slaby); }
    .pasek-profilu .opis b { color: var(--tekst); font-weight: 600; }
    .pasek-profilu.uwaga { background: var(--akcent-tlo); }
    .pasek-profilu.uwaga .opis { color: var(--tekst); }
    .pasek-profilu button {
      flex: 0 0 auto; border: 1px solid var(--akcent); background: var(--akcent); color: #fff;
      border-radius: 5px; padding: 3px 8px; font-size: 10.5px; font-weight: 600; cursor: pointer;
    }
    .pasek-profilu button:hover { filter: brightness(1.08); }
    .pasek-profilu button:focus-visible { outline: 2px solid var(--akcent); outline-offset: 1px; }
    .pasek-profilu button[disabled] { opacity: .6; cursor: default; }

    .schowany .tresc, .schowany .stopka, .schowany .zdarzenia,
    .schowany .ustawienia, .schowany .pasek-profilu { display: none; }
  `;

  /**
   * Ustawienie własności gospodarza panelu z najwyższym priorytetem kaskady.
   * Inline z !important stoi wyżej niż cokolwiek, co zadeklaruje badany serwis.
   */
  const stylKorzenia = (nazwa, wartosc) => korzen.style.setProperty(nazwa, wartosc, 'important');

  /**
   * Shadow DOM chroni WNĘTRZE panelu, ale element gospodarza jest zwykłym <div>
   * w drzewie strony — i łapie reguły serwisu. Nie jest to teoretyczne: example.com
   * ma w arkuszu „div { opacity: 0.8 }" i cały panel robi się przez to przygaszony.
   * W terenie równie dobrze trafi się reguła zerująca marginesy, przycinająca
   * rozmiar albo chowająca element. Dlatego wszystko, od czego zależy widoczność
   * i położenie panelu, przybijamy tutaj inline z !important.
   */
  const utwardzKorzen = () => {
    stylKorzenia('all', 'initial');   // czysty punkt wyjścia; kolejne reguły są ważniejsze
    stylKorzenia('position', 'fixed');
    stylKorzenia('z-index', '2147483647');
    stylKorzenia('display', 'block');
    stylKorzenia('visibility', 'visible');
    stylKorzenia('opacity', '1');
    stylKorzenia('margin', '0');
    stylKorzenia('padding', '0');
    stylKorzenia('border', '0');
    stylKorzenia('float', 'none');
    stylKorzenia('width', 'auto');
    stylKorzenia('height', 'auto');
    stylKorzenia('min-width', '0');
    stylKorzenia('min-height', '0');
    stylKorzenia('max-width', 'none');
    stylKorzenia('max-height', 'none');
    stylKorzenia('transform', 'none');
    stylKorzenia('filter', 'none');
    stylKorzenia('clip-path', 'none');
    stylKorzenia('mix-blend-mode', 'normal');
    stylKorzenia('pointer-events', 'auto');
    stylKorzenia('inset', 'auto');
  };

  /** Położenie gospodarza — jedna droga zapisu, żeby !important nie zgubiło się po drodze. */
  const ustawPolozenie = (lewo, gora, prawo, dol) => {
    stylKorzenia('left', lewo);
    stylKorzenia('top', gora);
    stylKorzenia('right', prawo);
    stylKorzenia('bottom', dol);
  };

  const zbudujPanel = () => {
    if (korzen) return;
    korzen = document.createElement('div');
    korzen.id = '__attribution_helper_korzen';
    utwardzKorzen();
    // Domyślnie lewy dolny róg — prawy zajmuje dymek „Tag Assistant connected".
    // Zapamiętana pozycja ma pierwszeństwo, żeby panel wracał tam, gdzie go przesunąłeś.
    const p = ustawienia.pozycja;
    if (p && typeof p.lewo === 'number' && typeof p.gora === 'number') {
      ustawPolozenie(p.lewo + 'px', p.gora + 'px', 'auto', 'auto');
    } else {
      ustawPolozenie('16px', 'auto', 'auto', '16px');
    }
    cien = korzen.attachShadow({ mode: 'open' });

    const styl = document.createElement('style');
    styl.textContent = STYL;
    cien.appendChild(styl);

    const panel = document.createElement('div');
    panel.className = 'panel ' + ustawienia.motyw;
    panel.innerHTML = [
      '<div class="pas">',
      '<span class="kropka"></span><b></b>',
      '<button class="ikona" data-akcja="ustawienia" title="Ustawienia" aria-label="Ustawienia">⚙</button>',
      '<button class="ikona" data-akcja="zwin" title="Zwiń" aria-label="Zwiń">–</button>',
      '<button class="ikona" data-akcja="zamknij" title="Ukryj" aria-label="Ukryj">×</button>',
      '</div>',
      '<div class="pasek-profilu"></div>',
      '<div class="ustawienia" hidden></div>',
      '<div class="tresc"></div>',
      '<div class="zdarzenia"></div>',
      '<div class="stopka">',
      '<button data-akcja="kopiuj">Kopiuj stan</button>',
      '<button data-akcja="zeruj" title="Czyści zapamiętaną poprzednią domenę">Zeruj ślad</button>',
      '</div>'
    ].join('');
    cien.appendChild(panel);

    cien.addEventListener('click', obsluzKlikniecie);
    cien.addEventListener('change', (e) => {
      const wybor = e.target && e.target.closest ? e.target.closest('[data-zestaw]') : null;
      if (!wybor) return;
      if (!wybor.value) return; // pozycja „układ własny" nic nie przełącza
      if (zastosujZestaw(wybor.value)) {
        renderujUstawienia();
        odswiez();
      }
    });
    uczynPrzeciagalnym();

    /*
     * Panel wstawiamy od razu, nie czekając na gotowy dokument — dzięki temu pojawia się
     * z pierwszą klatką strony, a nie po sekundzie. Gdy <body> jeszcze nie istnieje,
     * ląduje w <html> i przenosi się do <body>, gdy tylko ono powstanie.
     */
    const gniazdo = document.body || document.documentElement;
    gniazdo.appendChild(korzen);

    if (!document.body) {
      const obs = new MutationObserver(() => {
        if (document.body) {
          obs.disconnect();
          if (korzen && korzen.parentNode !== document.body) document.body.appendChild(korzen);
        }
      });
      obs.observe(document.documentElement, { childList: true });
    }
  };

  const zapiszUstawienia = () => chrome.storage.local.set({ ustawienia: ustawienia });

  /**
   * Stan przynaleznosci biezacej domeny do profilu — trzy sytuacje, kazda z innym skutkiem
   * dla tego, co panel w ogole moze ocenic.
   */
  const stanProfilu = () => {
    const host = location.hostname;
    if (!konfiguracja.nazwaProfilu) {
      return {
        klasa: 'uwaga',
        opis: 'Bez profilu — za domeny projektu robią hosty odwiedzone w tej sesji.',
        przycisk: 'Utwórz profil z tej domeny'
      };
    }
    if (wpisDomeny(host)) {
      return {
        klasa: '',
        opis: 'Profil <b>' + esc(konfiguracja.nazwaProfilu) + '</b> — ta domena jest w profilu.',
        przycisk: null
      };
    }
    return {
      klasa: 'uwaga',
      opis: '<b>' + esc(host) + '</b> jest spoza profilu <b>' + esc(konfiguracja.nazwaProfilu) +
        '</b> — panel nie ocenia tu kontenera ani strumienia i bierze ją za obcą domenę.',
      przycisk: 'Dodaj tę domenę'
    };
  };

  /*
   * Pasek rysujemy poza odswiez() i tylko przy realnej zmianie tresci. Przycisk musi
   * przezyc cykl odswiezania: gdyby byl wymieniany co dwie sekundy, prawdziwe klikniecie
   * myszy (dluzsze niz ten cykl) gubiloby sie miedzy mousedown a mouseup.
   */
  const renderujPasekProfilu = () => {
    if (!cien) return;
    const pasek = cien.querySelector('.pasek-profilu');
    if (!pasek) return;
    const s = stanProfilu();
    const html = '<span class="opis">' + s.opis + '</span>' +
      (s.przycisk ? '<button data-akcja="dodaj-domene">' + esc(s.przycisk) + '</button>' : '');
    if (pasek.__ostatniHtml === html) return;
    pasek.innerHTML = html;
    pasek.__ostatniHtml = html;
    pasek.className = 'pasek-profilu' + (s.klasa ? ' ' + s.klasa : '');
  };

  /** Dopisanie biezacej domeny do profilu — najczestsza sytuacja w terenie. */
  const dodajBiezacaDomene = (przycisk) => {
    if (przycisk) { przycisk.disabled = true; przycisk.textContent = 'dodaje…'; }
    chrome.runtime.sendMessage({ typ: 'dodaj-domene', host: location.hostname }, (odp) => {
      void chrome.runtime.lastError;
      if (odp && odp.profil) {
        konfiguracja.nazwaProfilu = odp.nazwaProfilu || null;
        konfiguracja.domeny = Array.isArray(odp.profil.domeny) ? odp.profil.domeny : [];
      }
      renderujPasekProfilu();
      odswiez();
    });
  };

  const obsluzKlikniecie = (e) => {
    const cel = e.target && e.target.closest
      ? e.target.closest('[data-akcja], [data-pomoc], [data-ustaw], [data-ukryj], [data-skala]')
      : null;
    if (!cel) return;

    const pomoc = cel.getAttribute('data-pomoc');
    if (pomoc) {
      stan.pomocOtwarta = (stan.pomocOtwarta === pomoc) ? null : pomoc;
      odswiez();
      return;
    }

    const ukryj = cel.getAttribute('data-ukryj');
    if (ukryj) {
      const i = ustawienia.ukryte.indexOf(ukryj);
      if (i === -1) ustawienia.ukryte.push(ukryj);
      else ustawienia.ukryte.splice(i, 1);
      // Reczna zmiana odrywa uklad od zestawu — ale zapisanego zestawu nie rusza.
      ustawienia.zestaw = rozpoznajZestaw();
      zapiszUstawienia();
      // Sam wybor w liscie aktualizujemy bez przebudowy panelu ustawien:
      // przebudowa skasowalaby wpisana nazwe nowego zestawu i zabrala zaznaczenie.
      const wybor = cien.querySelector('[data-zestaw]');
      if (wybor) wybor.value = ustawienia.zestaw || '';
      odswiez();
      return;
    }

    const skala = cel.getAttribute('data-skala');
    if (skala !== null) {
      zmienSkale(Number(skala));
      renderujUstawienia();
      return;
    }

    const ustaw = cel.getAttribute('data-ustaw');
    if (ustaw) {
      const [pole, wartosc] = ustaw.split(':');
      // Pola logiczne przychodzą jako tekst „true"/„false".
      ustawienia[pole] = (wartosc === 'true' || wartosc === 'false') ? (wartosc === 'true') : wartosc;
      zapiszUstawienia();
      zastosujMotyw();
      renderujUstawienia();
      odswiez();
      return;
    }

    const akcja = cel.getAttribute('data-akcja');
    if (akcja === 'zwin') {
      ustawienia.zwiniety = !ustawienia.zwiniety;
      zapiszUstawienia();
      zastosujMotyw();
      zastosujSkale();
    }
    if (akcja === 'zamknij') { korzen.remove(); korzen = null; }
    if (akcja === 'ustawienia') {
      stan.ustawieniaOtwarte = !stan.ustawieniaOtwarte;
      renderujUstawienia();
      zastosujSkale();
    }
    if (akcja === 'resetPozycji') {
      ustawienia.pozycja = null;
      zapiszUstawienia();
      ustawPolozenie('16px', 'auto', 'auto', '16px');
    }
    if (akcja === 'zapisz-zestaw') {
      const pole = cien.querySelector('[data-nazwa-zestawu]');
      const nazwa = (pole && pole.value || '').trim();
      if (!nazwa) {
        if (pole) pole.focus();
        return;
      }
      // Ta sama nazwa nadpisuje istniejacy zestaw — o to chodzi przy poprawianiu ukladu.
      zestawy[nazwa] = ustawienia.ukryte.slice();
      ustawienia.zestaw = nazwa;
      zapiszZestawy();
      zapiszUstawienia();
      renderujUstawienia();
      return;
    }
    if (akcja === 'usun-zestaw') {
      const nazwa = ustawienia.zestaw;
      if (nazwa && Object.prototype.hasOwnProperty.call(zestawy, nazwa)) {
        delete zestawy[nazwa];
        ustawienia.zestaw = rozpoznajZestaw();
        zapiszZestawy();
        zapiszUstawienia();
        renderujUstawienia();
      }
      return;
    }
    if (akcja === 'dodaj-domene') dodajBiezacaDomene(cel);
    if (akcja === 'kopiuj') kopiujStan();
    if (akcja === 'zeruj') {
      chrome.runtime.sendMessage({ typ: 'wyczysc-slad' }, () => {
        void chrome.runtime.lastError;
        stan.clientIdPoprzedni = null;
        stan.domenaPoprzednia = null;
        stan.stampPoprzedni = null;
        odswiez();
      });
    }
  };

  const uczynPrzeciagalnym = () => {
    const pas = cien.querySelector('.pas');
    let start = null;
    pas.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const p = korzen.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, lewo: p.left, gora: p.top };
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!start) return;
      ustawPolozenie(
        (start.lewo + e.clientX - start.x) + 'px',
        (start.gora + e.clientY - start.y) + 'px',
        'auto', 'auto'
      );
    });
    document.addEventListener('mouseup', () => {
      if (!start) return;
      start = null;
      // Najpierw korekta, potem zapis: bez tego dało się przeciągnąć panel poza ekran
      // i zapamiętać pozycję, w której po przeładowaniu byłby już niewidoczny.
      wyrownajDoEkranu();
      const p = korzen.getBoundingClientRect();
      ustawienia.pozycja = { lewo: Math.round(p.left), gora: Math.round(p.top) };
      zapiszUstawienia();
    });
  };

  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /**
   * Powiększenie panelu. CSS zoom skaluje układ tak jak przybliżanie w przeglądarce —
   * inaczej niż transform: scale, które rozmywa tekst i zostawia pierwotne wymiary.
   * Wysokość liczymy w pikselach panelu, czyli dzielimy dostępną wysokość przez skalę,
   * bo wewnątrz zoomu jednostki względne okna odnoszą się już do przeskalowanego układu.
   */
  /** Klasa motywu na panelu. Trzyma też stan zwinięcia, żeby jedno nie kasowało drugiego. */
  const zastosujMotyw = () => {
    if (!cien) return;
    cien.querySelector('.panel').className =
      'panel ' + ustawienia.motyw + (ustawienia.zwiniety ? ' schowany' : '');
  };

  const zastosujSkale = () => {
    if (!cien) return;
    const panel = cien.querySelector('.panel');
    const skala = ustawienia.skala || 1;
    panel.style.zoom = String(skala);
    panel.style.maxHeight = Math.round((window.innerHeight * 0.86) / skala) + 'px';
    panel.style.maxWidth = Math.round((window.innerWidth - 24) / skala) + 'px';
    wyrownajDoEkranu();
  };

  /** Po powiększeniu albo zmianie rozmiaru okna panel potrafi wyjść poza ekran. */
  const wyrownajDoEkranu = () => {
    if (!korzen) return;
    let p = korzen.getBoundingClientRect();
    const margines = 8;

    const doGory = (wartosc) => { stylKorzenia('top', wartosc); stylKorzenia('bottom', 'auto'); };
    const doLewej = (wartosc) => { stylKorzenia('left', wartosc); stylKorzenia('right', 'auto'); };

    // Najpierw górna i lewa krawędź — pozycja ujemna oznacza panel poza widokiem.
    if (p.top < 0) doGory(margines + 'px');
    if (p.left < 0) doLewej(margines + 'px');
    p = korzen.getBoundingClientRect();
    if (p.width && p.right > window.innerWidth - margines) {
      doLewej(Math.max(margines, window.innerWidth - p.width - margines) + 'px');
    }
    if (p.height && p.bottom > window.innerHeight - margines) {
      doGory(Math.max(margines, window.innerHeight - p.height - margines) + 'px');
    }
    if (p.left < 0) doLewej(margines + 'px');
    if (p.top < 0) doGory(margines + 'px');
  };

  const zmienSkale = (kierunek) => {
    const teraz = SKALE.indexOf(ustawienia.skala);
    const bazowy = teraz === -1 ? SKALE.indexOf(1) : teraz;
    if (kierunek === 0) ustawienia.skala = 1;
    else ustawienia.skala = SKALE[Math.min(SKALE.length - 1, Math.max(0, bazowy + kierunek))];
    zapiszUstawienia();
    zastosujSkale();
    odswiez();
  };

  const odswiez = () => {
    if (!korzen) return;
    const panel = cien.querySelector('.panel');
    panel.classList.toggle('schowany', ustawienia.zwiniety);

    const widoczne = WIERSZE.filter((w) => ustawienia.ukryte.indexOf(w.klucz) === -1);
    const wyniki = widoczne.map((w) => ({ def: w, ocena: w.ocena() }));

    // Kropka statusu bierze najgorszy stan z widocznych wierszy.
    const kolor = wyniki.some((w) => w.ocena.klasa === 'blad') ? 'var(--blad)'
      : wyniki.some((w) => w.ocena.klasa === 'ostrzezenie') ? 'var(--ostrzezenie)'
      : 'var(--ok)';
    cien.querySelector('.kropka').style.background = kolor;
    cien.querySelector('.pas b').textContent = location.hostname;

    let html = '';
    SEKCJE.forEach((s) => {
      const wSekcji = wyniki.filter((w) => w.def.sekcja === s.klucz);
      if (!wSekcji.length) return;
      html += '<div class="naglowek-sekcji">' + esc(s.tytul) + '</div>';
      wSekcji.forEach(({ def, ocena }) => {
        const otwarta = stan.pomocOtwarta === def.klucz;
        html += '<div class="rzad' + (def.glowny ? ' glowny' : '') + '">' +
          '<span class="etykieta">' + esc(def.etykieta) + '</span>' +
          '<span class="wartosc ' + ocena.klasa + '">' + esc(ocena.tekst) +
          (ocena.dopisek ? '<span class="dopisek">' + esc(ocena.dopisek) + '</span>' : '') +
          '</span>' +
          '<button class="pomoc-przycisk" data-pomoc="' + esc(def.klucz) + '" ' +
          'aria-expanded="' + (otwarta ? 'true' : 'false') + '" ' +
          'title="Co to znaczy?" aria-label="Wyjaśnij: ' + esc(def.etykieta) + '">?</button>' +
          '</div>';
        if (otwarta && POMOC[def.klucz]) {
          html += '<div class="pomoc-tresc"><b>' + esc(POMOC[def.klucz].tytul) + '</b>' +
            esc(POMOC[def.klucz].tresc) + '</div>';
        }
      });
    });
    // Przebudowa tylko przy realnej zmianie treści. Bez tego przyciski „?" byłyby
    // wymieniane co cykl odświeżania i gubiły kliknięcia, tak jak przełączniki ustawień.
    const tresc = cien.querySelector('.tresc');
    if (tresc.__ostatniHtml !== html) {
      tresc.innerHTML = html;
      tresc.__ostatniHtml = html;
    }

    const lista = cien.querySelector('.zdarzenia');
    lista.hidden = !ustawienia.pokazZdarzenia;
    lista.textContent = '';
    if (stan.zdarzenia.length) {
      stan.zdarzenia.slice(-10).forEach((z) => {
        const s = document.createElement('span');
        s.textContent = z;
        lista.appendChild(s);
      });
    } else {
      const s = document.createElement('span');
      s.textContent = 'brak zdarzeń';
      lista.appendChild(s);
    }

    renderujPasekProfilu();

    const panelUstawien = cien.querySelector('.ustawienia');
    panelUstawien.hidden = !stan.ustawieniaOtwarte;
    // Zawartość ustawień przebudowujemy TYLKO na żądanie — patrz renderujUstawienia().
  };

  /**
   * Rysuje zawartość ustawień.
   *
   * Świadomie poza odswiez(): panel odświeża się co sekundę lub dwie, a przebudowa
   * innerHTML wymienia przyciski na nowe obiekty. Prawdziwe kliknięcie myszą trwa dłużej
   * niż ten cykl, więc element znikał między mousedown a mouseup i zdarzenie click
   * w ogóle nie powstawało — stąd „przełączniki nie działają". Automatyczne testy tego
   * nie łapały, bo klikały natychmiast.
   */
  const renderujUstawienia = () => {
    if (!cien) return;
    const panelUstawien = cien.querySelector('.ustawienia');
    panelUstawien.hidden = !stan.ustawieniaOtwarte;
    if (!stan.ustawieniaOtwarte) return;
    const nazwaWlasna = (ustawienia.zestaw && Object.prototype.hasOwnProperty.call(zestawy, ustawienia.zestaw))
      ? ustawienia.zestaw : '';
    const mozliwyDoUsuniecia = !!nazwaWlasna;

    {
      const przycisk = (pole, wartosc, etykieta) =>
        '<button data-ustaw="' + pole + ':' + wartosc + '" aria-pressed="' +
        (String(ustawienia[pole]) === wartosc ? 'true' : 'false') + '">' + etykieta + '</button>';

      let html =
        '<div class="ustawienia-rzad"><span>Rozmiar</span><div class="przelacznik">' +
        '<button data-skala="-1" title="Pomniejsz" aria-label="Pomniejsz">−</button>' +
        '<button data-skala="0" title="Przywróć 100%">' + Math.round((ustawienia.skala || 1) * 100) + '%</button>' +
        '<button data-skala="1" title="Powiększ" aria-label="Powiększ">+</button>' +
        '</div></div>' +
        '<div class="ustawienia-rzad"><span>Zestaw wierszy</span><div class="przelacznik">' +
        listaZestawow() +
        '</div></div>' +
        '<div class="ustawienia-rzad"><span>Zapisz jako</span><div class="przelacznik">' +
        '<input class="nazwa-zestawu" data-nazwa-zestawu type="text" spellcheck="false" ' +
        'placeholder="nazwa zestawu" aria-label="Nazwa zestawu wierszy" value="' + esc(nazwaWlasna) + '">' +
        '<button data-akcja="zapisz-zestaw" title="Zapisuje aktualnie zaznaczone wiersze pod tą nazwą">Zapisz</button>' +
        (mozliwyDoUsuniecia ? '<button data-akcja="usun-zestaw" class="usun" title="Usuwa zestaw ' +
          esc(ustawienia.zestaw) + '">Usuń</button>' : '') +
        '</div></div>' +
        '<div class="podpowiedz-zestawu">Ta sama nazwa nadpisuje zestaw. ' +
        'Wbudowane zestawy nie kasują zapisanych.</div>' +
        '<div class="ustawienia-rzad"><span>Tło</span><div class="przelacznik">' +
        przycisk('motyw', 'jasny', 'Jasne') + przycisk('motyw', 'ciemny', 'Ciemne') +
        '</div></div>' +
        '<div class="ustawienia-rzad"><span>Pasek zdarzeń</span><div class="przelacznik">' +
        przycisk('pokazZdarzenia', 'true', 'Pokaż') + przycisk('pokazZdarzenia', 'false', 'Ukryj') +
        '</div></div>' +
        '<div class="ustawienia-rzad"><span>Doklejaj gtm_debug</span><div class="przelacznik">' +
        przycisk('doklejanie', 'false', 'Nie') + przycisk('doklejanie', 'true', 'Tak') +
        '</div></div>' +
        '<div class="ustawienia-rzad"><span>Położenie</span><div class="przelacznik">' +
        '<button data-akcja="resetPozycji">Przywróć w lewy dolny róg</button>' +
        '</div></div>';

      // Wybór pojedynczych wierszy — zaznaczony znaczy widoczny.
      html += '<div class="wybor-wierszy"><div class="wybor-naglowek">Które wiersze pokazywać</div>';
      SEKCJE.forEach((s) => {
        const wSekcji = WIERSZE.filter((w) => w.sekcja === s.klucz);
        if (!wSekcji.length) return;
        html += '<div class="wybor-grupa">' + esc(s.tytul) + '</div>';
        wSekcji.forEach((w) => {
          const widoczny = ustawienia.ukryte.indexOf(w.klucz) === -1;
          html += '<label class="wybor-opcja">' +
            '<input type="checkbox" data-ukryj="' + esc(w.klucz) + '"' +
            (widoczny ? ' checked' : '') + '>' + esc(w.etykieta) + '</label>';
        });
      });
      html += '</div>';
      panelUstawien.innerHTML = html;
    }
  };

  /** Lista zestawow do wyboru: wbudowane, potem wlasne, na koncu uklad bez nazwy. */
  const listaZestawow = () => {
    const opcja = (wartosc, etykieta) =>
      '<option value="' + esc(wartosc) + '"' +
      ((ustawienia.zestaw || '') === wartosc ? ' selected' : '') + '>' + esc(etykieta) + '</option>';

    // Pozycja pusta jest ZAWSZE na liscie, nie tylko gdy jest wybrana: po recznym
    // odznaczeniu wiersza ustawiamy ja z kodu, a select bez tej opcji zostalby pusty.
    let html = '<select data-zestaw aria-label="Zestaw wierszy">' +
      '<option value=""' + (ustawienia.zestaw ? '' : ' selected') + '>— układ własny —</option>' +
      '<optgroup label="Wbudowane">';
    ZESTAWY_WBUDOWANE.forEach((z) => { html += opcja(z.klucz, z.nazwa); });
    html += '</optgroup>';
    const wlasne = Object.keys(zestawy).sort();
    if (wlasne.length) {
      html += '<optgroup label="Zapisane">';
      wlasne.forEach((n) => { html += opcja(n, n); });
      html += '</optgroup>';
    }
    html += '</select>';
    return html;
  };

  const kopiujStan = () => {
    const linie = ['HOST: ' + location.hostname, 'ADRES: ' + location.href, ''];
    SEKCJE.forEach((s) => {
      const w = WIERSZE.filter((x) => x.sekcja === s.klucz);
      if (!w.length) return;
      linie.push('[' + s.tytul.toUpperCase() + ']');
      w.forEach((def) => {
        const o = def.ocena();
        linie.push('  ' + def.etykieta + ': ' + o.tekst + (o.dopisek ? ' (' + o.dopisek + ')' : ''));
      });
      linie.push('');
    });
    linie.push('ZDARZENIA: ' + stan.zdarzenia.slice(-15).join(', '));
    navigator.clipboard.writeText(linie.join('\n')).then(() => {
      const b = cien.querySelector('[data-akcja="kopiuj"]');
      const stary = b.textContent;
      b.textContent = 'skopiowane';
      setTimeout(() => { b.textContent = stary; }, 1200);
    }).catch(() => {});
  };

  /* ------------------------------------------------------------------ *
   *  Doklejanie gtm_debug (opcja, domyślnie wyłączona)
   * ------------------------------------------------------------------ */
  const doklejDoLinkow = (e) => {
    if (!ustawienia.doklejanie) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    let cel;
    try { cel = new URL(a.href, location.href); } catch (err) { return; }
    if (cel.hostname === location.hostname) return;
    if (!wlasnaDomena(cel.hostname)) return;
    if (cel.searchParams.has('gtm_debug')) return;
    cel.searchParams.set('gtm_debug', String(Date.now()));
    a.href = cel.toString();
  };

  /* ------------------------------------------------------------------ *
   *  Wpięcie
   * ------------------------------------------------------------------ */

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.zrodlo !== KANAL) return;

    if (d.typ === 'stan-gtm') {
      stan.kontenery = d.dane.kontenery || [];
      stan.debugGroupId = d.dane.debugGroupId || null;
      stan.bootstrapPodgladu = !!d.dane.bootstrapPodgladu;
      odswiez();
    }

    if (d.typ === 'hit-ga4') {
      const h = d.dane;
      stan.hitOstatni = h;
      stan.liczbaHitow++;
      if (h.startSesji && !stan.hitStartuSesji) stan.hitStartuSesji = h;
      // Zdarzenie uznajemy za wysłane przed zgodą, gdy sygnał analityczny był odmowny.
      if (h.zgoda && h.zgoda.charAt(3) === '0') stan.hitowPrzedZgoda++;
      if (h.sessionId) {
        if (!stan.sidPierwszy) stan.sidPierwszy = h.sessionId;
        else if (stan.sidPierwszy !== h.sessionId) stan.sidZmienil = true;
      }
      if (h.zdarzenie) stan.zdarzenia.push(h.zdarzenie);
      zapiszSlad();
      odswiez();
    }

    if (d.typ === 'datalayer') {
      stan.zdarzenia.push('dl:' + d.dane.zdarzenie);
      odswiez();
    }

    if (d.typ === 'baner') {
      stan.banerWidoczny = !!d.dane.widoczny;
      odswiez();
    }
  }, false);

  /**
   * Zapis śladu czeka na ustabilizowanie ciasteczka _ga. Bez tego okna zapis łapał wartość
   * sprzed przejęcia z parametru _gl i oznaczał poprawne przejście jako zerwane.
   */
  let zapisWykonany = false;
  const zapiszSlad = () => {
    if (zapisWykonany) return;
    zapisWykonany = true;

    const oczekiwany = clientIdZLinkera();
    let poprzedni = null;
    let stabilnych = 0;
    let proby = 0;

    const wyslij = (cid) => {
      clearInterval(zegar);
      const z = zgodaCmp();
      const s = sesjaZCiasteczka();
      const zr = przewidzZrodloWejscia();
      const k = kanalGa4(zr.zrodlo, zr.medium, zr.kampania, zr.maGoogleClickId);
      chrome.runtime.sendMessage({
        typ: 'zapisz-krok',
        url: location.href,
        host: location.hostname,
        clientId: cid,
        zLinkera: oczekiwany,
        sessionId: s ? s.sessionId : null,
        zrodlo: zr.zrodlo + ' / ' + zr.medium,
        kanal: k.kanal,
        kontenery: stan.kontenery,
        measurementId: (stan.hitOstatni && stan.hitOstatni.measurementId) || null,
        zgodaStamp: z ? z.stamp : null,
        zgodaKategorie: z ? opiszKategorie(z) : null,
        gcs: (stan.hitOstatni && stan.hitOstatni.zgoda) || null,
        startSesji: !!stan.hitStartuSesji,
        odsylajacy: hostOdsylajacego(),
        utm: obecneUtm(),
        identyfikatory: obecneIdentyfikatory().map((i) => i.nazwa)
      }, (odp) => {
        void chrome.runtime.lastError;
        // Poprzedni krok sciezki sluzy za punkt odniesienia dla wierszy porownawczych.
        if (odp && odp.poprzedni) {
          stan.clientIdPoprzedni = odp.poprzedni.clientId;
          stan.domenaPoprzednia = odp.poprzedni.host;
          stan.stampPoprzedni = odp.poprzedni.zgodaStamp || null;
          stan.sesjaPoprzednia = odp.poprzedni.sessionId || null;
          odswiez();
        }
      });
    };

    const zegar = setInterval(() => {
      proby++;
      const cid = clientIdZCiasteczka();
      if (cid) {
        if (oczekiwany && cid === oczekiwany) return wyslij(cid);
        stabilnych = (cid === poprzedni) ? stabilnych + 1 : 0;
        poprzedni = cid;
        if (stabilnych >= 4) return wyslij(cid);
      }
      if (proby >= 24) {
        clearInterval(zegar);
        if (cid) wyslij(cid);
        else zapisWykonany = false;
      }
    }, 500);
  };

  /** Zamkniecie panelu na zadanie tla — przy konczeniu sesji sledzenia. */
  chrome.runtime.onMessage.addListener((wiadomosc) => {
    if (wiadomosc && wiadomosc.typ === 'zamknij-panel' && korzen) {
      korzen.remove();
      korzen = null;
    }
  });

  const start = () => {
    chrome.storage.local.get(['ustawienia', 'sesja', 'zestawy'], (dane) => {
      if (dane && dane.ustawienia) Object.assign(ustawienia, dane.ustawienia);
      if (dane && dane.zestawy && typeof dane.zestawy === 'object') zestawy = dane.zestawy;
      // Pierwsze uruchomienie albo zapis ze starszej wersji: zestaw podstawowy.
      if (!Array.isArray(ustawienia.ukryte)) {
        ustawienia.ukryte = ukryteZestawuWbudowanego('podstawowy');
        ustawienia.zestaw = 'podstawowy';
      }
      // Zapis ze starszej wersji nie znal nazw zestawow — nazwe odtwarzamy z układu,
      // zeby uklad podstawowy nie pokazywal sie jako bezimienny wlasny.
      if (typeof ustawienia.zestaw === 'undefined' || ustawienia.zestaw === null) {
        ustawienia.zestaw = rozpoznajZestaw();
      }

      // Hosty odwiedzone w tej sesji traktujemy jak domeny projektu, gdy nie ma profilu.
      const sesja = dane && dane.sesja;
      if (sesja && Array.isArray(sesja.kroki)) {
        konfiguracja.domenySesji = [...new Set(sesja.kroki.map((k) => k.host).filter(Boolean))];
      }

      chrome.runtime.sendMessage({ typ: 'konfiguracja-dla-strony' }, (odp) => {
        void chrome.runtime.lastError;
        if (odp && odp.profil) {
          konfiguracja.nazwaProfilu = odp.nazwaProfilu || null;
          konfiguracja.domeny = Array.isArray(odp.profil.domeny) ? odp.profil.domeny : [];
        }

        zbudujPanel();
        zapamietajSygnalWejscia();
        document.addEventListener('mousedown', doklejDoLinkow, true);
        window.addEventListener('resize', zastosujSkale);
        setInterval(odswiez, 2000);
        zastosujSkale();
        odswiez();
        zapiszSlad();
      });
    });
  };

  // Bez czekania na DOMContentLoaded — panel ma być na ekranie od pierwszej chwili,
  // żeby przy przechodzeniu między stronami nie było przerwy, w której go nie widać.
  start();
})();
