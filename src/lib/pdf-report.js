// Monats- und Jahres-PDF – gleicher ruhiger Stil wie das Wochenblatt
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CONFIG } from '../config.js';
import { hhmm, fmtDate, fmtMin, isoWeek, weekday } from './time.js';

const C = {
  text: rgb(0.11, 0.12, 0.14),
  muted: rgb(0.48, 0.5, 0.54),
  faint: rgb(0.72, 0.73, 0.76),
  line: rgb(0.88, 0.89, 0.91),
  band: rgb(0.965, 0.968, 0.975),
  pos: rgb(0.1, 0.45, 0.25),
  neg: rgb(0.68, 0.16, 0.13),
};
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

async function setup(title, logo) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(CONFIG.employee);
  const W = 595.28, H = 841.89, M = 50;
  const page = doc.addPage([W, H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = (s, x, y, { f = font, size = 9, color = C.text, align = 'left' } = {}) => {
    const tw = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: align === 'right' ? x - tw : x, y, size, font: f, color });
  };
  const hline = (y, t = 0.5, color = C.line) =>
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: t, color });
  let img = null;
  if (logo) {
    try { img = (logo[0] === 0x89 && logo[1] === 0x50) ? await doc.embedPng(logo) : await doc.embedJpg(logo); } catch { img = null; }
  }
  return { doc, page, W, H, M, font, bold, text, hline, img };
}

function header(ctx, kicker, big, sub) {
  const { page, W, H, M, bold, text, hline, img } = ctx;
  let y = H - M;
  if (img) {
    const s = Math.min(32 / img.height, 150 / img.width);
    page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s });
  }
  text(kicker, W - M, y - 10, { f: bold, size: 8, color: C.muted, align: 'right' });
  text(big, W - M, y - 32, { f: bold, size: 20, align: 'right' });
  text(sub, W - M, y - 46, { size: 9, color: C.muted, align: 'right' });
  y -= 76;
  const meta = [['Mitarbeiter', CONFIG.employee], ['Firma', CONFIG.company], ['Sollzeit', `${fmtMin(CONFIG.sollDayMin * 5)} h / Woche`]];
  const colW = (W - 2 * M) / 3;
  meta.forEach(([k, v], i) => {
    text(k.toUpperCase(), M + i * colW, y, { size: 7, color: C.muted, f: bold });
    text(v, M + i * colW, y - 13, { size: 9.5 });
  });
  y -= 28;
  hline(y);
  return y;
}

function band(ctx, y, cells) {
  const { page, W, M, bold, text } = ctx;
  const h = 54;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: h, color: C.band });
  const cw = (W - 2 * M) / cells.length;
  cells.forEach(([k, v, col], i) => {
    const x = M + 14 + i * cw;
    text(k.toUpperCase(), x, y + h - 19, { size: 7, f: bold, color: C.muted });
    text(v, x, y + 13, { size: 15, f: bold, color: col || C.text });
    if (i) page.drawLine({ start: { x: M + i * cw, y: y + 11 }, end: { x: M + i * cw, y: y + h - 11 }, thickness: 0.5, color: C.line });
  });
}

function footer(ctx, notes, yNotes) {
  const { M, W, text, hline } = ctx;
  let y = yNotes;
  for (const n of notes) { text(n, M, y, { size: 7.5, color: C.muted }); y -= 11; }
  hline(M - 6, 0.4);
  text(`${CONFIG.employee} · ${CONFIG.company}`, M, M - 19, { size: 7.5, color: C.faint });
  text(`Erstellt am ${new Date().toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich' })}`, W - M, M - 19, { size: 7.5, color: C.faint, align: 'right' });
}

const signed = (m) => (m < 0 ? C.neg : m > 0 ? C.pos : C.text);

/**
 * Monatsübersicht
 * @param ym    'YYYY-MM'
 * @param st    rangeStats() des Monats
 * @param saldo Saldo total am Monatsende (bzw. heute)
 */
