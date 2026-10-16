# Arbeitsweise: Wissensnetz und Evangelienmaterial

Dieses Dokument erklärt, wie die Evangelien-Dateien eingeordnet und gepflegt
werden. Die dauerhafte Wissensbasis liegt ausschließlich in der LadybugDB;
begleitende Lern- und Visualisierungsdaten liegen unter
`research/sonstige/evangelien/`.

## Ordner und Zuständigkeiten

| Ort | Inhalt | Verwendung |
| --- | --- | --- |
| `data/ladybug/question-os.lbdb` | geprüfte Entitäten, Aussagen, Beziehungen und Kategorien | Fakten im Wissensnetz abfragen und weiterverwenden |
| `schemas/`, `src/`, `tools/` | Datenregeln, Abfragecode und Prüf-/Importwerkzeuge | Wissensdaten pflegen und validieren |
| `research/sonstige/evangelien/` | die vier unten aufgeführten Quelldokumente und diese Anleitung | Evangeliengliederung, Themenvergleich und Visualisierungen |

`Sonstige` ist der Sammelbereich für Recherchematerial, das noch keinem
eigenen Datenbereich zugeordnet ist. Wenn daraus ein dauerhaft eigenständiger
Bereich mit eigener Anwendung oder eigenem Datenmodell wird, bekommt er einen
passenden Ordner unter `research/`; die Fakten daraus bleiben im Wissensnetz,
sofern sie dessen Regeln erfüllen.

## Dateien in diesem Bereich

## Dateien

- `Evangelien_Reiseberichte_Jesus.json`: ausgewählte Reiseabschnitte,
  Bewegungsangaben, Textstellen und Graph-Export.
- `Evangelien_Themenvergleich.json`: 19 kuratierte Themenblöcke mit
  Evangelien-Textbereichen und Graph-Export.
- `Grundstruktur_der_vier_Evangelien.json`: Gliederungen, Reden, Übergänge,
  Wikipedia-Abgleich und Graph-Export.
- `Grundstruktur_der_vier_Evangelien.docx`: zugehörige Lernübersicht.

Die JSON-Dateien enthalten zudem Graph-Exporte mit Knoten und Kanten. Diese
Exporte sind abgeleitete Ansichten der redaktionell angelegten Daten. Sie sind
keine eigenständige Graphdatenbank und sollten nicht unabhängig von den
jeweiligen Quelldaten bearbeitet werden.

## Was wohin gehört

Ins Wissensnetz gehören einzelne, fachlich begründete Aussagen, zum Beispiel
„Lukas erzählt, dass Jesus nach Nain kam“. Jede Aussage braucht einen
nachprüfbaren Beleg und muss mit vorhandenen Entitäten und Beziehungstypen
zusammenpassen. Aussagen über einen Ort oder ein Ereignis sollen im Evangelium
verankert sein; sie werden nicht allein aus einer thematischen Einteilung
abgeleitet.

In diesem Recherchebereich bleiben redaktionelle Daten, die die Struktur
eines Textes beschreiben: Abschnittsgrenzen, Abschnittstitel, Zusammenfassungen,
thematische Vergleichsgruppen, Reihenfolgen und daraus erzeugte
Visualisierungsgraphen. Solche Daten können für eine Lernansicht sinnvoll
sein, sind aber nicht automatisch Aussagen über historische Ereignisse.

Die Dateien selbst kennzeichnen ihre Zusammenstellungen als nicht fachlich
begutachtet. Sie beschreiben weder eine vollständige Synopse noch eine
gesicherte historische Reiseroute. In der Reise-Datei bedeutet die Reihenfolge
vor allem Textreihenfolge innerhalb eines Evangeliums. Unterschiede zwischen
Evangelien werden deshalb einzeln und mit ihrer jeweiligen Textstelle
behandelt; sie werden nicht zu einer einzigen Route oder Chronologie
verschmolzen.

## Arbeitsablauf für neue Fakten im Wissensnetz

1. **Beleg lesen.** Den relevanten Bibelabschnitt oder eine verlässliche
   Fachquelle direkt prüfen. Wikipedia kann beim Auffinden von Begriffen und
   Literatur helfen, ersetzt aber bei einer konkreten Evangelienaussage nicht
   die Prüfung der angegebenen Bibelstelle.
2. **Bestand abgleichen.** Im Projektstamm ausführen:

   ```sh
   npm run knowledge:inspect -- "Suchwort"
   ```

   Bestehende Entitäten und erlaubte Beziehungen wiederverwenden. IDs nicht
   umbenennen und keine Dublette für einen bereits vorhandenen Ort anlegen.
3. **Kleinen Entwurf erstellen.** Den Entwurf außerhalb der Datenbank
   ablegen. Er enthält nur neue oder ergänzte Wissensobjekte und deren
   Kategoriezuweisungen. Textbereiche, Gliederungen oder fertige Zeitstrahlen
   gehören nicht in diesen Entwurf.
4. **Prüfen und übernehmen.** Für das Paket `bible-history` lauten die
   Befehle:

   ```sh
   npm run knowledge:check -- /pfad/zum/entwurf.json
   npm run knowledge:apply -- /pfad/zum/entwurf.json
   npm run check
   ```

   Nur nach erfolgreichem `knowledge:check` übernehmen. `npm run check`
   validiert anschließend die LadybugDB und führt die Tests aus.
5. **Inhalt stichprobenartig prüfen.** Stimmen Aussage, Zielentität und
   Fundstelle überein? Sind Übersetzungsunterschiede oder Unsicherheiten im
   Kontext kenntlich? Unklare Identifizierungen und nicht belegte Datierungen
   weglassen.

Die vollständigen Schema- und Pflegevorgaben stehen in `AGENTS.md`.

## Arbeitsablauf für Lern- und Visualisierungsdaten

1. Die passende Quelldatei in diesem Ordner bearbeiten und ihre bestehenden
   Feldbedeutungen sowie Textstellen beibehalten.
2. Redaktionelle Ergänzungen als solche kennzeichnen: verwendete Quelle,
   Abgrenzung, Unsicherheit und gegebenenfalls abweichende Gliederungen
   dokumentieren. Leere Felder oder eine fehlende Parallele nicht als Beweis
   deuten, dass ein Thema im Evangelium gar nicht vorkommt.
3. Reihenfolgen und Graphkanten als Navigations- oder Textstruktur behandeln.
   Sie belegen weder eine gemeinsame historische Chronologie noch eine
   tatsächliche Wegstrecke.
4. Graph-Exporte nach Änderungen an den zugrunde liegenden Objekten neu
   erzeugen oder gemeinsam mit ihnen aktualisieren. Keine Kante allein aus
   einer visuellen Nähe als neue Sachbehauptung in die LadybugDB übernehmen.
5. Vor einer Nutzung in einer Anwendung die JSON-Struktur, Referenzen und
   Bibelstellen prüfen. Die Lernmaterialien ersetzen nicht die Prüfung der
   zugrunde liegenden Textstellen.

Die Dateien nennen für die Grundstruktur einen Wikipedia-Abgleich, halten
aber zugleich ausdrücklich fest, dass keine Graphdatenbank verwendet wurde.
Die JSON-Graphen sind daher Exportdaten für eine mögliche Visualisierung,
nicht der Datenspeicher des Wissensnetzes.
