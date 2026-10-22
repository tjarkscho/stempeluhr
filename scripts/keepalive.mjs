// Hält das Supabase-Free-Projekt aktiv (pausiert sonst nach 7 Tagen ohne Aktivität)
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen');
  process.exit(1);
}
const res = await fetch(`${SUPABASE_URL}/rest/v1/entries?select=id&limit=1`, {
  headers: { apikey: SUPABASE_SERVICE_ROLE_KEY }, // funktioniert mit sb_secret_… und alten service_role-Keys
});
console.log(`Supabase keep-alive: HTTP ${res.status}`);
if (!res.ok) process.exit(1);
