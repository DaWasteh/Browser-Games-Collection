# Texttl

Texttl ist ein offline spielbarer deutscher Wordle-Klon ohne Frameworks,
Build-Schritt oder externe Assets. Öffne `index.html` direkt im Browser –
es wird kein Server und keine Internetverbindung benötigt.

Errate das geheime deutsche Fünf-Buchstaben-Wort in bis zu sechs Versuchen.
Nach jedem Versuch färben sich die Kacheln und zeigen, welche Buchstaben
stimmen.

## Neu in v1.9

- Wortschatz auf **1022 Lösungswörter** und **1118 gültige Ratewörter** erweitert.
  Der bisherige Tagespool (739 Wörter) bleibt eingefroren; der erweiterte Pool gilt
  für Tagesrätsel ab **10. September 2026 (UTC)**, damit frühere Tageswörter unverändert bleiben.
- Neuer **💡 Tipp**: Einmal pro Runde wird ein noch nicht gefundener Buchstabe samt
  Position aufgedeckt. Er erscheint blass in der aktuellen Reihe und auf der Tastatur,
  wird im Tagesmodus mitgespeichert und im geteilten Ergebnis mit `💡` markiert.
- Der Ergebnisdialog zeigt im Tagesmodus einen **Live-Countdown** bis zum nächsten Rätsel.
- Prozedurale **Soundeffekte** (Tippen, Flip, Fehler, Sieg, Niederlage) und **Konfetti**
  beim Sieg über das gemeinsame Audio-/Effektmodul; Ton per Toolbar abschaltbar.
- Größeres Spielfeld und Tastatur auf Widescreen-/Ultrawide-Monitoren.

## Neu in v1.6

- Wortschatz auf **739 Lösungswörter** und **789 gültige Ratewörter** erweitert.
- Der historische Tageswort-Pool mit 463 Lösungen bleibt eingefroren. Dadurch
  ändern sich frühere Tagesrätsel und vorhandene Speicherstände nicht; der neue
  Pool gilt ab **4. September 2026 (UTC)**.
- Optionaler Modus **Knifflig**: Grüne Buchstaben bleiben an ihrer Position,
  gelbe Buchstaben müssen erneut an einer anderen Position verwendet werden.
  Der Modus wird lokal gespeichert und im geteilten Ergebnis mit `◆` markiert.
- Neustart und Moduswechsel sind während einer laufenden Flip-/Endauswertung
  gesperrt, damit kein bestätigtes Endergebnis verloren geht.
- Statistikresultate werden als idempotente Ereignisse gespeichert und aus allen
  bekannten Ereignissen neu aufgebaut. Gleichzeitige Tabs überschreiben einander
  dadurch nicht mehr per veraltetem Gesamt-Snapshot.

## Neu in v1.5

- Ein mit Enter bestätigter Versuch wird vor der Flip-Animation atomar übernommen und im Tagesmodus gespeichert.
- Schließen oder Neuladen während der rund 1,4 Sekunden langen Animation verliert keinen bereits abgegebenen Versuch mehr.
- Gewinn/Verlust erhält beim Commit sofort den korrekten Save-Status; ein Reload ergänzt eine noch nicht geschriebene Tagesstatistik idempotent.

## Spielmodi

- **Tagesrätsel:** Allen Spielerinnen und Spielern wird am selben
  Kalendertag (UTC) dasselbe Wort gestellt. Das Wort wird deterministisch aus
  dem Datum abgeleitet und ist über alle Sitzungen identisch. Der
  Spielfortschritt eines Tages wird lokal gespeichert – schließt du den
  Tab, kannst du später an derselben Stelle weitermachen. `↻ Neu` leert den
  Tagesfortschritt auch dauerhaft für dieses Gerät, ohne die Statistik erneut
  zu zählen.
- **Zufallsmodus:** Jedes Spiel zieht ein neues Wort aus der
  Lösungsliste, beliebig oft.
- **Knifflig (optional):** Gilt in beiden Spielmodi. Bereits grüne Buchstaben
  bleiben fest; gelbe Buchstaben und bekannte Mehrfachvorkommen müssen im
  nächsten Versuch berücksichtigt werden.

