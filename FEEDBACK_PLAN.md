# Instrumente, Routing und Export

Stand: 17. September 2026 · v0.1.0-beta.14. Die folgenden Abschnitte beschreiben den implementierten Umfang; Prüfgrenzen stehen am Ende.

## 1. Fehler und Datensicherheit zuerst

- **PDF:** Die Druckgrafik kopiert jetzt alle extern referenzierten Objektdefinitionen rekursiv in eigene SVG-Definitionen. Vor dem Druck werden Bilder und Schriften geladen. Die Browservorschau zeigt Drumset, Percussion, Orchesterinstrument, Mikrofon und mehrzeilige Notiz. 16 Objektverweise sind innerhalb des Druck-SVG auflösbar; es enthält 46 Bilder und 82 Drum-Teilmarkierungen. Eine tatsächlich gespeicherte PDF-Datei konnte wegen des gesperrten Macs noch nicht kontrolliert werden.
- **Auswahlfenster:** Stagebox-Belegung aus dem Bühnenplan, freie Buchse und Signalauswahl wurden bei Desktopbreite und 390 × 844 Pixeln geprüft. Die Zuweisung wurde gespeichert. Instrument- und Mikrofonpicker funktionierten ebenfalls. Der gemeldete Auswahlfehler ließ sich in dieser Umgebung nicht reproduzieren; eine allgemeine Fehlerbehebung wird deshalb nicht behauptet.
- **DI-Box:** Eine platzierte DI-Box einem bestehenden Instrumentensignal zuordnen und dessen Kanal am Objekt anzeigen. Die DI ist Teil des Signalwegs und darf beim Verknüpfen keinen doppelten Pultkanal erzeugen. Für eine zunächst allein platzierte DI muss sich eine Signalquelle anlegen oder später verbinden lassen.
- **Speicherhinweis:** Beim ersten Projekt und dauerhaft über den Speicherstatus zugänglich. Keine feste Aufbewahrungsdauer versprechen. Lokale Speicherung gilt für diesen Browser und dieses Profil. Website-Daten löschen, Browserprofil entfernen, privates Surfen und automatische Browserbereinigung erklären. Eine Sicherungsdatei muss unmittelbar herunterladbar sein; bestätigten Account-Abgleich separat anzeigen.

## 2. Routing

Ein Instrument besitzt ein oder mehrere Signale. Jedes Signal hat seinen eigenen vollständigen Signalweg:

**Instrument → Abnahme → Stagebox-Buchse → Pultkanal**

Die Hauptliste zeigt Instrumentgruppen, darunter ihre Signale. Spalten: Signal, Mikrofon/DI, Stagebox und Buchse, Pultkanal. Details wie 48 V, Anschluss und Bemerkungen bleiben direkt erreichbar, müssen aber nicht ständig die Liste verbreitern. Eingangssignale und Monitorausgänge erhalten getrennte Ansichten. Die Stagebox-Ansicht verwendet dieselben Daten und denselben Verbindungsdialog.

Beispiel:

| Instrument | Signal | Abnahme | Stagebox | Pult |
| --- | --- | --- | --- | --- |
| Akustikgitarre | DI | DI-Modell | A · IN 9 | CH 9 |
| Akustikgitarre | Mikrofon | Mikrofonmodell | A · IN 10 | CH 10 |

- **Mono:** ein unabhängiges Signal.
- **Stereo:** zwei zusammengehörige Signale L/R mit gemeinsamer Bedienung.
- **Dual Mono:** zwei unabhängige Signale desselben Instruments; eigene Namen, Abnahmen, Mikrofone, 48 V, Buchsen und Pultkanäle. Kein automatischer Stereo-Link.
- Instrumentgruppen und Signale können verschoben werden. Vorgeschlagene Ausgangsreihenfolge: Drums, Percussion, Bass, Gitarren, Tasten, weitere Instrumente, Playback, Gesang. Bestehende Kanalnummern nie stillschweigend ändern; Neunummerierung bleibt eine ausdrückliche Aktion.
- Unvollständige Zuordnungen sichtbar markieren; Konflikte an der betroffenen Buchse erklären. Auswahl und Bearbeitung müssen sowohl beim Instrument als auch in der Routingliste möglich sein.

