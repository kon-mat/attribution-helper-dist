/**
 * sonda.js — dziala w kontekscie strony (MAIN world), od document_start.
 * Zadanie: przechwycic KAZDY hit GA4 (takze wysylany metoda POST z payloadem w ciele)
 * i przekazac odczytane pola do warstwy HUD przez CustomEvent.
 *
 * Powod przechwytywania w kontekscie strony, a nie w zakladce Network:
 * GA4 wysyla zdarzenia w ciele zadania POST, gdy payload przekracza limit dlugosci URL.
 * Parser czytajacy wylacznie adres gubi wtedy czesc zdarzen.
 */
(() => {
  'use strict';

  const KANAL = '__attribution_helper';
  const WZORZEC_GA4 = /(google-analytics\.com|analytics\.google\.com)\/(g\/collect|collect)/i;

  const nadaj = (typ, dane) => {
    try {
      // postMessage zamiast CustomEvent — pewniej przenosi obiekty miedzy
      // kontekstem strony a warstwa izolowana rozszerzenia.
      window.postMessage({ zrodlo: KANAL, typ, dane }, '*');
    } catch (e) { /* strona moze byc w trakcie zamykania */ }
  };

  /** Zamienia querystring na zwykly obiekt. */
  const naObiekt = (tekst) => {
    const wynik = {};
    try {
      new URLSearchParams(tekst).forEach((v, k) => { wynik[k] = v; });
    } catch (e) { /* nieparsowalne — pomijamy */ }
    return wynik;
  };

  /**
   * Rozklada hit GA4 na liste zdarzen.
   * Parametry wspolne siedza w adresie, a przy POST kazda linia ciala to osobne zdarzenie.
   */
  const rozlozHit = (adres, cialo) => {
    let wspolne = {};
    try {
      wspolne = naObiekt(new URL(adres, location.href).search.slice(1));
    } catch (e) { /* adres wzgledny lub uszkodzony */ }

    const linie = (typeof cialo === 'string' && cialo.trim())
      ? cialo.split('\n').filter((l) => l.trim())
      : [];

    if (!linie.length) return [wspolne];
    return linie.map((linia) => Object.assign({}, wspolne, naObiekt(linia)));
  };

  /**
   * Wyciaga z surowych parametrow to, co pokazuje panel.
   *
   * Znaczenie parametrow potwierdzone odczytem zywego hitu GA4 2026-08-28:
   *   cid  — client_id           sid  — session_id        sct — numer sesji
   *   seg  — sesja zaangazowana  _ss  — start sesji       _fv — pierwsza wizyta
   *   gcs  — stan zgody          gcd  — domyslna zgoda    npa — brak personalizacji reklam
   *   dl   — adres strony        dr   — odsylajacy        en  — nazwa zdarzenia
   *
   * Uwaga: w hicie NIE MA source ani medium. GA4 wylicza je po swojej stronie
   * z dl, dr i identyfikatorow klikniec — dlatego panel liczy je samodzielnie
   * i oznacza jako przewidywanie.
   */
  const opiszZdarzenie = (p) => ({
    measurementId: p.tid || null,
    zdarzenie: p.en || (p.t === 'pageview' ? 'page_view (Universal)' : null),
    clientId: p.cid || null,
    sessionId: p.sid || null,
    numerSesji: p.sct || null,
    sesjaZaangazowana: p.seg === '1',
    startSesji: p._ss === '1',
    pierwszaWizyta: p._fv === '1',
    trybDebug: p._dbg === '1' || p._dbg === 1 || p.ep_debug_mode === 'true' || p['ep.debug_mode'] === 'true',
    zgoda: p.gcs || null,
    zgodaDomyslna: p.gcd || null,
    bezPersonalizacji: p.npa === '1',
    adresStrony: p.dl || null,
    odsylajacy: p.dr || null,
    czas: Date.now()
  });

  const zglosHit = (adres, cialo, metoda) => {
    if (!WZORZEC_GA4.test(String(adres))) return;
    try {
      rozlozHit(adres, cialo).forEach((p) => {
        const opis = opiszZdarzenie(p);
        if (!opis.measurementId && !opis.zdarzenie) return;
        opis.metoda = metoda;
        nadaj('hit-ga4', opis);
      });
    } catch (e) { /* nigdy nie przerywaj dzialania strony */ }
  };

  /** Zamienia rozne typy ciala zadania na tekst, jesli to mozliwe bez blokowania. */
  const cialoNaTekst = (cialo) => {
    if (!cialo) return '';
    if (typeof cialo === 'string') return cialo;
    if (cialo instanceof URLSearchParams) return cialo.toString();
    if (cialo instanceof Blob && cialo.type.indexOf('text') === 0) return null; // odczyt asynchroniczny
    if (cialo instanceof ArrayBuffer) {
      try { return new TextDecoder().decode(cialo); } catch (e) { return ''; }
    }
    return '';
  };

  // --- przechwycenie sendBeacon (glowna droga wysylki GA4) ---
  const beaconOryginalny = navigator.sendBeacon;
  if (typeof beaconOryginalny === 'function') {
    navigator.sendBeacon = function (adres, dane) {
      const tekst = cialoNaTekst(dane);
      if (tekst === null && dane instanceof Blob) {
        dane.text().then((t) => zglosHit(adres, t, 'sendBeacon')).catch(() => {});
      } else {
        zglosHit(adres, tekst, 'sendBeacon');
      }
      return beaconOryginalny.apply(navigator, arguments);
    };
  }

  // --- przechwycenie fetch ---
  const fetchOryginalny = window.fetch;
  if (typeof fetchOryginalny === 'function') {
    window.fetch = function (zasob, opcje) {
      try {
        const adres = (typeof zasob === 'string') ? zasob : (zasob && zasob.url) || '';
        const cialo = (opcje && opcje.body) || null;
        const tekst = cialoNaTekst(cialo);
        if (tekst === null && cialo instanceof Blob) {
          cialo.text().then((t) => zglosHit(adres, t, 'fetch')).catch(() => {});
        } else {
          zglosHit(adres, tekst, 'fetch');
        }
      } catch (e) { /* pomijamy */ }
      return fetchOryginalny.apply(this, arguments);
    };
  }

  // --- przechwycenie XMLHttpRequest ---
  const otworzOryginalny = XMLHttpRequest.prototype.open;
  const wyslijOryginalny = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metoda, adres) {
    this.__ahAdres = adres;
    return otworzOryginalny.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (cialo) {
    try { zglosHit(this.__ahAdres || '', cialoNaTekst(cialo), 'XHR'); } catch (e) {}
    return wyslijOryginalny.apply(this, arguments);
  };

  // --- wykrywanie kontenerow GTM i stanu dataLayer ---
  const zbadajKontenery = () => {
    const gtm = window.google_tag_manager || {};
    const kontenery = [];
    Object.keys(gtm).forEach((klucz) => {
      if (/^GTM-/.test(klucz)) kontenery.push(klucz);
    });
    /*
     * Sygnaly trybu podgladu sprawdzone na zywym ruchu 2026-08-28:
     * ciasteczka __TAG_ASSISTANT NIE BYLO nawet przy dzialajacej sesji podgladu
     * (sprawdzone przez protokol, wiec takze warianty niedostepne dla JavaScriptu).
     * Realnie obecne sa dwa: klucz debugGroupId w obiekcie google_tag_manager
     * oraz skrypt debug/bootstrap w dokumencie. Na nich opiera sie wykrywanie.
     */
    const bootstrapPodgladu = [...document.querySelectorAll('script[src]')]
      .some((s) => /googletagmanager\.com\/debug\/bootstrap/i.test(s.src));

    nadaj('stan-gtm', {
      kontenery,
      debugGroupId: gtm.debugGroupId || null,
      bootstrapPodgladu,
      dataLayerDlugosc: Array.isArray(window.dataLayer) ? window.dataLayer.length : null
    });
  };

  /*
   * Badanie nie ma twardego konca. Wczesniejsza wersja przerywala po trzydziestu
   * sekundach, a w trybie podgladu kontener potrafi wstac PO tym oknie —
   * panel do konca zycia karty pokazywal wtedy "nie wykryto kontenera",
   * mimo ze kontener dzialal poprawnie. Gesto na poczatku, potem rzadziej.
   */
  let proby = 0;
  let zegar = setInterval(function tik() {
    zbadajKontenery();
    proby++;
    if (proby === 30) { // po trzydziestu sekundach zwalniamy, ale nie przestajemy
      clearInterval(zegar);
      zegar = setInterval(tik, 3000);
    }
  }, 1000);
  zbadajKontenery();

  /*
   * Widocznosc banera zgody. Cookiebot renderuje dialog jako #CybotCookiebotDialog;
   * sprawdzamy tez ogolniejsze selektory, zeby panel dzialal, gdyby CMP sie zmienil.
   * Baner widoczny przy braku zapisanej decyzji znaczy, ze pomiar czeka na klikniecie.
   */
  const zbadajBaner = () => {
    const kandydaci = [
      '#CybotCookiebotDialog',
      '#CybotCookiebotDialogBodyUnderlay',
      '[id*="CookiebotDialog"]',
      '[class*="cookie-consent"]',
      '[id*="cookie-banner"]'
    ];
    let widoczny = false;
    for (const selektor of kandydaci) {
      let el;
      try { el = document.querySelector(selektor); } catch (e) { continue; }
      if (!el) continue;
      const styl = window.getComputedStyle(el);
      const pudelko = el.getBoundingClientRect();
      if (styl.display !== 'none' && styl.visibility !== 'hidden' &&
          styl.opacity !== '0' && pudelko.height > 20) {
        widoczny = true;
        break;
      }
    }
    nadaj('baner', { widoczny });
  };

  setInterval(zbadajBaner, 1500);
  zbadajBaner();

  // --- podglad ostatnich wpisow dataLayer ---
  const obserwujDataLayer = () => {
    if (!Array.isArray(window.dataLayer)) return false;
    const pushOryginalny = window.dataLayer.push;
    window.dataLayer.push = function () {
      try {
        Array.prototype.forEach.call(arguments, (wpis) => {
          if (wpis && typeof wpis === 'object' && wpis.event) {
            nadaj('datalayer', { zdarzenie: String(wpis.event), czas: Date.now() });
          }
        });
      } catch (e) {}
      return pushOryginalny.apply(this, arguments);
    };
    return true;
  };
  if (!obserwujDataLayer()) {
    const zegarDL = setInterval(() => { if (obserwujDataLayer()) clearInterval(zegarDL); }, 300);
    // Minuta zamiast pietnastu sekund — w trybie podgladu dataLayer bywa pozniej.
    setTimeout(() => clearInterval(zegarDL), 60000);
  }
})();
