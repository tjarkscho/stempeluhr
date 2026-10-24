// Betrag und Datum aus dem OCR-Text eines Kassenbons lesen (DE/FR/CH-Bons)

const NUM = /(\d{1,5}(?:['’ ]\d{3})*)[.,](\d{2})(?!\d)/g;
// Zeilen mit diesen Wörtern enthalten fast sicher den Endbetrag (stärkster Treffer zuerst)
const STRONG = /\b(total|totale|summe|gesamt(?:betrag)?|zu\s*(?:be)?zahlen|à\s*payer|a\s*payer|net\s*à\s*payer|montant|betrag)\b/i;
const WEAK = /\b(chf|fr\.|sfr|eur|bar|karte|card|twint|visa|mastercard|maestro|postfinance|ec)\b/i;
// Zeilen, die NICHT der Endbetrag sind
const SKIP = /(mwst|mwst\.|tva|ust|vat|steuer|%|rückgeld|rueckgeld|retour|gegeben|change|rendu|zwischensumme|sous-total|subtotal|rabatt|remise|netto)/i;

function amountsIn(line) {
  const out = [];
  for (const m of line.matchAll(NUM)) {
    const v = parseFloat(`${m[1].replace(/['’ ]/g, '')}.${m[2]}`);
    if (v > 0 && v < 100000) out.push(v);
  }
  return out;
}

export function parseAmount(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let best = null;
  // 1) Zeilen mit "Total/Summe/…" – bei mehreren die letzte (meist unten auf dem Bon)
  for (let i = 0; i < lines.length; i++) {
    if (!STRONG.test(lines[i]) || SKIP.test(lines[i])) continue;
    const vals = amountsIn(lines[i]).length ? amountsIn(lines[i]) : amountsIn(lines[i + 1] || '');
    if (vals.length) best = Math.max(...vals);
  }
  if (best != null) return best;
  // 2) Zeilen mit Währung/Zahlart
  const weak = lines.filter((l) => WEAK.test(l) && !SKIP.test(l)).flatMap(amountsIn);
  if (weak.length) return Math.max(...weak);
  // 3) Notlösung: grösster Betrag auf dem Bon
  const all = lines.filter((l) => !SKIP.test(l)).flatMap(amountsIn);
  return all.length ? Math.max(...all) : null;
}

export function parseDate(text, today = new Date()) {
  const s = String(text || '');
  const re = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/g;
  for (const m of s.matchAll(re)) {
    const d = +m[1], mo = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2020 || y > today.getFullYear() + 1) continue;
    const key = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(`${key}T12:00:00`);
    if (dt.getMonth() + 1 !== mo) continue;               // z. B. 31.02.
    if (dt - today > 2 * 86400000) continue;              // kein Datum in der Zukunft
    return key;
  }
  return null;
}

export function parseReceipt(text, today = new Date()) {
  return { amount: parseAmount(text), day: parseDate(text, today) };
}

export const CATEGORIES = ['essen', 'fahrt', 'material', 'uebernachtung', 'anderes', 'km'];
export const PHOTO_CATS = CATEGORIES.filter((c) => c !== 'km');

/** Kilometer-Betrag (Rappen-genau) */
export const kmAmount = (km, rate) => Math.round(Number(km || 0) * rate * 100) / 100;

/** Summen pro Kategorie und gesamt (Rappen-genau) */
export function expenseTotals(items) {
  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  let total = 0;
  for (const it of items) {
    const c = Math.round(Number(it.amount) * 100);
    byCat[CATEGORIES.includes(it.category) ? it.category : 'anderes'] += c;
    total += c;
  }
  for (const k of Object.keys(byCat)) byCat[k] /= 100;
  return { total: total / 100, byCat };
}

export const fmtChf = (v) => Number(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

/** Letzter Werktag (Mo–Fr, kein Feiertag) eines Monats 'YYYY-MM' */
export function lastWorkday(ym, isHoliday = () => false) {
  const [y, m] = ym.split('-').map(Number);
  for (let d = new Date(Date.UTC(y, m, 0)); ; d.setUTCDate(d.getUTCDate() - 1)) {
    const key = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !isHoliday(key)) return key;
  }
}
