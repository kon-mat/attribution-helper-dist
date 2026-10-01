/**
 * tlo.js — proces tla. Zarzadza sesja sledzenia i sladem przejsc.
 *
 * Model dzialania: rozszerzenie domyslnie NIE robi nic na zadnej stronie.
 * Dopiero rozpoczecie sesji rejestruje skrypty tresci dla wszystkich adresow,
 * a zakonczenie je wyrejestrowuje. Powod: sonda podmienia sendBeacon i fetch,
 * wiec nie moze dzialac na kazdej odwiedzanej stronie w tle — tylko wtedy,
 * gdy swiadomie prowadzisz badanie.
 */
'use strict';

const ID_SKRYPTOW = ['ah-sonda', 'ah-panel'];
const LIMIT_KROKOW = 500;

const czytaj = (klucze) => new Promise((ok) => chrome.storage.local.get(klucze, ok));
const zapisz = (dane) => new Promise((ok) => chrome.storage.local.set(dane, ok));

/** Czy host nalezy do podanej domeny (sama domena albo jej subdomena). */
const naleziDoDomeny = (host, domena) => {
  if (!host || !domena) return false;
  const h = String(host).toLowerCase();
  const d = String(domena).toLowerCase().replace(/^\./, '');
  return h === d || h.endsWith('.' + d);
};

/* ------------------------------------------------------------------ *
 *  Rejestracja skryptow tresci
 * ------------------------------------------------------------------ */

