# Panda Spider

Panda Spider ist ein vollständig offline spielbarer Spider-Solitaire-Klon ohne Frameworks oder externe Assets. Öffne `index.html` direkt im Browser.

## Neu in v2.0

- Karten werden vom gemeinsamen Kartenmodul (`shared/card-deck.js`, `shared/card-deck.css`)
  gezeichnet: Eckindex, Pip-Layouts, gerahmte Bildkarten, Panda-Rückseite, Nacht-/Kontrast-Farben
  und ein Schalter für ein **vierfarbiges Deck** (♦ blau, ♣ grün).
- **Drag-and-drop mit Kartenvorschau** für Maus, Stift und Touch – gleichfarbige Folgen auf Zielkarten oder leere Spalten; gültige Ziele werden
  markiert, ungültige Ablagen federn zurück. Antippen-und-Ziel-wählen funktioniert weiterhin.
- Züge, Rückgängig und Austeilen laufen als flüssige Flug-Animationen (abschaltbar über
  `prefers-reduced-motion`).

## Neu in v1.5

- Die Tableauhöhe wächst mit der längsten realen Spalte; auch nach allen fünf Stock-Runden überdecken Karten nicht mehr Stock oder Regeln.
- Rückgängig nach Sieg beziehungsweise Sackgasse setzt die aktive Zeit sauber fort, ohne die Wartezeit auf dem Endzustand mitzuzählen.
- Tastaturereignisse von Dokument und Formularfeldern werden defensiver getrennt.

## Spielregeln

- Gespielt wird mit zwei Kartenspielen (104 Karten): 54 Karten liegen in zehn Tableau-Spalten, 50 Karten bilden den Stock.
- Die ersten vier Spalten erhalten sechs Karten, die übrigen sechs Spalten fünf Karten. Nur die jeweils oberste Karte ist offen.
- Baue absteigend. Eine einzelne offene Karte darf auf den direkt höheren Rang gelegt werden, unabhängig von der Farbe.
- Mehrere Karten dürfen nur als lückenlose, gleichfarbige Folge (z. B. 9–8–7) bewegt werden.
- Eine leere Spalte kann jede Karte oder Folge aufnehmen.
- Der Stock teilt in fünf Reihen je eine offene Karte an jede Spalte aus. Das geht nur, wenn keine Spalte leer ist.
- Eine vollständige gleichfarbige K–A-Folge wird automatisch entfernt. Acht entfernte Folgen gewinnen das Spiel.

## Bedienung

Klicke oder tippe eine offene Karte an und danach eine Zielkarte bzw. eine leere Spalte. Die Auswahl lässt sich durch erneutes Anklicken aufheben. Alle Karten und Schaltflächen sind mit Tab erreichbar; Enter/Leertaste aktiviert das fokussierte Element. `N` startet ein neues Spiel, `U` macht den letzten Zug rückgängig.

Die Auswahl der 1, 2 oder 4 Farben startet ein neues Spiel. Ein-Farbe-Spiele sind am einfachsten, vier Farben am anspruchsvollsten. Der Spielstand zeigt Züge, Zeit, entfernte Reihen und Restkarten.

## Technischer Hinweis

Die Oberfläche besteht aus semantischem HTML, CSS und reinem JavaScript. Es werden keine Netzwerkzugriffe, Cookies oder externen Abhängigkeiten verwendet.
