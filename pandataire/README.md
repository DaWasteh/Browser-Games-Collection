# Pandataire

Eigenständiger, offline spielbarer TriPeaks-Solitaire-Klon für die Browser-Games-Collection.

## Spielen

`index.html` direkt im Browser öffnen. Die Navigation **← Spieleauswahl** führt zurück zu `../index.html`.

## Regeln

- Das Tableau enthält die klassischen 28 Karten in drei Gipfeln: 3 + 6 + 9 + 10 Karten.
- Eine Karte ist frei, wenn keine der beiden Karten, die sie überdecken, noch im Tableau liegt.
- Eine freie Karte darf auf die Ablage, wenn ihr Rang genau eins höher oder niedriger ist.
- Das Ass ist zyklisch: A liegt auf 2 oder K und umgekehrt.
- Ist kein Zug möglich, wird eine Karte vom Talon gezogen. Der Talon hat 23 Karten.
- Sieg: alle 28 Tableau-Karten entfernen. Niederlage: Talon leer und kein gültiger Tableau-Zug.

Jede neue Runde wird aus einem kontrollierten, legalen Entfernungspfad erzeugt und ist daher grundsätzlich lösbar; Farben und Talon-Reihenfolge werden zufällig variiert.

## Steuerung und Funktionen

- Maus/Touch: Tableaukarte oder Talon antippen.
- Tastatur: `Tab` und `Enter`/Leertaste für Karten, `U` für Rückgängig, `R` für Neustart derselben Austeilung, `N` für eine neue Runde, `D` zum Ziehen.
- **Rückgängig**, **Runde neu starten** (gleicher Deal), **Neue Runde** (neuer Deal).
- Anzeigen für Züge, Zeit, Restkarten und aktuelle Serie.

## Dateien und Prüfung

- `index.html` – semantischer Einstieg
- `styles.css` – responsive Tisch- und Kartenansicht
- `game.js` – komplette Spiellogik und Eingabe

Syntaxprüfung: `node --check game.js`.