## 3. Drums und Percussion

Gut sichtbarer Einstieg „Drums & Percussion“ in der Bibliothek sowie „Aufbau bearbeiten“ am ausgewählten Set. Ein gemeinsamer Aufbau enthält frei platzierbare Trommeln, Cajon, Becken, Kleinpercussion, elektronische Pads, Hocker und Gesangsmikrofone.

- Vorlagen: Drumset, Percussion, Cajon-Set, leerer Aufbau. Die Vorlage legt nur den Anfang fest; danach bleibt jedes Teil frei kombinierbar.
- Ein Cajon-Set aus Kick, Cajon und Crash besteht aus drei editierbaren Teilen, nicht aus einer einzigen fest gezeichneten Kombination.
- **Cajon-Grafik:** neue saubere Draufsicht der Cajon selbst. Mikrofone, Kick und Becken werden getrennt darüber bzw. daneben gerendert.
- **Cajon-Abnahme:** vorne an der Schlagfläche, hinten am Schallloch oder beide; je Position ein wählbares Mikrofon und ein eigenes Signal.
- **Crash:** optional, links oder rechts als Startposition und anschließend frei verschiebbar. Eigene Abnahme bzw. Overhead-Zuordnung.
- **Vocal-Mic:** Boom-Stativ als eigenes Teil, dreh- und verschiebbar, mit Modellauswahl und eigenem Gesangskanal.
- Bestehende Drum-/Percussion-Aufbauten und ihre Kanalzuordnungen müssen beim Laden erhalten bleiben. Gemeinsame Bearbeitung darf keine bestehenden Signale umnummerieren oder neu identifizieren.

## 4. Weitere Erweiterungen

| Bereich | Umsetzung |
| --- | --- |
| Treppen | Stufenanzahl direkt im Auswahl-Popup, in den Eigenschaften und in der Zeichnung; für eingefügte Bühnentreppen, Randtreppen und Treppen im Bühnenform-Editor konsistent speichern. |
| Mikrofone | Sennheiser MD 421 Kompakt im gemeinsamen Mikrofonkatalog und bei passenden Drum-Abnahmen anbieten. |
| Freie Notizen | Die vorhandene „Freie Beschriftung“ als gut auffindbares mehrzeiliges Textfeld anbieten; direkt bearbeiten, verschieben und in PDF/Bild ausgeben. Text sicher behandeln. Für Freigaben dieselben klaren Hinweise wie bei anderen sichtbaren Beschriftungen. |
| Akkordeon | Standardausrichtung neuer Objekte um 180° ändern. Bereits bewusst platzierte Objekte nicht nachträglich drehen. |
| Akustikgitarren und Banjo | Gemeinsame Auswahl „Akustik & Banjo“ mit Dreadnought, Cutaway, Klassik, Gypsy, Jazzgitarre und Banjo. Sechs separat generierte transparente PNG-Assets nach Herstellerreferenzen; Abnahme unabhängig vom Modell einstellen. |
| E-Gitarren und weitere Saiteninstrumente | Elf Modelle unter „Gitarre“: Strat, Telecaster, Jazzmaster, Jaguar, Les Paul, SG, ES-335, Explorer, Flying V, King V und Superstrat. Mandoline, Lap Steel und Ukulele als eigene Bausteine. 14 einzeln mit imagegen erzeugte transparente PNGs; bisherige E-Gitarrentypen und Maße bleiben bestehen. |
| Streicher | Einzeln platzierte Streicher direkt in den Bühnen-Eigenschaften bearbeiten. Der Orchester-Editor bleibt für gemeinsame Aufstellungen und Gruppen. |

## Prüfstand

