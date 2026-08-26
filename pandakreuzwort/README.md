# Pandakreuzwort

Offline spielbares, nummeriertes Kreuzworträtsel ohne Frameworks oder externe
Abhängigkeiten. Die kompakten Raster verwenden sichtbare dunkle Sperrfelder,
weiße Buchstabenfelder sowie getrennte Hinweise für **waagrecht** und
**senkrecht**. Wählbar sind Deutsch und Bairisch sowie vier Schwierigkeitsgrade.

## Neu in v1.5

- Wortbank von 189 auf **464 redaktionelle Einträge** erweitert
  - 381 standarddeutsche Antworten
  - 83 bairische Antworten mit Region und standarddeutscher Bedeutung
- kompakte rechteckige Darstellung mit echten Sperrfeldern statt transparenter
  Freiform-Lücken
- korrigierter Generator: Eine Kreuzung ist nun zwingend genau ein waagrechtes
  plus ein senkrechtes Wort; gleichgerichtete Überlagerungen sind ausgeschlossen
- mehrere deterministische Kandidaten pro Seed werden nach Wortzahl,
  Kreuzungsrate, Gitterdichte, Richtungsbalance und Kompaktheit bewertet
- Mindestqualität je Schwierigkeitsgrad; ein unterhalb des Vertrags liegendes
  Raster wird nicht angezeigt
- auf Mobilgeräten mindestens 30 Pixel breite Zellen mit gezieltem Scrollbereich,
  dauerhaft sichtbarem aktivem Hinweis und größeren Bildschirmtasten
- positionssichere Wort-Eingabe: `·` markiert leere Stellen, ohne spätere
  Buchstaben nach links zu verschieben
- natürliche Antworten dürfen Leerzeichen, Bindestriche und Apostrophe tragen;
  im Raster entfallen diese Trennzeichen
- gespeicherte Spiele enthalten nur Seed, Versionen und Benutzereingaben. Raster,
  Nummern und Hinweise werden beim Laden neu und validiert erzeugt, statt
  manipulierbare abgeleitete Daten zu übernehmen
- Timer zeigt nach einer Stunde `HH:MM:SS` und pausiert im Hintergrund

## Regeln und Eingabe

Trage in jedes weiße Feld einen Buchstaben ein. Dunkle Felder sind Sperrfelder.
Wie bei klassischen deutschen Kreuzworträtseln gilt:

- `Ä → AE`
- `Ö → OE`
- `Ü → UE`
- `ß → SS`
- Leerzeichen, Bindestriche und Apostrophe belegen keine Zelle

Bedienwege:

- Feld oder Hinweis antippen/anklicken
- Pfeiltasten zur Navigation
- Enter, Leertaste oder erneutes Antippen wechselt an einer Kreuzung die Richtung
- physische Tastatur, große Bildschirmtastatur oder vollständige Wort-Eingabe
- `⌫` löscht rückwärts
- **Hinweis** setzt einen korrekten Buchstaben
- **Prüfen** markiert falsche bisherige Einträge
- **Neustart** behält Seed und Raster; **Neues Rätsel** erzeugt einen neuen Seed

## Schwierigkeitsgrade

| Stufe | Zielwörter | Mindestwörter | Hinweise | Qualitätsauswahl |
|---|---:|---:|---:|---|
| Leicht | 13 | 10 | 4 | kurze, kompakte Raster |
| Mittel | 17 | 14 | 3 | mehr und längere Einträge |
| Schwer | 21 | 17 | 2 | hohe Wortzahl, anspruchsvollere Hinweise |
| Experte | 23 | 19 | 1 | größte Raster und geringstes Hilfebudget |

Jedes Ergebnis bleibt innerhalb von 16×16 Zellen und muss zusammenhängend sein.
Das Spiel erzeugt ein **kompaktes Wortkreuz mit Sperrfeldern**, kein vorgegebenes
rotationssymmetrisches Zeitungs-Template. Dadurch bleiben hunderte Seeds lokal und
ohne Server generierbar, während Darstellung und Bedienung einem klassischen
Kreuzworträtsel entsprechen.

## Generator

`pandakreuzwort-logic.js` verwendet einen deterministischen PRNG und begrenztes
Backtracking. Für jede belegte Zelle wird der Richtungsbesitz separat geführt.
Der Abschlussvalidator rekonstruiert anschließend:

- Buchstaben und rechtwinklige Kreuzungen
- exakte Zellen, Zeilen und Spalten
- Nummerierung und Hinweislisten
- eine einzige zusammenhängende Komponente
- eindeutige Eintrags-IDs und Sprachzuordnung
- kanonische, aus der Wortbank abgeleitete Metadaten

Gleicher Seed + Sprache + Schwierigkeit + Daten-/Generatorversion ergibt dasselbe
Rätsel. Mehrere Kandidaten werden deterministisch bewertet; es gibt keine
zeitabhängige Abbruchentscheidung im Generator.

## Dateien

- `index.html` – semantische Oberfläche, aktiver Hinweis, Gitter und Dialoge
- `pandakreuzwort.css` – Sperrfeldraster, responsive Eingabe und Styles
- `pandakreuzwort-logic.js` – DOM-freier Generator, Metriken und Validator
- `pandakreuzwort-data.js` – versionierte redaktionelle Wortbank
- `pandakreuzwort.js` – Eingabe, Timer, Persistenz und UI
- `smoke-test.cjs` – Daten-, Unicode-, Generator-, Negativ- und Speicherprüfungen

## Prüfung

```bash
node --check pandakreuzwort/pandakreuzwort-logic.js
node --check pandakreuzwort/pandakreuzwort-data.js
node --check pandakreuzwort/pandakreuzwort.js
node pandakreuzwort/smoke-test.cjs
node browser-smoke-test.mjs
```
