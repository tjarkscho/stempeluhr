// Wochen-PDF (läuft im Browser und in Node) – ruhiges, reduziertes Layout
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CONFIG } from '../config.js';
import { hhmm, fmtDate, fmtMin } from './time.js';
import { pdfText } from './pdf-i18n.js';

const C = {
  text: rgb(0.11, 0.12, 0.14),
  muted: rgb(0.48, 0.5, 0.54),
  faint: rgb(0.72, 0.73, 0.76),
  line: rgb(0.88, 0.89, 0.91),
  band: rgb(0.965, 0.968, 0.975),
  pos: rgb(0.1, 0.45, 0.25),
  neg: rgb(0.68, 0.16, 0.13),
};

/**
 * @param w        Ergebnis von weekStats()
 * @param saldo    kumulierter Saldo inkl. dieser Woche (Minuten)
 * @param logo     Uint8Array (PNG oder JPG) oder null
 * @returns Uint8Array
 */
/**
 * @param opts.draft  Zwischenstand der laufenden Woche: Werte bis jetzt, klar gekennzeichnet
 * @param opts.today  'YYYY-MM-DD' (für Zwischenstand: spätere Tage leer lassen)
 * @param opts.stamp  Text "Stand …"
 * @param opts.lang   'de' | 'fr'
 */
