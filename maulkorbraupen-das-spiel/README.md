# Maulkorbraupen – Das Spiel

🐛 Ein vertontes, lineares Textadventure über Teamwork, Prüfgas und den wohlverdienten Feierabend. Komplett als statisches Browser-Spiel ohne Server, Framework oder Build-Prozess.

## Spiel starten

`index.html` lokal im Browser öffnen oder das Spiel über die [Spieleauswahl](../index.html) starten.

## Kapitel

1. **Schichtende? Noch nicht!** – Einführung
2. **Das verschwundene Prüfgas** – Inventar-Rätsel
3. **Die Ventil-Verwirrung** – Logikrätsel
4. **Der störrische Gasmesser** – Messwert-Rätsel
5. **Das Labor der verlorenen Analysen** – Kombinationsrätsel
6. **Der Weg zum Feierabendtor** – finales Code-Rätsel
7. **Der Raucherplatz der Helden** – Finale und Epilog

Die beiden Zwischenszenen „Das Chaoslabor“ und „Das verschlossene Feierabendtor“ verbinden die Kapitel. Alle elf gelieferten Bilder werden im Spiel verwendet, einschließlich Werkskarte.

## Features

- Zehn vollständig vertonte Szenen mit deutscher, männlicher Erzählerstimme
- Fünf Rätsel mit beliebig vielen Versuchen und optionalen Hinweisen
- Schichtprotokoll mit vier gesammelten Freigabeziffern
- Automatisch gespeicherter Fortschritt via `localStorage`
- Werkskarte und Kapitelübersicht
- Audio-Dateien mit Browser-Sprachausgabe als Fallback
- Vollständig mit Maus, Touch und Tastatur spielbar
- Responsive Darstellung und reduzierte Animationen bei `prefers-reduced-motion`
- Optimierte WebP-Szenenbilder statt der großen PNG-Quelldateien

## Steuerung

| Aktion | Bedienung |
|---|---|
| Entscheidung treffen | Auswahl anklicken oder mit `Tab` fokussieren und `Enter` drücken |
| Hinweis anzeigen | Schaltfläche **Hinweis** |
| Vertonung ein-/ausschalten | Schaltfläche **Vorlesen** |
| Karte öffnen | Schaltfläche **Karte** |
| Fortschritt löschen | Schaltfläche **Neustart** |

## Dateien

- `index.html` – semantischer Einstieg und Dialoge
- `styles.css` – responsive Werk-Optik
- `maulkorbraupen-logic.js` – DOM-freie Szenen-, Rätsel- und Speicherlogik
- `game.js` – Darstellung, Eingaben, Audio und lokale Speicherung
- `assets/` – elf optimierte WebP-Bilder
- `audio/` – zehn vorproduzierte MP3-Erzählungen
- `smoke-test.cjs` – Logik-, Asset- und Strukturtests

## Check

```bash
node --check maulkorbraupen-logic.js
node --check game.js
node smoke-test.cjs
npx --yes htmlhint@1.9.2 index.html
```
