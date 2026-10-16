# Question OS: Wissensdatenbank

Question OS hilft dabei, die Bibel zu lernen und historische Zusammenhänge besser zu verstehen. Das Wissen wird als Entitäten, Aussagen, Zeitangaben und fachliche Kategorien geordnet. Aufgaben, Antwortoptionen, Spiele oder fertige Zeitstrahlen werden nicht gespeichert; Anwendungen können solche Lernformen daraus entwickeln.

Question OS is an AI-assisted public learning project for studying the Bible
and understanding its historical context. You can connect its knowledge with
your own data and build new learning tools. The content is a work in progress
and may contain errors.

**Warum dieses Projekt existiert:** Es ist eine offene Wissensbasis für ein
Public Learning Project. Motivation, Grenzen des Wahrheitsanspruchs und
Arbeitsweise stehen in [docs/motivation.md](docs/motivation.md). Historische
Angaben werden dort, wo es Belege gibt, mit biblischen Texten in Beziehung
gesetzt. KI kann die Pflege unterstützen; der verbindliche Ablauf für
KI-Agenten steht in [AGENTS.md](AGENTS.md).

Die enthaltene LadybugDB hält das Bibel- und Geschichtswissen als einzigen
dauerhaften Datenbestand. Eigene Inhalte lassen sich über geprüfte Entwürfe
ergänzen; Anwendungen können die stabilen IDs und Graphbeziehungen direkt
abfragen.

## Lizenz

Der Programmcode und die zugehörige technische Dokumentation stehen unter der
[MIT-Lizenz](LICENSE). **Die Wissensdaten in LadybugDB sind davon
ausgenommen** und behalten die Lizenz aus dem gespeicherten Paketmanifest:
`bible-history` steht unter CC BY 4.0. Exporte daraus übernehmen diese Lizenz
und die Herkunft des Pakets. Beim Wiederverwenden vorhandener Inhalte gilt
deren Lizenz.

## Einfache Schreibregeln

1. **Entität anlegen:** `id`, `entityType`, `name`. Optional sind `description`, `alternativeNames` und `time`.
2. **Aussage anlegen:** `id`, `subjectEntityId`, `relationTypeId`, `target`. Das Ziel hat einen `targetType` (`entity`, `text` oder `source`) und genau den dazugehörigen Wert. `sources` belegt die Aussage optional. Eine Quelle als Ziel wird nicht noch einmal in `sources` eingetragen.
3. **Wissen einordnen:** `schoolSubjects` enthält Unterrichtsfächer. Eine Kategorie nennt ihr Fach mit `schoolSubjectId` und gegebenenfalls ihre Oberkategorie mit `parentCategoryId`. `entityIds` und `assertionIds` wählen Wissen aus.
4. **Prüfen:** `npm run check` validiert den LadybugDB-Datenbestand und seine Graphkanten.

Die verbindlichen Formate stehen in [content.schema.json](schemas/content.schema.json) und [package.schema.json](schemas/package.schema.json), Version **7.0**. Unbekannte Felder werden abgewiesen. Jede Aussage muss einer Kategorie zugeordnet und jede Entität über Kategorien erreichbar sein. [AGENTS.md](AGENTS.md) beschreibt die Pflege durch Sprachmodelle.

### Wissen geführt ergänzen

Zuerst nach vorhandenen Entitäten und Kategorien suchen:

```sh
npm run knowledge:inspect -- "Jesus" person
```

Ein Entwurf ist eine vorübergehende JSON-Datei außerhalb der Datenbank, zum Beispiel `beispiel.draft.json`:

```json
{
  "id": "fragezeichen",
  "entities": [
    { "id": "org.ichlerne.bible/concept/beispielbegriff", "entityType": "concept", "name": "Beispielbegriff" }
  ],
  "categoryAssignments": [
    { "categoryId": "org.ichlerne/category/religion-bibel", "entityIds": ["org.ichlerne.bible/concept/beispielbegriff"] }
  ]
}
```

```sh
npm run knowledge:check -- ./beispiel.draft.json
npm run knowledge:apply -- ./beispiel.draft.json
npm run check
```