export async function buildWeekPdf(w, saldo, logo = null, opts = {}) {
  const t = pdfText(opts.lang);
  const doc = await PDFDocument.create();
  doc.setTitle(`${t.weekSheet} ${t.week} ${w.week} ${w.year}`);
  doc.setAuthor(CONFIG.employee);
  const W = 595.28, H = 841.89, M = 56;
  const page = doc.addPage([W, H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const text = (s, x, y, { f = font, size = 9.5, color = C.text, align = 'left' } = {}) => {
    const tw = f.widthOfTextAtSize(s, size);
    const xx = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
    page.drawText(s, { x: xx, y, size, font: f, color });
  };
  const hline = (y, t = 0.5, color = C.line, x1 = M, x2 = W - M) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color });
  const signed = (m) => (m < 0 ? C.neg : m > 0 ? C.pos : C.text);

  // ---- Kopf ----
  let y = H - M;
  if (logo) {
    try {
      const isPng = logo[0] === 0x89 && logo[1] === 0x50;
      const img = isPng ? await doc.embedPng(logo) : await doc.embedJpg(logo);
      const s = Math.min(34 / img.height, 160 / img.width);
      page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s });
    } catch { /* Logo ungültig -> weglassen */ }
  }
  text((opts.draft ? `${t.weekSheet} · ${t.draft}` : t.weekSheet).toUpperCase(), W - M, y - 10, { f: bold, size: 8, color: opts.draft ? C.neg : C.muted, align: 'right' });
  text(`${t.week} ${w.week}`, W - M, y - 34, { f: bold, size: 22, align: 'right' });
  y -= 62;
  text(`${fmtDate(w.monday)} – ${fmtDate(w.sunday)}${opts.draft ? ` · ${opts.stamp}` : ''}`, W - M, y + 8, { size: 9, color: C.muted, align: 'right' });

  // ---- Stammdaten in einer Zeile ----
  y -= 22;
  const meta = [[t.employee, CONFIG.employee], [t.company, CONFIG.company], [t.target, `${fmtMin(CONFIG.sollDayMin * 5)} ${t.perWeek}`]];
  const colW = (W - 2 * M) / 3;
  meta.forEach(([k, v], i) => {
    text(k.toUpperCase(), M + i * colW, y, { size: 7, color: C.muted, f: bold });
    text(v, M + i * colW, y - 14, { size: 10 });
  });
  y -= 34;
  hline(y);

  // ---- Tabelle ----
  y -= 26;
  const X = { day: M, date: M + 78, in: M + 190, out: M + 240, pause: M + 296, total: M + 350, note: M + 370 };
  const head = [[t.day, X.day, 'left'], [t.date, X.date, 'left'], [t.in, X.in, 'right'], [t.out, X.out, 'right'],
    [t.pause, X.pause, 'right'], [t.total, X.total, 'right'], [t.note, X.note, 'left']];
  for (const [h, x, a] of head) text(h.toUpperCase(), x, y, { size: 7, f: bold, color: C.muted, align: a });
  y -= 10;
  hline(y, 0.8, C.faint);

  const rowH = 24;
  let anyManual = false, anyAuto = false;
  for (const [i, d] of w.days.entries()) {
    y -= rowH;
    const has = !!d.in;
    const weekend = i >= 5;
    if (weekend && !has) {
      text(t.days[i], X.day, y + 8, { color: C.faint });
      text(fmtDate(d.day), X.date, y + 8, { color: C.faint });
      continue;
    }
    const star = (b) => (b ? (anyManual = true, '*') : '');
    text(t.days[i], X.day, y + 8);
    text(fmtDate(d.day), X.date, y + 8, { color: C.muted });
    if (has) {
      text(hhmm(d.in) + star(d.manualIn), X.in, y + 8, { align: 'right' });
      text(d.out ? hhmm(d.out) + star(d.manualOut) : '–', X.out, y + 8, { align: 'right' });
      text(fmtMin(d.pause) + star(d.manualPause) + (d.autoPause ? (anyAuto = true, '†') : ''), X.pause, y + 8, { align: 'right', color: C.muted });
    }
    const future = opts.draft && opts.today && d.day > opts.today;
    const tot = future ? '' : d.dayTotal ? fmtMin(d.dayTotal) : (d.soll ? '0:00' : '');
    text(tot, X.total, y + 8, { align: 'right', f: bold });
    const notes = [t.label(d.label), d.bonus ? `+${Math.round(d.rate * 100)} % (+${fmtMin(d.bonus)})` : null,
      d.incomplete ? t.missingOut : null].filter(Boolean).join(' · ');
    if (notes) text(notes, X.note, y + 8, { size: 8.5, color: C.muted });
    hline(y, 0.4);
  }

  // ---- Zusammenfassung: ein ruhiges Band (Ist = Wochentotal) ----
  y -= 30 + 58;
  const bandH = 58;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: bandH, color: C.band });
  const soll = opts.draft ? w.sollToDate : w.soll, ist = opts.draft ? w.istToDate : w.ist, diff = opts.draft ? w.diffToDate : w.diff;
  const cells = [[opts.draft ? t.sollToday : t.soll, fmtMin(soll), C.text], [opts.draft ? t.istToday : t.ist, fmtMin(ist), C.text],
    [t.diff, fmtMin(diff, true), signed(diff)], [t.saldo, fmtMin(saldo, true), signed(saldo)]];
  const cw = (W - 2 * M) / cells.length;
  cells.forEach(([k, v, col], i) => {
    const x = M + 16 + i * cw;
    text(k.toUpperCase(), x, y + bandH - 20, { size: 7, f: bold, color: C.muted });
    text(v, x, y + 14, { size: 17, f: bold, color: col });
    if (i) page.drawLine({ start: { x: M + i * cw, y: y + 12 }, end: { x: M + i * cw, y: y + bandH - 12 }, thickness: 0.5, color: C.line });
  });

  // ---- Fussnoten ----
  y -= 26;
  const notes = [];
  if (opts.draft) notes.push(t.draftNote(opts.stamp || ''));
  if (anyManual) notes.push(t.manual);
  if (anyAuto) notes.push(t.autoBreak);
  notes.push(t.weekRules);
  for (const n of notes) { text(n, M, y, { size: 7.5, color: C.muted }); y -= 12; }

  // ---- Fusszeile ----
  hline(M - 6, 0.4);
  text(`${CONFIG.employee} · ${CONFIG.company}`, M, M - 20, { size: 7.5, color: C.faint });
  text(t.created(t.today()), W - M, M - 20, { size: 7.5, color: C.faint, align: 'right' });

  return doc.save();
}
