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
| ⏳ **Sand Game Pro** | [`sandgame/`](sandgame/) | Falling-Sand-Simulation mit Physik, Chemie und WebGL2-Rendering |
| 🦠 **Game of Life** | [`game-of-life/`](game-of-life/) | Conways zellulärer Automat, interaktiv auf Canvas |
| 🐼 **Panda Lemmings** | [`panda-lemmings/`](panda-lemmings/) | Lemmings-inspiriertes Puzzle mit Pandas |
| 🃏 **Pandataire** | [`pandataire/`](pandataire/) | Solitaire-Sammelband: TriPeaks, Golf und Pyramid mit lösbaren Deals und Undo |
| 🕷️ **Panda Spider** | [`panda-spider/`](panda-spider/) | Spider-Solitaire mit einer, zwei oder vier Farben |
| ♠️ **Panndike** | [`panndike/`](panndike/) | Klondike-Solitaire mit Zieh-1/3 und Foundations |
| ♥️ **PandaCell** | [`pandacell/`](pandacell/) | FreeCell mit Deal-Nummern und Supermoves |
| 💣 **Minenräumkommando Foxtrott** | [`minenraeumkommando-foxtrott/`](minenraeumkommando-foxtrott/) | Minesweeper mit sicherem Erstklick und Chording |
| 🔤 **Texttl** | [`texttl/`](texttl/) | Deutscher Wordle-Klon mit Tages- und Zufallsmodus |
| 🔢 **Pandadoku** | [`pandadoku/`](pandadoku/) | Sudoku mit Notizen, Hinweisen und drei Schwierigkeitsgraden |
| ✏️ **Pandakreuzwort** | [`pandakreuzwort/`](pandakreuzwort/) | Seed-randomisierte Kreuzworträtsel in vier Stufen auf Deutsch oder Bairisch |
| 🀄 **Pahjong** | [`pahjong/`](pahjong/) | Mahjong-Solitaire mit garantiert lösbaren Deals |
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
Installation von Chrome, Edge oder Chromium. Gemeinsam prüfen sie alle 16 Spiele bei
320, 375 und 414 Pixel Breite sowie im Querformat: Boot, Laufzeitfehler, Navigation,
Kontrast, Tastatur-/Touch-Bedienung, Dialogfokus und kritische Zustandswechsel.
Zusätzliche Logiktests stressen Generatoren, lösbare Deals, Unicode und Rennbedingungen.

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
node maulkorbraupen-das-spiel/smoke-test.cjs
```

## ✨ Neu in v1.4

- Pandataire enthält jetzt **TriPeaks, Golf und Pyramid** als auswählbare, lösbare Modi.
- Alle 16 Spiele erhielten intensive Logik-, Browser-, Mobil- und Barrierefreiheitstests.
- Behobene Schwerpunkte: Frame-Raten-Unabhängigkeit, Touch-/Tastatursteuerung,
  Dialogfokus, sichere Speicherung, Kartenregeln und deutsche ß/ẞ-Darstellung.

## 📜 Historie

Dieses Repository fasst sechs ehemals eigenständige Repositories zusammen
(GameOfLife, Panda-Lemmings, Pong, SandGame, Snake-Ultimate, Tetris).
Die vollständige Commit-Historie aller Spiele wurde per `git subtree` übernommen.
