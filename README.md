# Tetris Game

Ein klassisches Tetris-Spiel ohne Server, Frameworks oder Build-Prozess. Im Browser öffnen und spielen.

## Spiel starten

`index.html` öffnen. `tetris.html` funktioniert ebenfalls.

## Features

- **10x20 Grid** mit allen 7 klassischen Tetrominoes
- **Ghost-Piece**: Zeigt die Landeposition des Steins
- **Next-Piece**: Vorschau des nächsten Steins
- **Level-System**: Alle 10 Lines steigt das Level (Geschwindigkeit erhöht sich)
- **Scoring**: 100/300/500/800 Punkte für 1/2/3/4 Lines (multipliziert mit Level)
- **Touch-Steuerung**: Für mobile Geräte optimiert

## Steuerung

| Taste | Aktion |
|-------|--------|
| `←` `→` | Horizontal bewegen |
| `↓` | Schneller fallen lassen (Soft Drop) |
| `↑` | Rotieren |
| `Space` | Hard Drop (sofort fallen lassen) |
| `P` | Pause |

## Touch-Steuerung

| Geste | Aktion |
|-------|--------|
| Swipe horizontal | Bewegen |
| Swipe down | Hard Drop |
| Tap | Rotieren |

## Technische Details

- **Vanilla JavaScript**: Keine Frameworks, keine Runtime-Abhängigkeiten
- **HTML5 Canvas**: Direktes 2D-Rendering
- **Responsive**: Desktop und Mobile
- **Pure Game Logic**: Spielregeln in `tetris-logic.js`, UI/Canvas in `tetris.html`

## Dateien

- `index.html` – Einstieg/Redirect
- `tetris.html` – UI, Rendering, Eingabe, Audio
- `tetris-logic.js` – Spiellogik ohne DOM
- `smoke-test.cjs` – kleiner Node-Selbstcheck

## Check

```bash
node smoke-test.cjs
npx --yes htmlhint index.html tetris.html
```