`knowledge:check` liest LadybugDB und prüft den Entwurf ohne Änderung.
`knowledge:apply` prüft erneut, baut eine neue Datenbank in einer temporären
Datei und ersetzt den aktiven Stand erst nach erfolgreicher Validierung. Die
Paketversion steigt automatisch. Ein Entwurf darf außerdem `assertions`,
`relationTypes`, `schoolSubjects` und `categories` enthalten. Das Schema prüft
Struktur und Verweise; fachliche Richtigkeit muss anhand der angegebenen
Quellen geprüft werden.

### Beispiel: Person, Ort und Beziehung

```json
{ "id": "org.example/person/anna", "entityType": "person", "name": "Anna" }
{ "id": "org.example/place/berlin", "entityType": "place", "name": "Berlin" }
{ "id": "org.example/assertion/anna-born-berlin", "subjectEntityId": "org.example/person/anna", "relationTypeId": "born-in", "target": { "targetType": "entity", "entityId": "org.example/place/berlin" } }
```

`relationTypeId` benennt die Beziehung. Neue Beziehungen werden als `relationTypes` mit `subjectEntityTypes`, `targetType` und bei Entitätszielen `targetEntityTypes` definiert. `singleTargetPerSubject` und `exclusiveWithRelationTypeIds` sind nur für fachlich eindeutige oder gegensätzliche Beziehungen nötig.

## Zeit

Ein Datum hat eine historische Jahreszahl und eine Ära: `BCE` (v. Chr.) oder `CE` (n. Chr.). Optional kommen `month` und `day` hinzu. Das ausdrücklich erlaubte astronomische Jahr 0 verwendet `{ "year": 0, "era": "ZERO" }` und entspricht historisch 1 v. Chr. Jahr ohne Monat umfasst das ganze Jahr; Monat ohne Tag den ganzen Monat.

```json
{ "start": { "year": 4, "era": "BCE" }, "isApproximate": true }
{ "start": { "year": 2000, "era": "CE", "month": 2, "day": 29 } }
{ "start": { "year": 30, "era": "CE" }, "end": { "year": 33, "era": "CE" }, "isApproximate": true }
```

`time` steht an einer Entität für ihre Datierung: bei Personen für die Lebensspanne, bei Zeitpunkten für deren Datum. `time` an einer Aussage bezeichnet den Zeitraum, in dem **diese Aussage** gilt. `isApproximate: true` kennzeichnet eine ungefähre Angabe zur sichtbaren Darstellung, etwa als „ca.“. Ein Ereignis kann über `happened-on` mit **einer** datierten Zeitpunkt-Entität verbunden sein. Ein Ereignis darf entweder direkt `time` tragen oder über `happened-on` datiert sein; beides zugleich wird abgewiesen. Zeitstrahlen sind Abfragen und keine gespeicherten Entitäten.

## Quellen

Quellen sind optional. Eine strukturierte Quelle verwendet `sourceType`, `title` und je nach Art weitere Felder:

```json
{ "sourceType": "bible", "title": "Matthäus", "bibleBookCode": "MAT", "locationInSource": "2:1" }
{ "sourceType": "wikipedia", "title": "Bethlehem", "languageCode": "de", "link": "https://de.wikipedia.org/wiki/Bethlehem" }
{ "sourceType": "deep-link", "title": "Bibel-App: Matthäus 2,1", "link": "bibleapp://passage/MAT.2.1" }
```

Weitere `sourceType`-Werte sind `web`, `internal` und `bibliographic`. Der Validator prüft Struktur und Linkformat, nicht die sachliche Richtigkeit oder Erreichbarkeit einer Quelle.

## Bibel und Geschichte

`data/ladybug/question-os.lbdb` ist der einzige dauerhafte Wissensbestand. Das
gespeicherte Paket `bible-history` enthält biblische und historische Personen,
Orte, Ereignisse, Zeitpunkte und belegte Beziehungen. Kategorien ordnen die
Aussagen für Abfragen und Lernangebote.

