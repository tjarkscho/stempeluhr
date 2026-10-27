// "Legal": Rechtliches und wie die App rechnet – Deutsch / Französisch.
// Zahlen kommen aus CONFIG/calc.js, damit Text und Berechnung nie auseinanderlaufen.
import { CONFIG } from '../config.js';

const pct = (v) => `${Math.round(v * 100)} %`;
const h = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const chf = (v) => v.toFixed(2);
const S = CONFIG.surcharge;
const soll = CONFIG.sollDayMin;
const start = CONFIG.startDate.split('-').reverse().join('.');

const ARG = { de: 'https://www.fedlex.admin.ch/eli/cc/1966/57_57_57/de', fr: 'https://www.fedlex.admin.ch/eli/cc/1966/57_57_57/fr' };
const OR = { de: 'https://www.fedlex.admin.ch/eli/cc/27/317_321_377/de', fr: 'https://www.fedlex.admin.ch/eli/cc/27/317_321_377/fr' };

// Jeder Abschnitt: [Titel, [Absätze]] – Absätze sind reiner Text (wird escaped)
const DE = {
  title: 'Legal',
  rowText: 'Rechtliches & wie gerechnet wird',
  intro: 'Persönliches Hilfsmittel zur Zeiterfassung. Massgebend sind dein Arbeitsvertrag mit ' + CONFIG.company + ' und das Schweizer Recht. Keine Rechtsberatung – bei Unklarheiten bei NPS nachfragen.',
  sections: [
    ['Sollzeit & Saldo', [
      `Sollzeit: ${h(soll * 5)} pro Woche, Montag bis Freitag je ${h(soll)} (Arbeitsvertrag).`,
      `Gezählt wird ab ${start} mit Startsaldo 0:00.`,
      'Saldo = gearbeitete Zeit + Gutschriften + Zuschläge − Sollzeit. Der laufende Tag zählt erst nach dem Ausstempeln fest, vorher live.',
    ]],
    ['Pausen', [
      'Mindestpausen nach ArG Art. 15: über 5½ h Arbeit 15 Min., über 7 h 30 Min., über 9 h 1 Std.',
      'Abgezogen wird die gestempelte Pause, mindestens aber das gesetzliche Minimum. Wurde aufgestockt, steht im PDF eine kleine ¹.',
      'Zeit zwischen Aus- und erneutem Einstempeln am selben Tag gilt als Pause.',
    ]],
    ['Überstunden & Überzeit', [
      'Überstunden Mo–Fr werden 1:1 kompensiert (Arbeitsvertrag, zulässig nach OR Art. 321c).',
      'Samstag ist kein Arbeitstag: Samstagsarbeit zählt immer als Überstunden.',
      'Gesetzliche Höchstarbeitszeit: 45 h pro Woche (ArG Art. 9). Darüber ist es Überzeit: max. 2 h pro Tag und 170 h pro Jahr (ArG Art. 12), auszugleichen mit Freizeit gleicher Dauer oder Lohnzuschlag von 25 % (ArG Art. 13).',
      'Tägliche Ruhezeit: mindestens 11 Stunden am Stück (ArG Art. 15a).',
    ]],
    ['Zuschläge', [
      `Samstag: +${pct(S.saturday)} (Arbeitsvertrag).`,
      `Sonntag und Feiertag: +${pct(S.sunday)} bei vorübergehender Sonntagsarbeit (ArG Art. 19 Abs. 3, Feiertage nach Art. 20a). Als Sonntag gilt Samstag 23:00 bis Sonntag 23:00 (ArG Art. 18).`,
      `Nacht 23:00–06:00: +${pct(S.night)} bei vorübergehender Nachtarbeit (ArG Art. 10 und 17b). Gilt auch für einen Arbeitsbeginn vor 06:00.`,
      `Nacht kommt zu Samstag oder Sonntag dazu, z. B. Sonntag 01:00 = +${pct(S.sunday + S.night)}.`,
      'Die App rechnet minutengenau und schreibt Zuschläge als Zeit gut (z. B. 2 h Nacht = +0:30). Ob NPS stattdessen Geld auszahlt, regelt der Arbeitgeber.',
    ]],
    ['Einsatz über Mitternacht', [
      'Ein Einsatz zählt zum Tag, an dem eingestempelt wurde – auch wenn erst nach Mitternacht ausgestempelt wird. Im PDF steht dann „+1“ beim Ausstempeln.',
      'Wird länger als 18 Stunden nicht ausgestempelt, gilt der Tag als unvollständig („Ausstempeln fehlt“) und muss korrigiert werden.',
    ]],
    ['Feiertage & Abwesenheiten', [
      `Bezahlte freie Tage (Vertrag, Kanton Waadt): Neujahr, Berchtoldstag, Karfreitag, Ostermontag, Tag der Arbeit, Auffahrt, Pfingstmontag, Bundesfeier, Bettagsmontag, Weihnachten, Stephanstag – je ${h(soll)} gutgeschrieben, wenn sie auf Mo–Fr fallen.`,
      `Ferien und Krankheit: ${h(soll)} pro Tag, halber Ferientag ${h(soll / 2)}.`,
      'Gesetzlicher Ferienanspruch: mindestens 4 Wochen pro Jahr, bis 20 Jahre 5 Wochen (OR Art. 329a). Massgebend ist dein Vertrag.',
    ]],
    ['Korrekturen', [
      'Nachträglich geänderte oder erfasste Zeiten werden mit * „manuell korrigiert“ markiert – in der App und in allen PDFs.',
    ]],
    ['Spesen', [
      `Privatauto: CHF ${chf(CONFIG.kmRate)} pro km (Vereinbarung mit NPS). Betrag = km × Satz, auf den Rappen genau.`,
      'Auslagen werden nach Beleg ersetzt (OR Art. 327a). Fotos bleiben in der App abrufbar; Originalbelege aufbewahren, bis abgerechnet ist.',
      'Das Spesenblatt entsteht automatisch am letzten Werktag des Monats und wird bei späteren Änderungen neu erstellt.',
    ]],
    ['Nachweise', [
      'Wochennachweis: automatisch jeden Montag für die Vorwoche. Monats- und Jahresübersicht jederzeit im Verlauf.',
      'Der Arbeitgeber muss Arbeitszeiten erfassen und die Unterlagen mindestens 5 Jahre aufbewahren (ArG Art. 46, ArGV 1 Art. 73). Diese Nachweise dienen dir als eigene Kontrolle bzw. Grundlage dafür.',
      'Downloads werden immer frisch in der gewählten Sprache erstellt.',
    ]],
    ['Daten & Sicherheit', [
      'Deine Daten liegen in deiner eigenen Datenbank (Supabase); nur dein Konto hat Zugriff.',
      'Face ID läuft über das Gerät (WebAuthn) – biometrische Daten verlassen das iPhone nie.',
      'Die Erinnerung um 18:00 kommt nur, wenn du dann noch eingestempelt bist.',
    ]],
  ],
  sources: 'Gesetze',
  links: [['Arbeitsgesetz (ArG, SR 822.11)', ARG.de], ['Obligationenrecht (OR, SR 220)', OR.de]],
};

