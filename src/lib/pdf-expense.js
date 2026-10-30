// Monatliches Spesenblatt – gleicher ruhiger Stil wie Wochen-/Monats-PDF, Belegfotos im Anhang
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CONFIG } from '../config.js';
import { fmtDate } from './time.js';
import { expenseTotals, fmtChf, CATEGORIES, cleanRoute } from './receipt.js';
import { pdfText } from './pdf-i18n.js';

const C = {
  text: rgb(0.11, 0.12, 0.14),
  muted: rgb(0.27, 0.29, 0.32),   // dunkler, damit es gedruckt gut lesbar ist
  faint: rgb(0.5, 0.52, 0.55),
  line: rgb(0.7, 0.71, 0.74),
  band: rgb(0.93, 0.935, 0.945),
  neg: rgb(0.68, 0.16, 0.13),
};
export const CAT_DE = { essen: 'Verpflegung', fahrt: 'Fahrt', material: 'Material', uebernachtung: 'Übernachtung', anderes: 'Anderes', km: 'Fahrt Privatauto' };
const kmTxt = (km) => String(Number(km)).replace('.', ',');
// doppelte "und zurück" (alte Einträge) bereinigen
// Beschreibung: Hauptzeile + graue Zusatzzeile (bei Kilometern die Rechnung)
// Rück-Zusatz in der Sprache des Blatts
const routeIn = (r, t) => cleanRoute(r).replace(/\s*(und zurück|aller-retour)$/i, (m) => (m ? ` ${t.retSuffix}` : ''));
const descMain = (it, t) => (it.category === 'km' ? routeIn(it.route, t) || t.trip : it.note || '');
const descSub = (it, t = {}) => (it.category === 'km'
  ? [`${kmTxt(it.km)} km x CHF ${fmtChf(CONFIG.kmRate)}`, it.note].filter(Boolean).join(' · ')
  : [it.currency && it.currency !== 'CHF' && it.amount_orig != null ? `${it.currency} ${fmtChf(it.amount_orig)} x ${Number(it.rate).toFixed(4)}` : '',
    it.photo_path ? '' : t.noReceipt].filter(Boolean).join(' · '));

// Helvetica (WinAnsi) kann nicht alle Zeichen – Unbekanntes ersetzen statt abstürzen
const safe = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^\x20-\x7E\xA0-\xFF€]/g, '');

/**
 * @param ym     'YYYY-MM'
 * @param items  [{ id, day, amount, category, note }] (nach Datum sortiert)
 * @param photos Map(id -> Uint8Array JPG/PNG)
 * @param logo   Uint8Array | null
 * @param opts   { draft: bool, stamp: 'Stand …', receiptsOnly: nur die Belegfotos, lang: 'de' | 'fr' }
 */
