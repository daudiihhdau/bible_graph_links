# Pflegevertrag für LadybugDB-Wissensdaten

Diese Datei ist der verbindliche Arbeitsvertrag für Menschen und KI-Agenten, die Wissensdaten in `data/ladybug/question-os.lbdb` prüfen oder ändern. Vor solchen Arbeiten ist sie zu lesen und bei der Fortführung des Projekts beizubehalten. LadybugDB ist die einzige dauerhafte Datenquelle. Änderungen dürfen nur über `knowledge:check` und `knowledge:apply` erfolgen, damit jede Ergänzung gegen Schema, Graphbestand und Quellenregeln geprüft wird.

Trage nur fachlich begründete, wahre Aussagen ein. Leite keine Fakten aus falschen Antwortoptionen, früheren Aufgaben oder Vermutungen ab. Fehlt eine eindeutige Bedeutung oder Datierung, lass den Wert weg oder kennzeichne eine ungefähre Datierung mit `isApproximate: true`.

## Daten und Feldnamen (Schema 7.0)

- Der Graph enthält ein Paketmanifest, ein Curriculum sowie Entitäten, Aussagen und Beziehungstypen gemäß `schemas/content.schema.json`. Ihre vollständigen schema-konformen Datensätze liegen in `KnowledgeRecord.json`; Graphkanten verbinden Subjekt, Beziehungstyp und Entitätsziel.
- Eine Entität benötigt `id`, `entityType` und `name`. `description` beschreibt nur die Entität; `alternativeNames` enthält andere Namen derselben Entität.
- Eine Aussage benötigt `id`, `subjectEntityId`, `relationTypeId` und `target`. `subjectEntityId` ist die ID der beschriebenen Entität, **kein Unterrichtsfach**. Das Ziel verwendet `targetType: "entity"` mit `entityId`, `targetType: "text"` mit `text` oder `targetType: "source"` mit `sourceReference`. `context` präzisiert bei Bedarf die Aussage.
- `sources` ist eine optionale Liste von Belegen. Eine Quelle als Aussageziel steht nur in `target.sourceReference`, nicht erneut in `sources`. Quellen haben `sourceType` und `title`. Bibelstellen brauchen `bibleBookCode` und `locationInSource`; Wikipedia `languageCode` und `link`; `web` einen HTTPS-Link; `deep-link` einen sicheren absoluten Link; `internal` eine genaue Fundstelle. Keine Quelle oder Fundstelle erfinden.
- `schoolSubjects` enthält Unterrichtsfächer. Kategorien verwenden `schoolSubjectId` für das Fach und optional `parentCategoryId` für eine Oberkategorie desselben Fachs. Jede Aussage gehört zu mindestens einer Kategorie. Jede Entität ist direkt oder über eine kategorisierte Aussage erreichbar.
- Keine Fragen, Aufgaben, Antwortoptionen, Musterlösungen, Punkte, Schwierigkeitsgrade, Spiele, Decks, Lernfortschritte, Darreichungsformen oder fertigen Zeitstrahlen speichern.

## Beziehungen und Zeit

