# Übergabe an Codex

Stand: 15. November 2026. Branch: `claude/confident-franklin-jl5zd8`, Basis `a3716b7` (`main`, v0.1.0-beta.32).

Ben testet den Branch selbst, bevor etwas auf `main` geht. Nicht mergen, keinen Pull Request öffnen, nicht deployen.

## Zuerst lesen

1. `CLAUDE.md` und `AGENTS.md` (Projektregeln).
2. `CODE_ANALYSE.md` (vollständige Analyse mit Belegen; erledigte Punkte sind dort markiert).
3. Diese Datei.

## Was auf dem Branch liegt

| Commit | Inhalt | Geprüft |
| --- | --- | --- |
| `a3a9808` | `CODE_ANALYSE.md` | – |
| `bbf5a7f` | Projektliste lädt jeden Entwurf einzeln; unlesbare Einträge bleiben gespeichert; Hinweis mit „Rohdaten sichern“ im Dashboard. Toter Schlagzeug-Zweig (`large`) entfernt. Doppelter Schlüssel `stairsSteps` entfernt. | `npm test`, 24 Browserabläufe (Chromium), eigenes Szenario im Browser |
| `1d692dd` | Podeste mit fehlenden Maßen bekommen Standardwerte statt das Laden abzubrechen | `npm test`, 24 Browserabläufe (Chromium), eigenes Szenario im Browser |
| letzter Commit („wip“) | siehe nächster Abschnitt | `npm run check`, `npm test`, alle 24 Browserabläufe in Chromium und WebKit sowie manuelle Kernabläufe |

## Letzter Commit: vollständig geprüft, weiterhin nicht veröffentlichen

Die Abschlussprüfung ist am 15. November nachgeholt: `npm ci`, `npm run check` und `npm test` (51 Gruppen) bestehen. Alle 24 Browserabläufe bestehen in Chromium und WebKit. Direkt in der laufenden App geprüft: Drum Designer öffnen und ein Cowbell aus der erst dann aufgebauten Palette auf die Fläche setzen (danach verworfen), Routing-Werkzeuge und CSV-Export, X32-Szenendialog sowie PDF-Druckfluss. Die automatisierte Routing-Prüfung deckt den CSV-Import zusätzlich mit ab.

Inhalt:

1. **Schneller Kaltstart.** Die Percussion-Palette des Drum Designers wurde beim App-Start aufgebaut und lud 19 Bilder (3,3 MB), obwohl der Dialog zu ist. Sie entsteht jetzt beim ersten Öffnen (`ensureDrumPalette` in `stageplot-studio.html`). Gemessen: leerer Start 27 → 9 Dateien, 4,6 → 1,0 MB. Zwei neue Zusicherungen dazu stehen in `scripts/check-editor-ux.cjs`.
2. **Toter Code entfernt.**
   - `stageplot-studio.html`: `renderLegacyRouting`, `exportRoutingCsv` samt Listener auf `#sp-routing-csv`.
   - `stageplot-audio-v1.js`: `audioRoutingRows`, `audioPatchButton`, `audioMicBrand`.
   - `stageplot-symbols-v3.js`: Helfer `pedal` (nach Wegfall der Kick-Helfer ohne Aufrufer).
   - Tests angepasst: `stageplot-playback-v1.test.cjs` (zwei Zusicherungen auf den toten Renderer gestrichen), `stageplot-audio-v1.test.cjs` (nutzt `StageplotMics.brand`).
3. **Freigabe-Client.** `stageplot-share-v1.js` zeigt bei einer Nicht-JSON-Antwort keine rohe Parser-Meldung mehr. Drei neue Fälle in `stageplot-share-v1.test.cjs`.
4. **Deploy.** `.github/workflows/deploy.yml` löscht die 19 Mikrofon-Quellfotos (`*-original-*`, 5,8 MB) aus dem Pages-Artefakt. Im Repository bleiben sie. Der Workflow ist nicht gelaufen.
5. **Doku.** `CLAUDE.md` und `AGENTS.md` verweisen für die Build-Quellen auf `MODULES` in `scripts/build-inline.cjs`. README nennt 24 Browserprüfungen. `MASSTAB.md` verweist auf die aktuellen Mikrofon-Checks.
6. **Zwei veraltete Browserprüfungen gelöscht:** `scripts/check-iem-monitors.cjs` (klickte die unsichtbare alte Routing-Tabelle) und `scripts/check-boom-microphones.cjs` (erwartete `<use>`-Elemente, die Mikrofone seit dem Ebenen-Umbau nicht mehr haben; abgedeckt durch `check-mic-layers.cjs` und `check-mic-head-direction.cjs`).

