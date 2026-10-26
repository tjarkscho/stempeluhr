// Monats- und Jahres-PDF – gleicher ruhiger Stil wie das Wochenblatt
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CONFIG } from '../config.js';
import { hhmm, fmtDate, fmtMin, isoWeek, weekday } from './time.js';
import { pdfText } from './pdf-i18n.js';

const C = {
  text: rgb(0.11, 0.12, 0.14),
  muted: rgb(0.27, 0.29, 0.32),   // dunkler, damit es gedruckt gut lesbar ist
  faint: rgb(0.5, 0.52, 0.55),
  line: rgb(0.7, 0.71, 0.74),
  band: rgb(0.93, 0.935, 0.945),
  pos: rgb(0.1, 0.45, 0.25),
  neg: rgb(0.68, 0.16, 0.13),
};
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

async function setup(title, logo, t) {
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
  return { doc, page, W, H, M, font, bold, text, hline, img, t };
}

function header(ctx, kicker, big, sub) {
  const { page, W, H, M, bold, text, hline, img, t } = ctx;
  let y = H - M;
  if (img) {
    const s = Math.min(32 / img.height, 150 / img.width);
    page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s });
  }
  text(kicker, W - M, y - 10, { f: bold, size: 8, color: C.muted, align: 'right' });
  text(big, W - M, y - 32, { f: bold, size: 20, align: 'right' });
  text(sub, W - M, y - 46, { size: 9, color: C.muted, align: 'right' });
  y -= 76;
  const meta = [[t.employee, CONFIG.employee], [t.company, CONFIG.company], [t.target, `${fmtMin(CONFIG.sollDayMin * 5)} ${t.perWeek}`]];
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
  const { M, W, text, hline, t } = ctx;
  let y = yNotes;
  for (const n of notes) { text(n, M, y, { size: 7.5, color: C.muted }); y -= 11; }
  hline(M - 6, 0.4);
  text(`${CONFIG.employee} · ${CONFIG.company}`, M, M - 19, { size: 7.5, color: C.faint });
  text(t.created(t.today()), W - M, M - 19, { size: 7.5, color: C.faint, align: 'right' });
}

const signed = (m) => (m < 0 ? C.neg : m > 0 ? C.pos : C.text);

/**
 * Monatsübersicht
 * @param ym    'YYYY-MM'
 * @param st    rangeStats() des Monats
 * @param saldo Saldo total am Monatsende (bzw. heute)
 */
export async function buildMonthPdf(ym, st, saldo, logo = null, opts = {}) {
  const t = pdfText(opts.lang);
  const [y0, m0] = ym.split('-').map(Number);
  const name = `${t.months[m0 - 1]} ${y0}`;
  const ctx = await setup(`${t.monthSheet} ${name}`, logo, t);
  const { M, W, bold, text, hline } = ctx;
  let y = header(ctx, t.monthSheet.toUpperCase(), name, `${fmtDate(st.from)} – ${fmtDate(st.to)}${st.partial ? ` · ${t.asOfToday}` : ''}`);

  y -= 20;
  const X = { day: M, date: M + 24, kw: M + 92, in: M + 160, out: M + 205, pause: M + 252, total: M + 300, note: M + 318 };
  for (const [h, x, a] of [[t.day, X.day], [t.date, X.date], [t.week, X.kw], [t.in, X.in, 'right'], [t.out, X.out, 'right'],
    [t.pause, X.pause, 'right'], [t.total, X.total, 'right'], [t.note, X.note]]) text(h.toUpperCase(), x, y, { size: 6.5, f: bold, color: C.muted, align: a });
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
    text(t.daysShort[wd], X.day, y + 5, { color: col });
    text(fmtDate(d.day), X.date, y + 5, { color: quiet ? C.faint : C.muted });
    if (wd === 0) text(String(isoWeek(d.day).week), X.kw, y + 5, { color: C.muted, size: 8 });
    if (has) {
      const st_ = (b) => (b ? (manual = true, '*') : '');
      text(hhmm(d.in) + st_(d.manualIn), X.in, y + 5, { align: 'right', color: col });
      text(d.out ? hhmm(d.out) + st_(d.manualOut) : '–', X.out, y + 5, { align: 'right', color: col });
      text(fmtMin(d.pause), X.pause, y + 5, { align: 'right', color: C.muted });
    }
    if (d.counted && d.done && (d.dayTotal || d.soll)) text(fmtMin(d.dayTotal), X.total, y + 5, { align: 'right', f: bold, color: col });
    const notes = [t.label(d.label), d.bonus ? `+${Math.round(d.rate * 100)} %` : null].filter(Boolean).join(' · ');
    if (notes) text(notes, X.note, y + 5, { size: 8, color: C.muted });
    if (wd === 6) hline(y, 0.5, C.line);
  }

  y -= 24 + 54;
  band(ctx, y, [[t.soll, fmtMin(st.soll)], [t.ist, fmtMin(st.ist)], [t.diff, fmtMin(st.diff, true), signed(st.diff)],
    [t.saldo, fmtMin(saldo, true), signed(saldo)]]);
  const notes = [];
  if (manual) notes.push(t.manual);
  notes.push(t.monthSums(st.vacation, st.sick, fmtMin(st.bonus)));
  notes.push(t.monthRules);
  if (st.partial) notes.push(t.monthPartial);
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
export async function buildYearPdf(year, months, total, saldo, logo = null, opts = {}) {
  const t = pdfText(opts.lang);
  const ctx = await setup(`${t.yearSheet} ${year}`, logo, t);
  const { M, bold, text, hline } = ctx;
  let y = header(ctx, t.yearSheet.toUpperCase(), String(year), `01.01.${year} – 31.12.${year}${total.partial ? ` · ${t.asOfToday}` : ''}`);

  y -= 22;
  const X = { m: M, soll: M + 150, ist: M + 215, diff: M + 285, bonus: M + 350, vac: M + 405, sick: M + 450, saldo: M + 495 };
  for (const [h, x, a] of [[t.month, X.m], [t.soll, X.soll, 'right'], [t.ist, X.ist, 'right'], [t.diff, X.diff, 'right'],
    [t.bonus, X.bonus, 'right'], [t.vacation, X.vac, 'right'], [t.sick, X.sick, 'right'], [t.saldoShort, X.saldo, 'right']])
    text(h.toUpperCase(), x, y, { size: 6.5, f: bold, color: C.muted, align: a });
  y -= 8;
  hline(y, 0.8, C.faint);

  const rowH = 24;
  for (const { ym, st, saldo: sm } of months) {
    y -= rowH;
    const m = +ym.slice(5, 7);
    const empty = !st.soll && !st.ist;
    const col = empty ? C.faint : C.text;
    text(t.months[m - 1], X.m, y + 8, { color: col });
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
  band(ctx, y, [[t.soll, fmtMin(total.soll)], [t.ist, fmtMin(total.ist)], [t.diff, fmtMin(total.diff, true), signed(total.diff)],
    [t.saldo, fmtMin(saldo, true), signed(saldo)]]);
  footer(ctx, [
    t.monthSums(total.vacation, total.sick, fmtMin(total.bonus)),
    t.yearRules,
    ...(total.partial ? [t.yearPartial] : []),
  ], y - 20);
  return ctx.doc.save();
}
