# Produktplan

Stand: 17. November 2026 · Ergebnis einer Grill-Session zu Zielgruppe, Pro-Modell und Fahrplan bis zur stabilen Version.

## Zielgruppe

- **Hauptzielgruppe: Bands und Musiker:innen.** Sie bauen Stageplot und Inputliste und schicken beides an Veranstalter und Technik.
- **Pro-Stufe: Techniker:innen (FOH/Monitor).** Routing-Details, Stagebox-Patch und Pultszenen.

## Standard und Pro

| Standard (für Bands) | Pro (für Techniker) |
| --- | --- |
| Unbegrenzte Projekte | Routing-Ansicht **Stagebox**: Buchsen-Patch, Gerätebilder |
| Projekt duplizieren / Gig-Kopie | I/O-Spalte automatisch aus dem Stagebox-Patch |
| Bühnenplan | X32-Szenen, MADI/Dante |
| Routing-Ansicht **Quellen**: Instrument, Abnahme, Mikro/DI, 48 V, Kanal | Monitoring: Busse, Funkfrequenzen |
| Einfaches Monitoring: wer Wedge/IEM, mono/stereo | XLSX/CSV-Export |
| Inputliste inkl. I/O-Spalte als Freitext | Veranstalter-PDF |
| PDF und Bild mit allen Layout-Varianten und Modulen, Ansichtslink | Später: Logo, eigene Farben, gespeicherte eigene PDF-Vorlagen |

- Pro-Teile bleiben in Standard sichtbar, aber gesperrt, mit kurzem Hinweis (z. B. „Pro: Stagebox-Patch für Techniker“).
- Damit dreht sich die bisherige Aufteilung um: Heute sind 1 Projekt, Complete-PDF, XLSX und Projektkopien hinter Pro, das Techniker-Routing ist frei.

## Geschäftsmodell und Accounts

- Ziel: richtiges Produkt. Pro wird **nach der Beta ein Abo**.
- **Accounts für alle**, Projekte später in der Cloud.
- Cloud und Abo kommen **erst nach dem Feature-Stopp**, wenn die App stabil und flüssig läuft. Bis dahin bleibt alles lokal.
- Das lokale Projektformat muss verlustfrei in die Cloud migrierbar bleiben.

## Umfang bis zum Feature-Stopp

In dieser Reihenfolge:

1. **Aufräumen**
   - Inventar vollständig entfernen (Code, Tests, UI).
   - Neue Routing-Arbeitsfläche bleibt (Quellen, Monitoring, Stagebox).
   - Alte Reiter „Outputs & Monitore“ und „Stagebox-Belegung“ entfernen.
   - Gespeicherte Zuordnungen in bestehenden Projekten bleiben erhalten.
2. **Standard/Pro neu aufteilen** wie oben.
3. **Inputliste nach Vorbild Megan-Rider** (`Technical Rider - Megan-fullproduction.pdf`, Seite 5–6):
   1. Spalten Ch · Instrument · Mikro · Info · Stand · I/O
   2. Farbige Gruppen je Instrumentgruppe (im PDF abschaltbar)
   3. Monitor-Wege (AUX/IEM) unter den Inputs oder als eigene Tabelle (Schalter im PDF)
   4. Mikro-Alternativen („SE V Beat / MD 421K / e904“)
   5. Stativ-Spalte (clip, small boom, tall boom, round stand …)
   6. Abweichungen pro Gig: durchgestrichen bzw. hervorgehoben (siehe 4.)
   7. Legende und Fußnoten unter der Tabelle
4. **Gig-Kopie**
   - „Projekt als Gig duplizieren“ legt eine unabhängige Kopie an (keine Vererbung zur Stammversion).
   - Zeilenmenü statt Schaltern an jeder Zeile: `⋯` beim Drüberfahren, Rechtsklick; am Handy langes Drücken (ohne `⋯`).
   - Menüpunkte „Entfällt bei diesem Gig“ und „Hinweis hervorheben“.
5. **PDF-Export**
   - Alles auf einen Blick, nichts eingeklappt: Layout-Varianten, Einstellungen, Live-Vorschau.
   - Varianten sind Startpunkte, danach frei konfigurierbar.
   - Module jeweils an/aus und *ausführlich* oder *kompakt*: Kopf, Bühnenplan, Inputliste, Monitoring, Strom & Backline, Kontakte, Notizen & Anforderungen.
   - Global: Beschriftungen auf der Bühne an/aus, Hoch-/Querformat, Schriftgröße u. a.

Danach: Bugfixes bis zur Ausstiegsbedingung, dann Praxistest. Neue Funktionen nur, wenn ein Test eine echte Lücke zeigt. Einige offene Bugs (z. B. #103, #104) erledigen sich voraussichtlich durch Schritt 1 und 2.

## Ausstiegsbedingung für den Feature-Stopp

Alle Punkte müssen erfüllt sein:

- **0 offene Issues mit Label `bug`.**
- **Praxistest:** 3–5 Musiker:innen, die die App nicht kennen, bauen ihren echten Rider ohne Hilfe nach; das PDF ist für sie mindestens so gut wie ihr bisheriges Dokument.
- **Flüssig:** Start am Handy unter 2 Sekunden; Ziehen und Zoomen ruckelt nicht bei einem Plan in Megan-Größe (~40 Kanäle).
- **Kein Datenverlust:** Alte Projekte öffnen nach dem Update unverändert.

Der Megan-Rider wird als **Referenzplan** in der App nachgebaut und als fester Test in die Browserprüfungen aufgenommen.

## Bewusst zurückgestellt

- Cloud-Sync, Abo-Abwicklung, Zahlungsanbieter.
- Vererbung zwischen Stammversion und Gig-Versionen.
- Weitere Techniker-Funktionen über den bestehenden Stand hinaus.
