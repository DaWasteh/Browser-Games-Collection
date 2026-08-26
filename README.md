# 🕹️ Browser Games Collection

[![Deploy GitHub Pages](https://github.com/DaWasteh/Browser-Games-Collection/actions/workflows/pages.yml/badge.svg)](https://github.com/DaWasteh/Browser-Games-Collection/actions/workflows/pages.yml)

🌐 **Live spielen:** <https://dawasteh.github.io/Browser-Games-Collection/>

Eine Sammlung von Browser-Spielen – jedes Spiel ist eine eigenständige HTML-Datei
ohne Server, Frameworks oder Build-Prozess. Einfach öffnen und spielen.

## 🎮 Die Spiele

| Spiel | Ordner | Beschreibung |
|---|---|---|
| 🧱 **Tetris** | [`tetris/`](tetris/) | Der Klassiker: Fallende Blöcke stapeln und Reihen abbauen |
| 🐍 **Snake Ultimate** | [`snake-ultimate/`](snake-ultimate/) | Erweitertes Snake mit lokalem Multiplayer, 8 Themes und Addons |
| 🏓 **Pong** | [`pong/`](pong/) | Das klassische Duell – gegen die KI oder zu zweit |
| ⏳ **Sand Game Pro 2.2** | [`sandgame/`](sandgame/) | Falling-Sand-Simulation mit Active-Cell-Wind, Dirty Rendering und sicherem WebGL2/CPU-Fallback |
| 🦠 **Game of Life** | [`game-of-life/`](game-of-life/) | Conways zellulärer Automat, interaktiv auf Canvas |
| 🐼 **Panda Lemmings** | [`panda-lemmings/`](panda-lemmings/) | Lemmings-inspiriertes Puzzle mit Pandas |
| 🃏 **Pandataire** | [`pandataire/`](pandataire/) | Solitaire-Sammelband: TriPeaks, Golf und Pyramid mit lösbaren Deals und Undo |
| 🕷️ **Panda Spider** | [`panda-spider/`](panda-spider/) | Spider-Solitaire mit einer, zwei oder vier Farben |
| ♠️ **Panndike** | [`panndike/`](panndike/) | Zeitungsartiges Klondike mit Tagesdeal, Deal-Codes, Drag/Touch, Hinweisen und Foundations |
| ♥️ **PandaCell** | [`pandacell/`](pandacell/) | FreeCell mit Deal-Nummern und Supermoves |
| 💣 **Minenräumkommando Foxtrott** | [`minenraeumkommando-foxtrott/`](minenraeumkommando-foxtrott/) | Minesweeper mit sicherem Erstklick und Chording |
| 🔤 **Texttl** | [`texttl/`](texttl/) | Deutscher Wordle-Klon mit Tages- und Zufallsmodus |
| 🔢 **Pandadoku** | [`pandadoku/`](pandadoku/) | Sudoku mit Notizen, Hinweisen und drei Schwierigkeitsgraden |
| ✏️ **Pandakreuzwort** | [`pandakreuzwort/`](pandakreuzwort/) | Kompakte Sperrfeld-Kreuzworträtsel mit 464 deutschen/bairischen Einträgen |
| 🀄 **Pahjong** | [`pahjong/`](pahjong/) | Mahjong-Solitaire im echten 144-Stein-Turtle-Layout mit Anleitung, Zoom und lösbaren Deals |
| 🐛 **Maulkorbraupen – Das Spiel** | [`maulkorbraupen-das-spiel/`](maulkorbraupen-das-spiel/) | Vertontes Textadventure mit sieben Kapiteln und Werk-Rätseln |

Jeder Spiel-Ordner enthält ein eigenes README mit Details, Steuerung und Features.

## 🚀 Spielen

- **Online:** Die [Startseite](https://dawasteh.github.io/Browser-Games-Collection/) öffnen und ein Spiel auswählen.
- **Lokal:** Repository klonen und `index.html` im Browser öffnen – fertig.

```bash
git clone https://github.com/DaWasteh/Browser-Games-Collection.git
```

## ✅ Tests

Die browserbasierten Smoke-Tests benötigen **Node.js 22 oder neuer** sowie eine lokale
Installation von Chrome, Edge oder Chromium. Gemeinsam prüfen sie alle 16 Spiele in
sieben Phone-, Landscape-, Tablet- und Desktop-Viewports (DPR 1–3): Boot,
Laufzeitfehler, Navigation, Overflow, Kontrast, Zielgrößen, Tastatur-/Touch-Bedienung,
Dialogfokus, Persistenz und kritische Zustandswechsel. Zusätzliche Logiktests stressen
Generatoren über tausende Seeds, lösbare Deals, Unicode, Rennbedingungen,
Zustandskorruption, Pointer-Abbruch, Renderer-Fallback und Simulations-Tickbudgets.

```bash
node browser-smoke-test.mjs
node classic-games-smoke.mjs
node pandataire/smoke-test.cjs
node pahjong/smoke-test.cjs
node panndike/smoke-test.cjs
node panda-lemmings/smoke-test.cjs
node tetris/smoke-test.cjs
node minenraeumkommando-foxtrott/smoke-test.cjs
node texttl/smoke-test.cjs
node pandakreuzwort/smoke-test.cjs
node sandgame/smoke-test.cjs
node maulkorbraupen-das-spiel/smoke-test.cjs
```

## ✨ Neu in v1.5

### Große Überarbeitungen

- **Panndike Solitär** erhielt eine vollständige zeitungsartige Neugestaltung:
  reproduzierbare Deal-Codes, Tagesdeal, feste Zieh-1/3-Regel je Partie, Hinweise,
  sichere Auto-Moves, Doppelklick, Pointer-Drag, Touch, lokale Fortsetzung,
  aktive Spielzeit, Punkte/Statistik und ein vollständig responsives Sieben-Spalten-Layout.
- **Pandakreuzwort** wuchs von 189 auf **464 redaktionelle Einträge**. Sichtbare
  Sperrfelder, Mindestzellgröße, aktiver Hinweis und positionssichere Worteingabe
  wirken wie ein klassisches Kreuzworträtsel. Generator v3 verhindert
  gleichgerichtete Schein-Kreuzungen und bewertet Dichte, Kreuzungsrate,
  Richtungsbalance und Kompaktheit.
- **Pahjong** verwendet nun ein echtes, geometrisch konsistentes
  144-Stein-Turtle-Layout (87+36+16+4+1), eine sichtbare Drei-Schritte-Anleitung,
  klare Frei-/Bedeckt-/Auswahl-/Hinweis-Zustände, Zoom und räumliche Tastaturnavigation.
- **Sand Game Pro 2.2** begrenzt Catch-up auf acht Ticks, verarbeitet Wind nur über
  aktive Zellen, stoppt Uploads in pausierten Szenen, entprellt Welt-Resizes,
  begrenzt Bildimporte auf W×H und besitzt einen echten WebGL2→Canvas2D-Fallback.

### Fehlerbehebungen in den übrigen Spielen

- TriPeaks verrät keine verdeckten Ränge mehr; TriPeaks/Golf variieren ihre Rangpfade.
- PandaCell und Panda Spider berechnen tiefe Spaltenhöhen dynamisch; Escape und
  Rückgängig in Endzuständen funktionieren konsistent.
- Panda Lemmings ist per Tastatur bis zur Panda-/Fähigkeitszuweisung spielbar,
  wahrt native Dialogbuttons, vergrößert mobile Trefferflächen und speichert Fortschritt.
- Pong speichert CPU-/Spieler-2-Ergebnisse korrekt, startet Replays ohne Timing-Sprung
  und besitzt lesbare 44-Pixel-Mobile-Controls.
- Minesweeper trennt Custom-Bestzeiten nach Feldmaßen und löst nach Touch-Scrollen
  kein Feld mehr aus.
- Pandadoku speichert Puzzle, Notizen, Timer und Undo/Redo defensiv; häufiges Pausieren
  verliert keine Teilsekunden.
- Texttl persistiert bestätigte Versuche vor der Flip-Animation.

`game-of-life`, `maulkorbraupen-das-spiel` und `snake-ultimate` blieben auf Wunsch
inhaltlich unverändert; Tetris wurde geprüft, aber mangels reproduzierbarer Regression
nicht unnötig umgebaut.

## v1.4

- Pandataire enthält **TriPeaks, Golf und Pyramid** als auswählbare, lösbare Modi.
- Alle 16 Spiele erhielten Logik-, Browser-, Mobil- und Barrierefreiheitstests.

## 📜 Historie

Dieses Repository fasst sechs ehemals eigenständige Repositories zusammen
(GameOfLife, Panda-Lemmings, Pong, SandGame, Snake-Ultimate, Tetris).
Die vollständige Commit-Historie aller Spiele wurde per `git subtree` übernommen.

## 📄 Lizenz

Der Quellcode steht unter der [MIT-Lizenz](LICENSE).
