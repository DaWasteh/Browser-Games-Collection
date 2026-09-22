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
| 🫧 **Panda: Jäger der Blasen** | [`panda-bubbles/`](panda-bubbles/) | Bubble Shooter mit Bandenbonus, fallenden Gruppen und Bambusblase |
| 💎 **Des Pandas Juwelen** | [`des-pandas-juwelen/`](des-pandas-juwelen/) | Match 3 mit Kaskaden, Spezialkristallen und taktischer Panda-Pfote |
| ⏳ **Sand Game Pro 2.3** | [`sandgame/`](sandgame/) | Falling-Sand-Simulation mit Active-Cell-Wind, schlankem Chemie-Kern und sicherem WebGL2/CPU-Fallback |
| 🦠 **Game of Life** | [`game-of-life/`](game-of-life/) | Conways zellulärer Automat, interaktiv auf Canvas |
| 🐼 **Panda Lemmings** | [`panda-lemmings/`](panda-lemmings/) | Lemmings-inspiriertes Puzzle mit Pandas |
| 🃏 **Pandataire** | [`pandataire/`](pandataire/) | Solitaire-Sammelband: TriPeaks, Golf und Pyramid mit lösbaren Deals, Undo und Drag-and-drop |
| 🕷️ **Panda Spider** | [`panda-spider/`](panda-spider/) | Spider-Solitaire mit einer, zwei oder vier Farben und Drag-and-drop |
| ♠️ **Panndike** | [`panndike/`](panndike/) | Zeitungsartiges Klondike mit Tagesdeal, Deal-Codes, Drag/Touch mit Kartenvorschau, Hinweisen und Foundations |
| ♥️ **PandaCell** | [`pandacell/`](pandacell/) | FreeCell mit Deal-Nummern, Supermoves und Drag-and-drop |
| 💣 **Minenräumkommando Foxtrott** | [`minenraeumkommando-foxtrott/`](minenraeumkommando-foxtrott/) | Minesweeper mit sicherem Erstklick und Chording |
| 🔤 **Texttl** | [`texttl/`](texttl/) | Deutscher Wordle-Klon mit 1022 Lösungen, Tipp-Funktion, Tages-/Zufallsmodus und Knifflig-Modus |
| 🔢 **Pandadoku** | [`pandadoku/`](pandadoku/) | Sudoku mit Notizen, Hinweisen und drei Schwierigkeitsgraden |
| ✏️ **Pandakreuzwort** | [`pandakreuzwort/`](pandakreuzwort/) | Kompakte Sperrfeld-Kreuzworträtsel mit 969 deutschen/bairischen Einträgen und Bestzeiten |
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
Installation von Chrome, Edge oder Chromium. Gemeinsam prüfen sie alle 18 Spiele in
zehn Phone-, Landscape-, Tablet-, Desktop-, Widescreen- und Ultrawide-Viewports (DPR 1–3): Boot,
Laufzeitfehler, Navigation, Overflow, Kontrast, Zielgrößen, Tastatur-/Touch-Bedienung,
Dialogfokus, Persistenz und kritische Zustandswechsel. Zusätzliche Logiktests stressen
Generatoren über tausende Seeds, lösbare Deals, Unicode, Rennbedingungen,
Zustandskorruption, Pointer-Abbruch, Renderer-Fallback und Simulations-Tickbudgets.