- IDs wie `org.example/person/name` sind global eindeutig und stabil. Vorhandene IDs niemals umbenennen. Vorhandene Entitäten wiederverwenden. Eine neue `relationTypeId` zuerst in `relationTypes` definieren, mit `subjectEntityTypes`, `targetType` und gegebenenfalls `targetEntityTypes`.
- `singleTargetPerSubject` nur setzen, wenn ein Subjekt für diese Beziehung dauerhaft höchstens ein Ziel haben kann. Gegensätzliche Beziehungen gegenseitig mit `exclusiveWithRelationTypeIds` eintragen.
- Mögliche, umstrittene oder nur traditionell angenommene Beziehungen niemals als gesichert darstellen oder stillschweigend weglassen. Wenn möglich einen aussagekräftigen Beziehungstyp mit `possibly-` verwenden; andernfalls die Unsicherheit ausdrücklich in `context` markieren. Den Beleg für die Möglichkeit und den Unsicherheitsgrad angeben. Sichere und mögliche Aussagen getrennt halten.
- Vor jedem Dateneintrag zuerst den vorhandenen LadybugDB-Graph durchsuchen. Jede geplante Entität und Aussage einzeln ausarbeiten und anschließend Zeile für Zeile anhand tatsächlich geöffneter, verlässlicher Internetquellen prüfen. Zusätzlich gezielt außerhalb des bereits bekannten Materials nach weiteren unmittelbar relevanten, belegbaren Informationen suchen. Nur Aussagen übernehmen, deren jeweiliger Beleg sie trägt; Suchtreffer-Auszüge allein genügen nicht. Quellenbehauptung, historische Schlussfolgerung und Unsicherheit klar auseinanderhalten. Nicht belegbare Details weglassen.
- Bei jeder Internetrecherche zusätzlich den strukturierten Wikipedia-Wissensgraphen Wikidata nutzen: passende Einträge und Beziehungen über Wikidata beziehungsweise den Wikidata Query Service (SPARQL) suchen und mit dem Paketbestand abgleichen. Wikidata dient auch zur Entdeckung von Aliasnamen, Verknüpfungen und möglichen Lücken; jede übernommene Sachbehauptung muss weiterhin anhand ihrer angegebenen, geöffneten Belege geprüft werden. Widersprüche und fehlende Referenzen offen behandeln, nicht ungeprüft aus dem Graphen übernehmen.
- Verweise auf andere Pakete brauchen deren IDs in `manifest.requiredPackageIds`. Die Paketversion heißt `packageVersion`; sie ist unabhängig von `schemaVersion`.
- Zeiten verwenden `time.start` mit `year` und `era`. `BCE` bedeutet v. Chr., `CE` n. Chr.; Jahr 0 nutzt ausschließlich `ZERO` und entspricht historisch 1 v. Chr. `month` und `day` sind optional, aber `day` erfordert `month`. Ein Bereich erhält `time.end`. `isApproximate: true` kennzeichnet eine ungefähre Angabe, die Anwendungen sichtbar als „ca.“ darstellen können. Unbekannte Genauigkeit nicht erfinden.
- `time` an einer Person bezeichnet ihre Lebensspanne, an einem Zeitpunkt dessen Datum. `time` an einer Aussage begrenzt die Gültigkeit **dieser Aussage**. Ein Ereignis wird entweder direkt mit `time` oder über genau eine `happened-on`-Beziehung zu einem datierten Zeitpunkt datiert. Beide Wege zugleich sind unzulässig.

## Arbeitsfolge

1. Mit `npm run knowledge:inspect -- "Suchwort"` vorhandene Entitäten, Kategorien und erlaubte Beziehungen suchen; die fachliche Grundlage prüfen.
2. Einen kleinen temporären JSON-Entwurf erstellen. Er enthält nur neue Entitäten, Aussagen, Beziehungstypen, Fächer, Kategorien oder Kategoriezuweisungen. Quellen nur eintragen, wenn sie tatsächlich vorliegen.
3. `npm run knowledge:check -- <entwurf.json>` ausführen. Dieser Schritt liest den aktuellen Bestand direkt aus LadybugDB und verändert ihn nicht. Erst nach fehlerfreier Schema- und Graphprüfung mit `npm run knowledge:apply -- <entwurf.json>` übernehmen. Die Übernahme erhöht die Patch-Version des gespeicherten Pakets automatisch und veröffentlicht den neuen Graphen atomar.
4. `npm run check` ausführen und alle Fehler beheben. Fakten und Verweise fachlich stichprobenartig prüfen; verbleibende Unsicherheit offen nennen.

Schemaänderungen brauchen eine neue `schemaVersion`, aktualisierte Beispiele und passende Negativtests. `npm run validate` muss weiterhin die gespeicherten Datensätze und Graphkanten in LadybugDB prüfen. Tests müssen gegen LadybugDB arbeiten, nicht gegen separate Paketdateien.
