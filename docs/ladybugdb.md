# LadybugDB: direkt starten und weiterpflegen

Question OS verwendet ausschließlich LadybugDB als dauerhafte Wissensablage. Die startfertige Datenbank liegt unter `data/ladybug/question-os.lbdb`; sie enthält das einzige Wissenspaket Bibel und Geschichte. Es gibt keine zweite dauerhafte JSON-Paketablage.

## Direkt öffnen

Voraussetzung für interaktive Arbeit und Pflege ist LadybugDB CLI `lbug` 0.21.2. Node.js 20 oder neuer wird für die Pflegewerkzeuge benötigt. Die enthaltene Datenbank kann sofort geöffnet werden:

```sh
lbug data/ladybug/question-os.lbdb
```

Beispielabfrage für Jesu Mutter:

```cypher
MATCH (a:KnowledgeRecord)-[:KnowledgeLink {kind: 'SUBJECT'}]->(s:KnowledgeRecord)
MATCH (a)-[:KnowledgeLink {kind: 'RELATION_TYPE'}]->(p:KnowledgeRecord)
MATCH (a)-[:KnowledgeLink {kind: 'TARGET'}]->(t:KnowledgeRecord)
WHERE s.id = 'org.ichlerne.bible/person/jesus' AND p.id = 'has-mother'
RETURN s.name, p.id, t.name;
```

## Qualitätsprüfung

Alle Prüfungen lesen dieselbe LadybugDB-Datei. `npm run validate` rekonstruiert das gespeicherte Wissenspaket aus seinen vollständigen `KnowledgeRecord.json`-Datensätzen, prüft JSON-Schema, IDs, Kategorien und Zeitregeln und kontrolliert anschließend die Graphkanten direkt in LadybugDB. `npm test` führt schreibgeschützte Ladybug-Abfragen aus und prüft außerdem, dass ein neuer Entwurf in einer temporären LadybugDB gebaut und abgefragt werden kann. Die Tests und Prüfungen ändern die aktive Datenbank nicht.

```sh
npm run check
```

Technische Prüfungen erkennen Schemafehler, fehlende Verweise und fehlerhafte Kanten. Sie können nicht entscheiden, ob eine historische Aussage durch ihre Quelle tatsächlich belegt ist. Dafür gelten zusätzlich die Recherche-, Beleg- und Wikidata-Vorgaben in [`../AGENTS.md`](../AGENTS.md).

## Neue Daten eintragen

Zuerst den existierenden Bestand prüfen:

```sh
npm run knowledge:inspect -- "Jesus" person
```

Einen kleinen JSON-Entwurf außerhalb der Datenbank und des Repositories anlegen. Er darf nur neue Entitäten, Aussagen, Beziehungstypen, Fächer, Kategorien oder Kategoriezuweisungen enthalten. Danach prüfen und übernehmen:

```sh
npm run knowledge:check -- /tmp/beispiel.draft.json
npm run knowledge:apply -- /tmp/beispiel.draft.json
npm run check
```

`knowledge:check` validiert den Entwurf zusammen mit dem aktuellen Bestand, ohne etwas zu ändern. `knowledge:apply` führt dieselbe Prüfung erneut aus, baut eine neue LadybugDB in einer temporären Datei und ersetzt den aktiven Bestand erst, wenn Import und Graphprüfungen erfolgreich waren. Bei einem Fehler bleibt die bisherige Datenbank unverändert. Die gespeicherten Quellen und Kontexte werden beim Neuaufbau vollständig übernommen. Frühere `.lbdb`-Kopien und große CSV-Exporte werden nicht angelegt.

## Graphmodell

- `KnowledgeRecord` speichert jeden vollständigen Datensatz als JSON. `kind` unterscheidet Manifest, Curriculum, Entität, Aussage und Beziehungstyp; `packageId` dokumentiert die Herkunft.
- `KnowledgeLink` verknüpft Aussagen mit ihrem Subjekt (`SUBJECT`), Beziehungstyp (`RELATION_TYPE`) und, bei Entitätszielen, Ziel (`TARGET`). Text- und Quellenziele verbleiben im JSON der Aussage.
- Eingebaute Beziehungstypen, die im Datenbestand verwendet werden, liegen ebenfalls als Graphknoten vor.

## Export

Ein optionaler CSV-Prüfexport lässt sich erzeugen mit:

```sh
npm run knowledge:ladybug:export -- /tmp/question-os-export
```

Der Export ist ein abgeleitetes, temporäres Prüfartefakt. Für den normalen Start, die Datenpflege und die Tests wird direkt die eingecheckte LadybugDB verwendet.
