# Tetris Game

Ein klassisches Tetris-Spiel, komplett in einer einzigen HTML-Datei implementiert. Kein Server, keine Abhängigkeiten, kein Build-Prozess – einfach im Browser öffnen und spielen.

## Spiel starten

Einfach `tetris.html` im Browser öffnen. Fertig.

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

- **Single-File**: Alle Logik, Rendering und UI in einer HTML-Datei
- **Vanilla JavaScript**: Keine Frameworks, keine Abhängigkeiten
- **HTML5 Canvas**: Direktes 2D-Rendering
- **Responsive**: Funktioniert auf Desktop und Mobile

## Datei

- [`tetris.html`](tetris.html) – Das komplette Spiel (~500 Zeilen)
