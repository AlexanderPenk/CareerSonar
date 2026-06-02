# Career Sonar — lauffähiges Projekt

Das ist **unser kompletter Career-Sonar-Code**, verpackt in ein normales,
veröffentlichbares Web-Projekt. Der eigentliche App-Code (`src/career-sonar.jsx`)
ist **unverändert** — Design, alle 6 Tabs, Scoring, ICP-Mapping, Cockpit, Tracker,
Filter und Work-Mode sind genau wie gehabt.

## Was sich gegenüber dem Claude-Artifact geändert hat (nur 2 Dinge)

1. **Speichern** — Im Artifact lief das über `window.storage`. Das wird hier
   (in `src/main.jsx`) durch den ganz normalen Browser-Speicher ersetzt. Gleiches
   Verhalten; deine Daten bleiben in diesem Browser gespeichert. Der App-Code
   selbst musste dafür **nicht** angefasst werden.

2. **KI-Funktionen** — Im Artifact rief die App die KI direkt auf. In einer
   öffentlichen Web-App darf aber **kein Schlüssel im Browser liegen**. Deshalb ist
   der KI-Aufruf (in `src/career-sonar.jsx`, Funktion `callClaude`) aktuell ein klar
   markierter **Platzhalter**. Alles ohne KI funktioniert sofort vollständig:
   Profil, Suchkriterien, Cockpit, Tracker, Filter, manuelles Hinzufügen. Die
   KI-Aktionen (Find / Research / Draft / Verify / Score) zeigen bis zum nächsten
   Schritt einen freundlichen Hinweis. Im **nächsten Setup-Schritt** verbinden wir
   sie mit einem kleinen Backend, das den Schlüssel sicher hält.

## So startest du es (ohne Installation, ohne Terminal)

Du brauchst nur einen Browser-Editor, der das Projekt sofort live anzeigt:

- **StackBlitz** (empfohlen): Projekt nach GitHub hochladen, dann in StackBlitz
  öffnen. Läuft sofort als Live-Vorschau.
- **CodeSandbox**: Projektordner per Drag & Drop importieren.

Keine Sorge um die genauen Klicks — die gehen wir gemeinsam Schritt für Schritt
durch. Schick einfach einen Screenshot, wenn etwas hakt.

> Falls dir jemand mit Technik hilft: `npm install` dann `npm run dev` startet es
> lokal; `npm run build` erzeugt die veröffentlichbare Version.

## Was als Nächstes kommt

1. Dieses Projekt online öffnen (Live-Vorschau).
2. Veröffentlichen per Knopf (Netlify/Vercel) → echte Internet-Adresse.
3. Datenbank + Job-Portal-Schnittstellen (Greenhouse, Lever, Ashby, Personio,
   Bundesagentur) anbinden → echte Live-Stellen im Role Sonar.
4. KI-Bewertung + täglicher Auto-Scan + E-Mail mit den besten Treffern.

## Dateien im Überblick

- `src/career-sonar.jsx` — unser App-Code (unverändert, bis auf den KI-Platzhalter)
- `src/main.jsx` — Start + Browser-Speicher-Shim
- `src/index.css` — minimaler Hintergrund/Schrift-Feinschliff
- `index.html`, `vite.config.js`, `package.json` — Projekt-Gerüst
