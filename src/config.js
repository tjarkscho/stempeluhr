// Feste Einstellungen (keine Geheimnisse – darf ins Repo)
export const CONFIG = {
  employee: 'Marian Tjark Schomburg',
  company: 'Net Powersafe SA',
  startDate: '2026-10-22', // ab diesem Tag zählen Soll und Saldo (Startsaldo 0:00)
  kmRate: 0.8,            // Kilometerentschädigung Privatauto CHF/km
  sollDayMin: 480,         // 8:00 pro Arbeitstag (Mo–Fr) = 40:00 / Woche
  // Zuschläge auf gearbeitete Zeit (als Zeitgutschrift). Überstunden Mo–Fr: 1:1
  surcharge: { saturday: 0.25, sunday: 0.5, holiday: 0.5, night: 0.25 },   // Nacht 23–06 Uhr (ArG Art. 17b)
  calendarFrom: 2026,
  calendarTo: 2029,
};
