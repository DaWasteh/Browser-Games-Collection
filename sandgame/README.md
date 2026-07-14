# Sand Game Pro · Advanced Simulation v2.1

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/Pages-Live-success.svg)](https://dawasteh.github.io/SandGame/)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/DaWasteh/SandGame/build.yml)](https://github.com/DaWasteh/SandGame/actions/workflows/build.yml)

🎮 **Live spielen:** <https://dawasteh.github.io/SandGame/>

Ein interaktives **Zellulares Automaten-Spiel** mit physikalisch, chemisch und biologisch fundierter Simulation. Erstelle Sand, Wasser, Feuer, Pflanzen, Pilze und mehr – und beobachte, wie sie interagieren.

## 🎮 Features

### Materialien (72+)

| Kategorie | Materialien |
|-----------|-------------|
| **Grundlagen** | Sand, Stein, Erde, Wasser, Luft |
| **Flüssigkeiten** | Wasser, Öl, Lava, Säure, Schmelze |
| **Gase** | Dampf, CO₂, Stickstoff, H₂, O₂, Pollen |
| **Energie** | Feuer, Funke, TNT, Feuerlöscher |
| **Biologie** | Samen, Keimlinge, Stämme, Blätter, Wurzeln, 3 Blütentypen, Pilze, Bakterien |
| **Chemie** | Salz, Kalk, Kohle, Metall, Glas |
| **Kunststoffe** | Kunststoff (PLASTIC) |
| **Spezial** | Eier, Beton, Isolator, Sensor, Strahlung |

### 🌱 Erweitertes Biologie-System (v2.1)

#### Wachstumsstadien
Pflanzen durchlaufen strukturierte Entwicklungsstadien:

```
SAMEN → KEIMLING → JUNGER STAMM → ERWACHSENE PFLANZE → BLÜTE → ALTERUNG → TOTE PFLANZE → KOMPOST
```

| Stadium | Material | Beschreibung |
|---------|----------|--------------|
| 0 | [`PLANT_SEED`](sand_game.html:307) | Samen keimt bei Feuchtigkeit (5-30°C) |
| 1 | [`PLANT_SPROUT`](sand_game.html:308) | Keimling bildet erste Wurzeln und Blätter |
| 2 | [`PLANT_STEM`](sand_game.html:308) | Haupttrieb wächst nach oben, seitliche Blätter |
| 3 | [`PLANT_MATURE`](sand_game.html:309) | Erwachsene Pflanze, kann Blüten bilden |
| 4 | [`FLOWER_DANDELION`](sand_game.html:310) | Gänseblümchen (gelb) |
| 4 | [`FLOWER_TULIP`](sand_game.html:310) | Tulpe (rot) |
| 4 | [`FLOWER_POPPY`](sand_game.html:311) | Mohn (orange-rot) |
| 5 | [`PLANT_DEAD`](sand_game.html:311) | Tote Pflanze, wird zu Kompost |

#### Strukturierter Wachstum
- **Klarer Haupttrieb**: Pflanzen wachsen kontrolliert nach oben
- **Seitliche Blätter**: Alle 8-12 Ticks entsteht ein Blatt links/rechts abwechselnd
- **Kein Wuchern**: Keine seitlichen Stamm-Äste mehr
- **Wurzeln**: Nur der Keimling bildet Wurzeln nach unten

#### Saison-System
4 Jahreszeiten mit Einfluss auf das Wachstum:

| Saison | Symbol | Wachstumsfaktor | Effekt |
|--------|--------|-----------------|--------|
| Frühling | 🌸 | 1.0 | Normales Wachstum |
| Sommer | ☀️ | 1.2 | Maximales Wachstum |
| Herbst | 🍂 | 0.5 | Reduziertes Wachstum, Blätter färben sich |
| Winter | ❄️ | 0.1 | Fast kein Wachstum, Pflanzen sterben langsam |

#### Säfte- und Nährstoffdynamik
- [`plantSapGrid`](sand_game.html:510) - Säftestand (0-100)
- [`soilNutrientGrid`](sand_game.html:511) - Bodennährstoffe (0-100)
- [`plantWaterGrid`](sand_game.html:512) - Wasserstand (0-100)
- Wurzeln absorbieren Wasser und Nährstoffe aus dem Boden
- Saft wird nach oben zu Blättern und Blüten transportiert

#### Ökosystem-Balance (v2.1)
Das Ökosystem ist bewusst **zurückhaltend** abgestimmt, damit nicht zu viele Blumen
und Pflanzen entstehen und sich die Welt nicht flächendeckend zuwuchert:

- **Initial-Bewuchs**: Dichte von 30 % auf **10 %** reduziert; ein Mindestabstand
  verhindert direkt benachbarte Keime (lockerer, natürlicher Bewuchs).
- **Saatgut-Mischung**: überwiegend Gras/Kraut-Samen statt Blumen; Blumen-Samen sind
  nur ein kleiner Anteil, Bäume bleiben seltene Solitäre.
- **Selbst-Aussaat**: Blüh- und Vermehrungsraten von Blumen und Alt-Pflanzen deutlich
  gesenkt; eine Pflanze bildet keine Blüte mehr, wenn direkt daneben bereits eine blüht
  (verhindert Blüten-Cluster).
- **Wind-Eintrag**: vom Wind hereingetragene Samen sind mehrheitlich Gras/Kraut statt
  Blumen.

> Alle Funktionen, Materialien und der Bild-Import bleiben dabei vollständig erhalten –
> es wurden ausschließlich Wahrscheinlichkeiten und die Saatgut-Verteilung angepasst.

### ⚡ Performance-Optimierungen (v2.1)

Die Simulation wurde ohne Funktionsverlust spürbar beschleunigt:

- **Typprüfungen über Lookup-Tabellen**: `isLiquid`, `isGas`, `isPowder`, `isSolid`,
  `isPlant`, `isFlammable`, `isExplosive`, `isOxidizable`, `isOrganic` lesen ihren Wert
  jetzt aus flachen `Uint8Array`-Tabellen statt aus Objekt-Lookups (`MATS[m]?.type`).
  Diese Prüfungen laufen millionenfach pro Sekunde – das Verhalten ist bit-genau
  identisch (verifiziert über 256 IDs × 9 Prädikate).
- **Render-Schnellpfad**: Eine `DYNAMIC_COLOR`-Tabelle markiert nur Materialien mit
  eigener Farb-Animation (Feuer, Lava, Pflanzen-Gesundheit, Wolken, Herbstfärbung …).
  Gewöhnliches Terrain (Sand, Stein, Erde, Wasser, Wände, Metall …) überspringt die
  lange Farb-`if`-Kette komplett – das ist der häufigste Fall pro Pixel pro Frame.
- **Allokationsfreie heiße Pfade**: `checkChemicalReactions` und `updateThermal`
  allozieren keine Nachbar-Arrays mehr pro Zelle/Tick (deutlich weniger GC-Druck);
  Wärmeleitung nutzt Reservoir-Sampling über die Nachbarn.
- **Saison-/Sonnenwerte gepuffert**: pro Frame statt pro Zelle berechnet.

### 🖥️ Hardware-Beschleunigung (WebGL2)

Das Rendering kann über **WebGL2 auf der GPU** laufen – die gesamte Farb-Logik
(Temperatur-Glühen, pH, Herbstfärbung, Salz-Tönung, Pilz-Hut/Stiel, HSV-Blumen,
dynamische Materialien) wird in einen Fragment-Shader portiert. Pro Frame werden
nur die Simulations-Grids als 3 gepackte RGBA8-Texturen zur GPU hochgeladen
(reiner Byte-Schub); die GPU berechnet alle Pixel parallel.

- **Automatische Erkennung**: Ist WebGL2 verfügbar und kompiliert der Shader,
  läuft die GPU-Variante. Schlägt beides fehl, springt das Spiel automatisch auf
  den bewährten CPU-Renderpfad (`putImageData`) – die Farben bleiben in jedem
  Fall korrekt.
- **GPU-Rendering-Toggle** (Werkzeugleiste): Per Checkbox an/abschaltbar. Da der
  Canvas-Kontext-Typ (WebGL2 vs. 2D) einmalig beim Laden festgelegt wird, führt
  der Wechsel ein Neuladen herbei (Einstellung wird in `localStorage` gespeichert).
  Status-Anzeige: „WebGL2 ✓“ bzw. „CPU“.
- **Hinweis zur Simulation**: Die Partikel-Simulation selbst bleibt auf der CPU
  (sie ist über eine Active-Cell-List + Look-up-Tabellen bereits stark optimiert).
  Eine vollständige Portierung der Simulation auf WebGPU-Compute-Shader wäre ein
  massiver Eingriff in die gesamte Physik-/Chemie-/Biologie-Logik und wird
  bewusst nicht automatisch vorgenommen – das Risiko, das sorgfältig abgestimmte
  Verhalten zu verändern, wäre zu hoch.

### 🐞 Fehlerbehebungen (v2.1)

- **Auto-Zuordnung (Bild-Import)** funktioniert wieder: Die Material-IDs sind `const`
  und lagen nie auf `window`, weshalb die automatische Farb→Material-Zuordnung leer
  blieb. Sie liest die Farben jetzt direkt aus den Material-Definitionen.

### Physikalische Simulation

- **Thermodynamik**: Wärmeleitung, Wärmekapazität, Phasenübergänge (Schmelzen, Sieden, Kondensieren)
- **Dichte-basierte Physik**: Materialien schichten sich korrekt (Gas < Flüssigkeit < Festkörper)
- **Strömungsmechanik**: Flüssigkeiten und Pulver verhalten sich realistisch
- **Explosionsphysik**: Zonen-basierte Blastwirkung mit Verdampfung, Verbrennung und Rauchentwicklung

### Chemische Reaktionen

- **Verbrennung**: H₂ + O₂ → H₂O (Wasser/Dampf) mit Energie freisetzung
- **Neutralisation**: Säure + Lauge → Salz + Wasser
- **Oxidation**: Metall rostet bei Feuchtigkeit
- **Reduktion**: Erz wird zu Metall geschmolzen
- **Ei-Coagulation**: Protein gerinnt bei 62°C

### Biologische Prozesse

- **Photosynthese**: Pflanzen nutzen Licht, Wasser und CO₂ für Wachstum
- **Transpiration**: Wasserverdunstung durch Blätter
- **Nährstoffaufnahme**: Wurzeln scanken Boden auf Nährstoffe
- **Tropismen**: Pflanzen wachsen zum Licht
- **Sporen-Verbreitung**: Schimmel und Pilze verbreiten sich über Luft und Feuchtigkeit
- **Keimung**: Sporen keimen nur bei ausreichender Feuchtigkeit

## 🚀 Schnellstart

### Lokal ausführen

1. Klone das Repository:

   ```bash
   git clone https://github.com/yourusername/sand-game.git
   ```

2. Öffne [`sand_game.html`](sand_game.html) in einem modernen Browser (Chrome, Firefox, Edge)
3. Wähle ein Material aus der Palette und male auf das Spielfeld!

### Online spielen

Das Spiel kann über [GitHub Pages](https://yourusername.github.io/sand-game/) gespielt werden.

## 🎛️ Steuerung

### Maus & Tastatur

| Aktion | Bedienung |
|--------|-----------|
| Zeichnen | Linke Maustaste gedrückt halten |
| Radieren | Rechte Maustaste (oder Umschalt + linke Maustaste) |
| Material wählen | Tasten `1`–`9`, Buchstaben (siehe Palette) |
| Pause / Fortsetzen | `Leertaste` |
| Spielfeld leeren | `C` Taste |
| UI ein-/ausblenden | `H` Taste |

### Aktions-Schaltflächen

| Schaltfläche | Wirkung |
|--------------|---------|
| **Regen** | Lässt Wasser von oben fallen |
| **Feuerregen** | Lässt glühende Lava-Brocken fallen |
| **Wind** | Aktiviert horizontalen Wind (trägt Samen, Sporen, Pollen, Blätter) |
| **Ökosystem + Boden** | Erzeugt Boden-Schichten und säht spärlichen Initial-Bewuchs |
| **Sonnenzyklus** | Tag/Nacht + Jahreszeiten ein/aus |

### Einstellungen

| Einstellung | Bereich | Standard |
|-------------|---------|----------|
| **Grid-Auflösung** | 50–1080 Zellen/Breite (max. Feld 1080×720) | 200 |
| **Pinselgröße** | 1–40 Pixel | 5 |
| **Simulations-Ticks pro Frame** | 1–15 (effektiv auf max. 8/Frame begrenzt) | 5 |
| **Photosynthese-Aktivität** | 0–100 % | 70 |
| **Zyklus-Geschwindigkeit** | 1–100 | 30 |
| **GPU-Rendering** | An/Aus (WebGL2, Wechsel lädt neu) | An |

## 📸 Bild-Import

Das Spiel unterstützt den Import von Bildern zur Erstellung von Simulationen:

1. Klicke auf **"📁 Bild importieren"** im UI
2. Wähle ein Bild aus (JPG, PNG)
3. Das Bild wird automatisch in Materialien umgewandelt
4. Klicke auf **"Zuordnung anwenden"** um das Bild im Grid zu platzieren
5. Klicke auf **"Simulation starten"** um die Simulation zu beginnen

## 🔬 Wissenschaftliche Grundlagen

### Pflanzen-Physiologie

Das Wachstum von Pflanzen folgt realistischen biologischen Modellen:

```
Wachstumsrate = Basis × min(1, Wasser/3) × min(1, Nährstoffe/2) × Photosynthese × Temperaturfaktor
```

- **Optimale Temperatur**: 10–35°C
- **Temperaturstress**: Wachstum reduziert außerhalb des optimalen Bereichs
- **Lichtabhängigkeit**: Nachts nur 5% der tagaktiven Wachstumsrate
- **Wasserhaushalt**: Transpiration bei Trockenheit reduziert Wachstum

### Sonnenzyklus

Das Spiel simuliert einen Tag/Nacht-Zyklus mit:

- **Tag (50% des Zyklus)**: Volle Sonnenintensität für Photosynthese
- **Nacht (50% des Zyklus)**: Schwaches Mondlicht, Pflanzen atmen CO₂ aus
- **Sonnenhöhe**: Sinusförmiger Verlauf für sanfte Übergänge

### Explosions-Physik

TNT-Explosionen verwenden ein **Zonen-Modell**:

| Zone | Intensität | Effekt |
|------|-----------|--------|
| Zentrum | > 0.7 | Verdampfung aller Materialien |
| Innerer Ring | 0.4–0.7 | Verbrennung und Schmelzen |
| Äußerer Ring | < 0.4 | Hitze, Rauch, leichte Verschiebung |

### Lava-Kühlung

Lava kühlt je nach Untergrund unterschiedlich schnell ab:

| Untergrund | Kühlrate | Spezial-Effekt |
|------------|----------|----------------|
| Wasser/Eis | 2.0 | Bildung von Obsidian (GLASS) bei < 800°C |
| Erde/Sand | 0.3 | Bildung von Stein (STONE) bei < 600°C |
| Luft | 0.1 | Langsame Abkühlung |

## 📁 Projektstruktur

```
sand-game/
├── .github/
│   └── workflows/
│       └── build.yml          # CI/CD Pipeline
├── sand_game.html             # Hauptanwendung (Single-File)
└── README.md                  # Diese Datei
```

> **Hinweis**: Dies ist eine Single-File-Anwendung. Alle Logik, Rendering und UI sind in einer einzigen HTML-Datei enthalten.

## 🧪 Materialien-Leitfaden

### Dichte-Klassen

```
TYPE.GAS       (Dichte 0-5)    → Steigen nach oben
TYPE.LIQUID    (Dichte 5-20)   → Fließen unter Festkörpern
TYPE.POWDER    (Dichte 20-50)  → Fließen wie Sand
TYPE.SOLID     (Dichte 50+)    → Bleiben an Ort und Stelle
```

### Temperatur-Eigenschaften

Jedes Material hat definierte:

- **Schmelzpunkt** (`melting`): Temperatur, bei der es schmilzt
- **Siedepunkt** (`boiling`): Temperatur, bei der es verdampft
- **Wärmeleitfähigkeit** (`conductivity`): Wie schnell Wärme weitergegeben wird
- **Wärmekapazität** (`heatCapacity`): Wie viel Energie gespeichert wird

## 🛠️ Entwicklung

### Code-Struktur

```javascript
// Material-Definition
const SAND = 1;
materials[SAND] = {
  id: SAND,
  name: "Sand",
  type: TYPE.POWDER,
  color: [220, 200, 160],
  density: 30,
  melting: 1710,
  boiling: 2500,
  // ... weitere Eigenschaften
};

// Update-Funktion für jedes Material
function updateSand(x, y) {
  // Physik-Logik...
}

// Haupt-Loop
function frame() {
  update();  // Simulation
  render();  // Canvas-Rendering
}
```

### Erweitern um neue Materialien

1. Neue Material-Konstante hinzufügen: `const MY_MATERIAL = 53;`
2. Material-Definition in `materials` Array eintragen
3. Optional: Update-Funktion für spezielles Verhalten schreiben
4. Zur Material-Palette in der UI hinzufügen

## 📄 Lizenz

Dieses Projekt steht unter der [MIT License](LICENSE).

## 🙏 Credits

Entwickelt als zellulares Automaten-Spiel mit Fokus auf wissenschaftliche Korrektheit.

**Technologien**: Vanilla JavaScript, HTML5 Canvas, CSS3

---

*"Die einzige sichere Annahme ist, dass unsere Annahmen falsch sind."* – Wissenschaftliches Mantra