export async function buildMonthPdf(ym, st, saldo, logo = null) {
  const [y0, m0] = ym.split('-').map(Number);
  const name = `${MONTHS_DE[m0 - 1]} ${y0}`;
  const ctx = await setup(`Arbeitszeit ${name}`, logo);
  const { M, W, bold, text, hline } = ctx;
  let y = header(ctx, 'MONATSÜBERSICHT', name, `${fmtDate(st.from)} – ${fmtDate(st.to)}${st.partial ? ' · Stand heute' : ''}`);

  y -= 20;
  const X = { day: M, date: M + 24, kw: M + 92, in: M + 160, out: M + 205, pause: M + 252, total: M + 300, note: M + 318 };
  for (const [h, x, a] of [['Tag', X.day], ['Datum', X.date], ['KW', X.kw], ['Ein', X.in, 'right'], ['Aus', X.out, 'right'],
    ['Pause', X.pause, 'right'], ['Total', X.total, 'right'], ['Bemerkung', X.note]]) text(h.toUpperCase(), x, y, { size: 6.5, f: bold, color: C.muted, align: a });
  y -= 7;
  hline(y, 0.8, C.faint);

  // Zeilenhöhe so wählen, dass Zusammenfassung + 4 Fussnoten sicher über der Fusszeile Platz haben
  const reserve = 24 + 54 + 20 + 4 * 11 + 14 + M;
  const rowH = Math.min(16.2, (y - reserve) / st.days.length);
  let manual = false;
  for (const d of st.days) {
    y -= rowH;
    const wd = weekday(d.day);
    const has = !!d.in;
    const quiet = (wd >= 5 && !has) || !d.counted || (!d.done && !has);
    const col = quiet ? C.faint : C.text;
    text(DAYS[wd], X.day, y + 5, { color: col });
    text(fmtDate(d.day), X.date, y + 5, { color: quiet ? C.faint : C.muted });
    if (wd === 0) text(String(isoWeek(d.day).week), X.kw, y + 5, { color: C.muted, size: 8 });
    if (has) {
      const st_ = (b) => (b ? (manual = true, '*') : '');
      text(hhmm(d.in) + st_(d.manualIn), X.in, y + 5, { align: 'right', color: col });
      text(d.out ? hhmm(d.out) + st_(d.manualOut) : '–', X.out, y + 5, { align: 'right', color: col });
      text(fmtMin(d.pause), X.pause, y + 5, { align: 'right', color: C.muted });
    }
    if (d.counted && d.done && (d.dayTotal || d.soll)) text(fmtMin(d.dayTotal), X.total, y + 5, { align: 'right', f: bold, color: col });
    const notes = [d.label, d.bonus ? `+${Math.round(d.rate * 100)} %` : null].filter(Boolean).join(' · ');
    if (notes) text(notes, X.note, y + 5, { size: 8, color: C.muted });
    if (wd === 6) hline(y, 0.5, C.line);
  }

  y -= 24 + 54;
  band(ctx, y, [['Soll', fmtMin(st.soll)], ['Ist', fmtMin(st.ist)], ['Differenz', fmtMin(st.diff, true), signed(st.diff)],
    ['Saldo total', fmtMin(saldo, true), signed(saldo)]]);
  const notes = [];
  if (manual) notes.push('* manuell korrigiert');
  notes.push(`Ferien: ${st.vacation} Tag(e) · Krank: ${st.sick} Tag(e) · Zuschläge: ${fmtMin(st.bonus)}`);
  notes.push('Pausen nach ArG Art. 15 · Zuschlag als Zeit: Sa +25 %, So/Feiertag +50 % · Überstunden Mo–Fr 1:1');
  if (st.partial) notes.push('Laufender Monat: Werte bis und mit heute.');
  footer(ctx, notes, y - 20);
  return ctx.doc.save();
}

/**
 * Jahresübersicht
 * @param year   Zahl
 * @param months Array von { ym, st, saldo } (12 Einträge)
 * @param total  rangeStats() des ganzen Jahres
 * @param saldo  Saldo total am Jahresende (bzw. heute)
 */
export async function buildYearPdf(year, months, total, saldo, logo = null) {
  const ctx = await setup(`Arbeitszeit ${year}`, logo);
  const { M, bold, text, hline } = ctx;
  let y = header(ctx, 'JAHRESÜBERSICHT', String(year), `01.01.${year} – 31.12.${year}${total.partial ? ' · Stand heute' : ''}`);

  y -= 22;
  const X = { m: M, soll: M + 150, ist: M + 215, diff: M + 285, bonus: M + 350, vac: M + 405, sick: M + 450, saldo: M + 495 };
  for (const [h, x, a] of [['Monat', X.m], ['Soll', X.soll, 'right'], ['Ist', X.ist, 'right'], ['Differenz', X.diff, 'right'],
    ['Zuschlag', X.bonus, 'right'], ['Ferien', X.vac, 'right'], ['Krank', X.sick, 'right'], ['Saldo', X.saldo, 'right']])
    text(h.toUpperCase(), x, y, { size: 6.5, f: bold, color: C.muted, align: a });
  y -= 8;
  hline(y, 0.8, C.faint);

  const rowH = 24;
  for (const { ym, st, saldo: sm } of months) {
    y -= rowH;
    const m = +ym.slice(5, 7);
    const empty = !st.soll && !st.ist;
    const col = empty ? C.faint : C.text;
    text(MONTHS_DE[m - 1], X.m, y + 8, { color: col });
    if (!empty) {
      text(fmtMin(st.soll), X.soll, y + 8, { align: 'right', color: C.muted });
      text(fmtMin(st.ist), X.ist, y + 8, { align: 'right', f: bold });
      text(fmtMin(st.diff, true), X.diff, y + 8, { align: 'right', color: signed(st.diff) });
      text(st.bonus ? fmtMin(st.bonus) : '–', X.bonus, y + 8, { align: 'right', color: C.muted });
      text(String(st.vacation || '–'), X.vac, y + 8, { align: 'right', color: C.muted });
      text(String(st.sick || '–'), X.sick, y + 8, { align: 'right', color: C.muted });
      text(fmtMin(sm, true), X.saldo, y + 8, { align: 'right', f: bold, color: signed(sm) });
    }
    hline(y, 0.4);
  }

  y -= 30 + 54;
  band(ctx, y, [['Soll', fmtMin(total.soll)], ['Ist', fmtMin(total.ist)], ['Differenz', fmtMin(total.diff, true), signed(total.diff)],
    ['Saldo total', fmtMin(saldo, true), signed(saldo)]]);
  footer(ctx, [
    `Ferien: ${total.vacation} Tag(e) · Krank: ${total.sick} Tag(e) · Zuschläge: ${fmtMin(total.bonus)}`,
    'Saldo = Stand am Monatsende · Pausen nach ArG Art. 15 · Zuschlag als Zeit: Sa +25 %, So/Feiertag +50 % · Überstunden Mo–Fr 1:1',
    ...(total.partial ? ['Laufendes Jahr: Werte bis und mit heute.'] : []),
  ], y - 20);
  return ctx.doc.save();
}