## Regeln

- Gespielt wird mit **fünf Buchstaben** und **sechs Versuchen**.
- 🟩 **Grün** – der Buchstabe steht an der richtigen Stelle.
- 🟨 **Gelb** – der Buchstabe kommt im Wort vor, aber an einer anderen Stelle.
- ⬛ **Grau** – der Buchstabe kommt im Wort nicht vor.
- Doppelte Buchstaben werden fair ausgewertet: Jedes Vorkommen im
  Lösungswort kann nur einmal „verbraucht“ werden (Zweifachdurchlauf).
- **Ä, Ö, Ü und ß zählen jeweils als ein einzelner Buchstabe.** So ist
  `GRÖßE` genau fünf Buchstaben lang. (Hinweis: `ß` hat keine einzelne
  Großbuchstaben-Form und bleibt deshalb auch in den Kacheln `ß`.)

## Bedienung

- **Tastatur:** Buchstaben tippen, `Enter` bestätigt den Versuch,
  `Backspace`/`⌫` löscht das letzte Zeichen. Auch `Ä`, `Ö`, `Ü` und `ß`
  funktionieren über die physische Tastatur.
- **Bildschirmtastatur:** QWERTZ-Layout mit Umlaut- und ß-Taste; per Maus
  oder Touch bedienbar.
- `↻ Neu` startet dasselbe Wort noch einmal (zum Üben). Im Zufallsmodus
  gibt das Ergebnis-Modal ein neues Wort aus.
- Ergebnisse lassen sich **spoilerfrei teilen** (nur Farb-Emojis, keine
  Buchstaben) – mit Clipboard-API und Fallback auf ältere Browser.
- **Knifflig:** Über `◇ Knifflig` ein- oder ausschalten. Während der
  Flip-Auswertung sind Modus und Neustart kurz gesperrt.

## Statistik

Gespielte Partien, Siege, Trefferquote, aktuelle und längste Serie sowie
die Versuchsverteilung werden defensiv in `localStorage` gespeichert. Ergebnisse
besitzen eindeutige Ereignisschlüssel; die Anzeige wird daraus reproduzierbar neu
aufgebaut, sodass parallele Tabs keine Statistik verlieren. Die Tages-Serie
(Streak) wird nur im Tagesmodus fortgeschrieben; der Zufallsmodus zählt in die
Gesamtstatistik, bricht aber keine Serie.

## Barrierefreiheit & Animation

- Auswertungen werden mit einer Kipp-Animation (Flip) zurückgemeldet;
  bei gesetzter Systemeinstellung *Bewegung reduzieren*
  (`prefers-reduced-motion`) entfallen alle Animationen.
- Eine `aria-live`-Statusregion meldet Fortschritt, Fehler und das
  Ergebnis für Screenreader; das Spielfeld nutzt `role="grid"`,
  das Ergebnis ist ein `role="dialog"`.
- Alle Bedienelemente sind echte Buttons mit sichtbaren Fokus-Rahmen.

## Dateien und Prüfung

- `index.html` – deutsche, zugängliche Oberfläche mit Link zur
  Spieleauswahl, Regeln und Steuerung.
- `texttl-logic.js` – DOM-freie Logik (UMD-Export): Wortlisten, Bewertung,
  deterministisches Tageswort, Zufallsmodus, Statistik/Streak und
  spoilerfreies Teilen.
- `texttl.js` – DOM-/Eingabeschicht: Spielfeld, Bildschirmtastatur,
  physische Tastatur, Animation, Statistik, Teilen, Modi.
- `texttl.css` – responsives dunkles Theme, Flip-/Pop-/Shake-Animationen.
- `smoke-test.cjs` – Logik- und Konventionstests (Node, ohne Browser).

Syntax- und Logikprüfung:

```bash
node --check texttl-logic.js
node --check texttl.js
node smoke-test.cjs    # gibt "smoke ok" aus
```

Das Spiel speichert ausschließlich lokale Spielstände und benötigt weder
Server noch externe Assets.
