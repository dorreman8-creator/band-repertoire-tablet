# Band Repertoire Tablet

Een afzonderlijke, installatiebare Progressive Web App voor iPad, Android en browsers. Het Windows-project en de Windows-database worden niet gewijzigd.

## Functies

- Repertoire met titel, artiest, toonsoort, BPM, duur, status, opmerkingen en lyrics.
- PDF-, TXT- en afbeeldingsbestanden lokaal bewaren en bekijken.
- Setlijsten, pauzes, speelduur en sleepbare volgorde.
- Live-weergave met huidig document en lyrics naast elkaar en een knop Volgende.
- Offline controle en lokale opslag via IndexedDB.
- JSON-back-up importeren/exporteren.
- Synchronisatie vanuit de Windows-hoofdversie via Dropbox, inclusief offline documentkopieën.
- Agenda: actueel bekijken en afspraken toevoegen, wijzigen of verwijderen via de beveiligde Google-beheerpagina. Internet is nodig.
- Installeerbaar op beginscherm via de PWA-manifest- en serviceworkerbestanden.

## Agenda verbinden

Maak in de Windows-app bij **Agenda → Tablet beheren** een persoonlijke beheerlink. Open op de tablet het tabblad **Agenda**, plak de link en kies **Link bewaren**. Daarna opent **Agenda beheren** de actuele agenda. De link geeft beheerrechten; deel hem alleen met beheerders. Hij staat alleen lokaal op de tablet en gaat niet mee in repertoire-exports of Dropbox-snapshots.

Nieuwe afspraken, wijzigingen, aanwezigheid en verwijderingen worden bij Google opgeslagen. Windows haalt tabletwijzigingen bij de volgende agendasynchronisatie op. Bij gelijktijdig wijzigen moet een verouderd tabletvenster eerst worden vernieuwd.

## Lokaal testen

Voer vanuit deze map uit:

```powershell
..\.runtime\python\python.exe -m http.server 8765
```

Open daarna `http://localhost:8765`.

Voor installatie op een echte tablet moet de map via HTTPS worden gepubliceerd. Dropbox is geschikt voor documentbron/synchronisatie, maar niet als PWA-hosting. Publicatie gebeurt pas na afzonderlijke toestemming.
