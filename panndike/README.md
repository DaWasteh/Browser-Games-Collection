# Panndike Solitär

Panndike ist ein vollständig offline spielbares Klondike-Solitär im klaren,
zeitungsartigen Stil. Es benötigt weder Frameworks noch externe Assets und läuft
mit Maus, Tastatur, Touch und Stift.

## Neu in v2.0

- Karten werden vom gemeinsamen Kartenmodul (`shared/card-deck.js`, `shared/card-deck.css`)
  gezeichnet: Eckindex, Pip-Layouts, gerahmte Bildkarten, Panda-Rückseite, Nacht-/Kontrast-Farben
  und ein Schalter für ein **vierfarbiges Deck** (♦ blau, ♣ grün).
- **Drag-and-drop mit Kartenvorschau** für Maus, Stift und Touch – Tableau, Ablage und Fundamente; ersetzt den bisherigen Text-Ghost; gültige Ziele werden
  markiert, ungültige Ablagen federn zurück. Antippen-und-Ziel-wählen funktioniert weiterhin.
- Züge, Rückgängig und Austeilen laufen als flüssige Flug-Animationen (abschaltbar über
  `prefers-reduced-motion`).

## Neu in v1.5

- redaktionell ruhige, responsive Oberfläche statt eines horizontal verschobenen
  Mobil-Spielfelds
- reproduzierbare Deal-Codes, **Partie neu starten** und gemeinsamer **Tagesdeal**
- festes Regelwerk pro Partie: Zieh 1 oder Zieh 3 kann nicht mehr mitten im Deal
  gewechselt werden
- Hinweise, sichere Fundament-Züge, Doppelklick-Auto-Move sowie Pointer-Drag mit
  der weiterhin verfügbaren Antippen-und-Ziel-wählen-Bedienung
- Punkte, aktive Spielzeit, lokale Bestwerte und Tagesdeal-Serie
- laufende Partie wird lokal gespeichert und nach einem Reload defensiv
  wiederhergestellt
- dynamische Spaltenhöhe, damit lange Folgen niemals Bedienelemente überdecken
- Ergebnis- und Abbruchdialoge mit Fokusführung; ein Siegzug kann rückgängig
  gemacht werden

## Regeln

- Sieben Tableau-Spalten werden klassisch mit 1 bis 7 Karten ausgeteilt; nur die
  jeweils oberste Karte ist offen.
- Im Tableau wird absteigend und abwechselnd rot/schwarz gebaut.
- Eine leere Spalte nimmt nur einen König oder eine mit König beginnende Folge auf.
- Die vier Fundamente werden je Farbe vom Ass bis zum König aufgebaut.
- Die oberste Fundamentkarte darf auf ein gültiges Tableau zurückgelegt werden.
- Je nach zu Beginn gewählter Regel werden eine oder drei Karten vom Talon auf die
  Ablage gelegt. Ein leerer Talon recycelt die Ablage.
- Nicht jeder zufällige Klondike-Deal ist zwangsläufig lösbar; Rückgängig, Hinweis
  und derselbe neu startbare Deal unterstützen beim Ausprobieren anderer Wege.

## Bedienung

- **Maus/Touch:** Karte oder Folge antippen, danach ein markiertes Ziel antippen.
- **Maus/Stift:** Karten und Folgen können zusätzlich direkt gezogen werden.
- **Doppelklick:** eine passende Einzelkarte automatisch aufs Fundament legen.
- **Tastatur:** Tab und Enter/Leertaste für alle Ziele; Pfeiltasten bewegen den
  Fokus zwischen Tableau-Karten.
- Kurzbefehle: `U` Rückgängig, `H` Hinweis, `A` sichere Fundament-Züge,
  `R` dieselbe Partie neu, `N` neue Partie, `D` ziehen, `Esc` Auswahl aufheben.

## Architektur

- `engine.js` – DOM-freie, deterministische Klondike-Engine und Zustandsvalidator
- `game.js` – Darstellung, Eingabe, Timer, Speicherung, Dialoge und Statistik
- `index.html` – semantische Spieloberfläche und echte Kurzanleitung
- `styles.css` – responsive Karten-/Tableau-Darstellung
- `smoke-test.cjs` – Regel-, Seed-, Hinweis-, Speicher- und Shell-Tests

## Prüfung

```bash
node --check panndike/engine.js
node --check panndike/game.js
node panndike/smoke-test.cjs
node browser-smoke-test.mjs
```

Der Spielstand und die Statistik bleiben ausschließlich im lokalen Browser.
