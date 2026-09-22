# Pandataire

Eigenständiger, offline spielbarer Solitaire-Sammelband für die Browser-Games-Collection – drei Varianten in einem Spiel: **TriPeaks**, **Golf** und **Pyramid**.

## Neu in v2.0

- Karten werden vom gemeinsamen Kartenmodul (`shared/card-deck.js`, `shared/card-deck.css`)
  gezeichnet: Eckindex, Pip-Layouts, gerahmte Bildkarten, Panda-Rückseite, Nacht-/Kontrast-Farben
  und ein Schalter für ein **vierfarbiges Deck** (♦ blau, ♣ grün).
- **Drag-and-drop mit Kartenvorschau** für Maus, Stift und Touch – freie Karten auf die Ablage, in Pyramid auch direkt auf die Partnerkarte; gültige Ziele werden
  markiert, ungültige Ablagen federn zurück. Antippen-und-Ziel-wählen funktioniert weiterhin.
- Züge, Rückgängig und Austeilen laufen als flüssige Flug-Animationen (abschaltbar über
  `prefers-reduced-motion`).

## Neu in v1.5

- Blockierte TriPeaks-Karten zeigen weder visuell noch im Accessibility-Text Rang oder Farbe; sie werden erst beim Freilegen aufgedeckt.
- TriPeaks und Golf erzeugen deckverträgliche zufällige ±1-Rangpfade statt nur eines festen Musters und seiner Umkehrung.
- Wartezeit auf einem Gewinn-/Verlustdialog wird nach Rückgängig nicht mehr zur aktiven Spielzeit addiert.
- Seeds bleiben deterministisch; 100 Stichproben liefern mindestens 90 verschiedene Tableau-Rangsignaturen je Einzelkartenmodus.

## Spielen

`index.html` direkt im Browser öffnen. Die Navigation **← Spieleübersicht** führt zurück zu `../index.html`.
Oben wird der Modus gewählt (TriPeaks / Golf / Pyramid); die Auswahl wird lokal gespeichert.

## Modi und Regeln

### TriPeaks
- 28 Karten in drei Gipfeln (3 + 6 + 9 + 10).
- Eine Karte ist frei, wenn keine der beiden deckenden Karten mehr im Tableau liegt.
- Freie Karte auf die Ablage, wenn ihr Rang genau eins höher oder niedriger ist – Ass und König sind benachbart (A↔K).
- Talon: 23 Karten. Sieg: alle 28 Karten entfernt. Niederlage: Talon leer und kein gültiger Zug.

### Golf
- 35 Karten in sieben Spalten zu je fünf Karten.
- Nur der freie Spaltenboden (die unterste Karte einer Spalte) ist spielbar.
- Gleiche Rang-±1-Regel wie TriPeaks inklusive A↔K-Nachbarschaft.
- Talon: 16 Karten. Sieg: alle 35 Karten entfernt.

### Pyramid
- 28 Karten in einer Pyramide (1 + 2 + … + 7).
- Eine Karte ist frei, wenn beide darunter liegenden Karten entfernt sind.
- Entferne **Paare** freier Karten, deren Rangsumme 13 ergibt (6+7, 5+8, 4+9, 3+10, 2+J, A+Q). Ein **König (13)** geht allein raus.
- Eine freie Karte lässt sich auch mit der **Ablagespitze** paaren.
- Talon: 24 Karten, einmal umladbar (Umlauf). Sieg: alle 28 Pyramid-Karten entfernt.

Jede neue Runde wird aus einem kontrollierten, legalen Lösungspfad erzeugt und ist daher lösbar; Farben und Talon-Reihenfolge variieren zufällig.

## Steuerung und Funktionen

- Maus/Touch: Karte oder Talon antippen; bei Pyramid eine zweite Karte (oder die Ablage) zum Paaren wählen.
- Tastatur: `Tab` zu Karten, `Enter`/`Leertaste` auswählen; `U` Rückgängig, `R` gleiche Runde neu, `N` neue Runde, `D` Talon ziehen, `1`/`2`/`3` Modus wählen.
- **Rückgängig**, **Runde neu starten** (gleicher Deal), **Neue Runde** (neuer Deal).
- Anzeigen für Züge, Serie, Zeit, Übrig (sowie Umlauf bei Pyramid).

## Dateien und Prüfung

- `index.html` – semantischer Einstieg mit Moduswahl
- `styles.css` – responsive Tisch-, Karten- und Modus-Ansicht
- `engine.js` – DOM-freie, in Node testbare Kernlogik (PRNG, Deck, Züge, Undo, Lösbarkeit)
- `rulesets.js` – DOM-freie Regelsätze TriPeaks/Golf/Pyramid (Topologie, Layout, Generator)
- `game.js` – Controller und Ansicht (Moduswahl, Rendering, Eingabe, HUD)
- `smoke-test.cjs` – logischer Smoke-Test (1000 Seeds je Modus, keine Abhängigkeiten)

Syntax- und Logikprüfung:

```bash
node --check engine.js
node --check rulesets.js
node --check game.js
node smoke-test.cjs
```