### Warnung aus diesem Arbeitsschritt

`routingDirectionLabel` sah in der Analyse tot aus und wurde kurz entfernt. Der aktive CSV-Import nutzt die Funktion. Sie ist wieder drin. Lehre: Die Liste in `CODE_ANALYSE.md` Abschnitt 2.1 ist nur für Funktionen sicher, die **ohne** die Annahme „Listener ist tot“ unerreichbar sind. Nach jedem Löschen ESLint mit `no-undef` über die zusammengeführten Inline-Skripte laufen lassen.

## Erledigter Abschluss für Codex

1. **Abschlussprüfung:** erledigt – `npm ci`, Syntax, 51 Funktionstestgruppen sowie je 24 Browserabläufe in Chromium und WebKit sind grün.
2. **Manuelle Kernabläufe:** erledigt – Drum-Palette, Percussion-Platzierung mit Abbrechen, Routing-Werkzeuge/CSV-Export, X32-Dialog und PDF-Druckfluss öffnen korrekt.
3. **Release-Texte:** bewusst offen bis Ben den Branch freigibt. Dann erst In-App-Release-Notes, Versionsbadge, Hilfe-Fußzeile, README, `package.json` und `package-lock.json` auf sichtbare Änderungen angleichen.
4. **`CODE_ANALYSE.md`:** nachgezogen für 1.4, 1.6, 2.1, 2.2 und die Browser-Abnahme.

Der Branch bleibt bis zu Bens Test und Freigabe ohne Merge, Pull Request oder Deployment.

## Offen und bewusst nicht angefasst

- **Bilder nach WebP.** Größter verbleibender Hebel, aber Bens Entscheidung, weil es seine generierten Originale, die `sha256`-Einträge der Manifeste und Tests mit PNG-Header-Prüfung betrifft. Messwerte (PNG → WebP q92 / verlustfrei): Gitarre 1297 → 211 / 846 kB, Stagebox GX4816 2075 → 273 / 1352 kB, DI 1837 → 210 / 1218 kB, Cajon 1418 → 230 / 1010 kB. Logos: Dashboard-Logo 633 → 167 kB, Header 205 → 35 kB, Icon 139 → 25 kB. Die drei Logos machen fast den ganzen verbleibenden Kaltstart aus. `stageplot-studio-v61.test.cjs` schreibt die PNG-Pfade und den Alphakanal fest, `stageplot-preview.py` liefert im Branding-Ordner nur `.png` aus.
- **Alte Routing-Oberfläche vollständig entfernen** (Markup `#sp-routing` außer `#sp-routing-workspace-v2` und `#sp-routing-csv-file`, 28 Listener, zugehöriges CSS). Eng mit aktivem Code in `stageplot-audio-v1.js` verzahnt (`syncMobileRoutingActions`, `renderAudioFind`, `renderStageboxView`) und durch `stageplot-audio-v1.test.cjs` abgedeckt. Eigener Branch, nicht nebenbei.
- **Totes CSS** (60 Namen, 180 Regeln, rund 18 kB): Kandidatenliste in `CODE_ANALYSE.md` 2.3. `STARTOPTIMIERUNG.md` verlangt Vergleiche in Desktop, Mobil, Hell/Dunkel und Druck.
- **Drei grüne Checks außerhalb des Runners** (`check-mobile-warning`, `check-qol`, `check-touch-rotation`): Sie starten `chromium.launch({channel:'chrome'})` statt `browser-qa.cjs`. In der CI ist nur Playwright-Chromium bzw. WebKit installiert. Vor dem Eintragen in `run-browser-tests.cjs` auf `launchBrowser()` umstellen, sonst blockiert der Deploy.
- **Ungenutzte Treppen- und Kategoriebilder** (rund 80 kB): stehen in freigegebenen Manifesten, deshalb belassen.
- **CSP-Unterschied** zwischen Vorschau und `index.html`, mehrfach definierte `esc()`, eingecheckte `index.html`: siehe `CODE_ANALYSE.md` 1.5 und 4.
- Sieben ungenutzte lokale Variablen (ESLint `no-unused-vars`): `slot`, `rows`, `height`, `o`, `active`, `drumMicPopupChannel`, `clone`.

## Werkzeuge der Analyse

Nicht im Repository. Bei Bedarf neu aufsetzen: ESLint 9 mit `no-undef`, `no-unused-vars`, `no-dupe-keys` über alle Inline-Skripte von `stageplot-studio.html`, zu einer Datei zusammengeführt (Zeilennummern erhalten); acorn für die Suche nach unerreichbaren Funktionen.