const FR = {
  title: 'Légal',
  rowText: 'Aspects juridiques & mode de calcul',
  intro: 'Outil personnel de saisie du temps. Font foi ton contrat de travail avec ' + CONFIG.company + ' et le droit suisse. Pas un conseil juridique – en cas de doute, demande à NPS.',
  sections: [
    ['Temps prévu & solde', [
      `Temps prévu : ${h(soll * 5)} par semaine, du lundi au vendredi ${h(soll)} par jour (contrat de travail).`,
      `Décompte à partir du ${start}, solde initial 0:00.`,
      'Solde = temps travaillé + crédits + majorations − temps prévu. Le jour en cours compte définitivement après le timbrage de sortie, avant en direct.',
    ]],
    ['Pauses', [
      'Pauses minimales selon LTr art. 15 : plus de 5½ h de travail 15 min, plus de 7 h 30 min, plus de 9 h 1 h.',
      'On déduit la pause timbrée, mais au moins le minimum légal. Si elle a été augmentée, le PDF l’indique par un petit ¹.',
      'Le temps entre une sortie et une nouvelle entrée le même jour compte comme pause.',
    ]],
    ['Heures supplémentaires', [
      'Les heures supplémentaires lu–ve sont compensées 1:1 (contrat, admis selon CO art. 321c).',
      'Le samedi n’est pas un jour de travail : le travail du samedi compte toujours comme heures supplémentaires.',
      'Durée maximale légale : 45 h par semaine (LTr art. 9). Au-delà, c’est du travail supplémentaire : max. 2 h par jour et 170 h par an (LTr art. 12), compensé par un congé de même durée ou un supplément de salaire de 25 % (LTr art. 13).',
      'Repos quotidien : au moins 11 heures consécutives (LTr art. 15a).',
    ]],
    ['Majorations', [
      `Samedi : +${pct(S.saturday)} (contrat de travail).`,
      `Dimanche et jour férié : +${pct(S.sunday)} pour le travail dominical temporaire (LTr art. 19 al. 3, jours fériés selon art. 20a). Le dimanche va du samedi 23:00 au dimanche 23:00 (LTr art. 18).`,
      `Nuit 23:00–06:00 : +${pct(S.night)} pour le travail de nuit temporaire (LTr art. 10 et 17b). Vaut aussi pour un début avant 06:00.`,
      `La nuit s’ajoute au samedi ou au dimanche, p. ex. dimanche 01:00 = +${pct(S.sunday + S.night)}.`,
      'L’app calcule à la minute et crédite les majorations en temps (p. ex. 2 h de nuit = +0:30). Si NPS les paie en argent, c’est l’employeur qui le règle.',
    ]],
    ['Intervention après minuit', [
      'Une intervention compte pour le jour du timbrage d’entrée, même si la sortie a lieu après minuit. Le PDF indique alors « +1 » à la sortie.',
      'Sans sortie pendant plus de 18 heures, le jour est incomplet (« Sortie manquante ») et doit être corrigé.',
    ]],
    ['Jours fériés & absences', [
      `Jours libres payés (contrat, canton de Vaud) : Nouvel An, Saint-Berthold, Vendredi saint, Lundi de Pâques, Fête du travail, Ascension, Lundi de Pentecôte, Fête nationale, Lundi du Jeûne, Noël, Saint-Étienne – ${h(soll)} crédités s’ils tombent du lundi au vendredi.`,
      `Vacances et maladie : ${h(soll)} par jour, demi-journée de vacances ${h(soll / 2)}.`,
      'Droit légal aux vacances : au moins 4 semaines par an, 5 semaines jusqu’à 20 ans (CO art. 329a). Ton contrat fait foi.',
    ]],
    ['Corrections', [
      'Les heures modifiées ou saisies après coup sont marquées * « corrigé manuellement » – dans l’app et dans tous les PDF.',
    ]],
    ['Frais', [
      `Voiture privée : CHF ${chf(CONFIG.kmRate)} par km (accord avec NPS). Montant = km × taux, au centime près.`,
      'Les frais sont remboursés sur justificatif (CO art. 327a). Les photos restent disponibles dans l’app ; garde les originaux jusqu’au remboursement.',
      'La note de frais est créée automatiquement le dernier jour ouvrable du mois et recréée en cas de modification.',
    ]],
    ['Relevés', [
      'Relevé hebdomadaire : automatiquement chaque lundi pour la semaine précédente. Récapitulatifs mensuel et annuel à tout moment dans l’historique.',
      'L’employeur doit enregistrer le temps de travail et conserver les documents au moins 5 ans (LTr art. 46, OLT 1 art. 73). Ces relevés te servent de contrôle personnel et de base.',
      'Les téléchargements sont toujours générés à neuf dans la langue choisie.',
    ]],
    ['Données & sécurité', [
      'Tes données sont dans ta propre base de données (Supabase) ; seul ton compte y a accès.',
      'Face ID passe par l’appareil (WebAuthn) – les données biométriques ne quittent jamais l’iPhone.',
      'Le rappel de 18:00 n’arrive que si tu es encore timbré à ce moment-là.',
    ]],
  ],
  sources: 'Lois',
  links: [['Loi sur le travail (LTr, RS 822.11)', ARG.fr], ['Code des obligations (CO, RS 220)', OR.fr]],
};

export const legalText = (lang) => (lang === 'fr' ? FR : DE);
