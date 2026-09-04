# 🐼 Des Pandas Juwelen

Ein eigenständiges, responsives Match-3-Spiel ohne externe Abhängigkeiten. Benachbarte Kristalle werden vertauscht, um waagerechte oder senkrechte Reihen aus mindestens drei gleichen Farben zu bilden.

## Besonderheit: Panda-Pfote

Jede abgearbeitete Kaskadenstufe lädt ein Blatt. Nach fünf Blättern lässt sich die **Panda-Pfote** aktivieren: Einmalig dürfen zwei beliebige statt nur benachbarter Juwelen vertauscht werden. Der Fern-Tausch muss weiterhin eine gültige Reihe erzeugen; ein ungültiger Versuch verbraucht die Fähigkeit nicht. Damit bleibt das gewohnte Match-3-Prinzip erhalten und bekommt eine taktische, leicht verständliche Erweiterung.

## Spezialjuwelen

- Vier gleiche Juwelen erzeugen einen waagerechten oder senkrechten **Linienstein**.
- Eine T- oder L-Form erzeugt eine **Pfotenbombe**, die ein 3×3-Feld sprengt.
- Fünf gleiche Juwelen erzeugen ein **Panda-Prisma**, das beim Tausch eine ganze Farbe entfernt.
- Spezialsteine lösen sich auch gegenseitig aus, wenn sie von einer Explosion getroffen werden.

## Steuerung

- **Maus/Touch:** Zwei Juwelen antippen oder direkt in eine Richtung wischen.
- **Tastatur:** Mit den Pfeiltasten bewegen, mit `Enter`/`Leertaste` auswählen.
- `H` zeigt einen gültigen Zug, `N` startet eine neue Runde, `Escape` hebt Auswahl oder Panda-Pfote auf.
- Ungültige Tauschaktionen springen sichtbar zurück und kosten keinen Zug.

## Spielziel

Erreiche 9.000 Punkte innerhalb von 24 gültigen Zügen. Kaskaden multiplizieren die Punkte. Das Feld startet ohne fertige Reihen und besitzt garantiert mindestens einen gültigen Zug; falls später keiner mehr möglich ist, wird es automatisch neu gemischt.

## Technik

- `jewels-logic.js` – reine CommonJS-/Browser-Engine für Matches, Spezialsteine, Kaskaden, Schwerkraft und Mischbarkeit.
- `game.js` – barrierearme DOM-Steuerung, Wischgesten, Web-Audio-Sound und animierte Zugauflösung.
- `styles.css` – responsive Kristalloptik für Panda-, Nacht- und Kontrastansicht.
- `smoke-test.cjs` – deterministische Logik-, Spezialstein-, Generator- und Strukturtests.

Jede Farbe besitzt zusätzlich ein eigenes Symbol. Sound wird erst nach einer Nutzereingabe erzeugt. Bei `prefers-reduced-motion` bleiben sämtliche Zustandswechsel erhalten, die Übergänge werden aber stark verkürzt.
