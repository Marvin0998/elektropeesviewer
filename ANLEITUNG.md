# 🌐 360° Cloud Viewer — Schritt-für-Schritt Anleitung

Keine Vorkenntnisse nötig! Folge einfach den Schritten.

---

## Was du brauchst (alles kostenlos)

1. **Node.js** → https://nodejs.org (den "LTS"-Button klicken)
2. **Ein Supabase-Konto** → https://supabase.com (mit Google anmelden)
3. **Ein Vercel-Konto** → https://vercel.com (mit GitHub anmelden)
4. **VS Code** (optional, aber empfohlen) → https://code.visualstudio.com

---

## Schritt 1: Supabase einrichten (ca. 10 Minuten)

### 1a. Projekt anlegen
1. Gehe zu https://supabase.com und melde dich an
2. Klicke **"New Project"**
3. Gib einen Namen ein (z.B. "viewer360")
4. Wähle ein sicheres Passwort und speichere es
5. Wähle **Frankfurt** als Region → **Create project**

### 1b. Datenbank-Tabellen erstellen
1. Im Supabase-Dashboard auf **"SQL Editor"** klicken (links in der Sidebar)
2. Klicke **"New Query"**
3. Kopiere den gesamten Inhalt aus der Datei `supabase_setup.sql` hinein
4. Klicke **"Run"** (oder Strg+Enter)
5. Du solltest "Success" sehen — fertig!

### 1c. Storage-Bucket einrichten
1. Links in der Sidebar auf **"Storage"** klicken
2. Klicke **"New bucket"**
3. Name: `photos`
4. **"Public bucket"** anschalten → **Create bucket**

### 1d. Deine Zugangsdaten kopieren
1. Links auf **"Settings"** → **"API"**
2. Du brauchst zwei Werte:
   - **Project URL** (sieht aus wie: https://xxxx.supabase.co)
   - **anon public key** (langer Text der mit "eyJ..." beginnt)

---

## Schritt 2: Projekt auf deinen Computer laden

Öffne ein Terminal (Windows: "cmd" oder "PowerShell", Mac: "Terminal"):

```bash
# 1. In den gewünschten Ordner wechseln (z.B. Desktop)
cd Desktop

# 2. Abhängigkeiten installieren (im Projektordner)
cd viewer360
npm install

# 3. Konfigurationsdatei anlegen
cp .env.example .env.local
```

Öffne nun die Datei `.env.local` in einem Texteditor und füge deine Supabase-Daten ein:

```
NEXT_PUBLIC_SUPABASE_URL=https://DEINE-ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dein-langer-key-hier
```

---

## Schritt 3: App starten (lokal testen)

```bash
npm run dev
```

Öffne deinen Browser und gehe zu: **http://localhost:3000**

Du solltest die Login-Seite sehen! 🎉

---

## Schritt 4: Online stellen mit Vercel (kostenlos)

1. Lade deinen Code zu GitHub hoch (oder nutze den Vercel CLI)
2. Gehe zu https://vercel.com → **"New Project"**
3. Verbinde dein GitHub-Repository
4. Unter **"Environment Variables"** füge ein:
   - `NEXT_PUBLIC_SUPABASE_URL` → deine Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → deinen Supabase Key
5. Klicke **"Deploy"**

Nach ca. 2 Minuten bekommst du eine URL wie `viewer360.vercel.app` — fertig!

---

## Häufige Fragen

**Welche Bilder funktionieren?**
360°-Fotos im equirektangularen Format (das, was moderne 360°-Kameras wie Ricoh Theta oder Insta360 erzeugen). JPEG oder PNG, empfohlen max. 50 MB.

**Wie viele Projekte kann ich anlegen?**
Mit dem kostenlosen Supabase-Plan: unbegrenzte Projekte, bis zu 1 GB Bildspeicher. Das reicht für ~50-200 Fotos.

**Kann ich die App mit anderen teilen?**
Ja! Jede Person kann sich registrieren und sieht nur ihre eigenen Projekte.

**Etwas funktioniert nicht?**
Prüfe zuerst die `.env.local` Datei — dort sind die häufigsten Fehlerquellen (Tippfehler, falsche Keys).

---

## App-Übersicht

```
/                    → Startseite / Login
/dashboard           → Alle deine Projekte
/project/[id]        → Einzelnes Projekt mit Fotoliste
/viewer/[id]         → 360°-Viewer mit Notizen
```