export async function buildExpensePdf(ym, items, photos = new Map(), logo = null, opts = {}) {
  const [y, m] = ym.split('-').map(Number);
  const t = pdfText(opts.lang);
  const CAT = t.cat;
  const name = `${t.months[m - 1]} ${y}`;
  const doc = await PDFDocument.create();
  doc.setTitle(opts.receiptsOnly ? `${t.receipts} ${name}` : `${t.expSheet} ${name}`);
  doc.setAuthor(CONFIG.employee);
  const W = 595.28, H = 841.89, M = 50;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let img = null;
  if (logo) { try { img = (logo[0] === 0x89 && logo[1] === 0x50) ? await doc.embedPng(logo) : await doc.embedJpg(logo); } catch { img = null; } }

  let page;
  const text = (s, x, y_, { f = font, size = 9, color = C.text, align = 'left', maxW } = {}) => {
    let str = safe(s);
    if (maxW && f.widthOfTextAtSize(str, size) > maxW) {
      while (str.length > 1 && f.widthOfTextAtSize(str + '...', size) > maxW) str = str.slice(0, -1);
      str += '...';
    }
    const tw = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x, y: y_, size, font: f, color });
  };
  const hline = (y_, t = 0.5, color = C.line, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: y_ }, end: { x: x2, y: y_ }, thickness: t, color });
  const footer = (n) => {
    hline(M - 6, 0.4);
    text(`${CONFIG.employee} · ${CONFIG.company}`, M, M - 19, { size: 7.5, color: C.faint });
    text(t.expFooter(name, n), W - M, M - 19, { size: 7.5, color: C.faint, align: 'right' });
  };
  let pageNo = 0;
  const newPage = () => { page = doc.addPage([W, H]); pageNo++; footer(pageNo); };

  if (!opts.receiptsOnly) {
  // ---- Kopf ----
  newPage();
  let yy = H - M;
  if (img) {
    const s = Math.min(32 / img.height, 150 / img.width);
    page.drawImage(img, { x: M, y: yy - img.height * s, width: img.width * s, height: img.height * s });
  }
  text((opts.draft ? `${t.expSheet} · ${t.draft}` : t.expSheet).toUpperCase(), W - M, yy - 10, { f: bold, size: 8, color: opts.draft ? C.neg : C.muted, align: 'right' });
  text(name, W - M, yy - 32, { f: bold, size: 20, align: 'right' });
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  text(`01.${String(m).padStart(2, '0')}.${y} – ${last}.${String(m).padStart(2, '0')}.${y}${opts.draft ? ` · ${opts.stamp || ''}` : ''}`, W - M, yy - 46, { size: 9, color: C.muted, align: 'right' });
  yy -= 76;
  const meta = [[t.employee, CONFIG.employee], [t.company, CONFIG.company], [t.receipts, String(items.length)]];
  const colW = (W - 2 * M) / 3;
  meta.forEach(([k, v], i) => {
    text(k.toUpperCase(), M + i * colW, yy, { size: 7, color: C.muted, f: bold });
    text(v, M + i * colW, yy - 13, { size: 9.5 });
  });
  yy -= 28;
  hline(yy);

  // ---- Tabelle ----
  const X = { nr: M, date: M + 30, cat: M + 96, note: M + 180, amt: W - M };
  const head = () => {
    yy -= 20;
    for (const [h, x, a] of [[t.nr, X.nr], [t.date, X.date], [t.category, X.cat], [t.desc, X.note], [t.amount, X.amt, 'right']])
      text(h.toUpperCase(), x, yy, { size: 6.5, f: bold, color: C.muted, align: a });
    yy -= 8;
    hline(yy, 0.8, C.faint);
  };
  head();
  // Beschreibung umbrechen statt abschneiden
  const descW = X.amt - X.note - 64;
  const wrap = (str, size) => {
    const words = safe(str).split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > descW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  items.forEach((it, i) => {
    const main = wrap(descMain(it, t) || '–', 9), sub = descSub(it, t) ? wrap(descSub(it, t), 7.5) : [];
    const rowH = Math.max(20, 9 + main.length * 11 + sub.length * 9.5);
    if (yy - rowH < M + 30) { newPage(); yy = H - M; head(); }
    yy -= rowH;
    const top = yy + rowH - 13;
    text(String(i + 1), X.nr, top, { color: C.muted });
    text(fmtDate(it.day), X.date, top);
    text(CAT[it.category] || CAT.anderes, X.cat, top, { color: C.muted });
    main.forEach((l, k) => text(l, X.note, top - k * 11, { color: descMain(it, t) ? C.text : C.faint }));
    sub.forEach((l, k) => text(l, X.note, top - main.length * 11 - k * 9.5 + 1, { size: 7.5, color: C.muted }));
    text(fmtChf(it.amount), X.amt, top, { align: 'right', f: bold });
    hline(yy, 0.4);
  });
  if (!items.length) { yy -= 20; text(t.noReceipts, M, yy + 7, { color: C.muted }); }

  // ---- Zusammenfassung ----
  const tot = expenseTotals(items);
  const cats = CATEGORIES.filter((c) => tot.byCat[c] > 0);
  const need = 30 + 54 + 110;
  if (yy - need < M + 20) { newPage(); yy = H - M; }
  yy -= 30 + 54;
  const cells = [...cats.map((c) => [c === 'km' ? t.privateCar : CAT[c], fmtChf(tot.byCat[c])]), [t.totalChf, fmtChf(tot.total)]].slice(-6);
  const bandH = 54, cw = (W - 2 * M) / cells.length;
  page.drawRectangle({ x: M, y: yy, width: W - 2 * M, height: bandH, color: C.band });
  cells.forEach(([k, v], i) => {
    const x = M + 14 + i * cw, isTot = i === cells.length - 1;
    text(k.toUpperCase(), x, yy + bandH - 19, { size: 7, f: bold, color: C.muted });
    text(v, x, yy + 13, { size: isTot ? 16 : 13, f: bold, color: C.text });
    if (i) page.drawLine({ start: { x: M + i * cw, y: yy + 11 }, end: { x: M + i * cw, y: yy + bandH - 11 }, thickness: 0.5, color: C.line });
  });

  // ---- Fussnoten (keine Unterschriftsfelder) ----
  yy -= 24;
  if (opts.draft) text(t.expDraftNote(opts.stamp || ''), M, yy, { size: 7.5, color: C.muted });
  else if (items.some((it) => it.photo_path)) text(t.photosSeparate, M, yy, { size: 7.5, color: C.muted });
  if (items.some((it) => it.category === 'km')) { yy -= 11; text(t.kmRule(fmtChf(CONFIG.kmRate)), M, yy, { size: 7.5, color: C.muted }); }

  }

  // ---- Belegfotos: 2 pro Seite ----
  const withPhoto = items.map((it, i) => ({ it, nr: i + 1, bytes: photos.get(it.id) })).filter((x) => x.bytes);
  for (let k = 0; k < withPhoto.length; k += 2) {
    newPage();
    const slotH = (H - 2 * M - 20) / 2;
    for (let j = 0; j < 2 && k + j < withPhoto.length; j++) {
      const { it, nr, bytes } = withPhoto[k + j];
      const top = H - M - j * (slotH + 20);
      const cap = `${t.receipt} ${nr}`, cx = M + bold.widthOfTextAtSize(cap, 10) + 12;
      text(cap, M, top - 10, { f: bold, size: 10 });
      text(`${fmtDate(it.day)} · ${CAT[it.category] || ''} · CHF ${fmtChf(it.amount)}${it.note ? ` · ${it.note}` : ''}`, cx, top - 10,
        { size: 9, color: C.muted, maxW: W - M - cx });
      let ph = null;
      try { ph = (bytes[0] === 0x89 && bytes[1] === 0x50) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); } catch { ph = null; }
      const boxW = W - 2 * M, boxH = slotH - 26;
      if (!ph) { text(t.photoBad, M, top - 40, { color: C.neg }); continue; }
      const s = Math.min(boxW / ph.width, boxH / ph.height);
      const w = ph.width * s, h = ph.height * s;
      page.drawImage(ph, { x: M + (boxW - w) / 2, y: top - 22 - h, width: w, height: h });
    }
  }
  return doc.save();
}
