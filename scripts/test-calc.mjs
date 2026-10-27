// Selbsttest der Berechnungslogik:  npm test
import assert from 'node:assert/strict';
import { effectiveBreak, dayStats, groupByDay, weekStats, saldoThrough, validateDay } from '../src/lib/calc.js';
import { zurichToDate, dayKey, hhmm, isoWeek } from '../src/lib/time.js';
import { holidaysOf } from '../src/lib/holidays.js';

const ev = (day, list) => list.map(([kind, t], i) => ({ id: day + i, kind, ts: zurichToDate(day, t).toISOString(), manual: false }));

// ArG Art. 15
assert.equal(effectiveBreak(8 * 60 + 30, 0), 30);   // 8:30 Präsenz -> 30 min
assert.equal(effectiveBreak(8 * 60 + 30, 45), 45);  // mehr gestempelt -> bleibt
assert.equal(effectiveBreak(6 * 60, 0), 15);        // 6:00 -> 15 min
assert.equal(effectiveBreak(5 * 60, 0), 0);         // 5:00 -> keine
assert.equal(effectiveBreak(7 * 60 + 10, 0), 15);   // 7:10 -> 15 (6:55 Arbeit)
assert.equal(effectiveBreak(10 * 60, 0), 60);       // 10:00 -> 60

// Zeitzone / Sommerzeit
assert.equal(hhmm(zurichToDate('2026-07-01', '07:30')), '07:30');
assert.equal(hhmm(zurichToDate('2026-12-01', '07:30')), '07:30');
assert.equal(dayKey(zurichToDate('2026-10-25', '00:30')), '2026-10-25');
assert.deepEqual(isoWeek('2026-10-23'), { year: 2026, week: 43 });
assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 });

// Feiertage VD
const h26 = holidaysOf(2026);
for (const d of ['2026-04-03', '2026-04-06', '2026-05-14', '2026-05-25', '2026-09-21']) assert.ok(h26.has(d), d);

// Tag mit Pause
const d1 = dayStats(ev('2026-10-26', [['in', '07:00'], ['break_start', '12:00'], ['break_end', '12:20'], ['out', '16:00']]), false);
assert.equal(d1.stamped, 20); assert.equal(d1.pause, 30); assert.equal(d1.total, 510); assert.ok(d1.autoPause);

// Aus/Ein-Lücke zählt als Pause
const d2 = dayStats(ev('2026-10-27', [['in', '07:00'], ['out', '12:00'], ['in', '13:00'], ['out', '16:00']]), false);
assert.equal(d2.pause, 60); assert.equal(d2.total, 480);

// Reihenfolge
assert.equal(validateDay([{ kind: 'out' }]) !== null, true);
assert.equal(validateDay(ev('2026-11-02', [['in', '07:00'], ['out', '08:00']])), null);

// Woche + Saldo (Start 22.10.2026, Do)
const entries = [
  ...ev('2026-10-23', [['in', '07:00'], ['out', '16:00']]),            // 9:00 - 0:30 = 8:30
  ...ev('2026-10-26', [['in', '07:00'], ['out', '15:30']]),            // 8:00
];
const by = groupByDay(entries);
const abs = new Map([['2026-10-27', 'ferien']]);
const now = new Date('2026-11-10T10:00:00Z');
const w1 = weekStats('2026-10-19', by, abs, now);
assert.equal(w1.soll, 960); assert.equal(w1.ist, 510); assert.equal(w1.diff, -450);
const w2 = weekStats('2026-10-26', by, abs, now);
assert.equal(w2.soll, 2400); assert.equal(w2.ist, 960); // 8:00 + Ferien 8:00
assert.equal(saldoThrough('2026-10-26', by, abs, now), -450 + 960 - 2400);

console.log('Alle Tests OK');

// Tage vor Startdatum zählen nicht
const pre = weekStats('2026-10-19', groupByDay(ev('2026-10-20', [['in', '07:00'], ['out', '16:00']])), new Map(), now);
assert.equal(pre.ist, 0); assert.equal(pre.soll, 960);
console.log('Starttag-Test OK');

// Laufende Woche: Differenz nur bis heute
{
  const nowThu = new Date('2026-10-22T17:00:00Z'); // Do 22.10. = Starttag, 8:28 gearbeitet
  const w = weekStats('2026-10-19', groupByDay(ev('2026-10-22', [['in', '06:26'], ['out', '15:24']])), new Map(), nowThu, '2026-10-22');
  assert.equal(w.diffToDate, 28);
  const nowTue = new Date('2026-10-27T17:00:00Z'); // Di 27.10., Mo 8:00 gearbeitet, Di noch offen
  const w2 = weekStats('2026-10-26', groupByDay(ev('2026-10-26', [['in', '07:00'], ['out', '15:30']])), new Map(), nowTue, '2026-10-27');
  assert.equal(w2.diffToDate, 0);
  console.log('Differenz-bis-heute-Test OK');
}

// Zuschläge + freie Tage laut Vertrag
{
  const now2 = new Date('2026-11-20T10:00:00Z');
  const e = [
    ...ev('2026-11-07', [['in', '08:00'], ['out', '12:00']]), // Sa 4:00 -> +1:00
    ...ev('2026-11-08', [['in', '08:00'], ['out', '12:00']]), // So 4:00 -> +2:00
  ];
  const w = weekStats('2026-11-02', groupByDay(e), new Map(), now2);
  assert.equal(w.days[5].bonus, 60); assert.equal(w.days[6].bonus, 120);
  assert.equal(w.ist, 240 + 60 + 240 + 120); assert.equal(w.bonus, 180);
  const h = holidaysOf(2027);
  assert.ok(h.has('2027-05-01') && h.has('2027-12-26'));
  console.log('Zuschlag-Test OK');
}

