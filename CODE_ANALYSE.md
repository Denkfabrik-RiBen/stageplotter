# Code-Analyse

Stand: 15. November 2026, Branch `claude/confident-franklin-jl5zd8`, Basis-Commit `a3716b7` (`v0.1.0-beta.32`).

Dieser Bericht ändert keinen App-Code. Er listet Fehler, toten Code, verwaiste Dateien und Verbesserungen auf, jeweils mit der Art des Belegs.

## Ausgangslage

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | bestanden |
| `npm test` | 51 Testgruppen bestanden, Build synchron |
| `npm run test:browser` (Chromium) | 24 Abläufe bestanden |
| `BROWSER=webkit npm run test:browser` | 24 Abläufe bestanden |
| Eigener Browser-Lauf: ein Projekt mit allen 135 Katalogobjekten, alle fünf Ansichten | 135 von 135 gerendert, keine JavaScript-Ausnahme, keine Konsolenfehler, kein HTTP-Fehler |

Belegarten im Text:

- **Reproduziert:** im Browser oder in Node nachgestellt.
- **Statisch:** aus dem Quelltext abgeleitet (ESLint, AST-Auswertung mit acorn, Querverweise).
- **Kandidat:** heuristischer Treffer, vor dem Löschen einzeln prüfen.

## 1. Fehler und Risiken

### 1.1 Ein ungültiges Objekt blendet alle Projekte aus (hoch, reproduziert, behoben)

**Behoben auf diesem Branch:** `readDraftLibrary` lädt jeden Eintrag einzeln. Unlesbare Einträge bleiben unverändert im Speicher, auch nach weiteren Speichervorgängen. Das Dashboard meldet sie und bietet „Rohdaten sichern“ an. Im Browser gegengeprüft und per Test in `stageplot-project-identity.test.cjs` abgesichert. Podeste mit fehlenden oder ungültigen Maßen erhalten jetzt wie FOH und Zugänge Standardwerte (Katalogfläche, 40 cm Höhe) und brechen das Laden nicht mehr ab.

`readDraftLibrary` (`stageplot-studio.html:22437`) normalisiert jeden gespeicherten Entwurf in einer gemeinsamen `map`. Wirft `normalizeSetupDocument` für einen einzigen Eintrag, ist die ganze Bibliothek unlesbar.

Nachgestellt mit zwei Projekten im Browser:

| Zustand | Im Speicher | Karten im Dashboard |
| --- | --- | --- |
| zwei gültige Projekte | 2 | 2 |
| Projekt B enthält ein Podest ohne Höhe | 2 | 0 |

Die Daten bleiben erhalten, aber das Dashboard zeigt „0 Projekte“, und der Kopf meldet weiter „Lokal gespeichert“. Einen Weg zurück gibt es in der Oberfläche nicht.

Auslöser können sieben harte Abbrüche in `normalizeSetupDocument` sein (`stageplot-studio.html:17061` bis 17125), darunter „Ungültige Riser-Maße.“ und „Ungültiger Baustein.“. Kritisch wird das, sobald ein Release eine Prüfung verschärft oder einen Objekttyp entfernt: Dann trifft es bestehende Browserdaten.

Die Strenge ist außerdem uneinheitlich. FOH, Treppen und Zugänge fallen bei ungültigen Maßen auf Standardwerte zurück (Zeilen 17100 bis 17102), Podeste brechen ab (Zeile 17104).

Empfehlung: Einträge einzeln laden. Ein defekter Eintrag erscheint als „beschädigt“ mit Sicherungsdownload der Rohdaten, die übrigen bleiben nutzbar. Für Podeste denselben Rückfall auf Standardmaße wie bei FOH.

### 1.2 Toter Schlagzeug-Zweig mit `ReferenceError` (niedrig, reproduziert, behoben)

**Behoben auf diesem Branch:** Zweig und die Helfer `kick`, `drum`, `kickTop`, `kickOverhead` sind entfernt. Die Zeilenangaben unten beziehen sich auf den Stand davor.

`stageplot-symbols-v3.js:463` bis 478 zeichnet ein Schlagzeug ohne `drumLayout`. Der Zweig liest die nie deklarierte Variable `large` (Zeile 477).

```
createStageplotSymbolV3('drums')  ->  ReferenceError: large is not defined
```

Die App erreicht den Zweig nicht: Alle drei Aufrufe für Schlagzeuge übergeben ein `drumLayout` (`stageplot-studio.html:15512`, 20579, 20864). Er ist also zugleich tot und defekt. Mit ihm entfallen die nur dort verwendeten Helfer `kick` und `drum`.

### 1.3 Doppelter Schlüssel beim Duplizieren einer Treppe (niedrig, statisch, behoben)

**Behoben auf diesem Branch:** Der zweite Schlüssel ist entfernt, die Begrenzung auf 1 bis 24 gilt.

