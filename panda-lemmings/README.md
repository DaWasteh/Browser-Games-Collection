# 🐼 Panda Lemmings

Ein Lemmings-inspiriertes Puzzle-Spiel als eigenständige HTML-Datei –
keine Build-Schritte, keine Abhängigkeiten, einfach im Browser öffnen und spielen.

## Neu in v1.5

- Das Spielfeld ist eine fokussierbare interaktive Canvas-Anwendung: Pfeiltasten wählen einen Panda, Enter/Leertaste weist die gewählte Fähigkeit zu.
- Native Buttons in Start-, Ergebnis- und Finaldialogen behalten ihre normale Space-/Enter-Bedienung; kein globaler Handler löst mehr versehentlich eine andere Aktion aus.
- Touch-Ziele um Pandas werden auf schmalen Displays auf mindestens etwa 44 CSS-Pixel vergrößert und wählen den nächsten gültigen Panda.
- Level-Häkchen sowie gerettete/verlorene Gesamtsummen werden versioniert und defensiv lokal gespeichert.

## 🎮 Spielen

* **Lokal:** `panda_lemmings.html` im Browser öffnen.
* **Online:** Gespielt wird über GitHub Pages – siehe Badges/Link weiter unten
  (nach dem ersten Deployment).

## 🚀 Deployment

Dieses Repo enthält zwei GitHub-Actions-Workflows:

| Workflow | Auslöser | Wirkung |
| --- | --- | --- |
| `pages.yml`  | Push auf `master` / `main` | Spielt die neueste Version auf **GitHub Pages** aus |
| `release.yml` | Push eines Tags `v*` (z. B. `v0.2`) | Erzeugt ein **GitHub Release** mit angehängter HTML-Datei |

### Einrichtung (einmalig)

1. Repo auf GitHub anlegen, z. B. `panda-lemmings`.
2. Remote verbinden & pushen:
   ```bash
   git remote add origin git@github.com:<USER>/panda-lemmings.git
   git push -u origin master
   ```
3. **Settings → Pages → Build and deployment → Source: GitHub Actions** aktivieren.
4. Release erstellen:
   ```bash
   git tag v0.2
   git push origin v0.2
   ```

Nach Schritt 2 läuft automatisch das Pages-Deployment; nach Schritt 4 entsteht das Release.
