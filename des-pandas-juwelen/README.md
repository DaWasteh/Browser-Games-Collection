# 🐼 Des Pandas Juwelen

Ein eigenständiges, responsives Match-3-Spiel ohne externe Abhängigkeiten. Benachbarte Kristalle werden vertauscht, um waagerechte oder senkrechte Reihen aus mindestens drei gleichen Farben zu bilden.

## Besonderheit: Panda-Pfote

Jede abgearbeitete Kaskadenstufe lädt ein Blatt. Nach fünf Blättern lässt sich die **Panda-Pfote** aktivieren: Einmalig dürfen zwei beliebige statt nur benachbarter Juwelen vertauscht werden. Der Fern-Tausch muss weiterhin eine gültige Reihe erzeugen; ein ungültiger Versuch verbraucht die Fähigkeit nicht. Damit bleibt das gewohnte Match-3-Prinzip erhalten und bekommt eine taktische, leicht verständliche Erweiterung.

## Spezialjuwelen

- Vier gleiche Juwelen erzeugen ein waagerechtes oder senkrechtes **Linienjuwel**. Pfeilspitzen und ein Lichtband zeigen die Strahlrichtung.
- Eine T- oder L-Form erzeugt eine **Pfotenbombe** mit pochendem Zündring, die ein 3×3-Feld sprengt.
- Fünf gleiche Juwelen erzeugen ein **Panda-Prisma** (Regenbogen mit Stern), das beim Tausch genau die Farbe des Tauschpartners entfernt.
- Spezialsteine lösen sich auch gegenseitig aus, wenn sie von einer Explosion getroffen werden.
- Ein angetippter (oder mit der Maus berührter) Spezialstein markiert seinen Wirkungsbereich samt Kettenreaktionen. Beim ersten Entstehen jeder Sorte erklärt eine Tipp-Karte den Stein; die Seitenleiste zeigt echte Vorschauen.

## Fundstücke und Schatzbeutel

Gelegentlich fällt ein Juwel mit goldenem Abzeichen ins Feld. Wird es abgeräumt – egal ob per Reihe, Explosion oder Booster –, fliegt das Fundstück in den **Schatzbeutel**:

- 🔨 **Bambushammer** zerschlägt ein beliebiges Juwel.
- ✚ **Sternkreuz** räumt Zeile und Spalte des Ziels.
- 🌈 **Farbfunke** entfernt alle Juwelen einer Farbe.

Booster kosten keinen Zug, lösen aber getroffene Spezialsteine und anschließende Kaskaden aus. Der Beutel fasst drei je Sorte und bleibt über Runden hinweg gefüllt; zum Start liegt ein Hammer bereit. Fundstücke nutzen einen eigenen Zufallsstrom, gleiche Seeds ergeben also weiterhin dieselben Felder.

## Steuerung

- **Maus/Touch:** Zwei Juwelen antippen oder direkt in eine Richtung wischen.
- **Tastatur:** Mit den Pfeiltasten bewegen, mit `Enter`/`Leertaste` auswählen.
- `H` zeigt einen gültigen Zug, `N` startet eine neue Runde, `1`–`3` wählen einen Booster, `Escape` hebt Auswahl, Booster oder Panda-Pfote auf.
- Ungültige Tauschaktionen springen sichtbar zurück und kosten keinen Zug.

## Spielziel

Erreiche 9.000 Punkte innerhalb von 24 gültigen Zügen. Kaskaden multiplizieren die Punkte. Das Feld startet ohne fertige Reihen und besitzt garantiert mindestens einen gültigen Zug; falls später keiner mehr möglich ist, wird es automatisch neu gemischt.

## Animationen und Rundenabschluss

- Tauschaktionen bewegen die beiden Steine wirklich zwischen ihren Feldern, der gezogene Stein hebt sich dabei an; ungültige Züge federn sichtbar zurück.
- Die Schwerkraft animiert ausschließlich bewegte und neu eingefüllte Juwelen über ihre tatsächliche Zeilendistanz: beschleunigter Fall (Dauer wächst mit der Wurzel der Fallhöhe), von unten nach oben versetzte Starts je Spalte, Stauchung, Rückprall und Staubwolke beim Aufprall.
- Die Engine liefert zu jedem abgeräumten Juwel einen Zeitpunkt und den auslösenden Effekt. Linienstrahlen erreichen jede Zelle genau dann, wenn sie zerspringt; Bomben zünden mit Lichtblitz und Druckwelle, Prismen schicken Blitze zu jedem Ziel, Kettenreaktionen laufen nacheinander ab.
- Splitter fliegen auf Wurfparabeln, Steine einer Reihe verschmelzen in einen neu entstehenden Spezialstein, Punkte zählen hoch und Kaskaden-Anzeigen wachsen mit jeder Stufe.
- Beim Sieg leuchtet das gesamte Feld in einer Abschlusswelle auf und wird anschließend vollständig geleert. „Ergebnis ansehen“ führt deshalb in einen klaren, ruhigen Endzustand statt zurück in ein scheinbar noch laufendes Feld.
- Auch automatisches Mischen sowie der Start einer neuen Runde besitzen eigene, eingabegesperrte Übergänge.

## Technik

- `jewels-logic.js` – reine CommonJS-/Browser-Engine für Matches, Spezialsteine, Kaskaden, Schwerkraft, Bewegungs- und Zeitmetadaten, Fundstücke, Booster und Mischbarkeit.
- `game.js` – barrierearme DOM-Steuerung, Wischgesten, Web-Audio-Sound und animierte Zugauflösung.
- `styles.css` – responsive Kristalloptik für Panda-, Nacht- und Kontrastansicht.
- `smoke-test.cjs` – deterministische Logik-, Spezialstein-, Booster-, Generator- und Strukturtests.

Bestwert, Ton, Schatzbeutel und gesehene Tipps liegen in `localStorage` unter `des-pandas-juwelen-settings-v1` (derselbe Schlüssel wie vor v2.5, ältere Bestwerte bleiben erhalten).

Jede Farbe besitzt zusätzlich ein eigenes Symbol. Sound wird erst nach einer Nutzereingabe erzeugt. Bei `prefers-reduced-motion` bleiben sämtliche Zustandswechsel erhalten, die Übergänge werden aber stark verkürzt.
