/* === Pandakreuzwort — Redaktionelle Wortbank (UMD) ===
   Ausschließlich selbst formulierte Hinweise und Antworten mit der
   Quelle project-editorial. Kein Fetch, keine externen Definitionen.
   gridAnswer wird zur Ladezeit via normalizeGridAnswer berechnet, um
   Transkriptionsfehler auszuschließen (NFC + klassische Umschrift
   Ä→AE, Ö→OE, Ü→UE und ß→SS).

   Bairische Einträge führen verpflichtend region und standardGerman
   (standarddeutsche Entsprechung/Bedeutung). */
(function (root, factory) {
    var logic = (typeof require === 'function')
        ? require('./pandakreuzwort-logic.js')
        : (root && root.PandakreuzwortLogic);
    var normalize = (logic && logic.normalizeGridAnswer)
        ? logic.normalizeGridAnswer
        : function (v) { return String(v || '').toUpperCase(); };

    var DATASET_VERSION = '2026-01';

    // displayAnswer = natürliche Schreibweise; gridAnswer wird berechnet.
    var RAW = [
        // ============================================================
        // DEUTSCH (Standarddeutsch)
        // ============================================================
        { id: 'de-apfel', language: 'de', displayAnswer: 'Apfel', clue: 'Obst mit Kerngehäuse', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-tisch', language: 'de', displayAnswer: 'Tisch', clue: 'Möbel zum Abstellen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-stuhl', language: 'de', displayAnswer: 'Stuhl', clue: 'Sitzmöbel mit Lehne', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-haus', language: 'de', displayAnswer: 'Haus', clue: 'Gebäude zum Wohnen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-baum', language: 'de', displayAnswer: 'Baum', clue: 'Große Pflanze mit Stamm', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-blume', language: 'de', displayAnswer: 'Blume', clue: 'Pflanze mit bunten Blüten', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-sonne', language: 'de', displayAnswer: 'Sonne', clue: 'Gestirn am Tageshimmel', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-mond', language: 'de', displayAnswer: 'Mond', clue: 'Erdtrabant in der Nacht', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-stern', language: 'de', displayAnswer: 'Stern', clue: 'Lichtpunkt am Nachthimmel', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-wolke', language: 'de', displayAnswer: 'Wolke', clue: 'Wasserschleier am Himmel', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-berg', language: 'de', displayAnswer: 'Berg', clue: 'Hohe Erhebung der Landschaft', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-fluss', language: 'de', displayAnswer: 'Fluss', clue: 'Fließendes Gewässer', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-insel', language: 'de', displayAnswer: 'Insel', clue: 'Landstück im Wasser', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-tuer', language: 'de', displayAnswer: 'Tür', clue: 'Durchgang zum Öffnen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-fenster', language: 'de', displayAnswer: 'Fenster', clue: 'Öffnung mit Glas', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-dach', language: 'de', displayAnswer: 'Dach', clue: 'Obere Abdeckung eines Hauses', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-zimmer', language: 'de', displayAnswer: 'Zimmer', clue: 'Bewohnbarer Raum', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-kueche', language: 'de', displayAnswer: 'Küche', clue: 'Raum zum Kochen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-bett', language: 'de', displayAnswer: 'Bett', clue: 'Möbel zum Schlafen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-uhr', language: 'de', displayAnswer: 'Uhr', clue: 'Gerät zur Zeitmessung', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-garten', language: 'de', displayAnswer: 'Garten', clue: 'Stück Land zum Pflanzen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-wald', language: 'de', displayAnswer: 'Wald', clue: 'Viele Bäume zusammen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-wiese', language: 'de', displayAnswer: 'Wiese', clue: 'Grüne Fläche mit Gras', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-rose', language: 'de', displayAnswer: 'Rose', clue: 'Dornenblume mit Blüten', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-pilz', language: 'de', displayAnswer: 'Pilz', clue: 'Hutförmiger Waldbewohner', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-stein', language: 'de', displayAnswer: 'Stein', clue: 'Hartes Gesteinsstück', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-feuer', language: 'de', displayAnswer: 'Feuer', clue: 'Brennende Flamme', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-wasser', language: 'de', displayAnswer: 'Wasser', clue: 'Klare nassmachende Flüssigkeit', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-regen', language: 'de', displayAnswer: 'Regen', clue: 'Niederschlag von oben', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-schnee', language: 'de', displayAnswer: 'Schnee', clue: 'Weißer Winterwetter-Niederschlag', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-wind', language: 'de', displayAnswer: 'Wind', clue: 'Bewegte Luft', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-eis', language: 'de', displayAnswer: 'Eis', clue: 'Gefrorenes Wasser', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-sturm', language: 'de', displayAnswer: 'Sturm', clue: 'Heftiger Wind', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-nebel', language: 'de', displayAnswer: 'Nebel', clue: 'Dichter Dunst über dem Land', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-himmel', language: 'de', displayAnswer: 'Himmel', clue: 'Blaue Wölbung über uns', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-erde', language: 'de', displayAnswer: 'Erde', clue: 'Planet, auf dem wir leben', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-komet', language: 'de', displayAnswer: 'Komet', clue: 'Schweifstern am Himmel', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-welt', language: 'de', displayAnswer: 'Welt', clue: 'Die ganze Erde', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-zeit', language: 'de', displayAnswer: 'Zeit', clue: 'Was die Uhr misst', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-jahr', language: 'de', displayAnswer: 'Jahr', clue: 'Zwölf Monate', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-monat', language: 'de', displayAnswer: 'Monat', clue: 'Etwa vier Wochen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-woche', language: 'de', displayAnswer: 'Woche', clue: 'Sieben Tage', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-nacht', language: 'de', displayAnswer: 'Nacht', clue: 'Zeit nach Sonnenuntergang', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-morgen', language: 'de', displayAnswer: 'Morgen', clue: 'Frühe Tageszeit', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-abend', language: 'de', displayAnswer: 'Abend', clue: 'Späte Tageszeit', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-stunde', language: 'de', displayAnswer: 'Stunde', clue: 'Sechzig Minuten', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-sekunde', language: 'de', displayAnswer: 'Sekunde', clue: 'Kurze Zeiteinheit', difficulty: 3, allowedProfiles: ['schwer'] },
        { id: 'de-fest', language: 'de', displayAnswer: 'Fest', clue: 'Fröhliche Feier', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-urlaub', language: 'de', displayAnswer: 'Urlaub', clue: 'Zeit der Erholung', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-reise', language: 'de', displayAnswer: 'Reise', clue: 'Fahrt in die Ferne', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-zug', language: 'de', displayAnswer: 'Zug', clue: 'Schienenfahrzeug', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-auto', language: 'de', displayAnswer: 'Auto', clue: 'Fahrzeug mit Motor', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-bus', language: 'de', displayAnswer: 'Bus', clue: 'Großes Fahrzeug für Viele', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-boot', language: 'de', displayAnswer: 'Boot', clue: 'Kleines Wasserfahrzeug', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-schiff', language: 'de', displayAnswer: 'Schiff', clue: 'Großes Wasserfahrzeug', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-rad', language: 'de', displayAnswer: 'Rad', clue: 'Rundes Rollteil', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-motor', language: 'de', displayAnswer: 'Motor', clue: 'Antrieb einer Maschine', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-lampe', language: 'de', displayAnswer: 'Lampe', clue: 'Lichtquelle im Raum', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-licht', language: 'de', displayAnswer: 'Licht', clue: 'Macht es hell', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-glas', language: 'de', displayAnswer: 'Glas', clue: 'Durchsichtiges Trinkgefäß', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-holz', language: 'de', displayAnswer: 'Holz', clue: 'Material von Bäumen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-papier', language: 'de', displayAnswer: 'Papier', clue: 'Dünner Beschreibstoff', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-gold', language: 'de', displayAnswer: 'Gold', clue: 'Glänzendes Edelmetall', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-silber', language: 'de', displayAnswer: 'Silber', clue: 'Graues Edelmetall', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-messer', language: 'de', displayAnswer: 'Messer', clue: 'Schneidewerkzeug', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-gabel', language: 'de', displayAnswer: 'Gabel', clue: 'Essbesteck mit Zinken', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-loeffel', language: 'de', displayAnswer: 'Löffel', clue: 'Essbesteck zum Rühren', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-teller', language: 'de', displayAnswer: 'Teller', clue: 'Flaches Geschirr', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-tasse', language: 'de', displayAnswer: 'Tasse', clue: 'Henkelgefäß für Heißes', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-topf', language: 'de', displayAnswer: 'Topf', clue: 'Gefäß zum Kochen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-pfanne', language: 'de', displayAnswer: 'Pfanne', clue: 'Flaches Bratgeschirr', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-ofen', language: 'de', displayAnswer: 'Ofen', clue: 'Gerät zum Heizen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-hund', language: 'de', displayAnswer: 'Hund', clue: 'Treuer Vierbeiner', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-katze', language: 'de', displayAnswer: 'Katze', clue: 'Schnurrendes Haustier', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-maus', language: 'de', displayAnswer: 'Maus', clue: 'Kleines Nagetier', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-pferd', language: 'de', displayAnswer: 'Pferd', clue: 'Großes Reittier', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-kuh', language: 'de', displayAnswer: 'Kuh', clue: 'Milchgebendes Rind', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-gans', language: 'de', displayAnswer: 'Gans', clue: 'Vogel, der schnattert', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-fisch', language: 'de', displayAnswer: 'Fisch', clue: 'Wassertier mit Flossen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-vogel', language: 'de', displayAnswer: 'Vogel', clue: 'Tier mit Federn', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-biene', language: 'de', displayAnswer: 'Biene', clue: 'Honigsammelndes Insekt', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-ampel', language: 'de', displayAnswer: 'Ampel', clue: 'Verkehrslichtsignal', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-anker', language: 'de', displayAnswer: 'Anker', clue: 'Hält das Schiff fest', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-brief', language: 'de', displayAnswer: 'Brief', clue: 'Geschriebene Nachricht', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-buch', language: 'de', displayAnswer: 'Buch', clue: 'Gebundene Seiten zum Lesen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-seife', language: 'de', displayAnswer: 'Seife', clue: 'Zum Waschen der Hände', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-seil', language: 'de', displayAnswer: 'Seil', clue: 'Zum Binden und Klettern', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-nagel', language: 'de', displayAnswer: 'Nagel', clue: 'Kleines Befestigungsmittel aus Metall', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-hammer', language: 'de', displayAnswer: 'Hammer', clue: 'Werkzeug zum Schlagen', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-zelt', language: 'de', displayAnswer: 'Zelt', clue: 'Behelfsunterkunft aus Stoff', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-mass', language: 'de', displayAnswer: 'Maß', clue: 'Bayerische Biermenge von einem Liter', difficulty: 3, allowedProfiles: ['schwer'] },
        { id: 'de-groesse', language: 'de', displayAnswer: 'Größe', clue: 'Ausdehnung eines Dings', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-strasse', language: 'de', displayAnswer: 'Straße', clue: 'Fahrbahn für Autos', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-fuss', language: 'de', displayAnswer: 'Fuß', clue: 'Körperteil zum Gehen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-nase', language: 'de', displayAnswer: 'Nase', clue: 'Gesichtsteil zum Riechen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-auge', language: 'de', displayAnswer: 'Auge', clue: 'Organ zum Sehen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-ohr', language: 'de', displayAnswer: 'Ohr', clue: 'Organ zum Hören', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-hand', language: 'de', displayAnswer: 'Hand', clue: 'Greifwerkzeug am Arm', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-arm', language: 'de', displayAnswer: 'Arm', clue: 'Glied zwischen Schulter und Hand', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-kopf', language: 'de', displayAnswer: 'Kopf', clue: 'Oberstes Körperteil', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-herz', language: 'de', displayAnswer: 'Herz', clue: 'Pumpendes Organ in der Brust', difficulty: 2, allowedProfiles: ['mittel', 'schwer'] },
        { id: 'de-blut', language: 'de', displayAnswer: 'Blut', clue: 'Rote Körperflüssigkeit', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-kuchen', language: 'de', displayAnswer: 'Kuchen', clue: 'Süßes Gebäck zum Kaffee', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-milch', language: 'de', displayAnswer: 'Milch', clue: 'Weiße Flüssigkeit der Kuh', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-brot', language: 'de', displayAnswer: 'Brot', clue: 'Gebackenes Grundnahrungsmittel', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },
        { id: 'de-ei', language: 'de', displayAnswer: 'Ei', clue: 'Oval vom Huhn', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'] },

        // ============================================================
        // BAIRISCH — region und standardGerman verpflichtend.
        // ============================================================
        { id: 'bar-dahoam', language: 'bar', displayAnswer: 'Dahoam', clue: 'Bairisch für „zuhause"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'zuhause' },
        { id: 'bar-hendl', language: 'bar', displayAnswer: 'Hendl', clue: 'Bairisches grillfertiges Hähnchen', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Brathähnchen' },
        { id: 'bar-brezn', language: 'bar', displayAnswer: 'Brezn', clue: 'Bairisch gebackene Teigbrezel', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Brezel' },
        { id: 'bar-radl', language: 'bar', displayAnswer: 'Radl', clue: 'Bairisch für Fahrrad', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Fahrrad' },
        { id: 'bar-bussi', language: 'bar', displayAnswer: 'Bussi', clue: 'Bairisches Küsschen auf die Wange', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Küsschen' },
        { id: 'bar-bam', language: 'bar', displayAnswer: 'Bam', clue: 'Bairisch für Baum', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Baum' },
        { id: 'bar-dirndl', language: 'bar', displayAnswer: 'Dirndl', clue: 'Bairisches Trachtenkleid mit Schürze', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Trachtenkleid' },
        { id: 'bar-watschn', language: 'bar', displayAnswer: 'Watschn', clue: 'Bairische Ohrfeige, die „Watsche"', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Ohrfeige' },
        { id: 'bar-obazda', language: 'bar', displayAnswer: 'Obazda', clue: 'Bairischer Streich aus Camembert und Gewürzen', difficulty: 3, allowedProfiles: ['schwer'], region: 'mittelbairisch', standardGerman: 'Käsebrotaufstrich' },
        { id: 'bar-griassdi', language: 'bar', displayAnswer: 'Griaßdi', clue: 'Bairische Begrüßung: „Grüß dich"', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Grüß dich' },
        { id: 'bar-zamm', language: 'bar', displayAnswer: 'Zamm', clue: 'Bairisch für „zusammen"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'zusammen' },
        { id: 'bar-madl', language: 'bar', displayAnswer: 'Madl', clue: 'Bairisch für Mädchen', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Mädchen' },
        { id: 'bar-bub', language: 'bar', displayAnswer: 'Bub', clue: 'Bairisch für Junge', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Junge' },
        { id: 'bar-schee', language: 'bar', displayAnswer: 'Schee', clue: 'Bairisch für „schön"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'schön' },
        { id: 'bar-ned', language: 'bar', displayAnswer: 'Ned', clue: 'Bairisch für „nicht"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'nicht' },
        { id: 'bar-boarisch', language: 'bar', displayAnswer: 'Boarisch', clue: 'Bairisch für „bairisch"', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'bairisch' },
        { id: 'bar-gams', language: 'bar', displayAnswer: 'Gams', clue: 'Bairisch für das wendige Bergtier, die Gemse', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'alpin-bairisch', standardGerman: 'Gemse' },
        { id: 'bar-goass', language: 'bar', displayAnswer: 'Goass', clue: 'Bairisch für Ziege', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Ziege' },
        { id: 'bar-kas', language: 'bar', displayAnswer: 'Kas', clue: 'Bairisch für Käse', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Käse' },
        { id: 'bar-feia', language: 'bar', displayAnswer: 'Feia', clue: 'Bairisch für Feuer', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Feuer' },
        { id: 'bar-wiesn', language: 'bar', displayAnswer: 'Wiesn', clue: 'Bairisch für Wiese; auch Münchner Festwiese', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Wiese' },
        { id: 'bar-haxn', language: 'bar', displayAnswer: 'Haxn', clue: 'Bairisch für die gegarte Schweinshaxe', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Schweinshaxe' },
        { id: 'bar-mass', language: 'bar', displayAnswer: 'Maß', clue: 'Bairische Maßeinheit für einen Liter Bier', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Maßkrug (ein Liter)' },
        { id: 'bar-kraxn', language: 'bar', displayAnswer: 'Kraxn', clue: 'Bairischer Rückenkorb zum Tragen', difficulty: 3, allowedProfiles: ['schwer'], region: 'alpin-bairisch', standardGerman: 'Rückenkorb' },
        { id: 'bar-schaugn', language: 'bar', displayAnswer: 'Schaugn', clue: 'Bairisch für „schauen"', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'schauen' },
        { id: 'bar-damisch', language: 'bar', displayAnswer: 'Damisch', clue: 'Bairisch für „verrückt, wild"', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'verrückt' },
        { id: 'bar-brotzeit', language: 'bar', displayAnswer: 'Brotzeit', clue: 'Bairische kalte Mahlzeit mit Brot und Aufstrich', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Brotmahlzeit' },
        { id: 'bar-guglhupf', language: 'bar', displayAnswer: 'Guglhupf', clue: 'Bairischer Rührkuchen in Kranzform', difficulty: 3, allowedProfiles: ['schwer'], region: 'mittelbairisch', standardGerman: 'Gugelhupf' },
        { id: 'bar-fasching', language: 'bar', displayAnswer: 'Fasching', clue: 'Bairische Bezeichnung für Karneval', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Karneval' },
        { id: 'bar-pfanna', language: 'bar', displayAnswer: 'Pfanna', clue: 'Bairisch für Pfanne', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Pfanne' },
        { id: 'bar-suppa', language: 'bar', displayAnswer: 'Suppa', clue: 'Bairisch für Suppe', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Suppe' },
        { id: 'bar-kartoffl', language: 'bar', displayAnswer: 'Kartoffl', clue: 'Bairisch für Kartoffel', difficulty: 3, allowedProfiles: ['schwer'], region: 'mittelbairisch', standardGerman: 'Kartoffel' },
        { id: 'bar-oans', language: 'bar', displayAnswer: 'Oans', clue: 'Bairisch für die Zahl eins', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'eins' },
        { id: 'bar-zwoa', language: 'bar', displayAnswer: 'Zwoa', clue: 'Bairisch für die Zahl zwei', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'zwei' },
        { id: 'bar-drai', language: 'bar', displayAnswer: 'Drai', clue: 'Bairisch für die Zahl drei', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'drei' },
        { id: 'bar-fia', language: 'bar', displayAnswer: 'Fia', clue: 'Bairisch für die Zahl vier', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'vier' },
        { id: 'bar-fimfa', language: 'bar', displayAnswer: 'Fimfa', clue: 'Bairisch für die Zahl fünf', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'fünf' },
        { id: 'bar-wea', language: 'bar', displayAnswer: 'Wea', clue: 'Bairisch für das Fragewort „wer"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'wer' },
        { id: 'bar-wos', language: 'bar', displayAnswer: 'Wos', clue: 'Bairisch für das Fragewort „was"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'was' },
        { id: 'bar-wia', language: 'bar', displayAnswer: 'Wia', clue: 'Bairisch für das Fragewort „wie"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'wie' },
        { id: 'bar-do', language: 'bar', displayAnswer: 'Do', clue: 'Bairisch für „da, hier"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'da, hier' },
        { id: 'bar-liab', language: 'bar', displayAnswer: 'Liab', clue: 'Bairisch für „lieb, nett"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'lieb' },
        { id: 'bar-guad', language: 'bar', displayAnswer: 'Guad', clue: 'Bairisch für „gut"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'gut' },
        { id: 'bar-weng', language: 'bar', displayAnswer: 'Weng', clue: 'Bairisch für „ein wenig"', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'ein wenig' },
        { id: 'bar-lumpa', language: 'bar', displayAnswer: 'Lumpa', clue: 'Bairisch für Lump oder alten Lappen', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Lump, Lappen' },
        { id: 'bar-schneidig', language: 'bar', displayAnswer: 'Schneidig', clue: 'Bairisch für „flott, tüchtig"', difficulty: 3, allowedProfiles: ['schwer'], region: 'mittelbairisch', standardGerman: 'flott, tüchtig' },
        { id: 'bar-nopf', language: 'bar', displayAnswer: 'Nopf', clue: 'Nordbairisch für Knopf', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'nordbairisch', standardGerman: 'Knopf' },
        { id: 'bar-tropfa', language: 'bar', displayAnswer: 'Tropfa', clue: 'Bairisch für Tropfen', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Tropfen' },
        { id: 'bar-fensta', language: 'bar', displayAnswer: 'Fensta', clue: 'Bairisch für Fenster', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Fenster' },
        { id: 'bar-soch', language: 'bar', displayAnswer: 'Soch', clue: 'Bairisch für „Sache, Ding"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Sache' },
        { id: 'bar-kircha', language: 'bar', displayAnswer: 'Kircha', clue: 'Bairisch für Kirche', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Kirche' },
        { id: 'bar-schuasta', language: 'bar', displayAnswer: 'Schuasta', clue: 'Bairisch für den Schuhmacher', difficulty: 3, allowedProfiles: ['schwer'], region: 'mittelbairisch', standardGerman: 'Schuster' },
        { id: 'bar-pfeffa', language: 'bar', displayAnswer: 'Pfeffa', clue: 'Bairisch für Pfeffer', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Pfeffer' },
        { id: 'bar-soiz', language: 'bar', displayAnswer: 'Soiz', clue: 'Alpin-bairisch für Salz', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'alpin-bairisch', standardGerman: 'Salz' },
        { id: 'bar-zucka', language: 'bar', displayAnswer: 'Zucka', clue: 'Bairisch für Zucker', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Zucker' },
        { id: 'bar-moehl', language: 'bar', displayAnswer: 'Möhl', clue: 'Bairisch für Mehl', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Mehl' },
        { id: 'bar-weckla', language: 'bar', displayAnswer: 'Weckla', clue: 'Fränkisch-bairisch für Brötchen', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'fränkisch', standardGerman: 'Brötchen' },
        { id: 'bar-heferl', language: 'bar', displayAnswer: 'Heferl', clue: 'Bairisch-österreichisch für eine Tasse', difficulty: 3, allowedProfiles: ['schwer'], region: 'österreichisch-bairisch', standardGerman: 'Tasse' },
        { id: 'bar-schmarrn', language: 'bar', displayAnswer: 'Schmarrn', clue: 'Bairischer Pfannenkuchen; auch Unsinn', difficulty: 3, allowedProfiles: ['schwer'], region: 'mittelbairisch', standardGerman: 'Pfannengericht; Unsinn' },
        { id: 'bar-ross', language: 'bar', displayAnswer: 'Ross', clue: 'Bairisch für Pferd', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Pferd' },
        { id: 'bar-kua', language: 'bar', displayAnswer: 'Kua', clue: 'Bairisch für Kuh', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Kuh' },
        { id: 'bar-wassa', language: 'bar', displayAnswer: 'Wassa', clue: 'Bairisch für Wasser', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Wasser' },
        { id: 'bar-woid', language: 'bar', displayAnswer: 'Woid', clue: 'Bairisch für Wald', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Wald' },
        { id: 'bar-brod', language: 'bar', displayAnswer: 'Brod', clue: 'Bairisch für Brot', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Brot' },
        { id: 'bar-gell', language: 'bar', displayAnswer: 'Gell', clue: 'Bairische Bestätigung: „nicht wahr?"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'nicht wahr?' },
        { id: 'bar-jo', language: 'bar', displayAnswer: 'Jo', clue: 'Bairisch für „ja"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'ja' },
        { id: 'bar-na', language: 'bar', displayAnswer: 'Na', clue: 'Bairisch für „nein"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'nein' },
        { id: 'bar-lederhosn', language: 'bar', displayAnswer: 'Lederhosn', clue: 'Bairische knielange Lederhose', difficulty: 3, allowedProfiles: ['schwer'], region: 'alpin-bairisch', standardGerman: 'Lederhose' },
        { id: 'bar-servus', language: 'bar', displayAnswer: 'Servus', clue: 'Bairisch-österreichische Begrüßung und Verabschiedung', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'österreichisch-bairisch', standardGerman: 'Hallo; Tschüss' },
        { id: 'bar-grussgott', language: 'bar', displayAnswer: 'Grüßgott', clue: 'Oberbairische Begrüßung', difficulty: 3, allowedProfiles: ['schwer'], region: 'oberbairisch', standardGerman: 'Grüß Gott' },
        { id: 'bar-fackl', language: 'bar', displayAnswer: 'Fackl', clue: 'Bairisch für Fackel', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Fackel' },
        { id: 'bar-spitzbub', language: 'bar', displayAnswer: 'Spitzbub', clue: 'Bairisch für einen vorlauten, frechen Buben', difficulty: 3, allowedProfiles: ['schwer'], region: 'mittelbairisch', standardGerman: 'vorlauter Junge' },
        { id: 'bar-ferdl', language: 'bar', displayAnswer: 'Ferdl', clue: 'Bairische Verniedlichung des Pferdes', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Pferdchen' },
        { id: 'bar-knoedl', language: 'bar', displayAnswer: 'Knödl', clue: 'Bairisch für einen Kloß aus Teig', difficulty: 3, allowedProfiles: ['schwer'], region: 'mittelbairisch', standardGerman: 'Kloß' },
        { id: 'bar-seml', language: 'bar', displayAnswer: 'Seml', clue: 'Bairisch für Semmel/Brötchen', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Semmel' },
        { id: 'bar-mocht', language: 'bar', displayAnswer: 'Mocht', clue: 'Bairisch für „macht"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'macht' },
        { id: 'bar-gaht', language: 'bar', displayAnswer: 'Gaht', clue: 'Bairisch für „geht"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'geht' },
        { id: 'bar-doo', language: 'bar', displayAnswer: 'Doo', clue: 'Bairisch für „hin, dorthin"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'hin, dorthin' },
        { id: 'bar-oida', language: 'bar', displayAnswer: 'Oida', clue: 'Bairisch für „Alter"; auch eine Anrede', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Alter' },
        { id: 'bar-hoam', language: 'bar', displayAnswer: 'Hoam', clue: 'Bairisch für Heim, die Heimat', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Heim' },
        { id: 'bar-wuid', language: 'bar', displayAnswer: 'Wuid', clue: 'Bairisch für „wild"', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'wild' },
        { id: 'bar-fraud', language: 'bar', displayAnswer: 'Fraud', clue: 'Bairisch für „Freude"', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Freude' },
        { id: 'bar-maenna', language: 'bar', displayAnswer: 'Männa', clue: 'Bairisch für Männer', difficulty: 2, allowedProfiles: ['mittel', 'schwer'], region: 'mittelbairisch', standardGerman: 'Männer' }
    ];

    var entries = RAW.map(function (raw) {
        var entry = {
            id: raw.id,
            language: raw.language,
            displayAnswer: raw.displayAnswer,
            gridAnswer: normalize(raw.displayAnswer),
            clue: raw.clue,
            difficulty: raw.difficulty,
            allowedProfiles: raw.allowedProfiles.slice(),
            reviewed: true,
            source: { kind: 'project-editorial' }
        };
        if (raw.language === 'bar') {
            entry.region = raw.region;
            entry.standardGerman = raw.standardGerman;
        }
        return Object.freeze(entry);
    });

    var dataset = Object.freeze({
        schemaVersion: 1,
        datasetVersion: DATASET_VERSION,
        entries: entries
    });

    if (typeof module === 'object' && module.exports) {
        module.exports = dataset;
    } else {
        root.PandakreuzwortData = dataset;
    }
    return dataset;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () { return null; });
