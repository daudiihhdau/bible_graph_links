# Öffentliche Graph-API auf Vercel

Dieses Repository stellt die Question-OS-Wissensdaten als öffentliche, schreibgeschützte HTTP-API bereit. Die API läuft als eigenes Vercel-Projekt und kann von beliebigen Websites oder Anwendungen verwendet werden. Clients greifen auf stabile Datensatz-IDs und vorbereitete Graphabfragen zu; sie benötigen weder eine Kopie der Datenbank noch direkten Datenbankzugriff.

## Architektur

- Die LadybugDB unter `data/ladybug/question-os.lbdb` ist die Datenquelle.
- Vercel Functions unter `api/v1/` öffnen die Datenbank ausschließlich mit `readOnly=true`.
- `src/graph-api.js` enthält die erlaubten Abfragen. HTTP-Parameter werden validiert; Clients können keine Cypher-Abfragen oder Schreiboperationen übergeben.
- `vercel.json` nimmt die Datenbankdatei in das Function-Bundle auf.
- Client-Websites bleiben unabhängig. Sie rufen die API per HTTPS aus dem Browser oder von ihrem eigenen Server aus auf.

## Bereitstellung

1. Dieses Repository als eigenes Projekt in Vercel importieren. Ein Build-Befehl ist nicht erforderlich; Vercel installiert die Abhängigkeiten aus `package-lock.json` und erkennt die Functions unter `api/v1/`.
2. Node.js 20 oder neuer verwenden. Die LadybugDB wird per `includeFiles` eingebunden; die API verwendet keine Edge Runtime.
3. Optional die Produktionsursprünge der Browser-Clients als kommaseparierte Liste in `BIBLEGRAPHLINKS_API_ALLOWED_ORIGINS` setzen, zum Beispiel `https://example.org,https://www.example.org`. Ohne diese Variable sind nur `http://localhost:3000` und `http://127.0.0.1:3000` zugelassen. Server-zu-Server-Aufrufe benötigen keinen CORS-Ursprung.
4. Das Projekt deployen. Die Client-Anwendung konfiguriert anschließend die öffentliche API-Basisadresse bis einschließlich `/api/v1`.

Die API kann ohne `BIBLEGRAPHLINKS_API_ALLOWED_ORIGINS` betrieben werden, wenn kein Browser-Client von einer anderen Domain darauf zugreifen soll. CORS ist keine Zugriffskontrolle für nicht browserbasierte Clients; die Daten und Endpunkte sind öffentlich.

## Endpunkte

Alle Endpunkte verwenden `GET` und liefern JSON. Beispielbasis ist `https://<api-domain>/api/v1`.

| Endpunkt | Zweck |
| --- | --- |
| `/manifest` | Daten-, Schema- und Lizenzversion sowie Umfang |
| `/categories?subjectId=…` | Fächer und Kategorien, optional nach Fach gefiltert |
| `/category?id=…&includeDescendants=true&limit=20&cursor=0` | Datensätze einer Kategorie und optional ihrer Unterkategorien |
| `/search?q=…&type=person&limit=20&cursor=0` | Suche nach Namen, Alternativnamen und JSON-Datensätzen; `type` ist optional |
| `/node?id=…` | Vollständiger Datensatz anhand stabiler ID |
| `/node-relations?id=…&direction=both&limit=40&cursor=0` | Aussagen zu einem Knoten; `direction` ist `both`, `in` oder `out` |
| `/timeline?categoryId=…&fromYear=…&toYear=…&limit=40&cursor=0` | Datierte Einträge einer Kategorie im Zeitraum, einschließlich Zeiträumen, die das Fenster überschneiden |

`limit` ist auf 40 begrenzt. `cursor` ist ein numerischer Offset in einer stabil sortierten Ergebnismenge. Ungültige Parameter liefern 400; unbekannte Datensatz- und Kategorie-IDs liefern 404. Interne Fehlerdetails werden nicht an Clients gesendet. Relationsantworten enthalten Subjekt, Beziehungstyp, optionales Entitätsziel und die vollständigen JSON-Daten der Aussage. Text- und Quellenziele besitzen kein Entitätsziel.

Der Zeitstrahl liefert `{ category, items, nextCursor, limit }`. Jeder Eintrag enthält die Entitäts-ID, den Typ, Namen, optionale Beschreibung und `time` aus Question OS. Ereignisse, die über `happened-on` datiert sind, erhalten die Zeit des verknüpften Zeitpunkts. Mit `includeDescendants=true` werden zusätzlich Unterkategorien abgefragt. Jahreszahlen akzeptieren negative Werte für v. Chr. und positive Werte für n. Chr.; intern gibt es kein Jahr 0.

Beispiel:

```sh
curl 'https://<api-domain>/api/v1/search?q=Beispiel&limit=10'
```

## Client-Konfiguration

Ein Client verwendet die Basisadresse der API als Konfiguration und ergänzt die jeweilige Route. Bei einer statisch gebauten Website muss die öffentliche Basisadresse zur Build-Zeit gesetzt und im Browser verwendet werden können. Die API bleibt eigenständig deploybar und ist nicht an ein bestimmtes Client-Framework gebunden.

Für Browser-Clients müssen alle tatsächlich verwendeten Ursprünge exakt in `BIBLEGRAPHLINKS_API_ALLOWED_ORIGINS` stehen. Dazu können eigene Domains und bei Bedarf Vorschau-Domains gehören. Änderungen der erlaubten Ursprünge werden nach dem Deployment wirksam.

## Betrieb und Datenlizenz

Die API ist öffentlich und verändert keine Daten. Nach einer Änderung des Question-OS-Datenbestands muss das API-Projekt neu deployt werden, damit die Function die aktuelle Datenbankdatei enthält. Der Endpunkt `manifest` zeigt die ausgelieferte Version und Lizenzinformationen an.

Code und API-Implementierung stehen unter MIT. Die Wissensdaten haben eine eigene, im Paketmanifest festgelegte Lizenz. Clients müssen die Lizenz und Herkunft der jeweils verwendeten Daten anhand der `manifest`-Antwort und der Repository-Lizenzhinweise ausweisen.