- `npm test`: 44 Testgruppen erfolgreich, einschließlich der 14 neuen Saiteninstrument-Assets, unverzerrter Rastergeometrie, unveränderter Signal-IDs beim E-Gitarrenmodellwechsel, Migration alter Cajon-Kanäle, bestehender Akkordeon-Ausrichtung, mehrzeiliger Texte, Stufenanzahl und stabiler DI-/Dual-Mono-Kanäle.
- `npm run check`: 25 Laufzeitmodule und acht eingebettete Skripte erfolgreich geprüft; Build und erzeugte HTML-Dateien sind abgeglichen.
- PostgreSQL/PGlite: alle Migrationen einschließlich 0007 sowie Datenbereinigung, Eigentümerrechte und Freigabeabläufe erfolgreich geprüft. Neue Instrumentfelder werden zwischen Browser- und Datenbankfilter identisch behandelt.
- Browser: DI an Gitarre CH 16 verknüpft und neu geladen; Dual Mono behält ersten Kanal und Patch; Cajon vorne/hinten mit MD 421 Kompakt, zusätzliches Crash und Vocal-Boom mit SM58 gespeichert und erneut geladen. Direkte Violine-Eigenschaften, Gypsy-Gitarre, sieben Treppenstufen, zweizeilige Notiz und Speicherhinweis geprüft. Instrumentgruppen verschieben sich ohne Öffnen eines Dialogs. Mobile Routingansicht visuell geprüft. Keine JavaScript-Fehler in diesen Abläufen.
- Gitarren-Bildassets: alle sechs Modelle in der Auswahl visuell geprüft. Banjo auf der Bühne platziert und zu Cutaway gewechselt; Position, Drehung und CH 24 bleiben erhalten. Bestehende Gypsy-Gitarre lädt das neue Bild. Transparenz auf heller Auswahl und dunkler Bühne sowie Cutaway nach erneutem Laden in der Exportvorschau geprüft; keine Konsolenfehler. [Dateien, Prompts und Referenzen](stageplot-assets/objects/acoustic-instruments-v1.json).
- Neue E-Gitarren: alle elf Bilder in der Modellauswahl visuell geprüft. Jazzmaster, Mandoline, Lap Steel und Ukulele über die Oberfläche platziert, Signalanschlüsse geprüft und Projekt erneut geladen. Transparenz auf dunkler Bühne und alle vier Instrumente in der Exportvorschau geprüft; keine Konsolenfehler. PNG-Alpha und Prüfsummen aller 14 Assets kontrolliert. [Dateien, Prompts, Korrektur der Flying-V-Kopfplatte und Herstellerreferenzen](stageplot-assets/objects/electric-instruments-v1.json). Die tatsächliche PDF-Dateiausgabe wurde für diese Änderung nicht erneut geprüft.
- Bestandsaufbauten behalten ihre bisherigen Datenmodelle. Der bisherige Percussion-Editor bleibt für solche Objekte zuständig und bietet zusätzlich Kick, Snare, Cajon, Vocal-Boom und Mikrofonwahl; der Drum-Designer enthält die Percussion-Teile ebenfalls. Beide heißen „Drums & Percussion“.

Migration 0007 wurde am 17. September auf dem Freigabedienst angewandt. Eine Abfrage mit künstlichen Testdaten bestätigt erhaltene Treppenstufen, Hybrid-Percussion, Mikrofonwahl und Labelpositionen sowie weiterhin entfernte private Felder. Die Browserprüfung erzeugt zusätzlich eine echte zweiseitige PDF mit Schlagzeug, Jazzmaster und Kanalliste als Release-Artefakt. Der ursprünglich gemeldete Auswahlfehler bleibt auf dem betroffenen Gerät noch gegenzuprüfen; die lokal geprüften Abläufe sind oben dokumentiert.

## Ergänzungen und Prüfung vom 16. September