```bash
node browser-smoke-test.mjs
node classic-games-smoke.mjs
node panda-bubbles/smoke-test.cjs
node des-pandas-juwelen/smoke-test.cjs
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

## ✨ Neu in v2.1

### Kartengesichter ohne Überlappungen

- Festes Raster für alle Karten: Der Eckindex belegt die oberen rund 19 % der Kartenhöhe
  (unten gespiegelt), das Pip-Feld liegt zwischen 29,5 % und 70,5 %, Bildkarten-Rahmen
  zwischen 27 % und 73 % – das Emblem (🎋/🌸/👑) sitzt jetzt innerhalb des Rahmens.
- Kompakterer Index (Rang 23 cqw, Farbe 17 cqw), engere Pips bei 9 und 10, größere Bildkarten-Initiale.
- Bei sehr schmalen Karten (unter 36 px) entfallen unterer Index und Emblem, das Initial rückt in die Mitte.

## ✨ Neu in v2.0

### Gemeinsames Kartendesign für alle Kartenspiele

- Neues Modul `shared/card-deck.css` + `shared/card-deck.js` (`window.GameCards`), genutzt von
  **Pandataire, Panda Spider, Panndike und PandaCell**. Jede Karte zeigt einen klaren Eckindex
  (Rang + Farbe, unten gespiegelt), echte **Pip-Layouts** für 2–10, ein großes Ass und gerahmte
  Bildkarten mit Emblem (🎋 Bube, 🌸 Dame, 👑 König). Die Typografie skaliert per Container-Query
  mit der Kartenbreite, sodass dieselbe Karte auf 36 px und 88 px stimmig bleibt.
- Neue **Panda-Rückseite** (Gitter mit Medaillon) für Talon, verdeckte Karten und Stock; eigene
  Farbwerte für Nacht- und Kontrast-Ansicht.
- Neuer Schalter **Zweifarbig/Vierfarbig** in der Toolbar der Kartenspiele: im Vierfarbdeck
  sind ♦ blau und ♣ grün, damit sich alle Farben sofort unterscheiden lassen. Die Wahl wird
  geräteweit gespeichert.

### Flüssige Animationen und Drag-and-drop mit Kartenvorschau

- **Ziehen mit Vorschau**: Karten und ganze Folgen folgen dem Finger oder Zeiger als echte
  Kartenvorschau mit leichter Neigung; gültige Ziele werden markiert, das Ziel unter dem
  Finger leuchtet auf. Ungültige Ablagen federn sichtbar zurück. Antippen-und-Ziel-wählen bleibt
  parallel erhalten.
- **FLIP-Flüge**: Bei Tipp-Zügen, Auto-Zügen, Rückgängig und Austeilen fliegen die Karten
  sichtbar an ihren neuen Platz; freigelegte Karten drehen sich um; neue Deals werden gestaffelt
  ausgeteilt. Alles per `prefers-reduced-motion` abschaltbar.
- Mobile Optimierung: Bewegung über `transform`/`translate` in `requestAnimationFrame`, nur
  bewegliche Karten blockieren das Scrollen, Touch hebt die Vorschau leicht über den Finger.
- Panda Spider misst die Kartengeometrie jetzt wie die anderen Spiele aus der realen
  Spaltenbreite (festes Seitenverhältnis 0,72).

## ✨ Neu in v1.9

### Gemeinsames Ton- und Effektsystem

- Neues Modul `shared/game-audio.js`: prozedurale Web-Audio-Klänge (Tippen, Legen,
  Umdrehen, Treffer, Fehler, Hinweis, Rückgängig, Mischen, Sieg, Niederlage, Fanfare)
  ohne externe Assets. Ein **Ton-Schalter** in der gemeinsamen Toolbar gilt geräteweit
  für alle Spiele und wird lokal gespeichert; vor der ersten Nutzergeste bleibt alles still.
- Neues Modul `shared/game-fx.js`: **Konfetti** beim Sieg, Puls- und Wackel-Feedback für
  richtige bzw. falsche Eingaben, jeweils mit Rücksicht auf `prefers-reduced-motion`.
- Pahjong, Panda Spider, PandaCell, Pandadoku, Pandataire, Panndike, Texttl,
  Pandakreuzwort, Maulkorbraupen und der Launcher nutzen die Module; Dialoge blenden
  in allen Shell-Spielen weich ein, Toolbar-Buttons erhielten Hover-Glow.

### Texttl und Pandakreuzwort deutlich erweitert

- **Texttl** wächst auf **1022 Lösungen und 1118 gültige Ratewörter**. Der bisherige
  Tagespool bleibt eingefroren; der erweiterte Pool gilt ab **10. September 2026 (UTC)**.
  Neu sind ein einmaliger **💡 Tipp** pro Runde (Buchstabe samt Position, im Teilen-Text
  markiert), ein Live-Countdown bis zum nächsten Tagesrätsel sowie Flip-, Fehler- und
  Siegklänge. Spielfeld und Tastatur behalten auf allen Bildschirmen ihre volle Breite.
- **Pandakreuzwort** umfasst jetzt **969 redaktionelle Einträge** (844 Deutsch,
  125 Bairisch). Neue **Bestzeiten** je Sprache und Stufe erscheinen im HUD und im
  Ergebnisdialog; fertige Wörter geben ein Erfolgssignal, Prüfen und Hinweis eigene
  Klänge. Die v1.5- und v1.6-Wortbänke bleiben für laufende Rätsel eingefroren.

### Sand Game Pro 2.3 – schlankerer Simulationskern

- Die Reaktionskette läuft nur noch für Materialien, die tatsächlich Reaktionszentrum
  sein können, oder für Zellen über 44 °C; leere Nachbarn werden sofort übersprungen.
- Umgebungstemperatur einmal pro Tick statt pro Zelle, Rauchbildung ohne Allokation.
  Das Simulationsergebnis bleibt identisch, ruhende und sandlastige Szenen werden spürbar günstiger.

### Launcher und Responsivität

- Der Launcher besitzt **Kategorie-Chips**, eine **Suche**, Badges für aktualisierte
  Spiele, eine „Zuletzt gespielt“-Markierung und größere Karten auf Widescreen-Monitoren.
- Die gemeinsame Shell skaliert Schrift und Bedienelemente ab 1800 px bzw. 2400 px Breite;
  Texttl und Pandakreuzwort erhielten eigene Ultrawide-Layouts.
- Beide Browser-Suiten prüfen zusätzlich **1920×1080, 2560×1080 und 3440×1440** auf
  Überlauf, Kontrast und Bedienbarkeit, der Launcher-Test deckt Filter, Suche und
  Ton-Schalter ab.

## ✨ Neu in v1.8

### Des Pandas Juwelen – sauberer Spielfluss

- Juwelen tauschen nun ihre Plätze sichtbar per richtungsgenauer Bewegung; ungültige
  Züge federn zurück, statt nur an derselben Stelle zu wackeln.
- Die Engine liefert für jede Kaskade echte Quell-, Ziel- und Spawnpositionen.
  Dadurch fallen ausschließlich bewegte oder neue Steine – über exakt die
  zurückgelegte Zeilendistanz, gestaffelt und mit einem kleinen Landeeffekt.
- Treffer besitzen Kristallsplitter und Punkte-Popups; Liniensteine, Bomben und
  Prismen eigene Strahl-/Wellenanimationen. Auch Spezialstein-Erzeugung,
  automatisches Mischen und Rundenstart sind klar getrennte Übergänge.
- Ein Sieg endet jetzt in einer vollständigen Abschlusswelle: Das Spielfeld wird
  sichtbar abgeräumt und bleibt nach „Ergebnis ansehen“ in einem ruhigen, leeren
  Endzustand. Timer, Kombotext, Eingabesperre und Live-Status werden dabei sauber
  abgeschlossen.

### Panda: Jäger der Blasen – mehr Dynamik

- Das Panda-Katapult folgt jetzt der tatsächlichen Zielrichtung und reagiert mit
  Rückstoß, Mündungsring und Flugspur. Bewegte Zielpunkte, eine transparente
  Einrastvorschau und ein eigener Bandenimpuls machen jeden Schuss besser lesbar.
- Blasen rasten federnd ein, Gruppen platzen gestaffelt mit Ringen und Splittern,
  lose Gruppen fallen rotierend und Punkte erscheinen direkt am Treffer. Die
  Bambusblase erhielt zusätzlich eine echte schillernde Oberfläche.
- Neue Druckreihen schieben das komplette Hexraster weich nach unten, statt es
  springen zu lassen. Eine explizite Flug-/Treffer-/Fall-/Druck-/Abschlussphase
  verhindert Eingaben zwischen Zuständen und lässt das letzte Trefferfeedback vor
  dem Ergebnisdialog vollständig ausspielen.
- Pause friert jetzt auch Partikel und Übergänge ein; ein Wechsel auf reduzierte
  Bewegung räumt laufende Kosmetik sofort auf. Die neue kurze Querformatansicht
  hält Spielfeld, Vorschau und Hauptaktionen auf Smartphone-Displays gemeinsam im
  Blick.

### Qualität

- Die Logiktests prüfen Bewegungsmetadaten der Juwelenschwerkraft. Die Browser-Suite
  kontrolliert zusätzlich richtungsgenaue Tauschaktionen, selektive Fallwege,
  saubere Siegzustände, Druckreihen, Eingabesperren, pausierte Effekte und den
  Wechsel zu reduzierter Bewegung.

## ✨ Neu in v1.7

### Zwei neue Panda-Spiele

- **Panda: Jäger der Blasen** bringt einen vollständig responsiven Bubble Shooter
  mit präziser Maus-, Touch- und Tastatursteuerung, sichtbarer Abprall-Vorschau,
  Farbtausch, nachrückenden Reihen sowie animierten Platz-, Fall- und Flugphasen.
  Erfolgreiche Bandenwürfe laden die **Bambusblase**, die beim Auftreffen
  automatisch die dort stärkste Farbe annimmt.
- **Des Pandas Juwelen** ergänzt ein zugbasiertes Match-3-Spiel mit garantierter
  Startbewegung, automatischem Mischen festgefahrener Felder, Kaskadenwertung und
  Liniensteinen, 3×3-Pfotenbomben sowie farblöschenden Prismen. Die aufladbare
  **Panda-Pfote** erlaubt einmalig einen gültigen Fern-Tausch.

### Oberfläche, Sound und Qualität

- Beide Spiele verwenden die gemeinsame Panda-, Nacht- und Kontrastansicht,
  schlanke responsive Bedienfelder, eigenständige Farbsymbole, Live-Status und
  dialoggerechte Fokusführung. Der Bubble Shooter besitzt ein fokussierbares
  Tastatur-Canvas; das Juwelenspiel ergänzt roving Grid-Fokus und Wischgesten.
- Prozedural erzeugte Web-Audio-Effekte und reduzierte, bei Bedarf abschaltbare
  Animationen begleiten Schüsse, Abpraller, Treffer, Kaskaden, Spezialsteine,
  Siege und Niederlagen – ohne externe Assets oder Bibliotheken.
- Neue deterministische Logik-Suites stressen Hexraster, Gruppenabwurf,
  Andockgeometrie, Generatoren, gültige Züge, Spezialketten, Fern-Tausch,
  Schwerkraft und tausende Kaskadenauflösungen. Die Browser-Suite deckt jetzt alle
  **18 Spiele** ab; GitHub Pages wird erst nach den Logik- und Browser-Gates
  veröffentlicht.

## ✨ Neu in v1.6

### Inhalte und Oberfläche

- **Pandakreuzwort** umfasst jetzt **659 redaktionelle Einträge** (576 Deutsch,
  83 Bairisch). Die mobile Worteingabe lässt Cursor und IME-Komposition unberührt,
  statt den aktiven Text nach jedem Zeichen mit Platzhaltern zu überschreiben.
  Laufende v1.5-Rätsel bleiben über den eingefrorenen Altdatenbestand spielbar.
- **Texttl** wächst auf **739 Lösungen und 789 gültige Ratewörter**. Der neue
  optionale Modus **Knifflig** erzwingt bereits aufgedeckte grüne und gelbe Hinweise.
  Historische Tageswörter bleiben durch einen eingefrorenen v1-Pool unverändert;
  der erweiterte Tagespool beginnt am 4. September 2026 (UTC).
- **Pahjong** erhält einen plastischeren Holzrahmen-/Filztisch-Look für Panda-,
  Nacht- und Kontrastansicht. Seine Rückgängig-Historie speichert kompakte Aktionen
  statt kompletter Kopien aller 144 Steine.

### Stabilität und Bedienung

- Neustart und Moduswechsel in Texttl sind während der finalen Auswertung gesperrt;
  Statistikereignisse sind idempotent und gegen parallele Tabs abgesichert.
- Canvas, Dialoge und Tastatursteuerung wurden vereinheitlicht: Sand Game besitzt
  einen sichtbaren Tastatur-Zeichenpunkt, Pong kontinuierliche W/S- und Pfeiltasten-
  Steuerung, und globale Spielkürzel lösen nicht mehr hinter offenen Dialogen aus.
- Game of Life bleibt nach einem größenneutralen Resize aktiv, Snake verarbeitet
  alle aufgelaufenen Simulationsticks, Panda Lemmings startet zuverlässig ungepaust,
  und Minesweeper verwendet in HUD und Ergebnis dieselbe volle-Sekunden-Regel.
- Weitere Korrekturen betreffen leere Spider-Spalten, native Dialogbuttons in
  Pandadoku, historische Tagesdeal-Datumsangaben in Panndike, verzögerte Erzählung
  in Maulkorbraupen sowie präzisere ARIA-Auswahlzustände in Pandataire.
- Die automatisierten Logik- und Browser-Suites prüfen alle 16 Spiele einschließlich
  IME, Tastatur-Canvas, Modal-Fokus, Timing-Akkumulatoren und kompakter Undo-Historie.

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
