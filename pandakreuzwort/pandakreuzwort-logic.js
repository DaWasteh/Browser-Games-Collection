/* === Pandakreuzwort — DOM-freie Spiellogik (UMD) ===
   Reine Funktionen für Normalisierung, deterministischen PRNG,
   Freeform-Kreuzwortgenerator (Backtracking + MRV), harte
   Platzierungsregeln, Profil-/Metrikprüfung, Nummerierung,
   kanonische Serialisierung, Datenvalidierung und defensives
   Speicherladen.

   Klassische Kreuzworträtsel-Umschrift: Ä→AE, Ö→OE, Ü→UE und ß→SS.
   Die Umschrift geschieht vor der Zerlegung in einzelne Rasterzellen,
   sodass jeder Buchstabe genau eine Zelle belegt. NFC wird vorab angewendet. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PandakreuzwortLogic = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    'use strict';

    var GENERATOR_VERSION = 3;

    // Klassische deutsche Kreuzworträtsel-Umschrift -----------------------
    function toUpperDe(ch) {
        var map = { 'ä': 'AE', 'Ä': 'AE', 'ö': 'OE', 'Ö': 'OE', 'ü': 'UE', 'Ü': 'UE', 'ß': 'SS', 'ẞ': 'SS' };
        return map[ch] || ch.toUpperCase();
    }

    function normalizeGridAnswer(value) {
        var chars = Array.from(String(value == null ? '' : value).normalize('NFC'));
        var out = '';
        for (var i = 0; i < chars.length; i++) {
            var mapped = toUpperDe(chars[i]);
            // Natürliche Schreibweisen dürfen Leerzeichen, Bindestriche und
            // Apostrophe enthalten; im klassischen Gitter entfallen sie.
            if (/^[\s\-'’]$/.test(mapped)) continue;
            out += mapped;
        }
        return out;
    }

    function graphemes(value) {
        return Array.from(normalizeGridAnswer(value));
    }

    function isGridLetter(value) {
        return typeof value === 'string' && /^[A-Z]$/.test(value);
    }

    // Erlaubte Rasterzeichen nach der Umschrift.
    var ALLOWED_LETTER = /^[A-Z]$/;

    // ============================================================
    // Profile (Layout-Schwierigkeit, zentral konfigurierbar)
    // ============================================================
    var PROFILES = Object.freeze({
        leicht: Object.freeze({
            name: 'leicht',
            targetWords: 13,
            minWords: 10,
            maxAttempts: 60,
            maxNodes: 10000,
            candidateLimit: 11,
            placementLimit: 9,
            hints: 4,
            entryDifficultyMax: 2,
            preferLong: false,
            minCrossingRate: 0.18,
            minDensity: 0.24,
            qualityAttempts: 4,
            poolLimit: 100
        }),
        mittel: Object.freeze({
            name: 'mittel',
            targetWords: 17,
            minWords: 14,
            maxAttempts: 80,
            maxNodes: 20000,
            candidateLimit: 13,
            placementLimit: 11,
            hints: 3,
            entryDifficultyMax: 3,
            preferLong: true,
            minCrossingRate: 0.18,
            minDensity: 0.25,
            qualityAttempts: 5,
            poolLimit: 130
        }),
        schwer: Object.freeze({
            name: 'schwer',
            targetWords: 21,
            minWords: 17,
            maxAttempts: 100,
            maxNodes: 35000,
            candidateLimit: 15,
            placementLimit: 13,
            hints: 2,
            entryDifficultyMax: 3,
            preferLong: true,
            minCrossingRate: 0.18,
            minDensity: 0.26,
            qualityAttempts: 6,
            poolLimit: 170
        }),
        experte: Object.freeze({
            name: 'experte',
            targetWords: 23,
            minWords: 19,
            maxAttempts: 100,
            maxNodes: 35000,
            candidateLimit: 15,
            placementLimit: 13,
            hints: 1,
            entryDifficultyMax: 3,
            preferLong: true,
            minCrossingRate: 0.19,
            minDensity: 0.27,
            qualityAttempts: 7,
            poolLimit: 190
        })
    });

    var PROFILE_NAMES = Object.freeze(['leicht', 'mittel', 'schwer', 'experte']);

    // ============================================================
    // Deterministischer PRNG: cyrb128 (Hash) + sfc32.
    // Kein Math.random() im Generatoreingang — ausschließlich injiziert.
    // ============================================================
    function cyrb128(str) {
        var s = String(str == null ? '' : str);
        var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
        for (var i = 0; i < s.length; i++) {
            var k = s.charCodeAt(i);
            h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
            h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
            h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
            h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
        }
        h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
        h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
        h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
        h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
        h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
        return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
    }

    function sfc32(a, b, c, d) {
        return function () {
            a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
            var t = (a + b) | 0;
            a = b ^ (b >>> 9);
            b = (c + (c << 3)) | 0;
            c = (c << 21 | c >>> 11);
            d = (d + 1) | 0;
            t = (t + d) | 0;
            c = (c + t) | 0;
            return (t >>> 0) / 4294967296;
        };
    }

    // Erzeugt einen reproduzierbaren PRNG aus einem beliebigen Seed-String.
    function createPrng(seed) {
        var seedStr = (typeof seed === 'number') ? 'n:' + seed : String(seed == null ? '' : seed);
        var v = cyrb128(seedStr);
        return sfc32(v[0], v[1], v[2], v[3]);
    }

    // Deterministisch abgeleiteter Versuchs-Seed (Namespace enthält Versionen).
    function deriveAttemptSeed(seed, attempt, datasetVersion, generatorVersion) {
        return 'pk1|g' + generatorVersion + '|d' + datasetVersion +
            '|' + seed + '|#' + (attempt | 0);
    }

    // Fisher-Yates mit injiziertem PRNG.
    function shuffle(arr, prng) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(prng() * (i + 1));
            if (j < 0) j = 0;
            if (j > i) j = i;
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // ============================================================
    // Datenvalidierung
    // ============================================================
    function validateDataset(dataset) {
        var errors = [];
        if (!dataset || typeof dataset !== 'object') {
            return { ok: false, errors: ['Dataset ist kein Objekt.'] };
        }
        var entries = dataset.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            return { ok: false, errors: ['entries fehlt oder ist leer.'] };
        }
        if (typeof dataset.datasetVersion !== 'string' || !dataset.datasetVersion) {
            errors.push('datasetVersion fehlt.');
        }
        var seenId = Object.create(null);
        var seenAnswer = Object.create(null);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var ctx = 'Eintrag #' + i + (e && e.id ? ' (' + e.id + ')' : '');
            if (!e || typeof e !== 'object') { errors.push(ctx + ': kein Objekt.'); continue; }
            if (typeof e.id !== 'string' || !e.id) { errors.push(ctx + ': id fehlt.'); }
            else if (seenId[e.id]) { errors.push(ctx + ': doppelte id.'); }
            else seenId[e.id] = true;

            if (e.language !== 'de' && e.language !== 'bar') {
                errors.push(ctx + ': language muss "de" oder "bar" sein.');
            }
            if (typeof e.displayAnswer !== 'string' || !e.displayAnswer) {
                errors.push(ctx + ': displayAnswer fehlt.');
            }
            var ga = (typeof e.gridAnswer === 'string') ? e.gridAnswer : normalizeGridAnswer(e.displayAnswer);
            var want = normalizeGridAnswer(e.displayAnswer);
            if (e.gridAnswer != null && e.gridAnswer !== want) {
                errors.push(ctx + ': gridAnswer nicht normalisiert (' + ga + ' vs ' + want + ').');
            }
            var gs = graphemes(want);
            if (gs.length < 2 || gs.length > 14) {
                errors.push(ctx + ': gridAnswer-Länge ' + gs.length + ' außerhalb 2..14.');
            }
            for (var k = 0; k < gs.length; k++) {
                if (!ALLOWED_LETTER.test(gs[k])) {
                    errors.push(ctx + ': unerlaubtes Graphem "' + gs[k] + '".');
                    break;
                }
            }
            // NFC: Normalisiert-Form muss stabil sein.
            if (String(e.displayAnswer).normalize('NFC') !== String(e.displayAnswer)) {
                errors.push(ctx + ': displayAnswer nicht NFC.');
            }
            var answerKey = e.language + '|' + want;
            if (e.language) {
                if (seenAnswer[answerKey]) errors.push(ctx + ': doppelte gridAnswer in Sprache.');
                else seenAnswer[answerKey] = true;
            }
            if (typeof e.clue !== 'string' || !e.clue.trim()) {
                errors.push(ctx + ': clue fehlt oder leer.');
            }
            if (typeof e.difficulty !== 'number' || e.difficulty < 1 || e.difficulty > 3) {
                errors.push(ctx + ': difficulty muss 1..3 sein.');
            }
            if (!Array.isArray(e.allowedProfiles) || e.allowedProfiles.length === 0) {
                errors.push(ctx + ': allowedProfiles fehlt/leer.');
            } else {
                for (var p = 0; p < e.allowedProfiles.length; p++) {
                    if (PROFILE_NAMES.indexOf(e.allowedProfiles[p]) === -1) {
                        errors.push(ctx + ': unbekanntes Profil ' + e.allowedProfiles[p]);
                        break;
                    }
                }
            }
            if (e.reviewed !== true) errors.push(ctx + ': reviewed muss true sein.');
            if (!e.review || e.review.status !== 'project-reviewed' || typeof e.review.reviewerRole !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.review.reviewDate || '')) {
                errors.push(ctx + ': redaktionelle Review-Metadaten fehlen.');
            }
            if (!e.source || e.source.kind !== 'project-editorial') {
                errors.push(ctx + ': source.kind muss "project-editorial" sein.');
            }
            if (e.language === 'bar') {
                if (typeof e.region !== 'string' || !e.region.trim()) {
                    errors.push(ctx + ': bairischer Eintrag braucht region.');
                }
                if (typeof e.standardGerman !== 'string' || !e.standardGerman.trim()) {
                    errors.push(ctx + ': bairischer Eintrag braucht standardGerman.');
                }
            }
        }
        return { ok: errors.length === 0, errors: errors };
    }

    // Bereitet Einträge vor (cacht Grapheme und Buchstabenmenge in einem
    // WeakMap, sodass auch eingefrorene Einträge nicht verändert werden).
    var __cache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

    function prep(entry) {
        if (!entry) return { graphemes: [], letterSet: Object.create(null) };
        var info = __cache && __cache.get(entry);
        if (info) return info;
        var gs = graphemes(entry.gridAnswer || normalizeGridAnswer(entry.displayAnswer));
        var set = Object.create(null);
        for (var i = 0; i < gs.length; i++) set[gs[i]] = true;
        info = { graphemes: gs, letterSet: set };
        if (__cache) { try { __cache.set(entry, info); } catch (_e) { /* kein Cache möglich */ } }
        return info;
    }

    function ensurePrepared(entries) {
        for (var i = 0; i < entries.length; i++) prep(entries[i]);
        return entries;
    }

    // ============================================================
    // Generatorzustand
    // ============================================================
    function newState() {
        return {
            grid: Object.create(null),        // "r,c" -> Graphem
            owners: Object.create(null),      // "r,c" -> {across,down}
            letterIndex: Object.create(null), // Graphem -> [[r,c],...]
            placements: [],                   // {entry, row, col, dir}
            usedIds: Object.create(null),
            cellCount: 0,
            sumR: 0,
            sumC: 0,
            boxR0: null, boxR1: null, boxC0: null, boxC1: null
        };
    }

    function key(r, c) { return r + ',' + c; }

    // Maximale Ausdehnung der freien Bounding-Box (Spanne max 15
    // => bis zu 16 Zeilen/Spalten). Bietet Platz für dichtere Rätsel.
    var MAX_SPAN = 15;

    function expandBox(state, r, c) {
        if (state.boxR0 == null) {
            state.boxR0 = r; state.boxR1 = r; state.boxC0 = c; state.boxC1 = c;
        } else {
            if (r < state.boxR0) state.boxR0 = r;
            if (r > state.boxR1) state.boxR1 = r;
            if (c < state.boxC0) state.boxC0 = c;
            if (c > state.boxC1) state.boxC1 = c;
        }
    }

    function recomputeBox(state) {
        state.boxR0 = null; state.boxR1 = null; state.boxC0 = null; state.boxC1 = null;
        for (var k in state.grid) {
            var parts = k.split(',');
            expandBox(state, +parts[0], +parts[1]);
        }
    }

    function placeWordDirect(state, entry, row, col, dir) {
        var g = prep(entry).graphemes;
        var dr = dir === 'across' ? 0 : 1;
        var dc = dir === 'across' ? 1 : 0;
        var created = [];
        var touched = [];
        for (var i = 0; i < g.length; i++) {
            var r = row + dr * i, c = col + dc * i, ky = key(r, c);
            if (state.grid[ky] == null) {
                state.grid[ky] = g[i];
                state.cellCount++;
                state.sumR += r;
                state.sumC += c;
                expandBox(state, r, c);
                var arr = state.letterIndex[g[i]];
                if (!arr) { arr = []; state.letterIndex[g[i]] = arr; }
                arr.push([r, c]);
                created.push(ky);
            }
            if (!state.owners[ky]) state.owners[ky] = { across: false, down: false };
            state.owners[ky][dir] = true;
            touched.push(ky);
        }
        state.placements.push({ entry: entry, row: row, col: col, dir: dir });
        state.usedIds[entry.id] = true;
        return { created: created, touched: touched };
    }

    // Wendet eine geprüfte Platzierung an. Richtungsbesitz wird auch für
    // Kreuzungszellen gespeichert, damit gleichgerichtete Überlagerungen
    // unmöglich sind und beim Backtracking sauber entfernt werden.
    function applyPlacement(state, placement) {
        var changes = placeWordDirect(state, placement.entry, placement.row, placement.col, placement.dir);
        placement._created = changes.created;
        placement._touched = changes.touched;
    }

    function undoPlacement(state, placement) {
        var touched = placement._touched || [];
        for (var ti = 0; ti < touched.length; ti++) {
            var owner = state.owners[touched[ti]];
            if (owner) {
                owner[placement.dir] = false;
                if (!owner.across && !owner.down) delete state.owners[touched[ti]];
            }
        }
        var created = placement._created || [];
        for (var ci = 0; ci < created.length; ci++) {
            var ky = created[ci];
            var parts = ky.split(',');
            var r = +parts[0], c = +parts[1];
            var letter = state.grid[ky];
            delete state.grid[ky];
            state.cellCount--;
            state.sumR -= r;
            state.sumC -= c;
            var arr = state.letterIndex[letter];
            if (arr) {
                for (var m = arr.length - 1; m >= 0; m--) {
                    if (arr[m][0] === r && arr[m][1] === c) { arr.splice(m, 1); break; }
                }
                if (arr.length === 0) delete state.letterIndex[letter];
            }
        }
        state.placements.pop();
        delete state.usedIds[placement.entry.id];
        recomputeBox(state);
    }

    // ============================================================
    // Harte Platzierungsregeln (für Wörter nach dem Anker)
    // Eine Platzierung ist legal, wenn:
    //   - Zelle vor und nach dem Wort unbesetzt ist (kein Run-on),
    //   - jede Überlagerung dasselbe Graphem hat,
    //   - die Überlagerung eine rechtwinklige Kreuzung ist (automatisch
    //     durch die Run-on-Regel: gleichgerichtete Überlagerung verbietet
    //     die Zelle-davor/-danach-Prüfung),
    //   - neu belegte (nicht kreuzende) Zellen keine seitlichen Nachbarn
    //     haben (keine parallele Berührung / keine ungewollten Wörter),
    //   - mindestens eine echte Kreuzung entsteht.
    // ============================================================
    function isLegalPlacement(state, placement) {
        var g = prep(placement.entry).graphemes;
        var n = g.length;
        var row = placement.row, col = placement.col;
        var across = placement.dir === 'across';
        var dr = across ? 0 : 1;
        var dc = across ? 1 : 0;
        var hasCrossing = false;

        if (state.grid[key(row - dr, col - dc)]) return false; // Zelle davor
        if (state.grid[key(row + dr * n, col + dc * n)]) return false; // Zelle danach

        // Bounding-Box-Kappe: Ausdehnung bleibt kompakt.
        var r0 = row, r1 = row + dr * (n - 1), c0 = col, c1 = col + dc * (n - 1);
        var nr0 = (state.boxR0 == null) ? r0 : Math.min(state.boxR0, r0, r1);
        var nr1 = (state.boxR1 == null) ? r1 : Math.max(state.boxR1, r0, r1);
        var nc0 = (state.boxC0 == null) ? c0 : Math.min(state.boxC0, c0, c1);
        var nc1 = (state.boxC1 == null) ? c1 : Math.max(state.boxC1, c0, c1);
        if (nr1 - nr0 > MAX_SPAN || nc1 - nc0 > MAX_SPAN) return false;

        for (var i = 0; i < n; i++) {
            var r = row + dr * i, c = col + dc * i, ky = key(r, c);
            var existing = state.grid[ky];
            if (existing != null) {
                if (existing !== g[i]) return false;
                var owner = state.owners[ky];
                // Eine echte Kreuzung besteht aus genau einem waagrechten und
                // einem senkrechten Wort. Gleiche Richtung darf nie überlagern.
                if (!owner || owner[placement.dir]) return false;
                var perpendicular = placement.dir === 'across' ? 'down' : 'across';
                if (!owner[perpendicular]) return false;
                hasCrossing = true;
            } else {
                // Neue Zelle: seitliche Nachbarn müssen frei sein.
                var pr = across ? 1 : 0;
                var pc = across ? 0 : 1;
                if (state.grid[key(r + pr, c + pc)]) return false;
                if (state.grid[key(r - pr, c - pc)]) return false;
            }
        }
        return hasCrossing;
    }

    // Alle legalen Platzierungen eines Eintrags (über Kreuzungsbuchstaben).
    function enumerateLegalPlacements(state, entry) {
        var g = prep(entry).graphemes;
        var out = [];
        var seen = Object.create(null);
        for (var i = 0; i < g.length; i++) {
            var letter = g[i];
            var positions = state.letterIndex[letter];
            if (!positions) continue;
            for (var p = 0; p < positions.length; p++) {
                var gr = positions[p][0], gc = positions[p][1];
                // waagrecht: Wort beginnt bei (gr, gc - i)
                addIfLegal(state, entry, gr, gc - i, 'across', out, seen);
                // senkrecht: Wort beginnt bei (gr - i, gc)
                addIfLegal(state, entry, gr - i, gc, 'down', out, seen);
            }
        }
        return out;
    }

    function addIfLegal(state, entry, row, col, dir, out, seen) {
        var sk = row + ',' + col + ':' + dir;
        if (seen[sk]) return;
        seen[sk] = true;
        var placement = { entry: entry, row: row, col: col, dir: dir };
        if (isLegalPlacement(state, placement)) out.push(placement);
    }

    function sharesAnyLetter(state, entry) {
        var set = prep(entry).letterSet;
        for (var letter in state.letterIndex) {
            if (set[letter]) return true;
        }
        return false;
    }

    // Bewertung einer Platzierung: Kreuzungen, Kompaktheit, Länge.
    function scorePlacement(state, placement, profile) {
        var g = prep(placement.entry).graphemes;
        var across = placement.dir === 'across';
        var dr = across ? 0 : 1, dc = across ? 1 : 0;
        var crossings = 0;
        var boxPenalty = 0;
        for (var i = 0; i < g.length; i++) {
            var r = placement.row + dr * i, c = placement.col + dc * i;
            if (state.grid[key(r, c)] != null) crossings++;
            if (state.boxR0 != null && (r < state.boxR0 || r > state.boxR1 || c < state.boxC0 || c > state.boxC1)) boxPenalty += 5;
        }
        var cr = state.cellCount ? state.sumR / state.cellCount : 0;
        var cc = state.cellCount ? state.sumC / state.cellCount : 0;
        var mid = (g.length - 1) / 2;
        var wr = placement.row + dr * mid, wc = placement.col + dc * mid;
        var dist = Math.abs(wr - cr) + Math.abs(wc - cc);
        var lengthWeight = profile && profile.preferLong ? 3 : 1.5;
        return crossings * 120 - boxPenalty - dist * 2 + g.length * lengthWeight;
    }

    // Sammle einsetzbare Kandidaten (nur Einträge mit mind. einer legalen Stelle).
    function collectCandidates(state, order, profile, prng) {
        var candidates = [];
        for (var i = 0; i < order.length; i++) {
            var entry = order[i];
            if (state.usedIds[entry.id]) continue;
            if (!sharesAnyLetter(state, entry)) continue;
            var placements = enumerateLegalPlacements(state, entry);
            if (placements.length === 0) continue;
            // Nach Bewertung sortieren, Gleichstände PRNG-gemischt.
            for (var k = 0; k < placements.length; k++) placements[k]._tb = prng();
            placements.sort(function (a, b) {
                var sa = scorePlacement(state, a, profile), sb = scorePlacement(state, b, profile);
                if (sb !== sa) return sb - sa;
                return a._tb - b._tb;
            });
            candidates.push({
                entry: entry,
                placements: placements,
                count: placements.length,
                tiebreak: prng()
            });
        }
        // MRV / Fail-first: wenigste Stellen zuerst, dann härtere Einträge.
        candidates.sort(function (a, b) {
            if (a.count !== b.count) return a.count - b.count;
            var da = a.entry.difficulty || 1, db = b.entry.difficulty || 1;
            if (db !== da) return db - da;
            return a.tiebreak - b.tiebreak;
        });
        return candidates;
    }

    // ============================================================
    // Generierung eines Versuchs
    // ============================================================
    function generateOneAttempt(prng, pool, profile) {
        var order = shuffle(pool, prng);
        if (profile.poolLimit && order.length > profile.poolLimit) order = order.slice(0, profile.poolLimit);
        var state = newState();
        var anchor = order[0];
        placeWordDirect(state, anchor, 0, 0, 'across');

        var best = state.placements.slice();
        var budget = { count: 0 };

        (function bt() {
            if (state.placements.length > best.length) best = state.placements.slice();
            if (state.placements.length >= profile.targetWords) return;
            budget.count++;
            if (budget.count > profile.maxNodes) return;

            var candidates = collectCandidates(state, order, profile, prng);
            if (candidates.length === 0) return;

            var limit = Math.min(candidates.length, profile.candidateLimit);
            for (var ci = 0; ci < limit; ci++) {
                var cand = candidates[ci];
                var pmax = Math.min(cand.placements.length, profile.placementLimit);
                for (var k = 0; k < pmax; k++) {
                    var p = cand.placements[k];
                    applyPlacement(state, p);
                    var before = state.placements.length;
                    bt();
                    if (state.placements.length !== before) {
                        // sollte nicht passieren (undo symmetrisch); sicherheitshalber aufräumen
                    }
                    undoPlacement(state, p);
                    if (best.length >= profile.targetWords) return;
                }
                if (best.length >= profile.targetWords) return;
            }
        })();

        return best;
    }

    // Hauptgenerator: filtert Sprache/Profil, probiert deterministisch.
    function generatePuzzle(opts) {
        opts = opts || {};
        var seed = opts.seed != null ? opts.seed : 'panda';
        var language = opts.language === 'bar' ? 'bar' : 'de';
        var difficulty = PROFILES[opts.difficulty] ? opts.difficulty : 'mittel';
        var profile = PROFILES[difficulty];
        var allEntries = opts.entries || [];
        ensurePrepared(allEntries);
        var datasetVersion = opts.datasetVersion || '0';
        var pool = [];
        for (var i = 0; i < allEntries.length; i++) {
            var e = allEntries[i];
            if (e.language !== language) continue;
            var dataProfile = difficulty === 'experte' ? 'schwer' : difficulty;
            if (!(e.allowedProfiles && e.allowedProfiles.indexOf(dataProfile) !== -1)) continue;
            if ((e.difficulty || 1) > profile.entryDifficultyMax) continue;
            pool.push(e);
        }
        var meta = {
            seed: seed, language: language, difficulty: difficulty,
            datasetVersion: datasetVersion, generatorVersion: GENERATOR_VERSION
        };
        if (pool.length < 3) {
            // Für winzige Pools entsteht kein kreuzendes Rätsel. Wir geben ein
            // wohlgeformtes (ggf. leeres oder einzelnes Ankerwort-) Puzzle
            // zurück, das nicht wirft und das der Validator sicher prüfen kann.
            var tinySpecs = [];
            if (pool.length >= 1) tinySpecs.push({ entry: pool[0], row: 0, col: 0, dir: 'across' });
            var tinyPuzzle = buildPuzzle(tinySpecs, meta);
            tinyPuzzle.metrics = computeMetrics(tinyPuzzle);
            return tinyPuzzle;
        }

        var bestPlacements = null;
        var bestScore = -Infinity;
        var bestQualityPassed = false;
        var targetHits = 0;
        var attemptsUsed = 0;
        for (var attempt = 0; attempt < profile.maxAttempts; attempt++) {
            var attemptSeed = deriveAttemptSeed(seed, attempt, datasetVersion, GENERATOR_VERSION);
            var prng = createPrng(attemptSeed);
            var placements = generateOneAttempt(prng, pool, profile);
            var candidate = buildPuzzle(placements, meta);
            candidate.metrics = computeMetrics(candidate);
            var candidatePassed = candidate.metrics.wordCount >= profile.minWords &&
                candidate.metrics.crossingRate >= profile.minCrossingRate &&
                candidate.metrics.density >= profile.minDensity && candidate.metrics.directionBalance >= 0.28;
            var score = qualityScore(candidate.metrics, profile);
            if (score > bestScore) {
                bestScore = score;
                bestPlacements = placements;
                bestQualityPassed = candidatePassed;
            }
            attemptsUsed = attempt + 1;
            if (placements.length >= profile.targetWords) targetHits++;
            if (targetHits >= profile.qualityAttempts && bestQualityPassed) break;
        }

        var puzzle = buildPuzzle(bestPlacements, meta);
        puzzle.profile = profile.name;
        puzzle.metrics = computeMetrics(puzzle);
        puzzle.qualityPassed = puzzle.metrics.wordCount >= profile.minWords &&
            puzzle.metrics.crossingRate >= profile.minCrossingRate &&
            puzzle.metrics.density >= profile.minDensity &&
            puzzle.metrics.directionBalance >= 0.28;
        puzzle.attemptsUsed = attemptsUsed;
        return puzzle;
    }

    // ============================================================
    // Nummerierung, Bounding-Box, Zellen, Hinweislisten
    // ============================================================
    function byNumber(a, b) { return a.number - b.number; }

    function numberPlacements(placements) {
        var starts = Object.create(null);
        for (var i = 0; i < placements.length; i++) {
            var p = placements[i];
            var k = key(p.row, p.col);
            if (!starts[k]) starts[k] = { row: p.row, col: p.col, num: 0 };
        }
        var arr = [];
        for (var kk in starts) arr.push(starts[kk]);
        arr.sort(function (a, b) { return (a.row - b.row) || (a.col - b.col); });
        for (var j = 0; j < arr.length; j++) arr[j].num = j + 1;
        for (var m = 0; m < placements.length; m++) {
            placements[m].number = starts[key(placements[m].row, placements[m].col)].num;
        }
        return placements;
    }

    function toClue(p) {
        return {
            number: p.number,
            entryId: p.entryId,
            row: p.row,
            col: p.col,
            dir: p.dir,
            gridAnswer: p.gridAnswer,
            length: p.length,
            clue: p.clue,
            displayAnswer: p.displayAnswer,
            region: p.region || null,
            standardGerman: p.standardGerman || null
        };
    }

    function placementFromEntry(entry, row, col, dir) {
        return {
            entry: entry, row: row, col: col, dir: dir,
            entryId: entry.id,
            gridAnswer: entry.gridAnswer || normalizeGridAnswer(entry.displayAnswer),
            length: prep(entry).graphemes.length,
            clue: entry.clue,
            displayAnswer: entry.displayAnswer,
            region: entry.region || null,
            standardGerman: entry.standardGerman || null
        };
    }

    // Normalisiert Koordinaten auf Ursprung, nummeriert, baut Zellenkarte.
    function buildPuzzle(placementSpecs, meta) {
        // placementSpecs: [{entry,row,col,dir}] oder bereits angereichert
        var specs = placementSpecs || [];
        var minR = Infinity, minC = Infinity;
        for (var i = 0; i < specs.length; i++) {
            var s = specs[i];
            var g = prep(s.entry).graphemes;
            var dr = s.dir === 'across' ? 0 : 1, dc = s.dir === 'across' ? 1 : 0;
            for (var j = 0; j < g.length; j++) {
                var r = s.row + dr * j, c = s.col + dc * j;
                if (r < minR) minR = r;
                if (c < minC) minC = c;
            }
        }
        if (minR === Infinity) { minR = 0; minC = 0; }

        var placements = [];
        for (var m = 0; m < specs.length; m++) {
            var sp = specs[m];
            placements.push(placementFromEntry(sp.entry, sp.row - minR, sp.col - minC, sp.dir));
        }
        numberPlacements(placements);

        var cells = Object.create(null);
        var maxR = 0, maxC = 0;
        for (var n = 0; n < placements.length; n++) {
            var p = placements[n];
            var gg = graphemes(p.gridAnswer);
            var ddr = p.dir === 'across' ? 0 : 1, ddc = p.dir === 'across' ? 1 : 0;
            for (var q = 0; q < gg.length; q++) {
                var rr = p.row + ddr * q, cc = p.col + ddc * q, kkey = key(rr, cc);
                if (rr > maxR) maxR = rr;
                if (cc > maxC) maxC = cc;
                if (!cells[kkey]) cells[kkey] = { letter: gg[q], number: 0, across: null, down: null };
                if (p.dir === 'across') cells[kkey].across = n; else cells[kkey].down = n;
            }
        }
        for (var t = 0; t < placements.length; t++) {
            cells[key(placements[t].row, placements[t].col)].number = placements[t].number;
        }

        var across = placements.filter(function (p) { return p.dir === 'across'; }).sort(byNumber);
        var down = placements.filter(function (p) { return p.dir === 'down'; }).sort(byNumber);

        return {
            seed: meta.seed,
            language: meta.language,
            difficulty: meta.difficulty,
            datasetVersion: meta.datasetVersion,
            generatorVersion: meta.generatorVersion,
            placements: placements,
            cells: cells,
            rows: maxR + 1,
            cols: maxC + 1,
            clues: { across: across.map(toClue), down: down.map(toClue) }
        };
    }

    function computeMetrics(puzzle) {
        var cells = Object.create(null);
        var minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
        var total = 0;
        for (var i = 0; i < puzzle.placements.length; i++) {
            var p = puzzle.placements[i];
            var g = graphemes(p.gridAnswer);
            var dr = p.dir === 'across' ? 0 : 1, dc = p.dir === 'across' ? 1 : 0;
            for (var j = 0; j < g.length; j++) {
                var r = p.row + dr * j, c = p.col + dc * j, ky = key(r, c);
                cells[ky] = (cells[ky] || 0) + 1;
                total++;
                if (r < minR) minR = r; if (c < minC) minC = c;
                if (r > maxR) maxR = r; if (c > maxC) maxC = c;
            }
        }
        var cellCount = 0, crossingCells = 0;
        for (var kk in cells) { cellCount++; if (cells[kk] > 1) crossingCells++; }
        var wordCount = puzzle.placements.length;
        var rows = (minR === Infinity) ? 0 : maxR - minR + 1;
        var cols = (minC === Infinity) ? 0 : maxC - minC + 1;
        var acrossCount = puzzle.placements.filter(function (p) { return p.dir === 'across'; }).length;
        var downCount = wordCount - acrossCount;
        return {
            wordCount: wordCount,
            cellCount: cellCount,
            crossingCells: crossingCells,
            crossingRate: cellCount ? crossingCells / cellCount : 0,
            density: rows && cols ? cellCount / (rows * cols) : 0,
            directionBalance: Math.max(acrossCount, downCount) ? Math.min(acrossCount, downCount) / Math.max(acrossCount, downCount) : 0,
            acrossCount: acrossCount,
            downCount: downCount,
            rows: rows,
            cols: cols,
            avgLen: wordCount ? Math.round((total / wordCount) * 10) / 10 : 0
        };
    }

    function qualityScore(metrics, profile) {
        if (!metrics) return -Infinity;
        var minimumPenalty = metrics.wordCount < profile.minWords ? (profile.minWords - metrics.wordCount) * 1000000 : 0;
        if (metrics.crossingRate < profile.minCrossingRate) minimumPenalty += (profile.minCrossingRate - metrics.crossingRate) * 500000;
        if (metrics.density < profile.minDensity) minimumPenalty += (profile.minDensity - metrics.density) * 350000;
        if (metrics.directionBalance < 0.28) minimumPenalty += (0.28 - metrics.directionBalance) * 250000;
        return metrics.wordCount * 100000 - minimumPenalty +
            metrics.crossingRate * 12000 + metrics.density * 7000 +
            metrics.directionBalance * 2500 + metrics.avgLen * (profile.preferLong ? 80 : 25) -
            Math.abs(metrics.rows - metrics.cols) * 20;
    }

    // ============================================================
    // Abschlussvalidator: rekonstruiert das Gitter und prüft alle
    // harten Invarianten (Konfliktfreiheit, keine parallele Berührung
    // bzw. Run-on, eine Komponente, eindeutige IDs, Hinweise vorhanden).
    // ============================================================
    function validatePuzzle(puzzle, entries) {
        var errors = [];
        if (!puzzle || typeof puzzle !== 'object') return { ok: false, errors: ['puzzle kein Objekt.'] };
        var placements = puzzle.placements;
        if (!Array.isArray(placements) || placements.length === 0) return { ok: false, errors: ['Keine Platzierungen.'] };
        if (placements.length > 64) errors.push('Zu viele Platzierungen.');
        if (puzzle.language !== 'de' && puzzle.language !== 'bar') errors.push('Ungültige Sprache.');
        if (!PROFILES[puzzle.difficulty]) errors.push('Ungültige Schwierigkeit.');

        var grid = Object.create(null);
        var coverage = Object.create(null); // {across:index|null,down:index|null}
        var usedIds = Object.create(null);
        var idToEntry = Object.create(null);
        var sourceEntries = [];
        if (entries) for (var ei = 0; ei < entries.length; ei++) idToEntry[entries[ei].id] = entries[ei];

        for (var i = 0; i < placements.length; i++) {
            var p = placements[i];
            var ctx = 'Platzierung #' + (i + 1);
            if (!p || typeof p !== 'object') { errors.push(ctx + ': kein Objekt.'); sourceEntries.push(null); continue; }
            if (typeof p.entryId !== 'string' || !p.entryId) errors.push(ctx + ': entryId fehlt.');
            else if (usedIds[p.entryId]) errors.push(ctx + ': doppelte entryId ' + p.entryId);
            else usedIds[p.entryId] = true;
            if (typeof p.clue !== 'string' || !p.clue.trim()) errors.push(ctx + ': clue fehlt/leer.');
            if (p.dir !== 'across' && p.dir !== 'down') errors.push(ctx + ': dir ungültig.');
            if (!Number.isInteger(p.row) || !Number.isInteger(p.col) || p.row < 0 || p.col < 0 || p.row > MAX_SPAN || p.col > MAX_SPAN) {
                errors.push(ctx + ': row/col außerhalb des Gitters.');
            }
            if (typeof p.gridAnswer !== 'string' || !p.gridAnswer) errors.push(ctx + ': gridAnswer fehlt.');
            var g = graphemes(p.gridAnswer);
            if (g.length < 2 || g.length > 14) errors.push(ctx + ': ungültige Antwortlänge.');
            for (var gi = 0; gi < g.length; gi++) if (!ALLOWED_LETTER.test(g[gi])) { errors.push(ctx + ': unerlaubtes Graphem.'); break; }

            var sourceEntry = entries && p.entryId ? idToEntry[p.entryId] : null;
            sourceEntries.push(sourceEntry || null);
            if (entries && p.entryId) {
                if (!sourceEntry) errors.push(ctx + ': entryId nicht in Datenbank.');
                else {
                    var expectedAnswer = sourceEntry.gridAnswer || normalizeGridAnswer(sourceEntry.displayAnswer);
                    if (sourceEntry.language !== puzzle.language) errors.push(ctx + ': Sprache passt nicht zum Rätsel.');
                    if (p.gridAnswer !== expectedAnswer) errors.push(ctx + ': gridAnswer passt nicht zur entryId.');
                    if (p.clue !== sourceEntry.clue) errors.push(ctx + ': clue passt nicht zur entryId.');
                    if (p.displayAnswer !== sourceEntry.displayAnswer) errors.push(ctx + ': displayAnswer passt nicht zur entryId.');
                    if (p.length !== graphemes(expectedAnswer).length) errors.push(ctx + ': length passt nicht zur entryId.');
                }
            }
            if (p.dir !== 'across' && p.dir !== 'down') continue;
            var dr = p.dir === 'across' ? 0 : 1, dc = p.dir === 'across' ? 1 : 0;
            for (var j = 0; j < g.length; j++) {
                var r = p.row + dr * j, c = p.col + dc * j, ky = key(r, c);
                if (r > MAX_SPAN || c > MAX_SPAN) errors.push(ctx + ': Wort ragt aus dem maximalen Gitter.');
                if (grid[ky] == null) grid[ky] = g[j];
                else if (grid[ky] !== g[j]) errors.push(ctx + ': Buchstabenkonflikt bei ' + ky + '.');
                if (!coverage[ky]) coverage[ky] = { across: null, down: null };
                if (coverage[ky][p.dir] != null) errors.push(ctx + ': gleichgerichtete Überlagerung bei ' + ky + '.');
                else coverage[ky][p.dir] = i;
            }
        }

        var cellKeys = Object.keys(grid);
        var suppliedCells = puzzle.cells && typeof puzzle.cells === 'object' ? Object.keys(puzzle.cells) : [];
        if (!puzzle.cells || typeof puzzle.cells !== 'object') errors.push('cells fehlt.');
        if (suppliedCells.length !== cellKeys.length) errors.push('cells enthält fehlende oder zusätzliche Zellen.');
        for (var cki = 0; cki < cellKeys.length; cki++) {
            var cky = cellKeys[cki];
            var cellEntry = puzzle.cells && puzzle.cells[cky];
            if (!cellEntry || typeof cellEntry.letter !== 'string') errors.push('Zelle ' + cky + ' fehlt in cells.');
            else {
                if (cellEntry.letter !== grid[cky]) errors.push('Zelle ' + cky + ': Buchstabe widerspricht gridAnswer.');
                if (cellEntry.across !== coverage[cky].across || cellEntry.down !== coverage[cky].down) errors.push('Zelle ' + cky + ': Richtungsbesitz ist inkonsistent.');
            }
        }

        // Adjazenzregel: benachbarte Buchstabenpaare brauchen dieselbe Platzierung.
        for (var ck in grid) {
            var parts = ck.split(',');
            var cr = +parts[0], cc = +parts[1];
            var neighbors = [[cr, cc + 1], [cr + 1, cc]];
            for (var ni = 0; ni < neighbors.length; ni++) {
                var nk = key(neighbors[ni][0], neighbors[ni][1]);
                if (grid[nk] == null) continue;
                var a = coverage[ck], b = coverage[nk];
                var shared = (a.across != null && a.across === b.across) || (a.down != null && a.down === b.down);
                if (!shared) errors.push('Benachbarte Zellen ' + ck + ' und ' + nk + ' ohne gemeinsames Wort.');
            }
        }

        // Zusammenhängend: genau eine 4-Komponente der Buchstabenzellen.
        if (cellKeys.length === 0) errors.push('Keine Buchstabenzellen.');
        else {
            var visited = Object.create(null), components = 0;
            for (var si = 0; si < cellKeys.length; si++) {
                if (visited[cellKeys[si]]) continue;
                components++;
                var stack = [cellKeys[si]];
                while (stack.length) {
                    var cur = stack.pop();
                    if (visited[cur]) continue;
                    visited[cur] = true;
                    var cp = cur.split(','), qr = +cp[0], qc = +cp[1];
                    var nbs = [[qr + 1, qc], [qr - 1, qc], [qr, qc + 1], [qr, qc - 1]];
                    for (var nb = 0; nb < 4; nb++) {
                        var nky = key(nbs[nb][0], nbs[nb][1]);
                        if (grid[nky] != null && !visited[nky]) stack.push(nky);
                    }
                }
            }
            if (components !== 1) errors.push(components + ' getrennte Komponenten statt einer.');
        }

        // Alle abgeleiteten Daten werden gegen eine kanonische Rekonstruktion geprüft.
        if (entries && sourceEntries.every(Boolean) && sourceEntries.length === placements.length) {
            var specs = placements.map(function (p, index) { return { entry: sourceEntries[index], row: p.row, col: p.col, dir: p.dir }; });
            var expected = buildPuzzle(specs, {
                seed: puzzle.seed, language: puzzle.language, difficulty: puzzle.difficulty,
                datasetVersion: puzzle.datasetVersion, generatorVersion: puzzle.generatorVersion
            });
            if (puzzle.rows !== expected.rows || puzzle.cols !== expected.cols) errors.push('rows/cols stimmen nicht mit den Platzierungen überein.');
            for (var pi = 0; pi < placements.length; pi++) {
                if (placements[pi].row !== expected.placements[pi].row || placements[pi].col !== expected.placements[pi].col ||
                    placements[pi].number !== expected.placements[pi].number) errors.push('Platzierung #' + (pi + 1) + ': Koordinaten/Nummer nicht kanonisch.');
            }
            if (JSON.stringify(puzzle.clues) !== JSON.stringify(expected.clues)) errors.push('Hinweislisten sind nicht kanonisch.');
        }

        return { ok: errors.length === 0, errors: errors };
    }

    // ============================================================
    // Kanonische Serialisierung (für Determinismus- und Varianztests)
    // ============================================================
    function canonicalizePuzzle(puzzle) {
        if (!puzzle || !puzzle.placements) return '';
        var list = puzzle.placements.map(function (p) {
            return p.entryId + ':' + p.row + ',' + p.col + ':' + p.dir;
        });
        list.sort();
        return puzzle.language + '|' + puzzle.difficulty + '|' + list.join('|');
    }

    // Defensives Laden eines gespeicherten Rätsels.
    function sanitizeSavedPuzzle(value, entries) {
        if (!value || typeof value !== 'object' || value.generatorVersion !== GENERATOR_VERSION) return null;
        try {
            var puzzle = {
                seed: value.seed, language: value.language, difficulty: value.difficulty,
                datasetVersion: value.datasetVersion, generatorVersion: value.generatorVersion,
                placements: Array.isArray(value.placements) ? value.placements : [],
                cells: value.cells, rows: value.rows, cols: value.cols, clues: value.clues
            };
            var v = validatePuzzle(puzzle, entries);
            if (!v.ok) return null;
            var byId = Object.create(null);
            for (var i = 0; i < entries.length; i++) byId[entries[i].id] = entries[i];
            var specs = puzzle.placements.map(function (p) { return { entry: byId[p.entryId], row: p.row, col: p.col, dir: p.dir }; });
            if (specs.some(function (s) { return !s.entry; })) return null;
            var rebuilt = buildPuzzle(specs, {
                seed: puzzle.seed, language: puzzle.language, difficulty: puzzle.difficulty,
                datasetVersion: puzzle.datasetVersion, generatorVersion: puzzle.generatorVersion
            });
            rebuilt.profile = puzzle.difficulty;
            rebuilt.metrics = computeMetrics(rebuilt);
            return rebuilt;
        } catch (_err) {
            return null;
        }
    }

    return Object.freeze({
        GENERATOR_VERSION: GENERATOR_VERSION,
        PROFILES: PROFILES,
        PROFILE_NAMES: PROFILE_NAMES,
        ALLOWED_LETTER: ALLOWED_LETTER,
        normalizeGridAnswer: normalizeGridAnswer,
        graphemes: graphemes,
        toUpperDe: toUpperDe,
        isGridLetter: isGridLetter,
        validateDataset: validateDataset,
        ensurePrepared: ensurePrepared,
        createPrng: createPrng,
        cyrb128: cyrb128,
        sfc32: sfc32,
        deriveAttemptSeed: deriveAttemptSeed,
        shuffle: shuffle,
        newState: newState,
        isLegalPlacement: isLegalPlacement,
        enumerateLegalPlacements: enumerateLegalPlacements,
        applyPlacement: applyPlacement,
        undoPlacement: undoPlacement,
        scorePlacement: scorePlacement,
        collectCandidates: collectCandidates,
        generateOneAttempt: generateOneAttempt,
        generatePuzzle: generatePuzzle,
        numberPlacements: numberPlacements,
        buildPuzzle: buildPuzzle,
        computeMetrics: computeMetrics,
        qualityScore: qualityScore,
        validatePuzzle: validatePuzzle,
        canonicalizePuzzle: canonicalizePuzzle,
        sanitizeSavedPuzzle: sanitizeSavedPuzzle
    });
});
