# 🐼 Pandadoku

Sudoku für die Browser-Games-Collection – komplett offline, ohne externe
Abhängigkeiten oder Frameworks.

## Neu in v1.5

- Puzzle, Eingaben, Notizen, Fehlermarkierungen, Hinweise, Auswahl, Notizmodus, Undo-/Redo-Verlauf und aktive Zeit werden versioniert lokal gespeichert.
- Ein manuell pausiertes Rätsel bleibt nach einem Reload pausiert und verdeckt, bis es bewusst fortgesetzt wird.
- Der Timer speichert Millisekunden und rundet erst für die Anzeige; häufiges Pause/Fortsetzen verliert keine Teilsekunden mehr.
- Gespeicherte Rätsel werden vor dem Laden erneut auf gültige Zahlen, feste Vorgaben, eindeutige Lösbarkeit und dieselbe Lösung geprüft.

## Spielen

`index.html` direkt im Browser öffnen (oder über die
[Spieleauswahl](../index.html) erreichbar).

## Features

- **Drei Schwierigkeitsgrade** – Leicht (≈40 Vorgaben), Mittel (≈32),
  Schwer (≈25). Jedes Rätsel wird frisch erzeugt und besitzt **genau eine
  Lösung**.
- **Robuste Erzeugung** – vollständiges Gitter per randomisiertem
  Backtracking, anschließendes „Digging" mit `countSolutions(limit=2)` zur
  Eindeutigkeitsprüfung. Wird das Ziel nicht erreicht, stoppt die Erzeugung
  früher – die Eindeutigkeit bleibt in jedem Fall gewahrt.
- **Deutsche, barrierearme Oberfläche** – semantisches HTML, `role="grid"`,
  `aria-live`-Status, fokussierbare Felder, `prefers-reduced-motion`.
- **Notizmodus** – Kandidaten als kleine Zahlen eintragen (Taste `N`).
- **Begrenzte Hinweise** – bis zu drei korrekte Felder pro Rätsel (Taste `H`).
- **Fehlerprüfung** – falsche Eingaben werden rot markiert, ohne die Lösung
  zu verraten.
- **Undo / Redo**, **Pause** (mit abgedecktem Brett + gestopptem Timer),
  **Timer**, **Neustart** (gleiches Rätsel) und **Neues Spiel**.
- **Hervorhebung** – gewählte Zahl, Gleiche-Zahl-Felder sowie Zeile/Spalte/Kasten.
- **Touch & Tastatur** – Pfeiltasten, `1`–`9`, `Backspace`/`0`,
  `N` (Notiz), `R` (Neustart), `H` (Hinweis), `P` (Pause), `M` (Neues Spiel).

## Tastenkürzel

| Taste | Aktion |
|-------|--------|
| `← ↑ → ↓` | Feldauswahl bewegen |
| `1`–`9` | Zahl eintragen (bzw. Notiz im Notizmodus) |
| `Backspace` / `Entf` / `0` | Feld leeren |
| `N` | Notizmodus umschalten |
| `R` | Neustart (gleiches Rätsel) |
| `H` | Hinweis |
| `P` | Pause / Weiter |
| `M` | Neues Spiel |

## Dateien

- `index.html` – Markup und Struktur
- `styles.css` – Layout und Design
- `game.js` – Engine (Erzeugung/Solver) und Spiellogik; stellt
  `window.PandaDoku` für Smoke-Tests bereit

## Smoke-Test-API

```js
PandaDoku.generatePuzzle('schwer');   // { puzzle, solution, clues }
PandaDoku.countSolutions(grid, 2);    // 1 → eindeutig lösbar
PandaDoku.getState();                 // aktueller Spielzustand
```
