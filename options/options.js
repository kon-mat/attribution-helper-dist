'use strict';

const czytaj = (klucze) => new Promise((ok) => chrome.storage.local.get(klucze, ok));
const zapisz = (dane) => new Promise((ok) => chrome.storage.local.set(dane, ok));

let profile = {};

const pokazKomunikat = (tekst, klasa) => {
  const cel = document.getElementById('komunikat');
  cel.textContent = '';
  if (!tekst) return;
  const div = document.createElement('div');
  div.className = 'komunikat ' + (klasa || 'ok');
  div.textContent = tekst;
  cel.appendChild(div);
  setTimeout(() => { if (cel.contains(div)) div.remove(); }, 4000);
};

/**
 * Wklejony adres sprowadzamy do samego hosta. Dopasowanie w panelu idzie po hoscie,
 * wiec „https://sklep.pl/koszyk?a=1" musi zostac zapisane jako „sklep.pl" —
 * inaczej wpis nigdy by sie z niczym nie zgodzil.
 */
const oczyscDomene = (tekst) => String(tekst || '')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .replace(/[/?#].*$/, '')
  .replace(/:\d+$/, '');

/**
 * Zamienia tekst na liste domen. Format z wczesniejszych wersji, zachowany
 * do wklejania hurtem: wiersz to sama domena albo domena i oczekiwania po znaku |.
 */
const domenyZTekstu = (tekst) => String(tekst || '')
  .split('\n')
  .map((w) => w.trim())
  .filter(Boolean)
  .map((wiersz) => {
    const czesci = wiersz.split('|').map((c) => c.trim());
    const wpis = { domena: oczyscDomene(czesci[0]) };
    if (czesci[1]) wpis.kontener = czesci[1];
    if (czesci[2]) wpis.measurementId = czesci[2];
    if (czesci[3]) wpis.property = czesci[3];
    return wpis;
  })
  .filter((w) => w.domena);

/* ------------------------------------------------------------------ *
 *  Edytor domen — wiersz na domene, osobne pole na kazde oczekiwanie
 * ------------------------------------------------------------------ */

const POLA = [
  { klucz: 'domena', placeholder: 'sklep.pl', etykieta: 'Domena' },
  { klucz: 'kontener', placeholder: 'GTM-XXXXXXX', etykieta: 'Kontener GTM' },
  { klucz: 'measurementId', placeholder: 'G-XXXXXXXXXX', etykieta: 'Measurement ID' },
  { klucz: 'property', placeholder: '000000000', etykieta: 'Property' }
];

/** Buduje jeden wiersz edytora. Wartosci zyja w polach, bez osobnego stanu obok. */
const dodajWiersz = (wpis) => {
  const dane = wpis || {};
  const wiersz = document.createElement('div');
  wiersz.className = 'edytor-wiersz';

  POLA.forEach((pole) => {
    const input = document.createElement('input');
    input.dataset.pole = pole.klucz;
    input.placeholder = pole.placeholder;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = dane[pole.klucz] || '';
    input.setAttribute('aria-label', pole.etykieta);
    wiersz.appendChild(input);
  });

  const usun = document.createElement('button');
  usun.className = 'skasuj';
  usun.type = 'button';
  usun.textContent = '×';
  usun.title = 'Usuń tę domenę z profilu';
  usun.setAttribute('aria-label', 'Usuń wiersz');
  usun.addEventListener('click', () => {
    wiersz.remove();
    // Pusty edytor wyglada jak awaria — zawsze zostawiamy jeden wiersz do wpisania.
    if (!document.querySelectorAll('.edytor-wiersz').length) dodajWiersz();
  });
  wiersz.appendChild(usun);

  document.getElementById('wiersze').appendChild(wiersz);
  return wiersz;
};

/** Zastepuje zawartosc edytora lista wpisow; pusta lista daje jeden pusty wiersz. */
const wypelnijEdytor = (domeny) => {
  document.getElementById('wiersze').textContent = '';
  const lista = (domeny || []).filter(Boolean);
  if (!lista.length) dodajWiersz();
  else lista.forEach((w) => dodajWiersz(w));
};

/** Odczyt edytora do formatu profilu. Puste pole znaczy „nie sprawdzaj" i nie trafia do zapisu. */
const domenyZEdytora = () => [...document.querySelectorAll('.edytor-wiersz')]
  .map((wiersz) => {
    const wpis = {};
    POLA.forEach((pole) => {
      const input = wiersz.querySelector('[data-pole="' + pole.klucz + '"]');
      const wartosc = (input.value || '').trim();
      if (!wartosc) return;
      wpis[pole.klucz] = (pole.klucz === 'domena') ? oczyscDomene(wartosc) : wartosc;
    });
    return wpis;
  })
  .filter((w) => w.domena);

/* ------------------------------------------------------------------ *
 *  Lista profili
 * ------------------------------------------------------------------ */

const wczytajDoFormularza = (nazwa) => {
  document.getElementById('nazwa').value = nazwa;
  wypelnijEdytor(profile[nazwa].domeny);
  document.getElementById('tytulEdycji').textContent = 'Edycja profilu: ' + nazwa;
  document.getElementById('nazwa').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const rysujListe = () => {
  const cel = document.getElementById('listaProfili');
  cel.textContent = '';
  const nazwy = Object.keys(profile);
  if (!nazwy.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'pusto';
    td.textContent = 'Brak profili. Możesz pracować bez profilu albo dodać pierwszy poniżej.';
    tr.appendChild(td);
    cel.appendChild(tr);
    return;
  }
  nazwy.forEach((nazwa) => {
    const tr = document.createElement('tr');

    const tdNazwa = document.createElement('td');
    tdNazwa.textContent = nazwa;
    tr.appendChild(tdNazwa);

    const tdDomeny = document.createElement('td');
    tdDomeny.textContent = (profile[nazwa].domeny || []).map((d) => d.domena).join(', ');
    tr.appendChild(tdDomeny);

    const tdAkcje = document.createElement('td');
    tdAkcje.style.whiteSpace = 'nowrap';
    tdAkcje.style.textAlign = 'right';

    const edytuj = document.createElement('button');
    edytuj.textContent = 'Edytuj';
    edytuj.addEventListener('click', () => wczytajDoFormularza(nazwa));

    const usun = document.createElement('button');
    usun.textContent = 'Usuń';
    usun.className = 'usun';
    usun.style.marginLeft = '6px';
    usun.addEventListener('click', async () => {
      delete profile[nazwa];
      await zapisz({ profile });
      rysujListe();
      pokazKomunikat('Profil „' + nazwa + '" usunięty.', 'ok');
    });

    tdAkcje.appendChild(edytuj);
    tdAkcje.appendChild(usun);
    tr.appendChild(tdAkcje);
    cel.appendChild(tr);
  });
};

/* ------------------------------------------------------------------ *
 *  Zdarzenia
 * ------------------------------------------------------------------ */

document.getElementById('zapisz').addEventListener('click', async () => {
  const nazwa = document.getElementById('nazwa').value.trim();
  const domeny = domenyZEdytora();
  if (!nazwa) return pokazKomunikat('Podaj nazwę projektu.', 'blad');
  if (!domeny.length) return pokazKomunikat('Podaj przynajmniej jedną domenę.', 'blad');

  profile[nazwa] = { domeny, zmieniony: Date.now() };
  await zapisz({ profile });
  rysujListe();
  // Edytor odswiezamy zapisanymi wartosciami — widac od razu, co poszlo do profilu
  // po oczyszczeniu adresow (np. „https://sklep.pl/" zamienione na „sklep.pl").
  wypelnijEdytor(domeny);
  document.getElementById('tytulEdycji').textContent = 'Edycja profilu: ' + nazwa;
  pokazKomunikat('Zapisano profil „' + nazwa + '" (' + domeny.length + ' domen).', 'ok');
});

document.getElementById('wyczyscFormularz').addEventListener('click', () => {
  document.getElementById('nazwa').value = '';
  document.getElementById('domenyTekst').value = '';
  wypelnijEdytor([]);
  document.getElementById('tytulEdycji').textContent = 'Nowy profil';
});

document.getElementById('dodajWiersz').addEventListener('click', () => {
  dodajWiersz().querySelector('[data-pole="domena"]').focus();
});

document.getElementById('wczytajTekst').addEventListener('click', () => {
  const domeny = domenyZTekstu(document.getElementById('domenyTekst').value);
  if (!domeny.length) return pokazKomunikat('Nie znaleziono ani jednej domeny we wklejonym tekście.', 'blad');
  wypelnijEdytor(domeny);
  document.getElementById('wklejanie').open = false;
  pokazKomunikat('Wczytano ' + domeny.length + ' domen do edytora. Zapisz profil, żeby je utrwalić.', 'ok');
});

document.getElementById('eksport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ profile }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'attribution-helper-profile.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
});

document.getElementById('importPrzycisk').addEventListener('click', () => {
  document.getElementById('importPlik').click();
});

document.getElementById('importPlik').addEventListener('change', async (e) => {
  const plik = e.target.files && e.target.files[0];
  if (!plik) return;
  try {
    const tekst = await plik.text();
    const dane = JSON.parse(tekst);
    const wczytane = dane.profile || dane;
    if (!wczytane || typeof wczytane !== 'object') throw new Error('zły format');
    // Scalanie zamiast nadpisania — import nie kasuje profili juz zapisanych.
    // Klucze zaczynajace sie od podkreslenia to opisy w plikach szablonowych, nie profile.
    const nazwy = Object.keys(wczytane)
      .filter((n) => n.charAt(0) !== '_' && wczytane[n] && typeof wczytane[n] === 'object');
    if (!nazwy.length) throw new Error('plik nie zawiera profili');
    nazwy.forEach((nazwa) => { profile[nazwa] = wczytane[nazwa]; });
    await zapisz({ profile });
    rysujListe();
    pokazKomunikat('Wczytano ' + nazwy.length + ' profili.', 'ok');
  } catch (err) {
    pokazKomunikat('Nie udało się wczytać pliku: ' + err.message, 'blad');
  }
  e.target.value = '';
});

(async () => {
  const dane = await czytaj(['profile', 'aktywnyProfil']);
  profile = dane.profile || {};
  rysujListe();
  // Profil dopisany z panelu przyciskiem „Dodaj tę domenę" ma byc od razu pod reka
  // do dokonczenia — inaczej trzeba go szukac na liscie po otwarciu ustawien.
  const aktywny = dane.aktywnyProfil;
  if (aktywny && profile[aktywny]) wczytajDoFormularza(aktywny);
  else wypelnijEdytor([]);
})();
