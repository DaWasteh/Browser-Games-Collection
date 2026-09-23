# ☄️ Asteroids

Vektor-Arcade-Shooter im Neon-Look – eine einzige HTML-Datei ohne Abhängigkeiten.
Ursprünglich von Agnes 3.0 Flash erzeugt, für die Browser Games Collection
überarbeitet, von Fehlern befreit und um Touch-Steuerung ergänzt.

## Spielen

`asteroids.html` im Browser öffnen oder über die [Spieleauswahl](../index.html) starten.

## Steuerung

| Aktion | Tastatur | Touch |
|---|---|---|
| Drehen | ← → / A D | ⟲ ⟳ |
| Schub | ↑ / W | ▲ |
| Schießen | Leertaste | ✹ |
| Waffe wählen | 1–4, Q (nächste) | ⇄ (Toolbar) |
| Pause | P / Esc | ⏸ (Toolbar) |
| Ton | M | 🔊 (Toolbar) |
| Starten | Enter | Tippen |

## Features

- **Vier Waffen mit eigenen Regeln:** Blaster (Munition), Laser (Energie, überhitzt bei
  Dauerfeuer), Missile (zielsuchend, Munition) und Cannon (stark, verschleißt pro Schuss).
- **Begrenzter Treibstoff:** Schub verbraucht den Tank; FUEL-Pickups, der Levelbonus und
  ein kleiner Reservetank halten dich im Spiel.
- **UFOs** tauchen regelmäßig auf, schießen auf dich und lassen seltene Drops fallen:
  neue Waffen, Reparatur der Cannon, Quantum-Schild, Overdrive, Plasma, Triple-Shot.
- **Pickups aus Asteroiden:** Treibstoff, Munition, temporäre Power-ups (Doppelschuss,
  Schnellfeuer, Überladung, Schild, Tempo) und seltene permanente Upgrades.
- Asteroiden haben Trefferpunkte, zerfallen in kleinere Brocken; alle 10 000 Punkte gibt
  es ein Extraleben, der Highscore wird lokal gespeichert.
- Responsive: Auf kleinen Displays wird die Spielwelt verkleinert, HUD und Menüs passen
  sich an, die Darstellung ist auf HiDPI-Displays scharf.

## Tests

```bash
node asteroids/smoke-test.cjs
```

Der Logiktest spielt das Spiel deterministisch über ein gestubbtes DOM: Waffen,
Überhitzung, Verschleiß, Pickups, UFOs, Schild, Softlock-Schutz, Pause, Game Over,
Resize und ein langer Zufallslauf.