`stageplot-studio.html:22283` setzt `stairsSteps` zweimal im selben Objektliteral. Der zweite Wert (`source.stairsSteps||3`) überschreibt den ersten, der auf 1 bis 24 begrenzt und gerundet ist. Die Begrenzung wirkt dadurch nicht.

### 1.4 Zwei Browserprüfungen sind kaputt und laufen nirgends (mittel, reproduziert, behoben)

**Behoben auf diesem Branch:** Beide überholten Skripte sind gelöscht. `check-mic-layers.cjs` und `check-mic-head-direction.cjs` decken die aktuelle Mikrofon-Ebenen- und Richtungsdarstellung ab; die vollständigen Browser-Suiten in Chromium und WebKit sind am 15. November durchgelaufen.

| Skript | Ergebnis | Ursache |
| --- | --- | --- |
| `scripts/check-iem-monitors.cjs` | gelöscht | klickte `#sp-output-tab` der dauerhaft unsichtbaren alten Routing-Tabelle |
| `scripts/check-boom-microphones.cjs` | gelöscht | erwartete drei `<use>`-Elemente, die es seit der Mikrofon-Ebenen-Überarbeitung nicht mehr gibt |

Weiter nicht im Lauf, aber grün: `check-mobile-warning.cjs`, `check-qol.cjs`, `check-touch-rotation.cjs`. Diese drei verwenden noch `chromium.launch({channel:'chrome'})`; vor einer Aufnahme in `run-browser-tests.cjs` müssen sie auf `launchBrowser()` umgestellt werden, sonst wären sie in der CI nicht lauffähig.

### 1.5 Vorschau und Produktion unterscheiden sich (mittel, statisch)

`stageplot-preview.py` sendet eine Content-Security-Policy. Die veröffentlichte `index.html` hat keine. Alle Browserprüfungen laufen gegen die Vorschau. Was die CSP blockiert, fällt im Test auf, und was nur ohne CSP funktioniert, wäre live anders. Ein `<meta http-equiv="Content-Security-Policy">` im Wrapper von `scripts/build-inline.cjs` gleicht das an (`frame-ancestors` geht dort nicht).

Der Dokument-Wrapper existiert zweimal, in `build-inline.cjs` und in `stageplot-preview.py`. Der Vorschau fehlt die Meta-Description.

### 1.6 Kleinere Robustheitspunkte (niedrig, statisch, teilweise behoben)

- **Behoben auf diesem Branch:** `stageplot-share-v1.js` übersetzt Nicht-JSON-Antworten (etwa HTML-Fehlerseiten) in eine verständliche Fehlermeldung. Drei Fälle sichern dies in `stageplot-share-v1.test.cjs` ab.
- Dort gilt jeder `TypeError` als „Keine Verbindung“, auch ein Programmierfehler.

### 1.7 Geprüft ohne Befund

- Nutzereingaben im HTML: rund 30 Treffer, an denen Namen, Labels oder Titel ohne `esc()` verkettet werden, einzeln angesehen. Alle landen in Textkontexten oder stammen aus festen Katalogen. Das ist eine Stichprobe über ein Suchmuster, kein vollständiger Nachweis.
- Element-IDs: 757 statische IDs, keine doppelt, kein `$()`-Zugriff auf eine fehlende ID.
- Browser-Speicher: 14 Schlüssel, alle versioniert unter `stageplot-studio:…:v1`.

## 2. Toter Code

### 2.1 Alte Routing-Oberfläche (größter Posten, reproduziert, teilweise bereinigt)

**Teilweise bereinigt auf diesem Branch:** `renderLegacyRouting`, `exportRoutingCsv`, ihr CSV-Listener sowie `audioPatchButton`, `audioRoutingRows` und `audioMicBrand` sind entfernt. `routingDirectionLabel` bleibt absichtlich erhalten: Der aktuelle CSV-Import verwendet die Funktion. Markup, weitere alte Listener und deren CSS bleiben ein eigener, größerer Arbeitsschritt.

`renderRouting` setzt immer `data-workspace-v2="true"`. Die Regel in `stageplot-studio.html:6939` blendet dann jedes Kind von `#sp-routing` außer dem Workspace v2 aus. Im Browser bestätigt: alle sieben alten Kinder haben `display:none`.

Betroffenes Markup (`stageplot-studio.html:476` bis 487, rund 4,5 kB): Überschrift, Tabs, Suche und Filter, Kanaltabelle, Stagebox-Ansicht, Statuszeile und der Dialog „Routing-Aktionen“.

Daran hängt JavaScript, das niemand mehr auslösen kann. Per AST-Auswertung ermittelt, rund 16 kB:

