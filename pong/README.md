# Pong Game

🌐 **Live spielen:** <https://dawasteh.github.io/Pong/>

Ein klassisches Pong-Spiel, komplett in einer einzigen HTML-Datei implementiert. Kein Server, keine Abhängigkeiten, kein Build-Prozess – einfach im Browser öffnen und spielen.

## Spiel starten

Online spielen: **<https://dawasteh.github.io/Pong/>**

Oder lokal: Einfach `index.html` im Browser öffnen. Fertig.

## Features

- **vs CPU**: Spiele gegen die KI
- **2 Spieler**: Lokal gegen einen Freund am selben Gerät
- Canvas-basiertes Rendering mit 60 FPS
- Neon-Glow-Design mit Partikel-Effekten
- Ball wird bei jedem Treffer schneller (max Speed 14)
- Erster Spieler mit 5 Punkten gewinnt
- Verbesserte Physik und flüssigere Bewegungen
- Bessere Responsive Gestaltung

## Steuerung

| Spieler 1 (links) | Spieler 2 (rechts, nur 2P-Modus) |
|-------------------|----------------------------------|
| Maus bewegen | Pfeiltasten ↑ ↓ |
| Touch bewegen | Touch rechte Canvas-Hälfte |

## Technische Details

- **Single-File**: Alle Logik, Rendering und UI in einer HTML-Datei
- **Vanilla JavaScript**: Keine Frameworks, keine Abhängigkeiten
- **HTML5 Canvas**: Direktes 2D-Rendering mit `requestAnimationFrame`
- **Responsive**: Funktioniert auf Desktop und Mobile

## Verbesserungen

- **KI-Optimierung**: Flüssigere und realistischere KI-Bewegung
- **UI-Verbesserungen**: Modernes Design mit Animationen und Schatten
- **Physik-Optimierung**: Realistischere Ball-Bewegung und Kollisionen

## Datei

- [`pong.html`](pong.html) – Das komplette Spiel (~400 Zeilen)
