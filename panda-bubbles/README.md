# 🐼 Panda: Jäger der Blasen

Ein eigenständiger, responsiver Bubble Shooter ohne externe Abhängigkeiten. Gleichfarbige Blasen werden zu Gruppen verbunden; ab drei Blasen platzt die Gruppe und nicht mehr mit der Decke verbundene Blasen fallen herunter.

## Besonderheit: Bambusblase

Erfolgreiche Treffer laden Bambusenergie. Ein erfolgreicher Bandenwurf lädt besonders viel und gibt Bonuspunkte. Bei 100 % wird die nächste Kugel zur **Bambusblase**: Sie nimmt beim Auftreffen automatisch die Farbe an, die dort die größte zusammenhängende Gruppe bildet. Das erweitert das vertraute Bubble-Shooter-Prinzip, ohne die Grundregeln zu verändern.

## Steuerung

- **Maus/Touch:** Im Spielfeld zielen und tippen/klicken, um zu schießen.
- **Tastatur:** `←`/`→` zielen, `Leertaste` oder `Enter` schießen.
- `S` tauscht die aktuelle und nächste Blase.
- `P` pausiert, `N` startet eine neue Runde.
- Alle zentralen Bedienelemente besitzen mindestens 44 × 44 CSS-Pixel große Touch-Ziele.

## Spielregeln

- Gruppen aus mindestens drei Blasen derselben Farbe platzen.
- Blasen ohne Verbindung zur Decke fallen und geben Extrapunkte.
- Fünf erfolglose Würfe erzeugen eine zusätzliche Reihe.
- Erreicht eine Blase die Bambusgrenze, ist die Runde beendet.
- Aktueller Bestwert und Soundeinstellung werden lokal gespeichert.

## Technik

- `bubble-logic.js` – reine, per CommonJS und Browser nutzbare Hexraster-Logik.
- `game.js` – Canvas-Darstellung, Eingabe, Web-Audio-Sound und Animationen.
- `styles.css` – responsive Oberfläche für Panda-, Nacht- und Kontrastansicht.
- `smoke-test.cjs` – deterministische Logik-, Geometrie- und Strukturtests.

Sound wird erst nach einer Nutzereingabe über die Web Audio API erzeugt. `prefers-reduced-motion` beschleunigt den Schuss und deaktiviert Partikel/Fallanimationen, ohne Spielzustände auszulassen.

## Lokal starten

`index.html` direkt öffnen oder das Repository über einen lokalen HTTP-Server bereitstellen. Es gibt keinen Build-Schritt.