| Ort | Was |
| --- | --- |
| `stageplot-studio.html` | `renderLegacyRouting` und `exportRoutingCsv` entfernt; v2 exportiert selbst in `stageplot-routing-host-v2.js` |
| `stageplot-studio.html` | `routingDirectionLabel` bleibt für den aktiven CSV-Import |
| `stageplot-studio.html:20009` bis 20046, 20437 bis 20440 | 17 Listener auf unsichtbaren Elementen: Tabs, Zeilen-Klick, Drag-and-drop, Reset, PDF, CSV, XLSX |
| `stageplot-audio-v1.js` | `audioPatchButton` und `audioRoutingRows` entfernt; `audioVisibleRows`, `renderAudioFind`, `audioObjectKey`, `groupAudioInstruments` und `moveAudioInstrument` bleiben Kandidaten |
| `stageplot-audio-v1.js:619` bis 694 | 11 Listener auf unsichtbaren Elementen |

Weiter in Gebrauch und nicht zu löschen: `#sp-routing-csv-file` mit seinem `change`-Listener und `parseRoutingCsv`. Workspace v2 klickt das versteckte Dateifeld programmatisch an (`stageplot-studio.html:18435`).

Zwei Dinge sind beim Aufräumen zu beachten:

- `stageplot-audio-v1.test.cjs` und `stageplot-playback-v1.test.cjs` prüfen Teile dieses Codes. Die Tests halten ihn künstlich am Leben und müssen mit angepasst werden.
- Meine Auswertung zählt nur Funktionen, die ausschließlich über die toten Einstiege erreichbar sind. Zugehöriges CSS in `stageplot-audio-v1.css` und im Hauptblock ist nicht mitgezählt.

### 2.2 Einzelne ungenutzte Funktionen und Variablen (statisch, teilweise bereinigt)

**Bereinigt auf diesem Branch:** `kickTop`, `kickOverhead` und der nach dem Schlagzeugzweig verwaiste Helfer `pedal` sind entfernt.

| Ort | Name |
| --- | --- |
| `stageplot-studio.html` | `drumMicPopupChannel` wird gesetzt, nie gelesen |
| `stageplot-studio.html` | lokale Variablen `slot`, `rows`, `height`, `o`, `active` und `clone` ohne Verwendung |

### 2.3 Totes CSS (Kandidat)

60 Klassen- und ID-Namen aus den Stylesheets kommen weder im Markup noch in einem Skript vor. Dazu gehören 180 Regeln (rund 18 kB), die vollständig tot sind: 129 im handgeschriebenen Block, 42 in `stageplot-audio-v1.css`.

Beispiele: `sp-tag`, `sp-flex`, `sp-estimate`, `sp-category`, `sp-object-strip`, `sp-print-toolbar`, `sp-paper-heading`, `sp-header-actions`, `sp-offline`, `sp-preview-options`, `sp-angle-control`, `sp-export-select`, `sp-mic-sprite`, `sp-channel-toggle`, `sp-stagebox-unpatched`, `sp-stagebox-signal-list`, `sp-audio-mic-card`, `sp-audio-mic-brands`, `rw-microphone-art`, `rw-model-art`.

Dynamisch zusammengesetzte Namen (`'sp-foo-'+x`) habe ich über ihre Präfixe ausgeschlossen. Trotzdem vor dem Löschen je Name einmal suchen.

## 3. Verwaiste und überflüssige Dateien

### 3.1 Assets ohne Verwendung in der App

Viele Dateinamen entstehen zur Laufzeit (`c.id+'-v1.webp'`). Die folgende Liste ist deshalb gegen die Namensmuster und die tatsächlichen Aufrufe geprüft.

| Dateien | Größe | Beleg |
| --- | --- | --- |
| `stageplot-assets/mics/*-original-*` (19 Dateien) | 5,8 MB | Die Zeichenfolge `-original-` kommt in der App nicht vor. Es sind Quellfotos für die Herkunftsnachweise. |
| `stageplot-assets/tech/stairs-{top,bottom,left,right,top-left,top-right,bottom-left,bottom-right}-v1.webp`, `stairs-approved-v1.webp` (9 Dateien) | 0,26 MB | `stageplotStairArtwork` lädt nur `rail`, `rail-top`, `rail-bottom`, `surface`. |
| `stageplot-assets/categories/{all,lights,tech}-v1.webp` | 49 kB | Nur `orchestra-v1` und `stage-v1` werden referenziert. |
| `stageplot-assets/tech/mic-boom-top-v2.webp` | 15 kB | Durch `mic-boom-arm-top-v3` und `mic-boom-head-top-v3` ersetzt. |

Die Quellfotos und `stairs-approved` gehören zur Dokumentation und sollen im Repository bleiben. Sie werden aber mit `cp -R stageplot-assets` nach GitHub Pages kopiert (`.github/workflows/deploy.yml`). Ein eigener Ordner für Quellen außerhalb des Deploy-Pfads löst das.

