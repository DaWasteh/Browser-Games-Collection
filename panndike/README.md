# Panndike

Panndike ist ein vollständiger, offline spielbarer Klondike-Solitaire-Klon ohne Frameworks oder externe Assets. Öffne `index.html` direkt im Browser.

## Regeln

- Sieben Tableau-Spalten werden klassisch mit 1 bis 7 Karten ausgeteilt; nur die oberste Karte ist offen.
- Im Tableau wird absteigend mit wechselnden Farben gebaut. Eine leere Spalte nimmt nur einen König auf.
- Die vier Foundations werden je Farbe von Ass bis König aufgebaut.
- Der Stock unterstützt **Zieh 1** und **Zieh 3**. Ist er leer, wird die Waste umgedreht und recycelt.
- Ungültige Züge werden verhindert. Verdeckte Karten werden nach dem Entfernen der offenen Karte automatisch aufgedeckt.
- Die oberste Foundation-Karte kann konservativ zurück auf ein gültiges Tableau gelegt werden; darunterliegende Foundation-Karten bleiben geschützt.

## Bedienung

Karte oder gültige Sequenz anklicken bzw. antippen, anschließend Tableau/Foundation als Ziel wählen. Die oberste Karte einer Foundation kann ebenfalls ausgewählt und auf ein passendes Tableau zurückgelegt werden. Buttons sind vollständig per Tab/Enter erreichbar. `U` macht rückgängig, `N` startet ein neues Spiel und `A` führt sichere Foundation-Züge aus. Die Anzeige führt Züge, Zeit und Foundation-Fortschritt.

## Dateien

- `index.html` – semantische Spieloberfläche mit Navigation zu `../index.html`
- `styles.css` – responsive Desktop-/Touch-Darstellung mit sichtbarem Fokus
- `game.js` – Deal, Klondike-Regeln, Undo, Zeit, Auto-Finish und Siegzustand

## Prüfung

```bash
node --check game.js
```

Das Spiel benötigt keinen Server und speichert keine persönlichen Daten.
