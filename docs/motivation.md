# Motivation und Arbeitsweise

## Worum es geht

Dieses Repository ist die Wissensbasis für ein **Public Learning Project** im
Umfeld von [ich-lerne.de](https://www.ich-lerne.de/). Das
[Glossar](https://www.ich-lerne.de/glossar) beschreibt Public Learning als
öffentliches Lernen, bei dem auch der Lernweg sichtbar wird: Fragen,
Zwischenstände und neue Einsichten dürfen Teil des Lernens sein.

Die Datenbank macht Wissen, das beim Lernen entsteht, strukturiert und
wiederverwendbar. Sie ist kein abgeschlossenes Lexikon und kein Anspruch auf
vollständige oder endgültige Antworten. Das enthaltene Wissenspaket konzentriert
sich auf Bibel und Geschichte. Es kann wachsen, wenn neue Inhalte fachlich
sinnvoll belegt und eingeordnet werden.

Das Ziel ist, Menschen beim Lernen der Bibel zu unterstützen und historische
Zusammenhänge verständlicher zu machen. Die Wissensbasis ist keine fertige
Lernoberfläche. Interessierte können eigene Daten mit stabilen IDs und
Beziehungen ergänzen und daraus Abfragen, Anwendungen oder Lernangebote bauen.
Dafür stehen Schema, SDK und LadybugDB-Pflegewerkzeuge bereit.

## Anspruch und Grenzen

Unser Leitgedanke lautet: **Wir wollen sorgfältig und nachvollziehbar lernen.**
Das Projekt ist öffentlich und in Arbeit. Trotz Quellen, Prüfregeln und
Überarbeitung können einzelne Angaben unvollständig, missverständlich oder
falsch sein. Die technische Validierung kann das nicht ausschließen: Sie prüft
vor allem Datenformat, IDs und Verknüpfungen, nicht ob jede Aussage in der
Fachwelt als richtig gilt.

Wo Angaben umstritten, ungefähr oder nur traditionell überliefert sind, sollen
Paketbeiträge diese Unsicherheit kenntlich machen und Belege nennen. Neue
Behauptungen sollen nicht aus falschen Antwortmöglichkeiten, Vermutungen oder
bloßer Wiederholung entstehen. Wo sich etwas nicht zuverlässig belegen lässt,
gehört es nicht als gesicherte Tatsache in die Daten. Fehler zu finden und zu
korrigieren gehört zum öffentlichen Lernprozess.

## Was in die Wissensbasis gehört

Gespeichert werden fachlich sinnvolle Bausteine, aus denen unterschiedliche
Lernangebote entstehen können:

- **Entitäten**: etwa Personen, Orte, Ereignisse, Zeitpunkte und Begriffe.
- **Aussagen und Beziehungen**: zum Beispiel, dass eine Person an einem Ort
  geboren wurde oder ein Ereignis an einem bestimmten Ort stattgefunden hat.
- **Zeitangaben und Unsicherheit**: Datierungen mit der verfügbaren Genauigkeit;
  ungefähre oder umstrittene Angaben werden als solche behandelt.
- **Quellen und Kontext**: Belege für Aussagen und zusätzliche Erläuterungen,
  wenn eine Beziehung ohne Kontext missverständlich wäre.
- **Fächer und Kategorien**: eine fachliche Ordnung, über die Inhalte auffindbar
  und für verschiedene Lernwege auswählbar werden.

Nicht gespeichert werden fertige Fragen, Aufgaben, Antwortoptionen,
Musterlösungen, Punkte, Schwierigkeitsgrade, Spiele, Lernstände oder fertige
Zeitstrahlen. Solche Darreichungsformen können Anwendungen später aus dem
Wissensbestand erzeugen. So bleibt das Wissen unabhängig von einem bestimmten
Spiel oder einer Lernoberfläche nutzbar.

## Wie die Datenbank funktioniert

LadybugDB ist die einzige dauerhafte Wissensablage. Paketmanifest, Curriculum,
Entitäten, Aussagen und Beziehungstypen liegen als schema-konforme Datensätze
im Graphen. Jede Aussage hat ein Subjekt, eine Beziehung und ein Ziel; das Ziel
kann eine andere Entität, Text oder ein Quellenverweis sein. Stabile IDs
verbinden die Datensätze. Die vollständigen Inhalte einschließlich Quellen
und Kontext bleiben als JSON-Eigenschaft im Graph erhalten.

Neue Inhalte werden als kleine, temporäre Entwürfe vorbereitet. Schema und
Validator prüfen sie gegen den aktuellen Bestand aus LadybugDB. Beim Übernehmen
entsteht zunächst eine neue temporäre Datenbank; erst nach erfolgreicher
Prüfung ersetzt sie den bisherigen Stand. Es gibt keine parallelen
Paketdateien als zweite dauerhafte Datenquelle.

## Geschichte und biblische Texte

Ein Schwerpunkt ist, historische Personen, Orte, Ereignisse und Datierungen
mit Informationen aus der Bibel in Beziehung zu setzen. Bibelstellen können
zeigen, wo eine Aussage im Text belegt oder ein Ereignis erzählt wird. Weitere
Quellen können historische Angaben ergänzen oder ihnen widersprechen. Eine
Bibelstelle und eine daraus gezogene historische Schlussfolgerung sind dabei
nicht dasselbe: Die Quelle soll die konkrete Aussage tragen, und unsichere,
traditionelle oder umstrittene Verbindungen müssen als solche erkennbar sein.
Nicht jede historische Aussage muss einen Bibelbezug haben.

## KI-gestützte Pflege

Sprachmodelle (Large Language Models, LLMs) können dabei helfen, vorhandene
Inhalte zu finden, relevante Quellen und mögliche Lücken aufzuspüren sowie
kleine Entwürfe für neue Datensätze zu formulieren. Das Modell ist dabei ein
Arbeitswerkzeug, keine Quelle und keine Wahrheitsprüfung. Es kann sich irren
oder Angaben erfinden. Deshalb müssen neue Aussagen einzeln anhand geöffneter,
verlässlicher Belege geprüft werden; bei Internetrecherche gehört auch der
Abgleich mit Wikidata zum vorgesehenen Arbeitsablauf. Suchtreffer oder eine
Modellantwort allein reichen nicht als Beleg.

Für die Fortführung mit KI bleibt [`AGENTS.md`](../AGENTS.md) der verbindliche
Pflegevertrag. Er legt unter anderem Datenfelder, Recherche mit Quellen und
Wikidata, Unsicherheitskennzeichnung, Entwurf außerhalb der aktiven Datenbank,
Prüfung mit `knowledge:check`, Übernahme mit `knowledge:apply` und den
abschließenden `npm run check` fest. So können spätere KI-Agenten die Datenbank
im gleichen nachvollziehbaren Verfahren weiterpflegen.

## Wie Inhalte ergänzt werden

Neue Inhalte werden in kleinen, überprüfbaren Schritten ergänzt:

1. Mit `npm run knowledge:inspect -- "Suchwort"` vorhandene Entitäten,
   Kategorien und Beziehungen suchen.
2. Einen kleinen temporären Entwurf erstellen und jede geplante
   Aussage mit tatsächlich geprüften, verlässlichen Belegen abgleichen.
3. Den Entwurf mit `npm run knowledge:check -- <entwurf.json>`
   prüfen lassen.
4. Nur einen fehlerfreien Entwurf mit
   `npm run knowledge:apply -- <entwurf.json>` übernehmen.
5. Mit `npm run check` die LadybugDB und ihre Graphkanten prüfen.

Die Pflegevorgaben und Details des Datenformats stehen in [AGENTS.md](../AGENTS.md),
die Projekt- und Befehlsübersicht in [README.md](../README.md).

## Bezug zu ich-lerne.de

Die Motivation orientiert sich am öffentlichen Lernansatz von
[ich-lerne.de](https://www.ich-lerne.de/): Lernen zu Bibel, Geschichte,
Theologie und weiteren Themen wird sichtbar gemacht und darf sich entwickeln. Das
Repository stellt dafür strukturierte, wiederverwendbare Wissensbausteine
bereit. Diese Beschreibung ist die Einordnung dieses Repositories; sie ersetzt
nicht die Selbstdarstellung oder Inhalte der Website.

## Lizenz und Wiederverwendung

Der Programmcode und die technische Dokumentation dieses Repositorys stehen
unter der [MIT-Lizenz](../LICENSE). Das in LadybugDB gespeicherte Paket
`bible-history` verwendet CC BY 4.0. Eigene Inhalte können mit dem Schema
ergänzt werden; für die Übernahme vorhandener Datensätze gilt deren Lizenz.