Einschränkung: Der Browser-Lauf hat 154 Asset-Abrufe erfasst, aber nicht jeden Picker und Editor geöffnet. Die Liste oben stützt sich auf den Quelltext.

### 3.2 Skripte und Dokumente

| Datei | Befund |
| --- | --- |
| `scripts/check-iem-monitors.cjs` | auf diesem Branch gelöscht; überholte Prüfung der alten Routing-Tabelle |
| `scripts/check-boom-microphones.cjs` | auf diesem Branch gelöscht; überholte Erwartung an frühere Mikrofon-SVGs |
| `SESSION_HANDOFF.md` | Stand 7. September, beschreibt `beta.6`, nennt den Branch `codex/feedback-editor-production` und den Pfad `/Users/ben/Downloads/…`. Nennt 18 bzw. 20 Testgruppen. |
| `README.md` | Der aktuelle Browser-Testumfang ist auf 24 korrigiert. Die Datei ist weiterhin eher Änderungsprotokoll als eine Einführung. |
| `MOBILE_QA.md` | nennt 38 Testgruppen |
| `CLAUDE.md`, `AGENTS.md` | verweisen jetzt auf `MODULES` in `scripts/build-inline.cjs`; `SESSION_HANDOFF.md` bleibt historisch und damit veraltet. |

## 4. Verbesserungen

Nach Nutzen geordnet.

1. **Bilder der Gitarren, Bässe, Stageboxen und DI-Boxen nach WebP wandeln.** 29 PNGs in `objects/` belegen 34 MB, zehn in `stageboxes/` 17 MB, vier in `di/` 7 MB. Jede Datei hat 1,2 bis 2,1 MB. Die älteren WebP-Assets liegen bei rund 100 kB. Von 87 MB Assets entfallen 67 MB auf PNG. Das betrifft Ladezeit, Offline-Speicher und die Größe exportierter Dateien, weil der Export die Bildbytes einbettet. Die Regel aus `CLAUDE.md` bleibt gewahrt: Es ist eine Formatwandlung bestehender Rasterbilder, keine neue Zeichnung.
2. **Entwurfsbibliothek fehlertolerant laden** (siehe 1.1) ist auf diesem Branch umgesetzt und in Chromium und WebKit geprüft.
3. **Alte Routing-Oberfläche weiter entfernen** (siehe 2.1). Der ungefährliche erste Teil ist umgesetzt; Markup, weitere Listener und CSS gehören weiter auf einen eigenen Branch mit Browser-Gegenprobe.
4. **Testlisten automatisch bilden.** `scripts/run-tests.cjs` und `scripts/run-browser-tests.cjs` führen feste Listen. Eine neue Datei läuft erst mit, wenn jemand sie einträgt. Fünf Browserprüfungen sind so herausgefallen. Ein Glob über `*.test.cjs` und `scripts/check-*.cjs` verhindert das.
5. **`index.html` nicht einchecken.** Die Datei ist ein 2,2 MB großes Abbild von `stageplot-studio.html`. Jede Änderung steht doppelt im Diff. Der Deploy-Job kann sie mit `npm run build` erzeugen. Abwägung: Wer das Repository ohne Node klont, hat dann keine fertige Seite.
6. **Lint in die CI aufnehmen.** Eine ESLint-Konfiguration mit `no-undef`, `no-dupe-keys` und `no-unused-vars` über die zusammengeführten Skripte hat 1.2, 1.3 und 2.2 in Sekunden gefunden. `npm run check` prüft nur die Syntax.
7. **`esc()` einmal definieren.** Die HTML enthält acht inhaltsgleiche Definitionen, verteilt über die Module.
8. **Test-Dateinamen.** `stageplot-studio-v60.test.cjs` bis `-v81` tragen interne Versionsnummern, die sonst nirgends mehr vorkommen. Sprechende Namen erleichtern das Auffinden. Reine Kosmetik.

## 5. Was nicht geprüft wurde

- Die rund 7.000 handgeschriebenen Zeilen in `stageplot-studio.html` habe ich nicht Zeile für Zeile gelesen. Die Fehlersuche stützt sich auf Werkzeuge, Stichproben und den Browser-Lauf. Logikfehler in selten genutzten Abläufen können unentdeckt sein.
- Echte Touch-Geräte und der Supabase-Betrieb (Login, Sync, Freigaben gegen einen echten Server). WebKit lief am 15. November mit allen 24 Browserabläufen durch.
- Die SQL-Migrationen in `supabase/migrations/`.
- Ungenutzte Mitglieder der Modul-Schnittstellen (`StageplotMics.typical`, `StageplotPrint.copyArtwork` sind Kandidaten). Meine Auswertung dafür war zu grob für eine belastbare Aussage.