const zarejestrujSkrypty = async () => {
  await wyrejestrujSkrypty();
  await chrome.scripting.registerContentScripts([
    {
      id: 'ah-sonda',
      matches: ['<all_urls>'],
      js: ['content/sonda.js'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: false
    },
    {
      id: 'ah-panel',
      matches: ['<all_urls>'],
      js: ['content/panel.js'],
      runAt: 'document_start',
      world: 'ISOLATED',
      allFrames: false
    }
  ]);
};

const wyrejestrujSkrypty = async () => {
  try {
    const istniejace = await chrome.scripting.getRegisteredContentScripts();
    const doUsuniecia = istniejace
      .filter((s) => ID_SKRYPTOW.indexOf(s.id) !== -1)
      .map((s) => s.id);
    if (doUsuniecia.length) {
      await chrome.scripting.unregisterContentScripts({ ids: doUsuniecia });
    }
  } catch (e) {
    // brak zarejestrowanych skryptow to stan poprawny
  }
};

/** Wstrzykniecie do juz otwartych kart — bez tego trzeba by je przeladowac. */
const wstrzyknijDoKarty = async (idKarty) => {
  const wspolne = { target: { tabId: idKarty }, injectImmediately: true };
  try {
    await chrome.scripting.executeScript({ ...wspolne, files: ['content/sonda.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ ...wspolne, files: ['content/panel.js'], world: 'ISOLATED' });
    return true;
  } catch (e) {
    return false; // strony chrome:// i sklep Web Store sa niedostepne
  }
};

/* ------------------------------------------------------------------ *
 *  Sesja
 * ------------------------------------------------------------------ */

const nowaSesja = (profil) => ({
  aktywna: true,
  id: 'ses-' + Date.now(),
  start: Date.now(),
  koniec: null,
  profil: profil || null,
  kroki: [],
  przejscia: []
});

const rozpocznijSesje = async (opcje) => {
  const dane = await czytaj(['profile', 'aktywnyProfil']);
  const profile = dane.profile || {};
  const nazwaProfilu = (opcje && opcje.profil) || dane.aktywnyProfil || null;

  const sesja = nowaSesja(nazwaProfilu);
  await zapisz({ sesja });
  await zarejestrujSkrypty();
  await odswiezOdznake();

  // Wstrzykniecie do biezacej karty, zeby panel pojawil sie od razu.
  if (opcje && opcje.idKarty) await wstrzyknijDoKarty(opcje.idKarty);

  return { sesja, profil: profile[nazwaProfilu] || null };
};

const zakonczSesje = async () => {
  const dane = await czytaj(['sesja']);
  const sesja = dane.sesja;
  if (sesja) {
    sesja.aktywna = false;
    sesja.koniec = Date.now();
    await zapisz({ sesja });
  }
  await wyrejestrujSkrypty();
  await odswiezOdznake();
  // Panele na otwartych kartach znikaja po odswiezeniu; usuwamy je od razu.
  try {
    const karty = await chrome.tabs.query({});
    for (const k of karty) {
      chrome.tabs.sendMessage(k.id, { typ: 'zamknij-panel' }).catch(() => {});
    }
  } catch (e) { /* brak kart do posprzatania */ }
  return { sesja };
};

/** Odznaka na ikonie: liczba wykrytych problemow albo znacznik dzialania. */
const odswiezOdznake = async () => {
  const dane = await czytaj(['sesja']);
  const sesja = dane.sesja;
  if (!sesja || !sesja.aktywna) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  const problemy = (sesja.przejscia || []).filter((p) => !p.tozsamoscOk || !p.sesjaOk).length;
  await chrome.action.setBadgeText({ text: problemy ? String(problemy) : 'ON' });
  await chrome.action.setBadgeBackgroundColor({ color: problemy ? '#C62828' : '#1F5FA8' });
};

/* ------------------------------------------------------------------ *
 *  Slad przejsc
 * ------------------------------------------------------------------ */

/**
 * Zapisuje krok sciezki. Przejscie miedzy roznymi hostami rejestrujemy osobno,
 * z porownaniem czterech osi, ktore moga sie rozjechac niezaleznie:
 * tozsamosci (client_id), sesji (session_id), zrodla i zgody.
 */
const zapiszKrok = async (wiadomosc) => {
  const dane = await czytaj(['sesja']);
  const sesja = dane.sesja;
  if (!sesja || !sesja.aktywna) return { pominiete: true };

  const kroki = sesja.kroki || [];
  const poprzedni = kroki.length ? kroki[kroki.length - 1] : null;

  const krok = {
    czas: Date.now(),
    url: wiadomosc.url,
    host: wiadomosc.host,
    clientId: wiadomosc.clientId || null,
    sessionId: wiadomosc.sessionId || null,
    zrodlo: wiadomosc.zrodlo || null,
    kanal: wiadomosc.kanal || null,
    kontenery: wiadomosc.kontenery || [],
    measurementId: wiadomosc.measurementId || null,
    zgodaStamp: wiadomosc.zgodaStamp || null,
    zgodaKategorie: wiadomosc.zgodaKategorie || null,
    gcs: wiadomosc.gcs || null,
    startSesji: !!wiadomosc.startSesji,
    odsylajacy: wiadomosc.odsylajacy || null,
    utm: wiadomosc.utm || null,
    identyfikatory: wiadomosc.identyfikatory || []
  };

  const tenSamKrok = poprzedni && poprzedni.url === krok.url &&
    poprzedni.clientId === krok.clientId && poprzedni.sessionId === krok.sessionId;
  if (tenSamKrok) {
    kroki[kroki.length - 1] = krok;
  } else {
    kroki.push(krok);
  }
  while (kroki.length > LIMIT_KROKOW) kroki.shift();

  if (poprzedni && poprzedni.host !== krok.host) {
    (sesja.przejscia = sesja.przejscia || []).push({
      czas: krok.czas,
      z: poprzedni.host,
      doHosta: krok.host,
      tozsamoscOk: !!krok.clientId && krok.clientId === poprzedni.clientId,
      clientIdZ: poprzedni.clientId,
      clientIdDo: krok.clientId,
      sesjaOk: !!krok.sessionId && krok.sessionId === poprzedni.sessionId,
      sesjaZ: poprzedni.sessionId,
      sesjaDo: krok.sessionId,
      zrodloZ: poprzedni.zrodlo,
      zrodloDo: krok.zrodlo,
      zgodaOk: !!krok.zgodaStamp && krok.zgodaStamp === poprzedni.zgodaStamp,
      zgodaBrak: !krok.zgodaStamp,
      startSesji: krok.startSesji,
      samoodeslanie: krok.startSesji && !!krok.odsylajacy
    });
  }

  sesja.kroki = kroki;
  await zapisz({ sesja });
  await odswiezOdznake();
  return { zapisane: true, poprzedni };
};

/* ------------------------------------------------------------------ *
 *  Profil projektu
 * ------------------------------------------------------------------ */

/**
 * Dodaje host do profilu projektu. Wywolywane z panelu, gdy w trakcie badania
 * odkryjesz kolejna domene serwisu — bez tego panel nie odrozni samoodeslania
 * od zwyklego ruchu z zewnatrz, wiec to nie jest kosmetyka.
 *
 * Bez aktywnego profilu zaklada nowy, nazwany od tej domeny, i ustawia go jako
 * aktywny takze dla trwajacej sesji — inaczej dodanie nie mialoby zadnego skutku
 * do konca badania.
 */
const dodajDomeneDoProfilu = async (host) => {
  const czysty = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!czysty) return { blad: 'brak hosta' };

  const dane = await czytaj(['profile', 'aktywnyProfil', 'sesja']);
  const profile = dane.profile || {};
  const sesja = dane.sesja || null;
  let nazwa = (sesja && sesja.profil) || dane.aktywnyProfil || null;

  const nowy = !nazwa || !profile[nazwa];
  if (nowy) {
    nazwa = czysty;
    if (!profile[nazwa]) profile[nazwa] = { domeny: [] };
  }

  const wpis = profile[nazwa];
  if (!Array.isArray(wpis.domeny)) wpis.domeny = [];
  const juzJest = wpis.domeny.some((d) => naleziDoDomeny(czysty, d && d.domena));
  if (!juzJest) {
    wpis.domeny.push({ domena: czysty });
    wpis.zmieniony = Date.now();
  }

  const doZapisu = { profile, aktywnyProfil: nazwa };
  if (sesja && sesja.profil !== nazwa) {
    sesja.profil = nazwa;
    doZapisu.sesja = sesja;
  }
  await zapisz(doZapisu);

  return { nazwaProfilu: nazwa, profil: wpis, dodane: !juzJest, nowyProfil: nowy };
};

/* ------------------------------------------------------------------ *
 *  Wiadomosci
 * ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((wiadomosc, nadawca, odpowiedz) => {
  (async () => {
    switch (wiadomosc.typ) {
      case 'stan': {
        const dane = await czytaj(['sesja', 'ustawienia', 'profile', 'aktywnyProfil']);
        odpowiedz({
          sesja: dane.sesja || null,
          ustawienia: dane.ustawienia || null,
          profile: dane.profile || {},
          aktywnyProfil: dane.aktywnyProfil || null
        });
        break;
      }
      case 'start-sesji':
        odpowiedz(await rozpocznijSesje(wiadomosc));
        break;
      case 'stop-sesji':
        odpowiedz(await zakonczSesje());
        break;
      case 'zapisz-krok':
        odpowiedz(await zapiszKrok(wiadomosc));
        break;
      case 'wyczysc-slad': {
        const dane = await czytaj(['sesja']);
        if (dane.sesja) {
          dane.sesja.kroki = [];
          dane.sesja.przejscia = [];
          await zapisz({ sesja: dane.sesja });
        }
        await odswiezOdznake();
        odpowiedz({ wyczyszczone: true });
        break;
      }
      case 'dodaj-domene':
        odpowiedz(await dodajDomeneDoProfilu(wiadomosc.host));
        break;
      case 'konfiguracja-dla-strony': {
        const dane = await czytaj(['profile', 'aktywnyProfil', 'sesja']);
        const profile = dane.profile || {};
        const nazwa = (dane.sesja && dane.sesja.profil) || dane.aktywnyProfil;
        odpowiedz({
          profil: nazwa ? (profile[nazwa] || null) : null,
          nazwaProfilu: nazwa || null,
          sesjaAktywna: !!(dane.sesja && dane.sesja.aktywna)
        });
        break;
      }
      default:
        odpowiedz({});
    }
  })();
  return true; // odpowiedz jest asynchroniczna
});

/*
 * Zarejestrowane dynamicznie skrypty przezywaja restart przegladarki,
 * wiec po starcie synchronizujemy je ze stanem sesji — inaczej rozszerzenie
 * dzialaloby na wszystkich stronach mimo zakonczonej sesji.
 */
const zsynchronizujPoStarcie = async () => {
  const dane = await czytaj(['sesja']);
  const aktywna = !!(dane.sesja && dane.sesja.aktywna);
  if (aktywna) await zarejestrujSkrypty();
  else await wyrejestrujSkrypty();
  await odswiezOdznake();
};

chrome.runtime.onStartup.addListener(zsynchronizujPoStarcie);
chrome.runtime.onInstalled.addListener(zsynchronizujPoStarcie);