### Jesus-Beziehungen aus Wikidata

Das Bibelpaket enthält zusätzlich 42 belegte Aussagen zu Jesu Familie, zwölf Jüngern, Sprache, jüdischem Umfeld, Tätigkeiten, Orten und Lebensstationen. Die Aussagen verweisen auf [Wikidata: Jesus Christ (Q302)](https://www.wikidata.org/wiki/Q302) oder auf die jeweiligen Ereigniseinträge; passende Bibelstellen stehen zusätzlich an den Aussagen. Sie liegen in der Unterkategorie „Jesus: Beziehungen und Lebensstationen“. Die Kreuzigung ist wegen unterschiedlicher Datierungen als ungefährer Zeitraum von 30 bis 33 n. Chr. erfasst. Umstrittene Deutungen werden im `context` kenntlich gemacht; Wikidata-Metadaten und widersprüchliche Einzelangaben wurden nicht als Lernfakten übernommen.

### Die zwölf Apostel

Die [Wikidata-Gruppe der Zwölf (Q4155679)](https://www.wikidata.org/wiki/Q4155679) ist als gemeinsame Entität mit zwölf individuellen Mitgliedschaften erfasst. Weitere Aussagen verbinden die Personen mit Brüdern, Vätern, Herkunftsorten, Berufen und belegten Ereignissen. Matthias ist als Nachfolger des Judas erfasst und gehört nicht zu den ursprünglichen Zwölf. Die mögliche Gleichsetzung von Nathanael und Bartholomäus bleibt offen; beide haben getrennte IDs. Wikidata dient als Ausgangspunkt; zentrale Beziehungen werden anhand der angegebenen Bibelstellen am Text geprüft. Bei voneinander abweichenden Namen, unsicheren Todesorten oder nur traditionell überlieferten Lebensdaten wird keine genaue Tatsache behauptet.

## Repository und lokale Daten

Die startfertige LadybugDB liegt als `data/ladybug/question-os.lbdb` direkt im
Repository. Schema, SDK, Pflegewerkzeuge, Datenbanktests und Recherchehinweise
liegen in `schemas/`, `src/`, `tools/`, `tests/` und `research/`. Jede Aussage
behält ihre Quellen, ihren Kontext und ihre Unsicherheitsangaben im
Datensatz-JSON innerhalb der Datenbank. Browser-Inspektionen, temporäre
Entwürfe, Exporte und lokale Konfigurationen werden nicht eingecheckt.

Neue Inhalte folgen dem Recherche- und Prüfablauf in [`AGENTS.md`](AGENTS.md):
vorhandene Daten in LadybugDB durchsuchen, Belege prüfen, Entwürfe mit
`knowledge:check` prüfen und erst danach übernehmen. `knowledge:apply` schreibt
keine Änderungen an der aktiven Datei, bevor ein vollständiger Neuaufbau
erfolgreich validiert wurde.
Details stehen in [`docs/ladybugdb.md`](docs/ladybugdb.md).

## LadybugDB direkt verwenden

```js
lbug data/ladybug/question-os.lbdb
```

Beispielabfrage für Jesus' Mutter:

```cypher
MATCH (a:KnowledgeRecord)-[:KnowledgeLink {kind: 'SUBJECT'}]->(s:KnowledgeRecord)
MATCH (a)-[:KnowledgeLink {kind: 'RELATION_TYPE'}]->(p:KnowledgeRecord)
MATCH (a)-[:KnowledgeLink {kind: 'TARGET'}]->(t:KnowledgeRecord)
WHERE s.id = 'org.ichlerne.bible/person/jesus' AND p.id = 'has-mother'
RETURN s.name, p.id, t.name;
```

## Graphabfragen und LadybugDB

`npm run check` validiert die gespeicherten Datensätze und prüft, dass jede
Aussage die erwarteten Subjekt-, Beziehungstyp- und Zielkanten besitzt.
`knowledge:apply` aktualisiert LadybugDB ausschließlich über einen
Schema-geprüften Neuaufbau. Details stehen in [docs/ladybugdb.md](docs/ladybugdb.md).
