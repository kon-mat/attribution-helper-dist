'use strict';

let stanBiezacy = { sesja: null, profile: {}, aktywnyProfil: null };

const zapytaj = (wiadomosc) => new Promise((ok) => chrome.runtime.sendMessage(wiadomosc, (odp) => {
  void chrome.runtime.lastError;
  ok(odp || {});
}));

const godzina = (znacznik) => {
  const d = new Date(znacznik);
  const dwie = (n) => String(n).padStart(2, '0');
  return dwie(d.getHours()) + ':' + dwie(d.getMinutes()) + ':' + dwie(d.getSeconds());
};

const skroc = (t, ile) => {
  const limit = ile || 14;
  return (t && t.length > limit) ? t.slice(0, Math.ceil(limit / 2)) + '…' + t.slice(-4) : (t || '—');
};

const skrocAdres = (url) => {
  try {
    const u = new URL(url);
    const sciezka = u.pathname === '/' ? '' : u.pathname;
    return u.hostname + (sciezka.length > 26 ? sciezka.slice(0, 26) + '…' : sciezka);
  } catch (e) {
    return url || '—';
  }
};

const komorka = (klasa, tekst, drobne) => {
  const td = document.createElement('td');
  if (klasa) td.className = klasa;
  td.textContent = tekst;
  if (drobne) {
    const s = document.createElement('span');
    s.className = 'drobne';
    s.textContent = drobne;
    td.appendChild(s);
  }
  return td;
};

const pustyWiersz = (kolumny, tekst) => {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = kolumny;
  td.className = 'pusto';
  td.textContent = tekst;
  tr.appendChild(td);
  return tr;
};

/* ------------------------------------------------------------------ *
 *  Rysowanie
 * ------------------------------------------------------------------ */

const rysujPodsumowanie = (sesja) => {
  const cel = document.getElementById('podsumowanie');
  cel.textContent = '';
  const kroki = (sesja && sesja.kroki) || [];
  const przejscia = (sesja && sesja.przejscia) || [];
  const zerwaneTozsamosci = przejscia.filter((p) => !p.tozsamoscOk).length;
  const noweSesje = przejscia.filter((p) => !p.sesjaOk).length;

  const kafle = [
    { etykieta: 'Kroki', wartosc: kroki.length, klasa: '' },
    { etykieta: 'Przejścia', wartosc: przejscia.length, klasa: '' },
    { etykieta: 'Zerwana tożsamość', wartosc: zerwaneTozsamosci, klasa: zerwaneTozsamosci ? 'zle' : 'dobrze' },
    { etykieta: 'Nowe sesje', wartosc: noweSesje, klasa: noweSesje ? 'zle' : 'dobrze' }
  ];

  kafle.forEach((k) => {
    const div = document.createElement('div');
    div.className = 'kafel ' + k.klasa;
    const b = document.createElement('b');
    b.textContent = String(k.wartosc);
    const s = document.createElement('span');
    s.textContent = k.etykieta;
    div.appendChild(b);
    div.appendChild(s);
    cel.appendChild(div);
  });
};

const rysujPrzejscia = (sesja) => {
  const cel = document.getElementById('przejscia');
  cel.textContent = '';
  const przejscia = ((sesja && sesja.przejscia) || []).slice().reverse();
  if (!przejscia.length) {
    cel.appendChild(pustyWiersz(5, 'Brak przejść między domenami w tej sesji.'));
    return;
  }
  przejscia.forEach((p) => {
    const tr = document.createElement('tr');
    tr.appendChild(komorka('', p.z + ' → ' + p.doHosta, godzina(p.czas)));
    tr.appendChild(p.tozsamoscOk
      ? komorka('ok', 'zachowana', skroc(p.clientIdDo))
      : komorka('blad', 'ZERWANA', skroc(p.clientIdZ) + ' → ' + skroc(p.clientIdDo)));
    tr.appendChild(p.sesjaOk
      ? komorka('ok', 'ta sama')
      : komorka('blad', 'NOWA', p.samoodeslanie ? 'samoodesłanie' : null));
    tr.appendChild(komorka('', p.zrodloDo || '—',
      (p.zrodloZ && p.zrodloZ !== p.zrodloDo) ? 'przed: ' + p.zrodloZ : null));
    if (p.zgodaBrak) tr.appendChild(komorka('blad', 'brak'));
    else if (p.zgodaOk) tr.appendChild(komorka('ok', 'ta sama'));
    else tr.appendChild(komorka('uwaga', 'nowa'));
    cel.appendChild(tr);
  });
};

const rysujKroki = (sesja) => {
  const cel = document.getElementById('kroki');
  cel.textContent = '';
  const kroki = ((sesja && sesja.kroki) || []).slice().reverse();
  if (!kroki.length) {
    cel.appendChild(pustyWiersz(4, 'Brak kroków. Rozpocznij sesję i wejdź na badaną stronę.'));
    return;
  }
  kroki.forEach((k) => {
    const tr = document.createElement('tr');
    tr.appendChild(komorka('', godzina(k.czas)));
    tr.appendChild(komorka('', skrocAdres(k.url),
      k.startSesji ? 'session_start — tu przypisane źródło' : null));
    tr.appendChild(komorka(k.startSesji ? 'ok' : '', k.zrodlo || '—'));
    tr.appendChild(komorka('', k.kanal || '—'));
    cel.appendChild(tr);
  });
};

