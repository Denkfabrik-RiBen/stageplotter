# X32-Szenen

Unter **Routing → Werkzeuge → X32-Szene** lassen sich lokale UTF-8-kodierte
`.scn`-Dateien im Format `#4.0#` lesen und als Vorlage wieder exportieren.
Es ist keine Verbindung zum Mischpult nötig. Eine vollständige Szene aus
X32-Edit oder vom Pult dient als Ausgangspunkt.

## Import-Wizard

Nach der Dateiauswahl führt der Wizard durch vier Schritte:

1. **Inputs auswählen:** benannte Eingangskanäle und Aux-/USB-Kanäle sind
   vorausgewählt. Auch unbenannte Inputs lassen sich übernehmen. Die tatsächliche
   Stereo-Verknüpfung hält zusammengehörige Partner zusammen.
2. **Eingänge zuordnen:** die aus der Szene gelesene Quelle wird angezeigt.
   Vorhandene Stageboxen und deren Buchsen können ausdrücklich zugeordnet werden.
   Fehlende Geräte oder nicht auflösbare Quellen bleiben offen. Das Programm
   erfindet weder ein Stagebox-Modell noch eine Position auf der Bühne.
3. **Busverwendung bestätigen:** alle Mixbusse erscheinen unabhängig von
   physischen Ausgängen. Erkennbare FX-Sends und Subgruppen sind vorbelegt;
   Monitor, In-Ear oder ein anderer Verwendungszweck wird vom Benutzer gewählt.
   Eine solche Beschreibung verändert keine Sends oder Effekte der Szene.
4. **Ausgangsziele festlegen:** die Liste zeigt Anschluss bzw. Transportkanal,
   Signalquelle, Abgriffpunkt und vorhandenes Delay. Die tatsächlich benötigten
   Ausgänge werden ausgewählt und erhalten Zielnamen, beispielsweise PA links
   oder IEM Drums. AES50-Kanal und Stagebox-Ausgangsbuchse werden ausdrücklich
   einander zugeordnet.

Erst **I/O-Routing übernehmen** ersetzt die bisherigen Routinglisten. Die
Bühnenobjekte bleiben erhalten; deren automatisch erzeugte Routingzeilen werden
zunächst deaktiviert. Die gesamte Übernahme ist ein Rückgängig-Schritt.
Abbrechen und Zurückblättern verändern das Projekt nicht. Die Alternative
**Als Vorlage verwenden** behält die bisherigen Routinglisten.

Über **Zuordnung im Wizard bearbeiten** können gespeicherte Zuordnungen erneut
bearbeitet werden. Vorhandene Kanalnamen und geplante Eingangsverbindungen bleiben
beim erneuten Zuordnen erhalten. Ungültige Buchsen, widersprüchliche
Stagebox-Anschlüsse und doppelt belegte Ausgangsbuchsen werden erklärt.

## I/O-Liste

Nach dem Import öffnet sich unter Routing der zusätzliche Bereich **I/O-Liste**.
Er zeigt auch nicht übernommene Einträge der Szene und bietet eine Suche:

- Inputs mit Quelladresse, Stereo-Verknüpfung, Zuordnung und einzelnen Sends;
- Mixbusse, Main und Matrizen mit Quellen, Zielen und Insert-Zuweisungen;
- FX-Slots mit L/R-Eingängen, Returns, deren Sends und Inserts;
- interne Output-Slots sowie physische Ausgänge und Transportkanäle.

**Bus 5, Out 5 und XLR 5 sind verschiedene Identitäten.** Ausgangszeilen im
normalen Routing stehen für die gewählten Anschlüsse und Ziele. Aux-Kanäle behalten
ihre eigene AUX-Nummer. Die allgemeine automatische Portvergabe verändert keine
importierten X32-Zuordnungen.

Pegel, Send-Aktivierung, paarweise Abgriffpunkte und Stereo-Verknüpfungen bleiben
unterscheidbar. Ein Send auf −∞ ist weiterhin eine konfigurierte Verbindung;
daraus wird keine Aussage über den hörbaren Mix abgeleitet. Effektbusse werden
aus ihrer Verbindung zum FX-Prozessor erkannt; Bus 13–16 sind nicht fest dafür
reserviert. FX-Returns können weitere Busse speisen.