// Monat/Zeitraum + Saldo
{
  const { rangeStats, saldoAt } = await import('../src/lib/calc.js');
  const e = [...ev('2026-10-22', [['in', '06:26'], ['out', '15:24']]), ...ev('2026-10-23', [['in', '06:11'], ['out', '15:05']])];
  const by2 = groupByDay(e);
  const n = new Date('2026-10-23T20:00:00Z');
  const m = rangeStats('2026-10-01', '2026-10-31', by2, new Map(), n);
  assert.equal(m.soll, 960); assert.equal(m.ist, 1012); assert.equal(m.diff, 52); assert.ok(m.partial);
  assert.equal(saldoAt('2026-10-31', by2, new Map(), n), 52);
  assert.equal(saldoAt('2026-10-21', by2, new Map(), n), 0);
  console.log('Monats-Test OK');
}

// ---- Kassenbon-Erkennung ----
{
  const { parseReceipt, lastWorkday, expenseTotals } = await import('../src/lib/receipt.js');
  const today = new Date('2026-10-24T12:00:00');
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error('FAIL', m, a, b); process.exit(1); } };
  eq(parseReceipt('COOP Pronto\n23.10.2026 12:14\nSandwich 6.50\nCola 2,90\nTOTAL CHF 9.40\nBar 20.00\nRückgeld 10.60\nMwSt 2.6% 0.24', today), { amount: 9.4, day: '2026-10-23' }, 'coop');
  eq(parseReceipt('Restaurant Lac\nDate: 21/10/26\n2x Plat du jour 2 x 19.50 39.00\nMontant à payer CHF 43.00\nTVA 8.1% 3.22', today), { amount: 43, day: '2026-10-21' }, 'fr');
  eq(parseReceipt('Shell Gland\n18.10.2026\nBleifrei 95 45.12 l\nCHF 89.30\nKarte Visa', today), { amount: 89.3, day: '2026-10-18' }, 'tank');
  eq(parseReceipt('Hotel Alpina\nTotal 1\'240.00\n12.10.2026', today), { amount: 1240, day: '2026-10-12' }, 'tausender');
  eq(lastWorkday('2026-10'), '2026-10-30', 'lwd-okt');
  eq(lastWorkday('2026-12', (d) => d === '2026-12-31'), '2026-12-30', 'lwd-dez');
  eq(expenseTotals([{ amount: 0.1, category: 'essen' }, { amount: 0.2, category: 'essen' }, { amount: 5, category: 'fahrt' }]).total, 5.3, 'summe');
  console.log('Kassenbon-Test OK');
}

// ---- Einsatz über Mitternacht + Nacht-/Sonntagszuschlag ----
{
  const { dayRecord } = await import('../src/lib/calc.js');
  const at = (day, t) => zurichToDate(day, t).toISOString();
  // Mo 02.11.: 07:00–15:30, Pikett 22:00–01:00 (Di)
  const e = [
    { id: 1, kind: 'in', ts: at('2026-11-02', '07:00') }, { id: 2, kind: 'out', ts: at('2026-11-02', '15:30') },
    { id: 3, kind: 'in', ts: at('2026-11-02', '22:00') }, { id: 4, kind: 'out', ts: at('2026-11-03', '01:00') },
  ];
  const by = groupByDay(e);
  assert.equal(by.get('2026-11-02').length, 4, 'Ausstempeln 01:00 gehört zum Montag');
  assert.equal(by.get('2026-11-03'), undefined);
  const r = dayRecord('2026-11-02', by, new Map(), new Date('2026-11-05T12:00:00Z'));
  assert.equal(r.total, 690);            // 8:30 + 3:00 (Lücke = Pause)
  assert.equal(r.nightMin, 120);         // 23:00–01:00
  assert.equal(r.bonus, 30);             // 2 h × 25 %
  assert.ok(r.overnight);
  // Sa 07.11. 22:00 – So 02:00: 22–23 Sa (+25 %), 23–02 Sonntag + Nacht (+75 %)
  const e2 = [{ id: 1, kind: 'in', ts: at('2026-11-07', '22:00') }, { id: 2, kind: 'out', ts: at('2026-11-08', '02:00') }];
  const r2 = dayRecord('2026-11-07', groupByDay(e2), new Map(), new Date('2026-11-10T12:00:00Z'));
  assert.equal(r2.total, 240);      // 4 h, keine Mindestpause
  assert.equal(r2.bonus, 60 * 0.25 + 180 * 0.75);   // 150 min
  // laufender Einsatz nach Mitternacht zählt live zum Vortag
  const e3 = [{ id: 1, kind: 'in', ts: at('2026-11-02', '22:00') }];
  const s3 = dayStats(groupByDay(e3).get('2026-11-02'), false, zurichToDate('2026-11-03', '00:30'));
  assert.ok(s3.open); assert.equal(s3.total, 150);
  // vergessen auszustempeln (> 18 h) -> unvollständig, nächstes Einstempeln neuer Tag
  const e4 = [{ id: 1, kind: 'in', ts: at('2026-11-02', '07:00') }, { id: 2, kind: 'in', ts: at('2026-11-03', '07:00') }];
  const by4 = groupByDay(e4);
  assert.equal(by4.get('2026-11-03').length, 1);
  assert.ok(dayStats(by4.get('2026-11-02'), false, new Date('2026-11-03T12:00:00Z')).incomplete);
  console.log('Nacht-/Mitternacht-Test OK');
}