const rysujProfile = () => {
  const select = document.getElementById('profil');
  select.textContent = '';
  const brak = document.createElement('option');
  brak.value = '';
  brak.textContent = 'Bez profilu (dowolna strona)';
  select.appendChild(brak);
  Object.keys(stanBiezacy.profile || {}).forEach((nazwa) => {
    const opt = document.createElement('option');
    opt.value = nazwa;
    opt.textContent = nazwa;
    select.appendChild(opt);
  });
  const wybrany = (stanBiezacy.sesja && stanBiezacy.sesja.profil) || stanBiezacy.aktywnyProfil || '';
  select.value = wybrany;
  select.disabled = !!(stanBiezacy.sesja && stanBiezacy.sesja.aktywna);
};

const rysuj = () => {
  const sesja = stanBiezacy.sesja;
  const aktywna = !!(sesja && sesja.aktywna);

  document.getElementById('dioda').className = 'dioda' + (aktywna ? ' wl' : '');
  document.getElementById('etykietaStanu').textContent = aktywna
    ? 'sesja trwa od ' + godzina(sesja.start)
    : 'nieaktywna';

  const przycisk = document.getElementById('przelacz');
  przycisk.textContent = aktywna ? 'Zakończ sesję' : 'Rozpocznij sesję';
  przycisk.className = aktywna ? 'stop' : 'glowny';

  const notka = document.getElementById('notka');
  if (aktywna) {
    notka.hidden = false;
    notka.textContent = 'Sesja działa na każdej odwiedzanej stronie. Panel pojawia się automatycznie, '
      + 'a przejścia między domenami trafiają do tabeli powyżej. Zakończenie sesji usuwa panel '
      + 'i wyłącza wstrzykiwanie skryptów.';
  } else {
    notka.hidden = true;
  }

  rysujProfile();
  rysujPodsumowanie(sesja);
  rysujPrzejscia(sesja);
  rysujKroki(sesja);
};

const odswiez = async () => {
  stanBiezacy = await zapytaj({ typ: 'stan' });
  rysuj();
};

/* ------------------------------------------------------------------ *
 *  Raport
 * ------------------------------------------------------------------ */

const zbudujRaport = () => {
  const s = stanBiezacy.sesja;
  if (!s) return 'Brak sesji.';
  const linie = [];
  linie.push('ATTRIBUTION HELPER — raport sesji');
  linie.push('Start: ' + new Date(s.start).toLocaleString('pl-PL'));
  if (s.koniec) linie.push('Koniec: ' + new Date(s.koniec).toLocaleString('pl-PL'));
  linie.push('Profil: ' + (s.profil || 'bez profilu'));
  linie.push('Kroków: ' + (s.kroki || []).length + ', przejść: ' + (s.przejscia || []).length);
  linie.push('');

  linie.push('PRZEJŚCIA MIĘDZY DOMENAMI');
  if (!(s.przejscia || []).length) linie.push('  brak');
  (s.przejscia || []).forEach((p) => {
    linie.push('  ' + godzina(p.czas) + '  ' + p.z + ' → ' + p.doHosta);
    linie.push('    tożsamość: ' + (p.tozsamoscOk ? 'zachowana' : 'ZERWANA (' + p.clientIdZ + ' → ' + p.clientIdDo + ')'));
    linie.push('    sesja: ' + (p.sesjaOk ? 'ta sama' : 'NOWA' + (p.samoodeslanie ? ' — samoodesłanie' : '')));
    linie.push('    źródło: ' + (p.zrodloZ || '?') + ' → ' + (p.zrodloDo || '?'));
    linie.push('    zgoda: ' + (p.zgodaBrak ? 'brak' : (p.zgodaOk ? 'ta sama' : 'nowa decyzja')));
  });
  linie.push('');

  linie.push('ŚCIEŻKA');
  (s.kroki || []).forEach((k, i) => {
    linie.push('  ' + (i + 1) + '. ' + godzina(k.czas) + '  ' + k.url);
    linie.push('     source/medium: ' + (k.zrodlo || '?') + '   kanał: ' + (k.kanal || '?'));
    linie.push('     client_id: ' + (k.clientId || '?') + '   session_id: ' + (k.sessionId || '?')
      + (k.startSesji ? '   [session_start]' : ''));
    if (k.kontenery && k.kontenery.length) linie.push('     kontenery: ' + k.kontenery.join(', '));
    if (k.gcs) linie.push('     gcs: ' + k.gcs);
  });

  return linie.join('\n');
};

/* ------------------------------------------------------------------ *
 *  Zdarzenia
 * ------------------------------------------------------------------ */

document.getElementById('przelacz').addEventListener('click', async () => {
  const aktywna = !!(stanBiezacy.sesja && stanBiezacy.sesja.aktywna);
  if (aktywna) {
    await zapytaj({ typ: 'stop-sesji' });
  } else {
    const [karta] = await chrome.tabs.query({ active: true, currentWindow: true });
    const profil = document.getElementById('profil').value || null;
    await chrome.storage.local.set({ aktywnyProfil: profil });
    await zapytaj({ typ: 'start-sesji', profil, idKarty: karta && karta.id });
  }
  await odswiez();
});

document.getElementById('ustawienia').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('wyczysc').addEventListener('click', async () => {
  await zapytaj({ typ: 'wyczysc-slad' });
  await odswiez();
});

document.getElementById('kopiuj').addEventListener('click', (e) => {
  navigator.clipboard.writeText(zbudujRaport()).then(() => {
    const b = e.target;
    const stary = b.textContent;
    b.textContent = 'skopiowane';
    setTimeout(() => { b.textContent = stary; }, 1300);
  }).catch(() => {});
});

document.getElementById('pobierz').addEventListener('click', () => {
  const s = stanBiezacy.sesja;
  if (!s) return;
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'attribution-' + new Date(s.start).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
});

odswiez();
setInterval(odswiez, 3000);
