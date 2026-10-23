// Freie Tage laut Arbeitsvertrag NPS (Feiertage + bezahlte freie Tage). Werden mit 8:00 gutgeschrieben.
// Weicht der Firmenkalender ab: Liste hier anpassen.
import { addDays } from './time.js';

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const cache = new Map();

/** Map 'YYYY-MM-DD' -> Name */
export function holidaysOf(year) {
  if (cache.has(year)) return cache.get(year);
  const e = easter(year);
  // Bettagsmontag: Montag nach dem 3. Sonntag im September
  let sep1 = `${year}-09-01`;
  const dow = new Date(sep1 + 'T12:00:00Z').getUTCDay(); // 0 = So
  const firstSunday = addDays(sep1, (7 - dow) % 7);
  const jeune = addDays(firstSunday, 15);
  const map = new Map([
    [`${year}-01-01`, 'Neujahr'],
    [`${year}-01-02`, 'Berchtoldstag'],
    [addDays(e, -2), 'Karfreitag'],
    [addDays(e, 1), 'Ostermontag'],
    [addDays(e, 39), 'Auffahrt'],
    [addDays(e, 50), 'Pfingstmontag'],
    [`${year}-05-01`, 'Tag der Arbeit'], // laut Arbeitsvertrag bezahlt frei
    [`${year}-08-01`, 'Bundesfeier'],
    [jeune, 'Bettagsmontag'],
    [`${year}-12-25`, 'Weihnachten'],
    [`${year}-12-26`, 'Stephanstag'], // laut Arbeitsvertrag bezahlt frei
  ]);
  cache.set(year, map);
  return map;
}

export function holidayName(day) {
  return holidaysOf(+day.slice(0, 4)).get(day) || null;
}
