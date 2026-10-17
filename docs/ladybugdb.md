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

Die schnelle Prüfung nach einem Import kontrolliert nur die neuen Datensätze und deren Graphkanten:

```sh
npm run test:new -- /tmp/beispiel.draft.json
```

`npm test` prüft die Verifikationslogik an einer kleinen temporären LadybugDB.
Der Gesamtaudit (`npm run test:full` oder `npm run check`) validiert den ganzen
Bestand und ist für größere Batches, Schemaänderungen und Releases vorgesehen.
Er läuft nicht bei jedem neuen Datensatz und ändert die aktive Datenbank nicht.

Technische Prüfungen erkennen Schemafehler, fehlende Verweise und fehlerhafte Kanten. Sie können nicht entscheiden, ob eine historische Aussage durch ihre Quelle tatsächlich belegt ist. Dafür gelten zusätzlich die Recherche-, Beleg- und Wikidata-Vorgaben in [`../AGENTS.md`](../AGENTS.md).

## Neue Daten eintragen

Zuerst den existierenden Bestand prüfen:

```sh
npm run knowledge:inspect -- "Jesus" person
```

Für den schnellen Abgleich deutscher und englischer Namen kann eine einzelne Eingabe oder eine Textdatei mit einem Namen pro Zeile durchsucht werden. Das Skript vergleicht Haupt- und Alternativnamen, ignoriert Großschreibung und Akzentzeichen und markiert exakte, teilweise oder schreibähnliche Treffer. Es behauptet keine Übersetzung: Fehlt ein Sprachalias im Graphen, meldet es das, damit der Alias recherchiert und anschließend gezielt ergänzt werden kann. Die Suche ändert die Datenbank nicht.

```bash
npm run knowledge:names -- "John the Baptist"
npm run knowledge:names -- ./namen.txt
```

Einen kleinen JSON-Entwurf außerhalb der Datenbank und des Repositories anlegen. Er darf neue Entitäten, Aussagen, Beziehungstypen, Fächer, Kategorien und Kategoriezuweisungen enthalten. `entityUpdates` ergänzt bei bestehenden IDs nur Alternativnamen. `entityMerges` führt eindeutig doppelte Entitäten zusammen und überträgt ihre Graph- und Kategorieverweise. Danach prüfen und übernehmen:

```sh
npm run knowledge:check -- /tmp/beispiel.draft.json
npm run knowledge:apply -- /tmp/beispiel.draft.json
npm run test:new -- /tmp/beispiel.draft.json
```

`knowledge:check` liest nur die neuen Datensätze und die für ihre Schema- und Graphprüfung benötigten Bestandsverweise, ohne etwas zu ändern. `knowledge:apply` prüft danach den vollständigen resultierenden Paketgraphen einmal, baut die LadybugDB in einer temporären Datei und ersetzt den aktiven Bestand atomar erst nach erfolgreichem Import. Bei einem Fehler bleibt die bisherige Datenbank unverändert. Die gespeicherten Quellen und Kontexte werden beim Neuaufbau vollständig übernommen. Frühere `.lbdb`-Kopien und große CSV-Exporte werden nicht angelegt.

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
