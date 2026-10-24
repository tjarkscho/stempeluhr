// Sprache (DE/FR) und Theme – pro Gerät gespeichert
const STORE = 'stempeluhr.prefs';

const DICT = {
  de: {
    days: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
    daysShort: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    kind: { in: 'Ein', out: 'Aus', break_start: 'Pause Start', break_end: 'Pause Ende' },
    labels: {},
    email: 'E-Mail', password: 'Passwort', login: 'Anmelden', loginFailed: 'Anmeldung fehlgeschlagen',
    loginFailedHint: 'E-Mail oder Passwort stimmt nicht. Bitte nochmals versuchen.', loggingIn: 'Anmelden …', showPw: 'Passwort anzeigen',
    slideIn: 'Zum Einstempeln wischen', slideOut: 'Zum Ausstempeln wischen',
    done: { in: 'Eingestempelt', out: 'Ausgestempelt', break_start: 'Pause gestartet', break_end: 'Pause beendet' }, at: (t) => `um ${t}`,
    tabStamp: 'Stempeln', tabWeek: 'Woche', tabArchive: 'Archiv',
    calendar: 'Ferienkalender', settings: 'Einstellungen', logout: 'Abmelden',
    stateOff: 'Ausgestempelt', stateNone: 'Nicht eingestempelt', stateWork: 'Arbeitet', stateBreak: 'Pause',
    clockIn: 'Einstempeln', clockOut: 'Ausstempeln', pause: 'Pause', pauseEnd: 'Pause beenden',
    greet: (h) => (h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'),
    endAt: (t) => `Feierabend ab ${t}`, endAfterBreak: (m) => `Nach der Pause noch ${m} bis Feierabend`,
    sollReached: 'Soll für heute erreicht', niceEvening: 'Schönen Feierabend',
    heatLow: 'wenig', heatHigh: 'viel',
    workedToday: 'heute gearbeitet', in: 'Ein', out: 'Aus', remaining: 'Noch bis Soll', balance: 'Saldo',
    forgot: (d) => `${d}: Ausstempeln fehlt – tippen zum Korrigieren`,
    breakHint: 'Gesetzliche Mindestpause (ArG Art. 15) wird beim Ausstempeln automatisch berücksichtigt: ab 5:30 h → 15 min, ab 7 h → 30 min, ab 9 h → 60 min.',
    correctToday: 'Heute korrigieren',
    week: 'KW', day: 'Tag', total: 'Total', target: 'Soll', actual: 'Ist', diff: 'Differenz',
    balanceTotal: 'Saldo total', today: '(heute)',
    diffToday: 'Heute', diffWeek: 'Differenz Woche', targetWeek: 'Soll Woche', actualWeek: 'Ist Woche',
    untilToday: 'bis heute', since: (d) => `seit ${d}`,
    overtime: 'Überzeit', of: 'von', noTarget: 'kein Soll heute', saldoTrend: 'Saldo-Verlauf',
    chartSoon: 'Der Verlauf füllt sich ab der nächsten Woche.', archWeeks: 'Wochen', archMonths: 'Monate', archYears: 'Jahre',
    periodHint: 'Antippen erzeugt das PDF (PC: Download, Handy: Teilen/Sichern).',
    weekHint: 'Tag antippen zum Korrigieren. <sup>*</sup> = manuell korrigiert. Zuschlag: Sa +25 %, So/Feiertag +50 %.',
    bonus: 'davon Zuschlag',
    offlineSaved: 'offline gespeichert',
    offlineEdit: 'Korrigieren geht erst wieder mit Netz (Offline-Stempel noch nicht hochgeladen).',
    pending: (n) => `${n} Stempel offline gespeichert – wird automatisch hochgeladen, sobald Netz da ist`,
    synced: (n) => `${n} Offline-Stempel hochgeladen`,
    reminder: 'Erinnerung', reminderText: '18:00 – noch eingestempelt?',
    pushOk: 'Erinnerung aktiviert', pushDenied: 'Benachrichtigungen wurden nicht erlaubt (Handy-Einstellungen).',
    pushIos: 'Auf dem iPhone geht das nur, wenn die App vom Home-Bildschirm geöffnet wird (Teilen → Zum Home-Bildschirm).',
    pushUnsupported: 'Dieser Browser unterstützt keine Push-Benachrichtigungen.',
    pdfDraft: 'Zwischenstand-PDF', pdfDraftHint: 'Stand jetzt, zum Prüfen – wird nicht im Archiv gespeichert.',
    pdfMake: 'PDF erzeugen', pdfRemake: 'PDF neu erzeugen', pdfDownload: 'PDF herunterladen', pdfSaved: 'PDF gespeichert', pdfError: 'PDF-Fehler: ',
    archiveEmpty: 'Noch keine Wochen-PDFs. Das erste wird am Montag nach der ersten Woche automatisch erstellt.',
    downloadFailed: 'Download fehlgeschlagen: ',
    noEntries: 'Keine Einträge.', addEntry: '+ Eintrag', manualHint: 'Geänderte Einträge werden als „manuell korrigiert“ markiert.',
    save: 'Speichern', fillTimes: 'Bitte alle Zeiten ausfüllen',
    badOrder: 'Ungültige Reihenfolge (Ein → Pause Start → Pause Ende → Aus)',
    saved: 'Gespeichert', savedPdf: 'Gespeichert – PDF dieser Woche bei Bedarf neu erzeugen',
    error: 'Fehler: ', loadFailed: 'Laden fehlgeschlagen: ',
    absTitle: 'Ferien & Abwesenheit', absF: 'Ferien', absH: 'Halbtag', absK: 'Krank', absFT: 'Feiertag VD',
    absShort: { ferien: 'F', ferien_halb: '½', krank: 'K', hol: 'FT' },
    absHint: 'Tag antippen: Ferien → ½ Ferien → Krank → leer. Wird mit Tagessoll (8:00 / 4:00) gutgeschrieben.',
    vacDays: (y, n) => `Ferientage ${y}: ${n}`,
    theme: 'Farbschema', language: 'Sprache',
    themes: { auto: 'Auto', weiss: 'Weiss', dunkel: 'Dunkel', creme: 'Creme', dunkelblau: 'Dunkelblau' },
  },
  fr: {
    days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
    daysShort: ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'],
    months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
    kind: { in: 'Entrée', out: 'Sortie', break_start: 'Début pause', break_end: 'Fin pause' },
    labels: {
      'Neujahr': 'Nouvel An', 'Berchtoldstag': 'Saint-Berthold', 'Karfreitag': 'Vendredi saint',
      'Ostermontag': 'Lundi de Pâques', 'Auffahrt': 'Ascension', 'Pfingstmontag': 'Lundi de Pentecôte',
      'Bundesfeier': 'Fête nationale', 'Bettagsmontag': 'Lundi du Jeûne', 'Weihnachten': 'Noël',
      'Tag der Arbeit': 'Fête du travail', 'Stephanstag': 'Saint-Étienne',
      'Ferien': 'Vacances', '½ Ferien': '½ vacances', 'Krank': 'Maladie',
    },
    email: 'E-mail', password: 'Mot de passe', login: 'Se connecter', loginFailed: 'Échec de la connexion',
    loginFailedHint: 'E-mail ou mot de passe incorrect. Veuillez réessayer.', loggingIn: 'Connexion …', showPw: 'Afficher le mot de passe',
    slideIn: 'Glisser pour timbrer l’entrée', slideOut: 'Glisser pour timbrer la sortie',
    done: { in: 'Entrée timbrée', out: 'Sortie timbrée', break_start: 'Pause commencée', break_end: 'Pause terminée' }, at: (t) => `à ${t}`,
    tabStamp: 'Timbrer', tabWeek: 'Semaine', tabArchive: 'Archives',
    calendar: 'Calendrier des vacances', settings: 'Réglages', logout: 'Déconnexion',
    stateOff: 'Sortie timbrée', stateNone: 'Pas timbré', stateWork: 'Au travail', stateBreak: 'Pause',
    clockIn: 'Timbrer l’entrée', clockOut: 'Timbrer la sortie', pause: 'Pause', pauseEnd: 'Fin de pause',
    greet: (h) => (h < 18 ? 'Bonjour' : 'Bonsoir'),
    endAt: (t) => `Fin de journée à ${t}`, endAfterBreak: (m) => `Après la pause, encore ${m} avant la fin`,
    sollReached: 'Temps du jour atteint', niceEvening: 'Bonne soirée',
    heatLow: 'peu', heatHigh: 'beaucoup',
    workedToday: 'travaillé aujourd’hui', in: 'Entrée', out: 'Sortie', remaining: 'Reste', balance: 'Solde',
    forgot: (d) => `${d} : sortie non timbrée – toucher pour corriger`,
    breakHint: 'La pause minimale légale (LTr art. 15) est appliquée automatiquement : dès 5 h 30 → 15 min, dès 7 h → 30 min, dès 9 h → 60 min.',
    correctToday: 'Corriger aujourd’hui',
    week: 'Sem.', day: 'Jour', total: 'Total', target: 'Prévu', actual: 'Effectif', diff: 'Différence',
    balanceTotal: 'Solde total', today: '(aujourd’hui)',
    diffToday: 'Aujourd’hui', diffWeek: 'Différence semaine', targetWeek: 'Prévu semaine', actualWeek: 'Effectif semaine',
    untilToday: 'jusqu’à aujourd’hui', since: (d) => `depuis le ${d}`,
    overtime: 'heures sup.', of: 'sur', noTarget: 'pas de temps prévu', saldoTrend: 'Évolution du solde',
    chartSoon: 'Le graphique se remplit dès la semaine prochaine.', archWeeks: 'Semaines', archMonths: 'Mois', archYears: 'Années',
    periodHint: 'Toucher pour créer le PDF (PC : téléchargement, mobile : partager/enregistrer).',
    weekHint: 'Toucher un jour pour corriger. <sup>*</sup> = corrigé manuellement. Majoration : sa +25 %, di/férié +50 %.',
    bonus: 'dont majoration',
    offlineSaved: 'enregistré hors ligne',
    offlineEdit: 'Correction possible uniquement avec réseau (timbrages hors ligne pas encore envoyés).',
    pending: (n) => `${n} timbrage(s) hors ligne – envoi automatique dès que le réseau revient`,
    synced: (n) => `${n} timbrage(s) hors ligne envoyé(s)`,
    reminder: 'Rappel', reminderText: '18:00 – encore timbré ?',
    pushOk: 'Rappel activé', pushDenied: 'Notifications refusées (réglages du téléphone).',
    pushIos: 'Sur iPhone, cela fonctionne uniquement si l’app est ouverte depuis l’écran d’accueil (Partager → Sur l’écran d’accueil).',
    pushUnsupported: 'Ce navigateur ne prend pas en charge les notifications push.',
    pdfDraft: 'PDF provisoire', pdfDraftHint: 'État actuel, pour contrôle – pas enregistré dans les archives.',
    pdfMake: 'Créer le PDF', pdfRemake: 'Recréer le PDF', pdfDownload: 'Télécharger le PDF', pdfSaved: 'PDF enregistré', pdfError: 'Erreur PDF : ',
    archiveEmpty: 'Aucun PDF hebdomadaire pour l’instant. Le premier sera créé automatiquement le lundi suivant la première semaine.',
    downloadFailed: 'Échec du téléchargement : ',
    noEntries: 'Aucune entrée.', addEntry: '+ Entrée', manualHint: 'Les entrées modifiées sont marquées « corrigé manuellement ».',
    save: 'Enregistrer', fillTimes: 'Veuillez remplir toutes les heures',
    badOrder: 'Ordre invalide (Entrée → Début pause → Fin pause → Sortie)',
    saved: 'Enregistré', savedPdf: 'Enregistré – recréer le PDF de cette semaine si nécessaire',
    error: 'Erreur : ', loadFailed: 'Échec du chargement : ',
    absTitle: 'Vacances & absences', absF: 'Vacances', absH: 'Demi-journée', absK: 'Maladie', absFT: 'Férié VD',
    absShort: { ferien: 'V', ferien_halb: '½', krank: 'M', hol: 'JF' },
    absHint: 'Toucher un jour : Vacances → ½ vacances → Maladie → vide. Crédité avec le temps prévu (8:00 / 4:00).',
    vacDays: (y, n) => `Jours de vacances ${y} : ${n}`,
    theme: 'Thème', language: 'Langue',
    themes: { auto: 'Auto', weiss: 'Blanc', dunkel: 'Sombre', creme: 'Crème', dunkelblau: 'Bleu nuit' },
  },
};

export const THEMES = ['auto', 'weiss', 'dunkel', 'creme', 'dunkelblau'];
const THEME_COLOR = { weiss: '#ffffff', dunkel: '#1b1e24', creme: '#fbf7ef', dunkelblau: '#12233a' };

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
const saved = load();
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const browserFr = typeof navigator !== 'undefined' && /^fr/i.test(navigator.language || '');

export const prefs = {
  lang: saved.lang === 'fr' || saved.lang === 'de' ? saved.lang : (browserFr ? 'fr' : 'de'),
  theme: THEMES.includes(saved.theme) ? saved.theme : 'auto', // Standard: wie das Gerät
};

// Gerät wechselt hell/dunkel -> sofort übernehmen
mq?.addEventListener?.('change', () => { if (prefs.theme === 'auto') applyPrefs(); });

export function setPref(k, v) {
  prefs[k] = v;
  try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* egal */ }
  applyPrefs();
}

export function applyPrefs() {
  const theme = prefs.theme === 'auto' ? (mq?.matches ? 'dunkel' : 'weiss') : prefs.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = prefs.lang === 'fr' ? 'fr-CH' : 'de-CH';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  // Icons passend zum Farbschema
  const base = import.meta.env.BASE_URL;
  document.querySelector('link[rel="icon"]')?.setAttribute('href', `${base}favicon-${theme}.png`);
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', `${base}apple-touch-icon-${theme}.png`);
}

/** Aktuelles Wörterbuch */
export const T = () => DICT[prefs.lang];
/** Übersetzt Bezeichnungen aus der Logik (Feiertage, Ferien …) */
export const label = (s) => (s ? DICT[prefs.lang].labels[s] || s : s);
