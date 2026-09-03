/* === Texttl — DOM-freie Spiellogik (UMD) ===
   Reine Funktionen für Wortlisten, Bewertung (Zweifachdurchlauf für
   doppelte Buchstaben), deterministisches Tageswort, Zufallsmodus,
   Statistik/Streak und spoilerfreiem Teilen.

   WICHTIG: Ä, Ö, Ü und ß werden jeweils als EIN Graphem behandelt
   (über Array.from). 'ß'.toUpperCase() ergibt 'SS' (zwei Zeichen!) und
   darf deshalb NIEMALS auf ganze Wörter angewendet werden. Stattdessen
   wird graphemweise über toUpperDe großgeschrieben, wobei ÷ erhalten
   bleibt. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TexttlLogic = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    'use strict';

    var WORD_LENGTH = 5;
    var MAX_ATTEMPTS = 6;

    // Referenzdatum für die fortlaufende Rätselnummer (2024-01-01 UTC).
    var REFERENCE_EPOCH_DAYS = 19723; // dateToEpochDays(new Date(Date.UTC(2024,0,1)))

    // --- Graphem-Handling ---
    // Großschreibung, die ß als einzelnes Zeichen erhält.
    function toUpperDe(ch) {
        if (ch === 'ß' || ch === 'ẞ') return 'ß';
        return ch.toUpperCase();
    }

    // Wandelt eine Zeichenkette in ein Array einzelner Grapheme um und
    // schreibt jedes groß (ß bleibt ß). Niemals String.toUpperCase() nutzen.
    function graphemes(word) {
        var chars = Array.from(String(word == null ? '' : word));
        var out = [];
        for (var i = 0; i < chars.length; i++) {
            out.push(toUpperDe(chars[i]));
        }
        return out;
    }

    // Kanonische Form eines Wortes als Zeichenkette (für Sets/Vergleiche).
    function normalize(word) {
        return graphemes(word).join('');
    }

    // Ein erlaubter einzelner Buchstabe (Graphem) im Spiel.
    function isValidLetter(ch) {
        if (ch == null) return false;
        var arr = graphemes(ch);
        if (arr.length !== 1) return false;
        return /^[A-ZÄÖÜßẞ]$/.test(arr[0]);
    }

    // ============================================================
    // Wortlisten — alle Wörter haben exakt 5 Grapheme (ÄÖÜß = je 1).
    // SOLUTION_WORDS: geläufige deutsche Wörter (potenzielle Lösungen).
    // EXTRA_GUESS_WORDS: weitere gültige Ratewörter (selten Lösung).
    // ============================================================
    var SOLUTION_WORDS = [
        // A
        'ABEND', 'ADLER', 'AHORN', 'AKTEN', 'ALBUM', 'ALGEN', 'ALLEE', 'ALTER',
        'AMPEL', 'ANGEL', 'ANGST', 'ANKER', 'APFEL', 'ASCHE', 'ATLAS', 'ARCHE',
        'ARMUT', 'AUßEN', 'ÄPFEL', 'ÄRZTE', 'ÄRMEL',
        // B
        'BÄCHE', 'BÄREN', 'BÄUME', 'BAUER', 'BEERE', 'BEINE', 'BERGE', 'BETEN',
        'BETON', 'BEUTE', 'BIBEL', 'BIERE', 'BIRNE', 'BITTE', 'BLATT', 'BLUME',
        'BOTEN', 'BOOTE', 'BRAUT', 'BRIEF', 'BRÜHE', 'BUCHE', 'BÜHNE',
        // D
        'DÄMME', 'DAMEN', 'DANKE', 'DECKE', 'DELTA', 'DICKE', 'DIEBE', 'DOSEN',
        'DREHE',
        // E
        'EBENE', 'ECKEN', 'EICHE', 'EIFER', 'EINER', 'EISEN', 'ELCHE', 'ELITE',
        'EMAIL', 'ENGEL', 'ENKEL', 'ENTEN', 'ERDEN', 'ERIKA', 'ESCHE', 'ESSEN',
        'ETAGE', 'EUROS',
        // F
        'FÄHRE', 'FALKE', 'FASER', 'FAHRT', 'FEILE', 'FEIND', 'FELSE', 'FERNE',
        'FESTE', 'FEUER', 'FIGUR', 'FILME', 'FIRMA', 'FISCH', 'FLÖTE', 'FOLGE',
        'FORST', 'FORUM', 'FRAGE', 'FREMD', 'FÜHRE', 'FÜLLE',
        // G
        'GÄNSE', 'GEBET', 'GEBOT', 'GEHEN', 'GEIER', 'GEIST', 'GELBE', 'GENAU',
        'GERÄT', 'GESTE', 'GLEIS', 'GLÜCK', 'GRABE', 'GRAUE', 'GREIF', 'GRÖßE',
        'GRÜßE', 'GUCKE', 'GURKE',
        // H
        'HÄNDE', 'HÄNGE', 'HÄRTE', 'HALLE', 'HALTE', 'HAUSE', 'HEERE', 'HEFTE',
        'HEIDE', 'HEXEN', 'HIEBE', 'HILFE', 'HIRNE', 'HITZE', 'HÖFEN', 'HÖREN',
        'HÜGEL', 'HÜLLE', 'HUNDE', 'HÜTTE', 'HÄUTE',
        // I
        'INDEX', 'INSEL', 'IRREN',
        // J
        'JAGEN', 'JÄGER', 'JEDER', 'JENEN', 'JUBEL', 'JUNGS',
        // K
        'KÄFER', 'KÄLTE', 'KÄMME', 'KANAL', 'KARTE', 'KASSE', 'KÄSTE', 'KAUFE',
        'KEHLE', 'KEILE', 'KERLE', 'KERZE', 'KETTE', 'KEULE', 'KLEBE', 'KLEID',
        'KLEIN', 'KNETE', 'KOHLE', 'KOMET', 'KÖNIG', 'KÖPFE', 'KÖRBE', 'KOSTE',
        'KRAFT', 'KRAGE', 'KRAHE', 'KRÄNE', 'KRANK', 'KRAUT', 'KREBS', 'KREIS',
        'KREUZ', 'KRIEG', 'KRÖTE', 'KÜHLE', 'KUNDE', 'KURVE', 'KÜSSE',
        // L
        'LACKE', 'LÄDEN', 'LÄMME', 'LANGE', 'LASSE', 'LASTE', 'LÄUFE', 'LAUTE',
        'LEBEN', 'LEDER', 'LEHRE', 'LEINE', 'LEISE', 'LENKE', 'LICHT', 'LINDE',
        'LINIE', 'LINSE', 'LISTE', 'LITER', 'LOBEN', 'LOCKE', 'LOHNE', 'LÖSER',
        'LÖWEN', 'LÜCKE', 'LUNGE',
        // M
        'MÄHNE', 'MAKEL', 'MAKRO', 'MANGE', 'MÄRZE', 'MASTE', 'MATHE', 'MÄUSE',
        'MEERE', 'MEILE', 'MEINE', 'MENGE', 'MERKE', 'MIETE', 'MILCH', 'MINZE',
        'MITTE', 'MODEL', 'MONAT', 'MORAL', 'MOTIV', 'MOTOR', 'MULDE', 'MÜCKE',
        'MÜNZE', 'MUSIK', 'MÄSTE', 'MAßEN',
        // N
        'NACHT', 'NADEL', 'NASEN', 'NEBEL', 'NEFFE', 'NEIGE', 'NESTE', 'NETZE',
        'NEUEN', 'NOTIZ', 'NÜSSE',
        // O
        'ÖFFNE', 'OHREN', 'ONKEL', 'OPFER', 'OPTIK', 'ORGAN', 'OSTER', 'ÖFTER',
        // P
        'PÄCKE', 'PAARE', 'PAUSE', 'PFERD', 'PFUND', 'PIANO', 'PILLE', 'PILZE',
        'PIRAT', 'PLAGE', 'PLANE', 'PLÄNE', 'PLATZ', 'POLEN', 'POREN', 'PORTO',
        'PREIS', 'PRINZ', 'PROBE', 'PRÜFE', 'PUDEL', 'PUSTE',
        // Q
        'QUARK', 'QUOTE',
        // R
        'RABEN', 'RADAR', 'RADIO', 'RÄDER', 'RAMPE', 'RÄNKE', 'RASEN', 'RASSE',
        'RASTE', 'RAUCH', 'RÄUME', 'REBEN', 'RECHT', 'REGEN', 'REGIE', 'REIHE',
        'REISE', 'RENTE', 'RETTE', 'RHEIN', 'RICHT', 'RIEGE', 'RIESE', 'RINGE',
        'RIPPE', 'ROLLE', 'ROSEN', 'RÖSSE', 'ROTEN', 'RUBEL', 'RUDER', 'RÜCKE',
        'RUNDE', 'RUINE',
        // S
        'SÄBEL', 'SÄCKE', 'SÄGEN', 'SAITE', 'SALBE', 'SALON', 'SALZE', 'SAMEN',
        'SANFT', 'SÄTZE', 'SCHAR', 'SCHÖN', 'SCHUH', 'SECHS', 'SEIFE',
        'SEILE', 'SEINE', 'SEKTE', 'SERUM', 'SETZE', 'SIEGE', 'SILBE', 'SINGE',
        'SITZE', 'SKALA', 'SOCKE', 'SOHLE', 'SÖHNE', 'SOLCH', 'SONDE', 'SONNE',
        'SPARE', 'SPÄTE', 'SPIEL', 'SPITZ', 'SPORT', 'SPREE', 'STABE', 'STAHL',
        'STAND', 'STARK', 'STATT', 'STAUB', 'STEAK', 'STEGE', 'STERN', 'STIFT',
        'STIRN', 'STOCK', 'STOFF', 'STOLZ', 'STROH', 'STUBE', 'STÜCK', 'STUFE',
        'STUHL', 'STURM', 'STÖßE',
        // T
        'TAFEL', 'TALER', 'TANNE', 'TAUBE', 'TEICH', 'TEILE', 'TENOR', 'TEXTE',
        'THEMA', 'TIEFE', 'TIERE', 'TIGER', 'TIPPE', 'TISCH', 'TÖNEN', 'TONNE',
        'TÖPFE', 'TRAGE', 'TRÄGE', 'TRÄNE', 'TRAUM', 'TRICK', 'TROPF',
        'TRUHE', 'TRÜBE', 'TRUPP', 'TÜREN',
        // U
        'UHREN', 'UNGAR', 'UNION', 'UNKEN', 'UNTER',
        // V
        'VATER', 'VIELE', 'VOGEL', 'VOLLE',
        // W
        'WAAGE', 'WACHE', 'WAFFE', 'WAGEN', 'WÄHLE', 'WÄLDE', 'WANDE', 'WÄNDE',
        'WANGE', 'WANNE', 'WANZE', 'WARME', 'WARTE', 'WATTE', 'WEBEN', 'WEHEN',
        'WEISE', 'WEITE', 'WELLE', 'WELPE', 'WENDE', 'WERBE', 'WERFE', 'WERKE',
        'WERTE', 'WESTE', 'WETTE', 'WICKE', 'WIEGE', 'WIESE', 'WILDE', 'WINDE',
        'WINKE', 'WISCH', 'WITWE', 'WITZE', 'WOCHE', 'WOGEN', 'WOLKE', 'WOLLE',
        'WORTE', 'WÜRFE', 'WÜSTE',
        // Z
        'ZÄHLE', 'ZÄHNE', 'ZAHLE', 'ZEBRA', 'ZEHEN', 'ZEIGE', 'ZEILE', 'ZELLE',
        'ZIEGE', 'ZIEHE', 'ZIELE', 'ZUNGE', 'ZWANG'
    ];

    // Der ursprüngliche Tageswort-Pool bleibt als v1-Schedule eingefroren.
    // Neue Wörter dürfen deshalb historische Tagesrätsel nicht umnummerieren.
    var DAILY_WORDS_V1 = Object.freeze(SOLUTION_WORDS.slice());
    var EXPANDED_SOLUTION_WORDS = [
        // A
        'ABBAU', 'ADIEU', 'AGAVE', 'AHNEN', 'AKTIE', 'ALARM', 'ALLES', 'AMMEN',
        'ANBAU', 'ANMUT', 'ANRUF', 'ANZUG', 'APRIL', 'ARENA', 'ARMEE', 'AROMA', 'ATMEN',
        // B
        'BACKE', 'BADEN', 'BALLE', 'BANDE', 'BARON', 'BAUCH', 'BEBEN', 'BEIDE',
        'BELAG', 'BESEN', 'BETTE', 'BLICK', 'BLIND', 'BLOCK', 'BLOND', 'BLÜTE',
        'BODEN', 'BOMBE', 'BONUS', 'BRAND', 'BREIT', 'BRUST', 'BÜGEL', 'BUNTE', 'BÜRDE',
        // D/E
        'DACHS', 'DAMPF', 'DATUM', 'DAUER', 'DAUNE', 'DENKE', 'DICHT', 'DINGS',
        'DOCHT', 'DOLCH', 'DRAHT', 'DRANG', 'DURST', 'EIMER', 'EKLAT', 'ENORM',
        'ERBSE', 'ERSTE', 'EWIGE',
        // F
        'FABEL', 'FADEN', 'FAHNE', 'FARNE', 'FAUST', 'FEDER', 'FEGEN', 'FERSE',
        'FETTE', 'FIESE', 'FLAUM', 'FLECK', 'FLEIß', 'FLINK', 'FLORA', 'FLUCH',
        'FLUSS', 'FORME', 'FROHE', 'FRUST', 'FURIE',
        // G/H
        'GABEL', 'GANZE', 'GARDE', 'GASSE', 'GAUDI', 'GEBEN', 'GENIE', 'GERTE',
        'GLANZ', 'GLAUB', 'GNOME', 'GRILL', 'GRUBE', 'GRUND', 'GÜTER', 'HABEN',
        'HAFEN', 'HAFER', 'HAKEN', 'HALBE', 'HALLO', 'HANDY', 'HARFE', 'HASEN',
        'HECKE', 'HEILE', 'HELLE', 'HERDE', 'HEUTE', 'HOBEL', 'HOTEL', 'HÜFTE', 'HUMOR',
        // I–K
        'IDEAL', 'IMMER', 'INNEN', 'JACKE', 'JOKER', 'KABEL', 'KANNE', 'KARMA',
        'KATER', 'KAUEN', 'KEBAB', 'KELCH', 'KERBE', 'KERNE', 'KISTE', 'KLAGE',
        'KLANG', 'KLIMA', 'KNALL', 'KNICK', 'KNOPF', 'KOALA', 'KOBRA', 'KOPIE',
        'KRANZ', 'KRUME', 'KUGEL', 'KUNST', 'KÜSTE',
        // L–N
        'LABOR', 'LACHE', 'LAGER', 'LAICH', 'LAUNE', 'LEERE', 'LEGEN', 'LERNE',
        'LESEN', 'LILIE', 'LINKS', 'LOTSE', 'MACHT', 'MAGEN', 'MAGIE', 'MANGO',
        'MARKE', 'MASKE', 'MAUER', 'MELDE', 'METER', 'MIEZE', 'MINUS', 'MOLCH',
        'MÖBEL', 'MÖHRE', 'MÜSLI', 'NACKE', 'NAGEL', 'NATUR', 'NEBEN', 'NICHT',
        'NOBEL', 'NUDEL',
        // O–R
        'OBERE', 'OCKER', 'OLIVE', 'OZEAN', 'PANDA', 'PANNE', 'PARKA', 'PERLE',
        'PFAHL', 'PHASE', 'PINIE', 'PIXEL', 'PLUMP', 'POKAL', 'PUMPE', 'PUNKT',
        'QUITT', 'RACHE', 'RAUPE', 'REDEN', 'REGAL', 'REGEL', 'REICH', 'RINDE',
        'RITTE', 'ROBBE', 'RÜBEN', 'RÜHRE',
        // S
        'SACHE', 'SAHNE', 'SAUNA', 'SCHAF', 'SCHEU', 'SEELE', 'SEGEN', 'SEIDE',
        'SENKE', 'SERIE', 'SICHT', 'SORGE', 'SPECK', 'SPEER', 'SPURE', 'STAAT',
        'STALL', 'STAMM', 'STEIL', 'STEIN', 'STIEL', 'STÖRE', 'STUMM', 'SUMME',
        // T–Z
        'TABAK', 'TADEL', 'TANGO', 'TARIF', 'TASTE', 'TAUFE', 'TAUEN', 'TEUER',
        'THRON', 'TINTE', 'TOAST', 'TORTE', 'TOTAL', 'TRANK', 'TREUE', 'TROST',
        'ULKEN', 'URALT', 'URBAN', 'VIDEO', 'VIRUS', 'WABEN', 'WALZE', 'WARUM',
        'WEDEL', 'WEHRT', 'WEICH', 'WEIDE', 'WEINE', 'WEIßE', 'WERDE', 'WERFT',
        'WESEN', 'WIPPE', 'WIRKE', 'WOHER', 'WURST', 'ZANGE', 'ZELTE', 'ZINNE',
        'ZIRKA', 'ZITAT', 'ZOBEL', 'ZWECK', 'ZWERG', 'ZWIRN'
    ];
    for (var expandedIndex = 0; expandedIndex < EXPANDED_SOLUTION_WORDS.length; expandedIndex++) {
        SOLUTION_WORDS.push(EXPANDED_SOLUTION_WORDS[expandedIndex]);
    }
    var DAILY_WORDS_V2 = Object.freeze(SOLUTION_WORDS.slice());
    var DAILY_V2_START_DAY = Math.floor(Date.UTC(2026, 8, 4) / 86400000); // ab 04.09.2026 UTC

    var EXTRA_GUESS_WORDS = [
        // Weitere gültige 5-Graphem-Wörter (dürfen Lösung überlappen, wird deduppt).
        'ACHSE', 'ABTEI', 'ACKER', 'ÄRGER', 'ALTEN', 'BÄDER', 'BOXEN',
        'DRITT', 'ECKIG', 'ERNST', 'ESSIG', 'FAHRE', 'GÄSTE', 'GRÜNE', 'HEIME',
        'HEIZT', 'IDEEN', 'JAHRE', 'LEBTE', 'LIEBE', 'LÜGEN', 'MÄGDE',
        'MACHE', 'NEHME', 'RUFST', 'SCHAU', 'TANZT', 'WÄRME', 'FLÖßE',
        'RAUHE', 'KOMMT', 'GEHTS', 'MEINE', 'DEINE',
        'EINEM', 'EINEN', 'EURES', 'EUREM', 'EUREN', 'MEIST', 'BLEIB',
        'STILL', 'STUND', 'BÜRGE', 'KNABE', 'KLAUE', 'ZÄHME', 'LÄUTE', 'EUERE',
        'YACHT', 'TYPEN'
    ];

    // Dedup & einfrieren. Lösungen müssen Teilmenge der gültigen Ratewörter sein.
    var VALID_GUESS_WORDS = (function () {
        var seen = Object.create(null);
        var all = [];
        var i, w;
        for (i = 0; i < SOLUTION_WORDS.length; i++) {
            w = SOLUTION_WORDS[i];
            if (!seen[w]) { seen[w] = true; all.push(w); }
        }
        for (i = 0; i < EXTRA_GUESS_WORDS.length; i++) {
            w = EXTRA_GUESS_WORDS[i];
            if (!seen[w]) { seen[w] = true; all.push(w); }
        }
        return Object.freeze(all);
    })();

    var VALID_SET = (function () {
        var s = Object.create(null);
        for (var i = 0; i < VALID_GUESS_WORDS.length; i++) s[VALID_GUESS_WORDS[i]] = true;
        return s;
    })();

    // Selbstprüfung: jedes Wort exakt 5 Grapheme, eindeutig.
    function assertListsSane() {
        var seen = Object.create(null);
        var words = VALID_GUESS_WORDS;
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            var g = Array.from(w);
            if (g.length !== WORD_LENGTH) {
                throw new Error('TexttlLogic: Wort nicht 5 Grapheme: ' + w);
            }
            if (normalize(w) !== w) {
                throw new Error('TexttlLogic: Wort nicht normalisiert: ' + w);
            }
            if (seen[w]) {
                throw new Error('TexttlLogic: doppeltes Wort: ' + w);
            }
            seen[w] = true;
        }
        return true;
    }

    // ============================================================
    // Bewertung — Zweifachdurchlauf für korrekte Doppelbuchstaben.
    // ============================================================
    // grade: 'absent' | 'present' | 'correct'
    function evaluate(guess, solution) {
        var g = graphemes(guess);
        var s = graphemes(solution);
        var n = Math.max(g.length, s.length);
        if (g.length !== WORD_LENGTH || s.length !== WORD_LENGTH) {
            throw new RangeError('evaluate: Ratewort und Lösung müssen 5 Grapheme haben');
        }
        var result = new Array(n);
        var remaining = s.slice(); // noch nicht verbrauchte Lösungs-Grapheme

        // Durchlauf 1: exakte Treffer markieren und aus dem Rest entfernen.
        for (var i = 0; i < n; i++) {
            if (g[i] === s[i]) {
                result[i] = 'correct';
                remaining[i] = null;
            }
        }
        // Durchlauf 2: Present nur, wenn das Graphem im Rest noch verfügbar ist.
        for (var j = 0; j < n; j++) {
            if (result[j] === 'correct') continue;
            var idx = -1;
            for (var k = 0; k < remaining.length; k++) {
                if (remaining[k] === g[j]) { idx = k; break; }
            }
            if (idx !== -1) {
                result[j] = 'present';
                remaining[idx] = null;
            } else {
                result[j] = 'absent';
            }
        }
        return result;
    }

    function hardModeViolation(guess, previousGuesses, solution) {
        var candidate = graphemes(normalize(guess));
        var answer = normalize(solution);
        if (candidate.length !== WORD_LENGTH || graphemes(answer).length !== WORD_LENGTH) {
            return 'Das Wort muss genau fünf Buchstaben haben.';
        }
        var history = Array.isArray(previousGuesses) ? previousGuesses : [];
        var requiredCounts = Object.create(null);
        for (var row = 0; row < history.length; row++) {
            var oldWord = normalize(history[row]);
            if (graphemes(oldWord).length !== WORD_LENGTH) continue;
            var oldLetters = graphemes(oldWord);
            var grades = evaluate(oldWord, answer);
            var rowCounts = Object.create(null);
            for (var i = 0; i < WORD_LENGTH; i++) {
                if (grades[i] === 'correct' && candidate[i] !== oldLetters[i]) {
                    return oldLetters[i] + ' muss an Stelle ' + (i + 1) + ' bleiben.';
                }
                if (grades[i] === 'present' && candidate[i] === oldLetters[i]) {
                    return oldLetters[i] + ' gehört nicht erneut an Stelle ' + (i + 1) + '.';
                }
                if (grades[i] === 'correct' || grades[i] === 'present') {
                    rowCounts[oldLetters[i]] = (rowCounts[oldLetters[i]] || 0) + 1;
                }
            }
            for (var letter in rowCounts) {
                requiredCounts[letter] = Math.max(requiredCounts[letter] || 0, rowCounts[letter]);
            }
        }
        var candidateCounts = Object.create(null);
        for (var c = 0; c < candidate.length; c++) candidateCounts[candidate[c]] = (candidateCounts[candidate[c]] || 0) + 1;
        for (var required in requiredCounts) {
            if ((candidateCounts[required] || 0) < requiredCounts[required]) {
                return required + ' muss mindestens ' + requiredCounts[required] + '-mal vorkommen.';
            }
        }
        return '';
    }

    function isWin(result) {
        for (var i = 0; i < result.length; i++) {
            if (result[i] !== 'correct') return false;
        }
        return result.length === WORD_LENGTH;
    }

    function isValidLength(word) {
        return graphemes(word).length === WORD_LENGTH;
    }

    function isValidGuess(word) {
        if (!isValidLength(word)) return false;
        return !!VALID_SET[normalize(word)];
    }

    // Vertrauensgrenze für aus localStorage geladene Versuche. Gibt immer
    // kanonische Wörter zurück oder null; dadurch erreicht keine korrupte
    // Eingabe evaluate().
    function sanitizeGuesses(guesses, solution) {
        if (!Array.isArray(guesses) || guesses.length > MAX_ATTEMPTS) return null;
        var out = [];
        for (var i = 0; i < guesses.length; i++) {
            if (typeof guesses[i] !== 'string' || !isValidGuess(guesses[i])) return null;
            out.push(normalize(guesses[i]));
        }
        if (solution != null && !isSolution(solution)) return null;
        return out;
    }

    function isSolution(word) {
        var n = normalize(word);
        for (var i = 0; i < SOLUTION_WORDS.length; i++) {
            if (SOLUTION_WORDS[i] === n) return true;
        }
        return false;
    }

    // ============================================================
    // Deterministisches Tageswort & Zufallsmodus
    // ============================================================
    function dateToEpochDays(date) {
        var d = (date instanceof Date) ? date : new Date();
        // Tagesrätsel beziehen sich ausdrücklich auf den UTC-Kalendertag,
        // nicht auf die lokale Zeitzone des Browsers.
        var ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        return Math.floor(ms / 86400000);
    }

    function dayKey(date) {
        return dateToEpochDays(date);
    }

    // Puzzle-Nummer ab dem Referenzdatum (kosmetisch, für Teilen).
    function puzzleNumber(date) {
        return dayKey(date) - REFERENCE_EPOCH_DAYS + 1;
    }

    // Deterministischer PRNG (mulberry32) — testbar und stabil.
    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function dailyPool(date) {
        return dayKey(date) < DAILY_V2_START_DAY ? DAILY_WORDS_V1 : DAILY_WORDS_V2;
    }

    function dailyIndex(date) {
        var key = dayKey(date);
        var pool = dailyPool(date);
        var rng = mulberry32(key);
        return Math.floor(rng() * pool.length);
    }

    function dailyWord(date) {
        var pool = dailyPool(date);
        return pool[dailyIndex(date)];
    }

    function randomIndex(rng) {
        var r = typeof rng === 'function' ? rng() : Math.random();
        var idx = Math.floor(r * SOLUTION_WORDS.length);
        if (idx < 0) idx = 0;
        if (idx >= SOLUTION_WORDS.length) idx = SOLUTION_WORDS.length - 1;
        return idx;
    }

    function randomWord(rng) {
        return SOLUTION_WORDS[randomIndex(rng)];
    }

    // ============================================================
    // Statistik & Streak (rein: geben NEUES Objekt zurück)
    // ============================================================
    function emptyStats() {
        return {
            played: 0,
            won: 0,
            currentStreak: 0,
            maxStreak: 0,
            dist: [0, 0, 0, 0, 0, 0],
            dailySolvedKey: null, // Tag (epochDays), an dem das Tagesrätsel bereits gewertet wurde
            dailyWonKey: null     // Tag, an dem das Tagesrätsel zuletzt gewonnen wurde
        };
    }

    function cloneStats(prev) {
        var s = emptyStats();
        var p = prev || emptyStats();
        s.played = Math.max(0, p.played | 0);
        s.won = Math.max(0, Math.min(s.played, p.won | 0));
        s.currentStreak = Math.max(0, Math.min(s.won, p.currentStreak | 0));
        s.maxStreak = Math.max(s.currentStreak, Math.min(s.won, Math.max(0, p.maxStreak | 0)));
        // dist defensiv auffüllen/abschneiden auf Länge 6 (teilweise Eingaben retten).
        var srcDist = (p.dist && Array.isArray(p.dist)) ? p.dist : [];
        s.dist = [];
        for (var i = 0; i < 6; i++) {
            var v = srcDist[i];
            s.dist.push((typeof v === 'number' && v >= 0 && isFinite(v)) ? Math.floor(v) : 0);
        }
        s.dailySolvedKey = (typeof p.dailySolvedKey === 'number' && isFinite(p.dailySolvedKey)) ? Math.floor(p.dailySolvedKey) : null;
        s.dailyWonKey = (typeof p.dailyWonKey === 'number' && isFinite(p.dailyWonKey)) ? Math.floor(p.dailyWonKey) : null;
        return s;
    }

    function winRate(stats) {
        var s = stats || emptyStats();
        if (s.played <= 0) return 0;
        return s.won / s.played;
    }

    // opts: { mode:'daily'|'random', won:bool, attempts:1..6, dayKey:number|null }
    // Liefert ein NEUES Statistik-Objekt (Eingabe bleibt unverändert).
    function recordResult(prev, opts) {
        opts = opts || {};
        var s = cloneStats(prev);
        var won = !!opts.won;
        var attempts = Math.max(1, Math.min(MAX_ATTEMPTS, opts.attempts | 0));

        // Tagesrätsel nur einmal pro Tag werten (idempotent).
        if (opts.mode === 'daily' && typeof opts.dayKey === 'number') {
            if (prev && prev.dailySolvedKey === opts.dayKey) {
                return s; // bereits gewertet → keine Doppelzählung
            }
            s.dailySolvedKey = opts.dayKey;
        }

        s.played += 1;
        if (won) {
            s.won += 1;
            s.dist[attempts - 1] += 1;
        }

        if (opts.mode === 'daily' && typeof opts.dayKey === 'number') {
            if (won) {
                var prevWon = (prev && typeof prev.dailyWonKey === 'number') ? prev.dailyWonKey : null;
                if (prevWon === opts.dayKey - 1) {
                    s.currentStreak = (prev ? prev.currentStreak : 0) + 1;
                } else {
                    s.currentStreak = 1;
                }
                s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
                s.dailyWonKey = opts.dayKey;
            } else {
                s.currentStreak = 0;
            }
        }
        return s;
    }

    // Wurde das Tagesrätsel an dayKey bereits gewertet?
    function dailyAlreadySolved(prev, dayKey) {
        return !!(prev && prev.dailySolvedKey === dayKey);
    }

    // ============================================================
    // Spoilerfreies Teilen (nur Emojis, keine Buchstaben)
    // ============================================================
    function gradeToEmoji(grade) {
        if (grade === 'correct') return '🟩';
        if (grade === 'present') return '🟨';
        return '⬛';
    }

    function shareLine(result) {
        var out = '';
        for (var i = 0; i < result.length; i++) out += gradeToEmoji(result[i]);
        return out;
    }

    // opts: { mode, puzzleNumber, won, attempts, rows:[[grade,...],...] }
    function buildShareText(opts) {
        opts = opts || {};
        var score = opts.won ? (opts.attempts + '/6') : 'X/6';
        var head;
        if (opts.mode === 'daily') {
            var label = (typeof opts.puzzleNumber === 'number' && opts.puzzleNumber > 0)
                ? ('#' + opts.puzzleNumber) : '';
            head = 'Texttl ' + label + ' ' + score;
        } else {
            head = 'Texttl (Zufall) ' + score;
        }
        if (opts.hardMode) head += ' ◆';
        var lines = [head];
        if (Array.isArray(opts.rows)) {
            for (var i = 0; i < opts.rows.length; i++) lines.push(shareLine(opts.rows[i]));
        }
        return lines.join('\n');
    }

    // ============================================================
    // On-Screen-Tastatur-Layout (QWERTZ + ÄÖÜß)
    // ============================================================
    var KEYBOARD_ROWS = Object.freeze([
        Object.freeze(['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü']),
        Object.freeze(['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä']),
        Object.freeze(['ENTER', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', 'ß', 'BACK'])
    ]);

    // Priorität für Tastaturfarben: correct > present > absent.
    function mergeKeyState(oldState, newState) {
        var rank = { absent: 0, present: 1, correct: 2 };
        if (!oldState) return newState;
        if (!newState) return oldState;
        return rank[newState] > rank[oldState] ? newState : oldState;
    }

    // Listen-Integrität beim Laden prüfen (bricht bei kaputten Daten).
    assertListsSane();

    return Object.freeze({
        WORD_LENGTH: WORD_LENGTH,
        MAX_ATTEMPTS: MAX_ATTEMPTS,
        REFERENCE_EPOCH_DAYS: REFERENCE_EPOCH_DAYS,
        SOLUTION_WORDS: SOLUTION_WORDS,
        EXTRA_GUESS_WORDS: EXTRA_GUESS_WORDS,
        DAILY_WORDS_V1: DAILY_WORDS_V1,
        DAILY_WORDS_V2: DAILY_WORDS_V2,
        DAILY_V2_START_DAY: DAILY_V2_START_DAY,
        VALID_GUESS_WORDS: VALID_GUESS_WORDS,
        KEYBOARD_ROWS: KEYBOARD_ROWS,
        toUpperDe: toUpperDe,
        graphemes: graphemes,
        normalize: normalize,
        isValidLetter: isValidLetter,
        evaluate: evaluate,
        hardModeViolation: hardModeViolation,
        isWin: isWin,
        isValidLength: isValidLength,
        isValidGuess: isValidGuess,
        sanitizeGuesses: sanitizeGuesses,
        isSolution: isSolution,
        assertListsSane: assertListsSane,
        dateToEpochDays: dateToEpochDays,
        dayKey: dayKey,
        puzzleNumber: puzzleNumber,
        mulberry32: mulberry32,
        dailyIndex: dailyIndex,
        dailyWord: dailyWord,
        randomIndex: randomIndex,
        randomWord: randomWord,
        emptyStats: emptyStats,
        cloneStats: cloneStats,
        winRate: winRate,
        recordResult: recordResult,
        dailyAlreadySolved: dailyAlreadySolved,
        gradeToEmoji: gradeToEmoji,
        shareLine: shareLine,
        buildShareText: buildShareText,
        mergeKeyState: mergeKeyState
    });
});