- Die feste Bildregel steht in `CLAUDE.md`: neue und ersetzte Instrumentgrafiken über Bildgenerierung als lokale Rasterassets; Mikrofonkataloge ausschließlich mit echten Fotos.
- Vocal-Boom als transparentes PNG aus dem eingebauten Bildgenerator, unverändert eingebunden. [Prompt und Herkunft](stageplot-assets/percussion/vocal-boom-top-v1.json).
- 94 Katalogeinträge besitzen Fotos, darunter ausdrücklich gekennzeichnete Beispielfotos für fünf allgemeine Mikrofontypen. Eigene freie Modellnamen bleiben ohne automatische Bildzuordnung. [Quellen und Fotolizenzen](stageplot-assets/mics/ATTRIBUTION.md).
- Drum-Positionen können weit außerhalb des alten 0–1-Rahmens liegen. Die Vorschau hat eine unabhängig zoombare und verschiebbare Kamera; gespeicherte Koordinaten behalten die bisherige Bezugsgröße. Der Bühnenumriss folgt den tatsächlich platzierten Teilen einschließlich Rotation und Riser.
- Doppelklick auf Labels und freien Text öffnet und fokussiert das Beschriftungsfeld. Eine echte Ziehbewegung gilt nicht als erster Klick. Cmd-/Strg-Klick fügt Objekte zur Auswahl hinzu oder entfernt sie. Der Auswahlknopf wird auf Geräten mit Maus ausgeblendet; für Touch bleibt er verfügbar.
- Dual Mono für Amps, Pedalboards und einzeln platzierte Orchesterinstrumente; Geräte mit mehr als zwei Ausgängen behalten die übrigen Ausgänge und Stereo-Paare. Bestehende Kanalnummern und Stagebox-Patches bleiben erhalten.
- Automatisiert: 43 Testgruppen einschließlich großer Drum-Layouts und Koordinaten-Roundtrip, Doppelklick/Drag-Abgrenzung, Cmd-/Strg-Auswahl, Amp ohne bisherige Ausgänge, Vierkanal-Gerät, Orchester-Dual-Mono und Foto-Herkunft/Prüfsummen.
- Browserprüfung auf separater lokaler Testadresse: Treppen-Popup 5→8 und 12 Stufen mit erhaltener Eingabefokussierung; Doppelklick fokussiert Instrument- und Textbeschriftung; Cmd-Klick selektiert zwei Objekte; Amp-DI/Mic getrennt, Amp-Topteil mit zunächst null Ausgängen nach Umschalten und Neuladen mit zwei erhaltenen Kanälen, echtes MD-421-Kompakt-Foto geladen und gewählt. Floor-Tom außerhalb der bisherigen Grenze bewegt, Nachbarposition bleibt stabil. Neuer Vocal-Boom sichtbar. Aufbau mit 3,77 × 3,78 m nach Neuladen erhalten, Zoom und Exportvorschau geprüft. Eine neu gespeicherte PDF-Datei wurde in dieser Ergänzung nicht geprüft.

## Quellen für Produktdaten und Speicherhinweis

- Sennheiser MD 421 Kompakt: https://www.sennheiser.com/en-de/catalog/products/microphones/md-421-kompakt/md-421-kompakt-700587
- Browser-Speicher und Löschkriterien: https://developer.mozilla.org/de/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Web Storage im privaten Modus: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API

## Routing- und Export-Workflow · X32-Branch

