# PandaCell

PandaCell ist ein vollständiger, offline spielbarer FreeCell-Klon ohne Frameworks, Build-Schritt oder externe Assets. Öffne `index.html` direkt im Browser.

## Regeln

- 52 Karten werden offen auf acht Tableau-Spalten verteilt (4 Spalten mit 7, 4 mit 6 Karten).
- Im Tableau wird absteigend und mit wechselnden Farben gebaut; jede Karte kann in eine der vier freien Zellen gelegt werden.
- Die vier Foundations werden nach Farbe von Ass bis König aufgebaut.
- Korrekt gebaute Sequenzen können als Block verschoben werden. Die Supermove-Grenze lautet `(freie Zellen + 1) × 2^leere Spalten`. Beim Verschieben in eine leere Spalte wird diese Zielspalte nicht mitgezählt.
- Sichere Auto-Moves legen nur Karten ab, deren Verschieben keine niedrigere gegnerische Farbe blockieren kann.
- Alle Deal-Nummern 1–32000 erzeugen mit einem lokalen, deterministischen Zufallsgenerator reproduzierbare Austeilungen.

## Bedienung

Klicke oder tippe eine Karte bzw. Sequenz an und anschließend eine freie Zelle, Foundation oder Tableau-Spalte. Doppelklick führt nur sichere Foundation-Züge aus. Alle Ziele sind echte Buttons und per Tab/Enter erreichbar. `U` macht rückgängig, `N` startet denselben Deal neu, `D` wählt den nächsten Deal und `A` führt sichere Auto-Moves aus.

## Dateien und Prüfung

- `index.html` – zugängliche deutsche Oberfläche mit Navigation zur Spieleauswahl
- `styles.css` – responsive Desktop-/Touch-Darstellung und sichtbare Fokusrahmen
- `game.js` – deterministischer Deal, Regeln, Supermoves, Undo, Timer, Auto-Moves und Sieg

Syntaxprüfung:

```bash
node --check game.js
```

Das Spiel speichert keine persönlichen Daten und benötigt keinen Server.
