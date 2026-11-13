# X32-Szenen

Unter **Routing → Werkzeuge → X32-Szene** lassen sich lokale UTF-8-kodierte `.scn`-Dateien im
Format `#4.0#` als Vorlage laden und wieder exportieren. Es ist keine Verbindung
zum Mischpult nötig. Eine vollständige Szene aus X32-Edit oder vom Pult dient als
Ausgangspunkt; die App erzeugt keine neue Mischung ohne Vorlage.

## Import

Nach der Dateiauswahl zeigt die App eine Vorschau. Erst **Szene übernehmen**
ändert das Projekt. Es gibt zwei Möglichkeiten:

- **Als Vorlage verwenden:** vorhandenes Stageplot-Routing behalten und die Szene
  für den späteren Export hinterlegen.
- **Kanal- und Buslisten übernehmen:** die bisherigen Routinglisten durch die
  benannten Eingangskanäle und Mixbusse ersetzen. Leere Partner eines importierten
  Stereopaars werden ebenfalls übernommen. Vorhandene Bühnenobjekte bleiben
  erhalten, ihre automatisch erzeugten Routingzeilen werden zunächst deaktiviert.

Die Szene enthält keine Bühnenpositionen oder verlässlichen Instrumentmodelle.
Deshalb entstehen beim Import keine geratenen Bühnenobjekte. Mixbusse werden
zunächst als Line-Wege geführt: Ein Bus kann Monitor, IEM, Subgruppe oder Effektweg
sein. AUX-/USB-Eingänge bleiben ausschließlich in der Originalszene.

Die vollständige Vorlage gehört zum Projekt: Sie überlebt lokales Speichern,
Neuladen, Rückgängig/Wiederholen, Projektkopien und die portable JSON-Sicherung.
Der bestehende private Account-Abgleich behandelt sie wie die übrigen privaten
Projektdaten. Öffentliche Freigaben und Offline-Ansichtslinks enthalten weder die
Szenendatei noch ihren Dateinamen. Beim Entfernen der Vorlage bleiben die
Routinglisten erhalten.

## Eingangszuordnung

Unter **Stageboxen am X32 zuordnen** wird jede verwendete Stagebox einem Anschluss
und einem ersten Eingang zugeordnet. Beispiel: Buchse 1 einer zweiten S16
entspricht **AES50 A, Eingang 17**.

Unterstützt werden lokale Eingänge, AES50 A/B und Card-Eingänge in den vorhandenen
8er-Blöcken der Vorlage. Der aktuelle REC-/PLAY-Modus bestimmt die verwendete
Eingangstabelle. Ein Stagebox-Port wird darüber in einen X32-Kanalquellen-Slot
übersetzt. Fehlende Zuordnungen oder nicht verfügbare Eingänge verhindern den
Export mit einer Erklärung. Die App programmiert keine neuen Eingangsblöcke.
User-In und andere unbekannte Quellen werden unverändert erhalten; ihre
physische Zuordnung wird noch nicht aufgelöst.

## Export

**Export vorbereiten** zeigt Änderungen und Hinweise. Erst **Szene herunterladen**
erzeugt die Datei. Übertragen werden:

- Namen der Eingangskanäle und Mixbusse gemäß ihren Kanal-/Busnummern;
- vollständige Stereo-Paare mit ungerader/gerader Nummer, beispielsweise 9/10;
- explizit zugeordnete Eingangssignale.

Nicht im Plan aufgeführte Kanäle bleiben erhalten. Eine Umnummerierung überträgt
Beschriftung und Quelle auf den Zielkanal; sie verschiebt weder dessen
Klangbearbeitung noch löscht sie den ursprünglichen Kanal. Die Vorschau weist
darauf hin. EQ, Dynamik, Effekte, Fader, Mutes, Sends, Vorverstärker/48 V und alle
physischen Ausgangszuordnungen bleiben aus der Vorlage erhalten. Eine
Monitor-Stagebox-Verbindung im Plan programmiert deshalb keinen Ausgang am Pult.

Geänderte Namen werden auf maximal zwölf ASCII-Zeichen abgebildet; Umlaute werden
umschrieben und lange Namen gekürzt. Jede solche Anpassung erscheint vor dem
Download als Hinweis. Unveränderte Originalnamen bleiben exakt erhalten. Dateien
mit mehrdeutigen oder nicht unterstützten Parameterformen werden abgelehnt.

## Prüfstand

Automatische Tests prüfen den unveränderten Datei-Roundtrip einschließlich
Zeilenenden, die Begrenzung auf erlaubte Parameter, Quellenauflösung, Stereo-Paare,
Fehlerfälle sowie Speicherung, Sicherung, Freigaben und Browserbedienung. Sie
verwenden synthetische Szenen ohne Nutzerdaten.

Eine Gegenprobe in X32-Edit und am Pult steht noch aus. Die Formatumsetzung
orientiert sich an exportierten Szenen und an den
[X32-Formatreferenzen von Patrick Maillot](https://github.com/pmaillot/X32-Behringer)
(unabhängige Dokumentation).
