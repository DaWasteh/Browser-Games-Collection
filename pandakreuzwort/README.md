# Pandakreuzwort

Offline spielbares Freiform-Kreuzworträtsel ohne Frameworks oder externe Assets.
Einstieg ist `index.html`. Wählbar sind **Deutsch** und **Bairisch** sowie vier
Schwierigkeitsgrade. Alle Hinweise und Antworten sind ausschließlich
redaktionell (`project-editorial`) erstellt – kein Fetch, kein CDN, keine
fremden Definitionen.

## Regeln
Trage in jedes Feld den richtigen Buchstaben ein. Waagrechte und senkrechte
Wörter kreuzen sich und bilden ein zusammenhängendes Gitter. Es gilt die
klassische Kreuzworträtsel-Umschrift: **ß → SS, Ä → AE, Ö → OE, Ü → UE**.

- **↻ Neustart** behält dasselbe Rätsel (gleicher Seed), **⊕ Neues Rätsel**
  erzeugt einen neuen Seed bei gleicher Sprache und Schwierigkeit.
- **Sprache** ist exklusiv Deutsch **oder** Bairisch; es wird nie automatisch
  gemischt. Bairische Einträge führen verpflichtend `region` und die
  standarddeutsche Bedeutung (`standardGerman`), die im Hinweis angezeigt wird.
- **Schwierigkeit** steuert Wortzahl, Kreuzungsgrad und das Hinweisbudget:
  Leicht (bis 13 Wörter/4 Hinweise), Mittel (17/3), Schwer (21/2) und
  Experte (23/1).

## Bedienung
- Zelle antippen oder mit den **Pfeiltasten** navigieren (Pfeiltasten setzen
  zugleich die Eintragsrichtung). An einer Kreuzung wechselt **Enter**, die
  Leertaste oder ein wiederholter Tip die Richtung (waagrecht/senkrecht).
- Buchstaben über die physische Tastatur, die Gittertastatur oder das
  **Wort-Eingabefeld** (mobil) tippen; `⌫` löscht rückwärts.
- Die **Hinweislisten** (Waagrecht/Senkrecht) sind große Buttons und ein
  gleichwertiger Bedienweg – besonders wichtig auf schmalen Displays.
- **💡 Hinweis** setzt einen richtigen Buchstaben (begrenzt), **✓ Prüfen**
  markiert falsche Buchstaben zusätzlich zur Farbe mit Text.

## Generator
`pandakreuzwort-logic.js` erzeugt jedes Rätsel aus Seed + Sprachpool per
**deterministischem Backtracking** mit MRV/Fail-first, bewerteten Kreuzungen
und einer festen Knotengrenze (keine Zeitgrenze, kein `Math.random` im
Generator). Es gibt **keine Layoutvorlagen** – gleicher vollständiger Schlüssel
ergibt bytegleich dasselbe kanonische Puzzle; verschiedene Seeds erzeugen
unterschiedliche zusammenhängende Gitter. Vor der Ausgabe läuft
`validatePuzzle()` als Abschlussvalidator (Konfliktfreiheit, keine parallele
Berührung/Run-on, genau eine Komponente, eindeutige IDs, Hinweise vorhanden).

Harte Platzierungsregeln: Zelle vor/nach einem Wort muss frei sein, Überlagerung
nur bei gleichem Graphem als rechtwinklige Kreuzung, neu belegte Zellen dürfen
keine seitlichen Nachbarn haben, alle Buchstabenzellen bilden eine Komponente.
Die Bounding-Box wird kompakt gehalten.

## Dateien und Prüfung
- `index.html` – Offline-Shell, Gitter, Hinweislisten, Wort-Eingabe, Dialoge
- `pandakreuzwort-logic.js` – DOM-freie UMD-Logik (Generator, Validator, PRNG,
  Metriken, kanonische Serialisierung, Datenvalidierung). Reine
  `PandakreuzwortLogic`-API.
- `pandakreuzwort-data.js` – eingefrorene, redaktionelle Wortbank
  (`project-editorial`), Deutsch und Bairisch.
- `pandakreuzwort.js` – DOM/UI, `window.Pandakreuzwort`-Smoke-API
- `pandakreuzwort.css` – responsives Gitter/Wort-Eingabe, drei Ansichten
- `smoke-test.cjs` – Node-Vertrag für Daten, Generator, Varianz und Shell

```bash
node --check pandakreuzwort-logic.js
node --check pandakreuzwort-data.js
node --check pandakreuzwort.js
node pandakreuzwort/smoke-test.cjs
```