- **Input-Liste:** kompakte, nach Pultkanal sortierte Einzelzeilen; AUX-Kennungen separat, Stereo-Partner sichtbar. Suche und Filter für offene Verbindungen grenzen die Liste ein. „Anschlüsse“ öffnet die Bearbeitung direkt unter der Zeile; Auswahl und Scrollposition bleiben erhalten. Instrumentgruppen bleiben in „Quellen“ erhalten.
- **Kanalplanung:** eine belegte Mono-Kanalnummer tauscht die beiden Signale; „Davor einfügen“ verschiebt die folgenden Nummern ausdrücklich. Gerätebuchsen bleiben am Signal. Stereo-Paare werden vor unvollständigen Verschiebungen geschützt.
- **Import/Export:** CSV, X32 und XLSX stehen im Menü der Input-Liste; PDF bleibt direkt erreichbar. Der X32-Wizard trennt das Speichern einer Vorlage vom Routing-Import. Mehrere ausgewählte AES50-Inputs lassen sich nach ausdrücklicher Hardware- und Blockwahl gemeinsam zuordnen; Vorschau und Konfliktprüfung gehen der Übernahme voraus. Inaktive Ausgänge sind kompakt, die vollständige Liste ist zuschaltbar. Die letzte Seite nennt die zu ersetzenden und neuen Routingzeilen.
- **PDF:** Schriftgröße und Zeilenabstand verändern die tatsächliche Vorschau und lösen die Seitenaufteilung neu aus. Die Browserprüfung deckt alle drei Einstellungen, eine überlange Tabellenzeile und 64 zusätzliche Kanäle mit großer Schrift ab; Chromium erzeugt dazu eine echte PDF mit derselben Seitenzahl wie die Vorschau.
- **Drumdesigner:** Sidesnare in 6, 8, 10, 12, 13 und 14 Zoll. Der Drehring zeigt den Winkel live, unterstützt genaue Gradeingabe und Pfeiltasten und lässt sich mit Escape abbrechen. Eine Geste bleibt ein Rückgängig-Schritt. Texteingaben behalten ihr natives Rückgängig. Laptop L/R bekommt direkt im Designer Pultkanal, Stagebox und Eingangsbuchse; die Tastaturfolge bleibt beim Bearbeiten erhalten. Die Zuordnungen gehören zum Entwurf, nicht zur wiederverwendbaren Drumvorlage. Abbrechen verwirft sie; Drumset und Patch werden gemeinsam übernommen und rückgängig gemacht. Belegte Kanäle/Buchsen verhindern die Übernahme mit einer sichtbaren Meldung. Vorlagen stehen eingeklappt unter den Instrumenteigenschaften; „Als Vorlage speichern“ und „Änderungen übernehmen“ benennen die beiden Aktionen.
- **Mobile Projekte:** Verwaltung und Speicherhinweise stehen unter „Verwalten“. Eine kompaktere Vorschau bringt den Öffnen-Button des ersten Projekts auf einem 390 × 670 großen Bildschirm direkt in den sichtbaren Bereich.

Reproduzierbare Bedienprüfungen: `scripts/check-workflow-feedback.cjs`, `scripts/check-editor-ux.cjs`, `scripts/check-routing-list-ux.cjs`, `scripts/check-print-assets.cjs`, `scripts/check-x32-scenes.cjs` und `scripts/check-x32-wizard.cjs`. Sie verwenden ausschließlich künstliche Testdaten und isolierte Browserkontexte. Eine Gegenprobe der Szenendateien am echten X32 bleibt unabhängig davon ausstehend. Diese Überarbeitung ist lokal und nicht veröffentlicht.

Prüfstand 14. November 2026: Build-Abgleich und alle 51 Funktionstestgruppen bestanden; Syntaxprüfung für 33 Laufzeitmodule und zehn eingebettete Skripte bestanden. Alle 23 Browserabläufe bestehen jeweils in Chromium und WebKit. Darunter: natives Text-Rückgängig, stabile Laptop-Feldfolge, live drehende Instrumentgeometrie, Escape/Pointer-Abbruch, Tastaturwinkel und ein Undo pro Geste; Inline-Patching samt Stereo, Fehlermeldungen nach Filtern, mobile Scrollwiederherstellung, Read-only-Ansicht und Offline-Neuladen. Die kompakte Liste zeigt im geprüften Sichtbereich elf vollständige Zeilen bei 1440 × 1000 und vier bei 390 × 844; das erste Projekt lässt sich bei 390 × 670 ohne Scrollen öffnen. Screenshots und Chromium-PDFs wurden lokal geprüft. Native Auswahlmenüs werden im Headless-Test über die Select-API bedient; die anschließende Tab-Folge und der Fokuserhalt werden separat geprüft.