CSV/PDF/XLSX verwenden weiterhin die übernommenen Routingzeilen. Das vollständige
Szeneninventar mit allen internen Bussen und FX wird in der I/O-Liste angezeigt.

## Speicherung

Die Vorlage und Wizard-Zuordnungen gehören zum lokalen Projekt: Sie überleben
Neuladen, Rückgängig/Wiederholen, Projektkopien und portable JSON-Sicherungen.
Der private Account-Abgleich behandelt sie wie die übrigen privaten Projektdaten.
Öffentliche Freigaben und Offline-Ansichtslinks enthalten weder die Szenendatei
noch ihren Dateinamen oder die vollständige Szenenübersicht. Die übernommenen
Routingzeilen bleiben Teil der normalen Ansicht. Beim Entfernen der Vorlage
bleiben diese Zeilen erhalten.

## Auflösung und Grenzen

Eingangsquellen werden anhand der aktiven REC-/PLAY-Eingangsblöcke auf Local,
AES50 A/B oder Card zurückgeführt. Aux-Remap und USB-Playback werden berücksichtigt.
Ausgangsblöcke für lokale XLR-Anschlüsse, AES50 und Card werden auf interne
Out-/P16-Slots oder durchgereichte Eingangsanschlüsse zurückgeführt. Aux-, Ultranet-, AES/EBU- und
USB-Recorder-Ausgänge werden ebenfalls angezeigt. Main, Busse, Matrizen, Direct-Outs,
FX-Returns, Monitor und Talkback werden als unterschiedliche Quellen geführt.

User-In/User-Out und nicht unterstützte zusammengesetzte Bankzuordnungen bleiben
**nicht aufgelöst** sichtbar. Ohne expliziten XLR-Patch werden interne Out-Slots
nicht als lokale XLR-Buchsen ausgegeben. Die Szene allein identifiziert weder die
angeschlossene Hardware noch deren Betriebsart oder Bühnenposition.

## Export

**Export vorbereiten** zeigt Änderungen und Hinweise vor dem Download.
Übertragen werden Namen und Stereo-Paare der normalen Eingangskanäle sowie
explizit zugeordnete Eingangssignale. Ältere Projekte mit importierten Buszeilen
können weiterhin deren Namen und Stereo-Paare übertragen.

Die neuen Busverwendungsangaben und Ausgangsziele dokumentieren den Aufbau.
Aux-Namen, Ausgangsrouting, Sends, Fader, Mutes, Effekte, EQ, Dynamik und
Vorverstärker/48 V bleiben aus der Vorlage erhalten. Ein Zielname im Stageplotter
programmiert keinen Ausgang am Pult. Eine Umnummerierung eines normalen
Eingangskanals überträgt Beschriftung und Quelle auf den Zielkanal; sie verschiebt
weder dessen Klangbearbeitung noch löscht sie den ursprünglichen Kanal.

Geänderte X32-Namen werden auf höchstens zwölf ASCII-Zeichen abgebildet; Umlaute
werden umschrieben. Die Vorschau meldet solche Anpassungen. Unveränderte Inhalte,
Zeilenenden und unbekannte Parameter bleiben exakt erhalten.

## Prüfstand

Synthetische Tests prüfen Quellenauflösung, nicht identische Out-/XLR-Zuordnungen,
Stereo, Aux/USB, FX-/Subgruppenwege, Delay, unbekannte Quellen, Wizard-Validierung
und bytegleichen Export. Browserprüfungen decken Abbrechen, Zurückblättern,
Zuordnungen, Rückgängig, Neuladen, Sicherungen, Freigaben und schmale Ansichten ab.
Eine Gegenprobe in X32-Edit und am Pult steht noch aus.

Grundlage sind die X32-Bedienungsanleitung, exportierte Szenen und die unabhängigen
[X32-Formatreferenzen von Patrick Maillot](https://github.com/pmaillot/X32-Behringer).
