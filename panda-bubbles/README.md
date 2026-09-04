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

## Animationen und Spielfeedback

- Das Panda-Katapult dreht sich exakt in Zielrichtung, federt beim Abschuss zurück und schickt die Kugel mit einer leuchtenden Flugspur los.
- Zielpunkte wandern entlang der echten Flugbahn; das Einrastfeld wird als dezente Blasenvorschau angezeigt und Bandenberührungen erzeugen einen eigenen Lichtimpuls.
- Treffer rasten federnd ein, Gruppen platzen gestaffelt mit Ringen und Splittern, abgetrennte Blasen fallen mit Rotation und Punkte schweben direkt am Treffer auf.
- Eine neue Druckreihe springt nicht mehr ins Feld, sondern schiebt das komplette Raster weich und eingabegesperrt nach unten.
- Sieg und Niederlage besitzen eine kurze Abschlussphase, damit Treffer- und Fallfeedback sichtbar bleibt, bevor der Ergebnisdialog erscheint. Pause friert nun auch sämtliche Effekte ein.
- Eine kompakte Querformatansicht hält Spielfeld, Vorschau und zentrale Steuerung auch auf kurzen Smartphone-Displays gleichzeitig sichtbar.

## Technik

- `bubble-logic.js` – reine, per CommonJS und Browser nutzbare Hexraster-Logik.
- `game.js` – Canvas-Darstellung, Eingabe, Web-Audio-Sound und eine explizite Flug-/Treffer-/Druck-/Abschluss-Phasensteuerung.
- `styles.css` – responsive Oberfläche für Panda-, Nacht- und Kontrastansicht.
- `smoke-test.cjs` – deterministische Logik-, Geometrie- und Strukturtests.

Sound wird erst nach einer Nutzereingabe über die Web Audio API erzeugt. `prefers-reduced-motion` beschleunigt den Schuss und deaktiviert Partikel/Fallanimationen, ohne Spielzustände auszulassen.

## Lokal starten

`index.html` direkt öffnen oder das Repository über einen lokalen HTTP-Server bereitstellen. Es gibt keinen Build-Schritt.
