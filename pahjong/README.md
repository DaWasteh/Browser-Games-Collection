# Pahjong

Offline spielbares Mahjong-Solitaire mit einem echten 144-Stein-**Turtle-Layout**,
kompletter Spielanleitung, Zoom und reproduzierbar lösbaren Deals. Keine
Frameworks, CDNs oder externen Assets.

## Neu in v1.5

- bisherige vier rechteckige Ebenen durch ein klassisches Schildkrötenlayout mit
  **87 + 36 + 16 + 4 + 1** Steinen ersetzt
- Halbstein-Koordinaten: sichtbare Überdeckung, Seitenkontakt und Spiellogik
  verwenden exakt dieselben Rechtecke
- freie Steine bleiben hell, bedeckte Steine werden deutlich abgeblendet
- ausgewählter Stein, passende freie Partner und das exakt zweisteinige
  Hinweis-Paar besitzen unterschiedliche Markierungen
- sichtbare Drei-Schritte-Anleitung, Legende und ausführliche Regeln für normale
  Motive, Blumen und Jahreszeiten
- Einpassen sowie vier Zoomstufen; gezoomtes Brett lässt sich auf Mobilgeräten
  gezielt verschieben
- räumliche Pfeiltasten-Navigation mit nur einem Tab-Stopp im Brett
- nach dem Entfernen wandert der Fokus zu einem sichtbaren freien Stein statt auf
  einem unsichtbaren, deaktivierten Element zu verbleiben
- ein Sieg kann rückgängig gemacht werden
- laufender Deal, aktive Spielzeit und Zoom werden lokal gespeichert

## Spielanleitung

### 1. Freien Stein erkennen

Ein Stein ist frei, wenn:

1. kein Stein einer höheren Ebene seine Fläche überdeckt und
2. mindestens eine lange Seite – links **oder** rechts – vollständig offen ist.

Das Spiel dimmt blockierte Steine. Nur helle Steine sind wählbar.

### 2. Passendes Paar bilden

- Kreise, Bambus und Zeichen brauchen denselben Wert und dasselbe Motiv.
- Ost/Süd/West/Nord passen nur zum identischen Wind.
- Roter, grüner und weißer Drache passen nur zum identischen Drachen.
- Zwei beliebige **Blumen** passen zusammen.
- Zwei beliebige **Jahreszeiten** passen zusammen.

Wähle nacheinander zwei freie Partner. Ein falscher zweiter Stein wird zur neuen
ersten Auswahl, ohne einen Zug zu verbrauchen.

### 3. Alle 144 Steine entfernen

Jeder neue Deal wird rückwärts aus einem überprüften Entfernungsplan aufgebaut.
Damit existiert mindestens ein vollständiger Lösungsweg. Ein anderer legaler Zug
kann trotzdem eine Sackgasse erzeugen. Dann helfen:

- **Rückgängig** – stellt die letzte Paarung oder Mischung wieder her
- **Rest lösbar mischen** – erhält sämtliche übrigen Motive und verteilt sie auf
  eine neu verifizierte geometrische Fortsetzung
- **Hinweis** – markiert genau ein aktuell freies Paar

## Bedienung

- Maus/Touch: freie Steine nacheinander antippen
- Tab: Brett mit einem einzigen Fokusziel betreten
- Pfeiltasten: räumlich zum nächsten freien Stein
- Enter/Leertaste: Stein auswählen
- `H`: Hinweis
- `M`: Reststeine lösbar mischen
- `U`: Rückgängig
- `N`: neues Spiel
- `Esc`: Auswahl aufheben

## Architektur und Tests

- `engine.js` – DOM-freie Turtle-Geometrie, Faces, Paarregeln, Deal-/Shuffle-Plan
- `game.js` – zugängliche Oberfläche, Fokus, Zoom, Timer und Speicherung
- `styles.css` – responsive Ebenendarstellung und visuelle Zustände
- `smoke-test.cjs` – 1000 vollständige Deals, 120 Rest-Shuffles, Geometrie,
  Sonderpaare, Zustandsvalidator und Shell-Verträge

```bash
node --check pahjong/engine.js
node --check pahjong/game.js
node pahjong/smoke-test.cjs
node browser-smoke-test.mjs
```
