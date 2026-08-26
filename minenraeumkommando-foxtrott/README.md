# Minenräumkommando Foxtrott

💣 Ein klassisches Minesweeper-Spiel ohne Server, Frameworks oder Build-Prozess.
Komplett offline im Browser spielbar — nur eine HTML-Datei öffnen und loslegen.

## Neu in v1.5

- Eine Touch-Geste, die ein breites Minenfeld scrollt, deckt beim Loslassen kein versehentliches Feld mehr auf.
- Benutzerdefinierte Bestzeiten sind nach `Zeilen × Spalten × Minen` getrennt; unterschiedlich große Custom-Felder überschreiben einander nicht mehr.

## Spiel starten

Lokal: `index.html` im Browser öffnen (per Doppelklick oder Drag & Drop).
Alternativ über die [Spieleauswahl](../index.html) der Collection.

> Hinweis: Die Schwierigkeitsstufen können direkt im Startmenü gewählt werden.

## Features

- **Sicherer Erstklick**: Die Minen werden erst beim ersten Aufdecken platziert —
  die angeklickte Zelle **und ihre komplette 3×3-Nachbarschaft** bleiben garantiert
  minenfrei (an den Rändern beschnitten). Flaggen vor dem Erstaufdecken sind erlaubt.
- **Vier Schwierigkeitsstufen** + **Benutzerdefiniert**:

  | Stufe        | Raster    | Minen | Dichte  |
  |--------------|-----------|-------|---------|
  | Rekrut       | 9 × 9     | 10    | ~12 %   |
  | Feldwebel    | 16 × 16   | 40    | ~16 %   |
  | Hauptmann    | 16 × 30   | 99    | ~21 %   |
  | General      | 24 × 24   | 150   | ~26 %   |
  | Benutzerdef. | 5–40 × 5–40 | frei wählbar | — |

- **Chording**: Linksklick auf eine aufgedeckte Zahl (oder Mittelklick / `C`),
  deren Wert der Anzahl umliegender Flaggen entspricht, deckt alle übrigen
  Nachbarn auf.
- **Iterativer Flood-Fill**: Leere Zellen (0) breiten sich sicher aus — auch auf
  dem 24×24-Board ohne Stack-Overflow-Risiko.
- **Lokale Bestzeiten** pro Stufe via `localStorage` (im Privatmodus deaktiv,
  Spiel bleibt voll spielbar).
- **Barrierefreiheit**: Tastaturnavigation, sichtbarer Fokus (`:focus-visible`),
  sprechende `aria-label` je Zelle, `aria-live`-Region für Status/Minenzähler/Timer,
  reduzierte Animationen bei `prefers-reduced-motion`.
- **Sound** (Web Audio) mit an/aus-Schalter.

## Steuerung

### Maus

| Aktion | Wirkung |
|--------|---------|
| Linksklick | Zelle aufdecken |
| Rechtsklick | Flagge setzen / entfernen |
| Mittelklick | Chord |
| Linksklick auf aufgedeckte Zahl | Chord (wenn Flaggenanzahl passt) |

### Touch

| Geste | Wirkung |
|-------|---------|
| Tippen | Aufdecken |
| Lang drücken (~500 ms) | Flagge setzen / entfernen |

### Tastatur

| Taste | Aktion |
|-------|--------|
| `←` `→` `↑` `↓` | Cursor bewegen |
| `Enter` / `Leer` | Aufdecken |
| `F` | Flagge |
| `C` | Chord |
| `Home` / `End` | Zeilenanfang / -ende |

Das Smiley 🙂 oben startet jederzeit ein neues Spiel mit derselben Stufe.

## Spielregeln

- **Ziel**: Alle Nicht-Minen-Zellen aufdecken. Flaggen allein gewinnen **nicht**.
- **Zahlen** geben an, wie viele Minen in den 8 Nachbarzellen liegen.
- **Aufdecken einer 0** öffnet automatisch die gesamte verbundene leere Region.
- **Minenzähler** = verbleibende Minen − gesetzte Flaggen (darf negativ werden).
- **Niederlage**: Eine Mine wird aufgedeckt (auch versehentlich per Chord).
  Der Timer stoppt, alle Minen werden sichtbar, falsche Flaggen markiert.

## Technische Details

- **Vanilla JavaScript** — keine Frameworks, keine Runtime-Abhängigkeit, kein CDN.
- **DOM-freie Spiellogik** in `minesweeper-logic.js` (UMD-Modul, in Node testbar):
  `Object.freeze` Konstanten, injizierbarer RNG für deterministische Tests.
- **Kein Inline-`onclick`**, kein `innerHTML` für Inhalte — alle Events via
  `addEventListener`, alle dynamischen Inhalte via `textContent` / `createElement`.
- **Timer** über `Date.now()`-Differenz (keine Frame-/Intervall-Drift).
- **Defensiv**: `localStorage`-Zugriffe in `try/catch`, Dichte-Guard gegen
  zu viele Minen wirft sauber `RangeError` (kein Endlosloop).

## Dateien

- `index.html` – Einstieg, semantisches HTML, Accessibility, Menü & HUD
- `minesweeper.css` – komplette Optik, responsiv, `prefers-reduced-motion`
- `minesweeper-logic.js` – reine Spiellogik ohne DOM (UMD, `module.exports` + global `MinesweeperLogic`)
- `minesweeper.js` – UI-/DOM-Schicht, Eingaben, Timer, Sound, Bestzeiten
- `smoke-test.cjs` – Node-Selbsttest für Logik + HTML-Pattern-Checks
- `README.md` – diese Datei

## Check

```bash
node --check minesweeper-logic.js
node --check minesweeper.js
node smoke-test.cjs
npx --yes htmlhint@1.9.2 index.html
```
