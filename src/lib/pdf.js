// Wochen-PDF (läuft im Browser und in Node)
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CONFIG } from '../config.js';
import { hhmm, fmtDate, fmtMin, DAY_NAMES } from './time.js';

const C = {
  text: rgb(0.1, 0.1, 0.12),
  muted: rgb(0.42, 0.44, 0.48),
  line: rgb(0.8, 0.81, 0.84),
  head: rgb(0.93, 0.94, 0.95),
  weekend: rgb(0.97, 0.97, 0.98),
  accent: rgb(0.08, 0.32, 0.55),
};

/**
 * @param w        Ergebnis von weekStats()
 * @param saldo    kumulierter Saldo inkl. dieser Woche (Minuten)
 * @param logo     Uint8Array (PNG oder JPG) oder null
 * @returns Uint8Array
 */
export async function buildWeekPdf(w, saldo, logo = null) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Arbeitszeitnachweis KW ${w.week} ${w.year}`);
  doc.setAuthor(CONFIG.employee);
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, M = 50;
  let y = 841.89 - M;

  const text = (s, x, yy, { f = font, size = 10, color = C.text, align = 'left' } = {}) => {
    const tw = f.widthOfTextAtSize(s, size);
    const xx = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
    page.drawText(s, { x: xx, y: yy, size, font: f, color });
  };
  const hline = (yy, x1 = M, x2 = W - M, t = 0.6, color = C.line) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color });

  // ---- Kopf: Logo links, Titel rechts ----
  const headTop = y;
  if (logo) {
    try {
      const isPng = logo[0] === 0x89 && logo[1] === 0x50;
      const img = isPng ? await doc.embedPng(logo) : await doc.embedJpg(logo);
      const maxH = 48, maxW = 200;
      const s = Math.min(maxH / img.height, maxW / img.width);
      page.drawImage(img, { x: M, y: headTop - img.height * s, width: img.width * s, height: img.height * s });
    } catch { /* Logo ungültig -> weglassen */ }
  }
  text('Arbeitszeitnachweis', W - M, headTop - 18, { f: bold, size: 18, align: 'right' });
  text(`KW ${w.week} / ${w.year}`, W - M, headTop - 34, { size: 11, color: C.accent, f: bold, align: 'right' });
  text(`${fmtDate(w.monday)} – ${fmtDate(w.sunday)}`, W - M, headTop - 48, { size: 10, color: C.muted, align: 'right' });
  y = headTop - 70;
  hline(y, M, W - M, 1.2, C.accent);

  // ---- Stammdaten ----
  y -= 24;
  const info = [['Mitarbeiter', CONFIG.employee], ['Firma', CONFIG.company], ['Sollzeit', `${fmtMin(CONFIG.sollDayMin * 5)} h / Woche (Mo–Fr)`]];
  for (const [k, v] of info) {
    text(k, M, y, { color: C.muted });
    text(v, M + 90, y, { f: bold });
    y -= 16;
  }

  // ---- Tabelle ----
  y -= 14;
  const cols = [
    { h: 'Tag', x: M + 6, a: 'left' },
    { h: 'Datum', x: M + 86, a: 'left' },
    { h: 'Ein', x: M + 196, a: 'right' },
    { h: 'Aus', x: M + 246, a: 'right' },
    { h: 'Pause', x: M + 300, a: 'right' },
    { h: 'Total', x: M + 354, a: 'right' },
    { h: 'Bemerkung', x: M + 372, a: 'left' },
  ];
  const rowH = 22;
  page.drawRectangle({ x: M, y: y - 7, width: W - 2 * M, height: rowH, color: C.head });
  for (const c of cols) text(c.h, c.x, y, { f: bold, size: 9.5, align: c.a });
  y -= rowH;

  let anyManual = false, anyAuto = false;
  for (const [i, d] of w.days.entries()) {
    if (i >= 5) page.drawRectangle({ x: M, y: y - 7, width: W - 2 * M, height: rowH, color: C.weekend });
    const has = !!d.in;
    const star = (b) => (b ? (anyManual = true, '*') : '');
    const vals = [
      DAY_NAMES[i],
      fmtDate(d.day),
      has ? hhmm(d.in) + star(d.manualIn) : '',
      has ? (d.out ? hhmm(d.out) + star(d.manualOut) : '?') : '',
      has ? fmtMin(d.pause) + star(d.manualPause) + (d.autoPause ? (anyAuto = true, '†') : '') : '',
      d.dayTotal ? fmtMin(d.dayTotal) : (d.soll ? '0:00' : ''),
    ];
    const notes = [d.label, d.incomplete ? 'Ausstempeln fehlt' : null].filter(Boolean).join(', ');
    vals.push(notes);
    cols.forEach((c, j) => text(vals[j], c.x, y, { size: 9.5, align: c.a, color: i >= 5 && !has ? C.muted : C.text }));
    hline(y - 7);
    y -= rowH;
  }

  // Wochentotal
  y -= 2;
  text('Wochentotal', cols[0].x, y, { f: bold, size: 10.5 });
  text(fmtMin(w.ist), cols[5].x, y, { f: bold, size: 10.5, align: 'right' });
  hline(y - 8, M, W - M, 1.2, C.text);

  // ---- Drei Felder ----
  y -= 80;
  const boxes = [['Soll', fmtMin(w.soll)], ['Differenz', fmtMin(w.diff, true)], ['Saldo total', fmtMin(saldo, true)]];
  const gap = 12, bw = (W - 2 * M - 2 * gap) / 3, bh = 50;
  boxes.forEach(([k, v], i) => {
    const x = M + i * (bw + gap);
    page.drawRectangle({ x, y, width: bw, height: bh, borderColor: C.line, borderWidth: 1 });
    text(k, x + 12, y + bh - 17, { size: 9, color: C.muted });
    text(v, x + 12, y + 12, { f: bold, size: 16, color: i === 2 ? C.accent : C.text });
  });

  // ---- Fussnoten ----
  y -= 26;
  const notes = [];
  if (anyManual) notes.push('* manuell korrigiert');
  if (anyAuto) notes.push('† Pause auf gesetzliches Minimum erhöht (ArG Art. 15)');
  notes.push('Feiertage, Ferien und Krankheit werden mit der Tagessollzeit gutgeschrieben.');
  for (const n of notes) { text(n, M, y, { size: 8.5, color: C.muted }); y -= 13; }

  text(`Erstellt am ${new Date().toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich' })}`, M, M - 10, { size: 8, color: C.muted });

  return doc.save();
}
