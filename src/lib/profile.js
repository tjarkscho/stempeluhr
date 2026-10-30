// Benutzerprofil (pro Mitarbeiter): Name, Zählbeginn, Ferien, Stundenlohn, Admin.
// Die Rechenfunktionen lesen CONFIG – deshalb wird das Profil dort eingesetzt.
import { CONFIG } from '../config.js';
import { dayKey } from './time.js';

const BASE = { ...CONFIG };

export const nameFromEmail = (email) => String(email || '').split('@')[0].split(/[._-]+/).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function profileConfig(p) {
  const today = dayKey(new Date());
  return {
    ...BASE,
    employee: p?.name || nameFromEmail(p?.email) || BASE.employee,
    startDate: p?.start_date || today,
    employmentStart: p?.employment_start || p?.start_date || today,
    vacationDays: p?.vacation_days != null ? Number(p.vacation_days) : BASE.vacationDays,
    hourlyRate: p?.hourly_rate ? Number(p.hourly_rate) : 0,
  };
}

export function applyProfile(p) { Object.assign(CONFIG, profileConfig(p)); }

/** Kurz mit dem Profil eines anderen rechnen (Admin-Ansicht, Server-Skripte) */
export async function withProfile(p, fn) {
  const saved = { ...CONFIG };
  applyProfile(p);
  try { return await fn(); } finally { Object.assign(CONFIG, saved); }
}

export function withProfileSync(p, fn) {
  const saved = { ...CONFIG };
  applyProfile(p);
  try { return fn(); } finally { Object.assign(CONFIG, saved); }
}
