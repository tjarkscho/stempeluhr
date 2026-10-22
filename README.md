# Stempeluhr

Persönliche Zeiterfassung (Marian Schomburg, Net Powersafe SA). Statische Web-App auf GitHub Pages mit Supabase (Auth, DB, Storage).

## Funktionen
- Ein-/Ausstempeln und Pause, Live-Tageszeit
- Pausen nach ArG Art. 15: gestempelte Pause, mindestens 15 min (> 5,5 h), 30 min (> 7 h) bzw. 60 min (> 9 h)
- Korrektur pro Tag (Einträge werden als *manuell korrigiert* markiert)
- Wochenübersicht: Soll 40:00, Ist, Differenz, Saldo total (Start 23.10.2026 mit 0:00)
- Ferienkalender 2026–2029 (Ferien, ½ Ferien, Krank) und automatische Feiertage VD
- Wochen-PDF jeden Montag automatisch (GitHub Action) mit Archiv zum Download
- Keep-alive alle 2 Tage gegen das Pausieren von Supabase Free

## Struktur
```
src/            App (main.js), Logik (lib/calc.js), PDF (lib/pdf.js), Feiertage, Konfiguration
public/logo.png Firmenlogo fürs PDF (PNG oder JPG, hier ablegen)
supabase/       schema.sql
scripts/        weekly-report.mjs, keepalive.mjs, test-calc.mjs
.github/        Deploy, Wochen-PDF, Keep-alive
```
Name, Firma und Startdatum stehen in `src/config.js`.

## Setup

### 1. Supabase
1. https://supabase.com/dashboard, dann **New project**. Name `stempeluhr`, Region **Central EU (Frankfurt)**, Passwort generieren.
2. **SQL Editor**, dann **New query**. Inhalt von `supabase/schema.sql` einfügen und auf **Run** klicken.
3. **Authentication > Sign In / Providers**: *Allow new users to sign up* **aus**. Email-Provider bleibt an.
4. **Authentication > Users > Add user > Create new user**: deine E-Mail und ein Passwort, *Auto Confirm User* aktivieren.
5. **Project Settings > API Keys**: Project URL, anon/publishable-Key und service_role/secret-Key bereithalten. Nicht in den Chat kopieren.

### 2. Lokal
```bash
npm install
copy .env.example .env      # dann .env ausfüllen
npm test                    # Logik-Selbsttest
npm run dev                 # http://localhost:5173
```

### 3. GitHub
1. GitHub Desktop: **Add > Add existing repository** mit diesem Ordner (bzw. *create a repository*), dann **Publish**, **öffentlich** (Keep this code private: aus).
2. Repo auf github.com, dann **Settings > Secrets and variables > Actions > New repository secret**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. **Settings > Pages > Source: GitHub Actions**.
4. **Actions > Deploy > Run workflow**. Danach ist die App unter `https://<user>.github.io/<repo>/` erreichbar.
5. Am Handy die Seite öffnen und **Zum Home-Bildschirm** hinzufügen.

## Sicherheit
- `.env` ist in `.gitignore`. Keys gehören nur dorthin und in die GitHub Secrets.
- Der anon-Key im Frontend ist öffentlich vorgesehen. Den Schutz übernehmen Row Level Security und der Umstand, dass nur ein Benutzer existiert und Registrierung deaktiviert ist.
- Der service_role-Key wird nur in den GitHub Actions verwendet.

## Betrieb
- **PDF manuell:** in der App unter Woche den Button *PDF neu erzeugen* (z. B. nach einer Korrektur), oder *Actions > Wochen-PDF > Run workflow*.
- **Feiertage:** `src/lib/holidays.js` (Kanton Waadt). Bei abweichendem Firmenkalender dort anpassen.
