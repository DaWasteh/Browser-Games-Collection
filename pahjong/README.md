# Pahjong

Offline spielbarer Mahjong-Solitaire-Klon ohne Frameworks oder externe Assets. Einstieg ist `index.html`.

## Regeln
Das Spiel nutzt 144 lokal gezeichnete Unicode-Steine in einem mehrlagigen Turtle-Layout. Ein Stein ist frei, wenn kein Stein auf ihm liegt und mindestens eine Seite (links oder rechts) vollständig offen ist. Zwei freie gleiche Steine werden entfernt. Die vier Blumen passen untereinander, die vier Jahreszeiten untereinander. Ziel ist, alle Steine zu entfernen. Gibt es kein freies Paar, erkennt das Spiel die Blockade; mit Rückgängig oder einem lösbaren Mischen kann die Partie fortgesetzt werden.

Jeder Deal wird durch eine rückwärts konstruierte Entfernungsreihenfolge erzeugt. Dadurch existiert garantiert ein Lösungsweg (nicht jeder beliebige Zug muss richtig sein). `Mischen` verteilt die verbleibenden Gesichter erneut in einer rückwärts konstruierten lösbaren Fortsetzung. `Hinweis` markiert ein gültiges Paar. Undo stellt den vorherigen Zustand wieder her.

## Bedienung
Maus/Touch oder Tastatur (Tab, Enter/Leertaste). `H` Hinweis, `M` Mischen, `U` Rückgängig, `N` Neues Spiel.

## Dateien und Prüfung
- `index.html` Oberfläche
- `styles.css` responsives Layout
- `game.js` Spiellogik und `window.Pahjong`-Smoke-API

Syntaxprüfung: `node --check game.js`.
