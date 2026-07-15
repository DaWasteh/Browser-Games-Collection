(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MaulkorbraupenLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const STORAGE_KEY = 'maulkorbraupen-save-v1';

  const SCENES = {
    intro: {
      id: 'intro', chapter: 1, label: 'Schichtende? Noch nicht!', title: 'Willkommen im Werk',
      image: 'assets/01-intro.webp', audio: 'audio/01-intro.mp3',
      alt: 'Maulkorbraupe vor dem Werk bei Sonnenuntergang', kind: 'continue', next: 'gas',
      objective: 'Finde die Fehler, hilf deinen Kollegen und rette den Feierabend.',
      hint: 'Noch ist alles ruhig. Genieße es – das hält nicht lange an.',
      narrative: [
        'Willkommen im Werk der Maulkorbraupen.',
        'Ein langer Arbeitstag neigt sich dem Ende zu. Die Gasflaschen sind gefüllt, die Analysen abgeschlossen und die Kollegen träumen bereits vom Feierabend.',
        'Doch heute läuft etwas nicht nach Plan. Mehrere Probleme sind aufgetreten, und solange sie nicht gelöst werden, bleibt das Feierabendtor verschlossen.',
        'Als erfahrene Arbeiterraupe liegt die Verantwortung nun bei dir. Finde die Fehler. Hilf deinen Kollegen. Löse die Rätsel.',
        'Denn Maulkorb verbindet.'
      ]
    },
    gas: {
      id: 'gas', chapter: 2, label: 'Das verschwundene Prüfgas', title: 'Alarm im Lager',
      image: 'assets/02-pruefgas.webp', audio: 'audio/02-pruefgas.mp3',
      alt: 'Maulkorbraupen durchsuchen ein Lager nach einer Prüfgasflasche', kind: 'choice', next: 'valves',
      objective: 'Durchsuche das Lager und finde die verschwundene Prüfgasflasche.',
      hint: 'Nicht alles ist dort, wo es hingehört. Auf dem Bild trägt ein Bereich das Wort „Reserve“.',
      success: 'Hinter den Reserveflaschen findest du das Prüfgas. Fundziffer 7 notiert!',
      reward: { item: 'Prüfgasflasche', token: ['gas', '7'] },
      narrative: [
        'Die letzte Stunde der Spätschicht hat begonnen. Noch ein paar Kontrollen, dann könnten die Maulkorbraupen endlich Feierabend machen.',
        'Doch die Prüfflasche für die Endkontrolle ist verschwunden. Ohne Prüfgas keine Prüfung. Ohne Prüfung keine Freigabe. Und ohne Freigabe … kein Feierabend.',
        'Die Staplerraupe hat nichts gesehen. Die Ventilraupe schwört, die Flasche sei heute Morgen noch da gewesen. Die Dokumentationsraupe hat selbstverständlich alles ordnungsgemäß dokumentiert. Wahrscheinlich.',
        'Du setzt deinen Sicherheitsmaulkorb gerade und schnappst dir die Taschenlampe. Die Zukunft des Feierabends liegt in deinen Fühlern.'
      ],
      choices: [
        { id: 'shelf', text: 'Das normale Gasregal prüfen', feedback: 'Viele Flaschen, viele Etiketten – aber kein Prüfgas.' },
        { id: 'toolbox', text: 'Die Werkzeugkiste ausräumen', feedback: 'Schraubenschlüssel, Dichtungen und eine sehr alte Brotbox. Kein Prüfgas.' },
        { id: 'desk', text: 'Den Schreibtisch durchsuchen', feedback: 'Du findest drei Prüfprotokolle und eine kalte Kaffeetasse.' },
        { id: 'reserve', text: 'Im Reserve-Schrank nachsehen', correct: true }
      ]
    },
    valves: {
      id: 'valves', chapter: 3, label: 'Die Ventil-Verwirrung', title: 'Fluss in Gefahr',
      image: 'assets/03-ventile.webp', audio: 'audio/03-ventile.mp3',
      alt: 'Fünf farbige Ventile in einer industriellen Rohrleitung', kind: 'choice', next: 'meter',
      objective: 'Wähle die sichere Reihenfolge der fünf Ventile.',
      hint: 'Die Tafeln über den Ventilen verraten eine natürliche Reihenfolge von 1 bis 5.',
      success: 'Die Ventile greifen sauber ineinander. Ventilziffer 2 notiert!',
      reward: { item: 'Ventil-Freigabe', token: ['valves', '2'] },
      narrative: [
        'Das Prüfgas wurde gefunden, doch aus der Füllstation ertönt ein Alarm. Kein Druck. Kein Durchfluss. Keine Freigabe.',
        'Jemand hat die Ventile verstellt. Oder schlimmer: Jemand hat die Anleitung gelesen und trotzdem die falsche Reihenfolge gewählt.',
        'Die Ventilraupe kratzt sich ratlos am Maulkorb. Die Messraupe widerspricht, und die Sicherheitsraupe möchte am liebsten alles gleichzeitig schließen.',
        'Analysiere die Hinweise und stelle den Gasfluss wieder her. Druck, Durchfluss und Vernunft müssen zusammenarbeiten.'
      ],
      choices: [
        { id: 'v1', text: 'N₂ → O₂ → Ar → CO₂ → H₂', correct: true },
        { id: 'v2', text: 'H₂ → CO₂ → Ar → O₂ → N₂', feedback: 'Der Druck fällt sofort ab. Wasserstoff war deutlich zu voreilig.' },
        { id: 'v3', text: 'O₂ → N₂ → H₂ → Ar → CO₂', feedback: 'Ein Ventil quietscht empört. Diese Reihenfolge ist nicht stabil.' },
        { id: 'v4', text: 'Ar → CO₂ → N₂ → H₂ → O₂', feedback: 'Die Füllstation bleibt stumm. Noch einmal genau auf die Tafeln schauen.' }
      ]
    },
    meter: {
      id: 'meter', chapter: 4, label: 'Der störrische Gasmesser', title: 'Messwert außer Kontrolle',
      image: 'assets/04-gasmesser.webp', audio: 'audio/04-gasmesser.mp3',
      alt: 'Maulkorbraupen beraten vor einem großen Gasmesser', kind: 'choice', next: 'chaos',
      objective: 'Finde den Messwert, der bei einem Sollwert von 100 Normkubikmetern pro Stunde unplausibel ist.',
      hint: '99 und 101 liegen jeweils nur einen Punkt vom Sollwert 100 entfernt.',
      success: '147 ist der Übertragungsfehler. Aus dem Sollwert 100 wird die Druckziffer 1 notiert!',
      reward: { item: 'Geprüfte Messwerte', token: ['pressure', '1'] },
      narrative: [
        'Geschafft. Die Ventile stehen richtig und der Gasfluss läuft. Ruhe kehrt ein – für ungefähr zwölf Sekunden.',
        'Dann meldet sich die Messraupe. Ein Blick auf den Gasmesser genügt: Zwei Werte liegen nahe am Sollwert, doch ein dritter tanzt völlig aus der Reihe.',
        'Die Dokumentationsraupe möchte neu messen. Die Sicherheitsraupe möchte alles sperren. Die Statistikraupe beginnt zum Spaß Mittelwerte zu berechnen.',
        'Prüfe die Werte genau. Wer blind jedem Messwert glaubt, verbringt den Feierabend im Kalibrierraum.'
      ],
      choices: [
        { id: '99', text: 'Messung A: 99 Nm³/h', feedback: '99 liegt plausibel nahe am Sollwert 100.' },
        { id: '101', text: 'Messung B: 101 Nm³/h', feedback: '101 ist nur eine kleine und plausible Abweichung.' },
        { id: '147', text: 'Messung C: 147 Nm³/h', correct: true },
        { id: '100', text: 'Der Sollwert 100 Nm³/h', feedback: 'Der Sollwert ist die Referenz, nicht der Fehler.' }
      ]
    },
    chaos: {
      id: 'chaos', chapter: 5, label: 'Zwischenszene', title: 'Das Chaoslabor',
      image: 'assets/05-chaoslabor.webp', audio: 'audio/05-chaoslabor.mp3',
      alt: 'Chaotisches Labor mit verstreuten Unterlagen und ratlosen Maulkorbraupen', kind: 'continue', next: 'lab',
      objective: 'Bewahre die Ruhe und verschaffe dir einen Überblick.',
      hint: 'Ordnung ist nur Chaos mit einem guten Protokoll.',
      narrative: [
        'Der Messfehler ist gefunden. Der Gasmesser war nicht defekt – jemand hatte lediglich einen Wert falsch übertragen.',
        'Doch im Labor wartet bereits das nächste Problem. Überall liegen Unterlagen, Proben stehen durcheinander und Chromatogramme segeln durch den Raum.',
        'Die Laborraupe ruft: „Das war doch eben noch hier!“ Eine Archivraupe antwortet aus einem Papierstapel: „Wo ist was?“',
        'Ohne die richtigen Analysen gibt es keine Qualitätsfreigabe. Zeit, Ordnung in das Chaos zu bringen.'
      ]
    },
    lab: {
      id: 'lab', chapter: 5, label: 'Das Labor der verlorenen Analysen', title: 'Vier Proben, vier Ergebnisse',
      image: 'assets/06-analysen.webp', audio: 'audio/06-analysen.mp3',
      alt: 'Labor mit vier Proben und verstreuten Chromatogrammen', kind: 'lab', next: 'gate',
      objective: 'Ordne jeder Probe das richtige Analyseergebnis zu. Jedes Ergebnis darf nur einmal vorkommen.',
      hint: 'Die Probenübersicht nennt die Stoffe. Typische Luft enthält 78,1 % N₂, 20,9 % O₂, 0,9 % Ar und 0,1 % CO₂.',
      success: 'Alle vier Zuordnungen stimmen. Analysenziffer 9 notiert!',
      reward: { item: 'Vollständige Analysen', token: ['analyses', '9'] },
      narrative: [
        'Die Proben wurden analysiert, doch niemand weiß mehr, welches Ergebnis zu welcher Probe gehört.',
        'Probe A enthält Stickstoff, Probe B Sauerstoff, Probe C Argon und Probe D Kohlendioxid. Die vier Ergebnisblätter zeigen 78,1 %, 20,9 %, 0,9 % und 0,1 %.',
        'Chromatogramme, Notizen und Messwerte erzählen dieselbe Geschichte – aber nicht in der richtigen Reihenfolge.',
        'Ordne jede Analyse der richtigen Probe zu und bringe die Qualitätsfreigabe zurück.'
      ],
      labRows: [
        { id: 'A', label: 'Probe A – Stickstoff (N₂)' },
        { id: 'B', label: 'Probe B – Sauerstoff (O₂)' },
        { id: 'C', label: 'Probe C – Argon (Ar)' },
        { id: 'D', label: 'Probe D – Kohlendioxid (CO₂)' }
      ],
      labOptions: ['78,1 %', '20,9 %', '0,9 %', '0,1 %'],
      answer: { A: '78,1 %', B: '20,9 %', C: '0,9 %', D: '0,1 %' }
    },
    gate: {
      id: 'gate', chapter: 6, label: 'Zwischenszene', title: 'Das verschlossene Feierabendtor',
      image: 'assets/07-tor-verschlossen.webp', audio: 'audio/07-tor-verschlossen.mp3',
      alt: 'Enttäuschte Maulkorbraupen vor dem verschlossenen Feierabendtor', kind: 'continue', next: 'code',
      objective: 'Nimm deine vier Freigabeziffern mit zum Terminal.',
      hint: 'Dein Schichtprotokoll enthält bereits alles, was du brauchst.',
      narrative: [
        'Unglaublich. Die Analysen sind vollständig, die Dokumentation stimmt und die Qualitätsfreigabe wurde erteilt.',
        'Die Kollegen jubeln bereits vor dem großen Tor. Doch als du den Öffnungsknopf drückst, leuchtet eine rote Anzeige auf.',
        'Feierabendfreigabe unvollständig. Letztes Hindernis erkannt.',
        'Ein kollektives Stöhnen geht durch die Belegschaft. Vor dem Tor wartet ein altes Codesystem – und es akzeptiert nur die Ergebnisse dieses langen Arbeitstages.'
      ]
    },
    code: {
      id: 'code', chapter: 6, label: 'Der Weg zum Feierabendtor', title: 'Der letzte Freigabecode',
      image: 'assets/08-feierabendtor.webp', audio: 'audio/08-feierabendtor.mp3',
      alt: 'Maulkorbraupen vor einem Terminal am verschlossenen Feierabendtor', kind: 'code', next: 'finale',
      objective: 'Gib den vierstelligen Code in der Reihenfolge Ventile, Druck, Prüfgas, Analysen ein.',
      hint: 'Lies die Ziffern im Schichtprotokoll: Ventile → Druck → Prüfgas → Analysen.',
      success: '2–1–7–9. Die grünen Lampen leuchten. Feierabendfreigabe bestätigt!',
      reward: { item: 'Geöffnetes Feierabendtor', token: ['code', '2179'] },
      narrative: [
        'Prüfgas gefunden. Ventile korrigiert. Messwerte geprüft. Analysen zugeordnet. Alle Aufgaben der Schicht sind erledigt – und doch bleibt das Tor zu.',
        'Der Code besteht nicht aus neuen Informationen. Die Lösung wurde während deiner Reise gesammelt.',
        'Setze die Ventilziffer, die Druckziffer, die Prüfgasziffer und die Analysenziffer zusammen.',
        'Ein letzter Code. Ein letztes Rätsel. Ein letztes Mal: Maulkorb verbindet.'
      ],
      answer: '2179'
    },
    finale: {
      id: 'finale', chapter: 7, label: 'Der Raucherplatz der Helden', title: 'Feierabend erreicht',
      image: 'assets/09-finale.webp', audio: 'audio/09-finale.mp3',
      alt: 'Maulkorbraupen feiern gemeinsam am Raucherplatz bei Sonnenuntergang', kind: 'continue', next: 'epilogue',
      objective: 'Genieße deinen wohlverdienten Feierabend.',
      hint: 'Heute gibt es nichts mehr zu lösen. Wirklich.',
      narrative: [
        'Der Code wird eingegeben. Einen Moment lang passiert nichts. Die Maulkorbraupen halten den Atem an. Dann klicken die Schlösser, und die grünen Lampen beginnen zu leuchten.',
        'Feierabendfreigabe bestätigt. Das Tor öffnet sich – langsam, majestätisch und mit dem schönsten Geräusch, das eine Arbeiterraupe nach einer langen Schicht hören kann.',
        'Keine Warnungen. Keine Fehlermeldungen. Keine offenen Punkte. Nur Feierabend.',
        'Gemeinsam ziehen die Maulkorbraupen zum Raucherplatz der Helden. Hier werden Geschichten erzählt, über verrückte Messwerte gelacht und neue Ablagesysteme für die Dokumentationsraupe beschlossen.',
        'Du hast allen den Feierabend gerettet. Heute warst du mehr als eine Arbeiterraupe. Heute warst du ein Held.',
        'Maulkorb verbindet. Im Werk. Im Team. Im Feierabend.'
      ]
    },
    epilogue: {
      id: 'epilogue', chapter: 7, label: 'Epilog', title: 'Der nächste Morgen',
      image: 'assets/10-epilog.webp', audio: 'audio/10-epilog.mp3',
      alt: 'Maulkorbraupe kehrt am nächsten Morgen als Mitarbeiterraupe des Tages ins Werk zurück', kind: 'end',
      objective: 'Schicht abgeschlossen. Du kannst jederzeit eine neue Runde beginnen.',
      hint: 'Im Hintergrund blinkt schon wieder eine Warnlampe …',
      narrative: [
        'Die Sonne geht auf. Der nächste Schichtwechsel beginnt, und ein neuer Arbeitstag wartet im Werk.',
        'Am Eingang hängt nun dein Bild: Mitarbeiterraupe des Tages – Held des Feierabends.',
        'Ein Kollege lächelt und sagt: „Heute wird bestimmt ruhiger.“ Im Hintergrund beginnt bereits eine Warnlampe zu blinken.',
        'Kurze Pause. „Das haben wir gestern auch gesagt.“',
        'Jeder Tag eine neue Challenge. Jeder Feierabend ein kleiner Sieg. Maulkorb verbindet.'
      ]
    }
  };

  const CHAPTERS = [
    'Schichtende? Noch nicht!', 'Das verschwundene Prüfgas', 'Die Ventil-Verwirrung',
    'Der störrische Gasmesser', 'Das Labor der verlorenen Analysen',
    'Der Weg zum Feierabendtor', 'Der Raucherplatz der Helden'
  ];

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  deepFreeze(SCENES);
  deepFreeze(CHAPTERS);

  function createState() {
    return {
      version: VERSION,
      sceneId: 'intro',
      solved: [],
      inventory: [],
      tokens: {},
      attempts: {},
      hintsUsed: [],
      startedAt: Date.now()
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function isSolved(state, sceneId) {
    return state.solved.includes(sceneId);
  }

  function markSolved(next, scene) {
    if (!next.solved.includes(scene.id)) next.solved.push(scene.id);
    if (scene.reward) {
      if (!next.inventory.includes(scene.reward.item)) next.inventory.push(scene.reward.item);
      next.tokens[scene.reward.token[0]] = scene.reward.token[1];
    }
  }

  function recordAttempt(next, sceneId) {
    next.attempts[sceneId] = (next.attempts[sceneId] || 0) + 1;
  }

  function submitChoice(state, choiceId) {
    const scene = SCENES[state.sceneId];
    if (!scene || scene.kind !== 'choice') return { state: cloneState(state), correct: false, message: 'Hier gibt es nichts auszuwählen.' };
    const choice = scene.choices.find((item) => item.id === choiceId);
    if (!choice) return { state: cloneState(state), correct: false, message: 'Unbekannte Auswahl.' };
    const next = cloneState(state);
    recordAttempt(next, scene.id);
    if (choice.correct) {
      markSolved(next, scene);
      return { state: next, correct: true, message: scene.success };
    }
    return { state: next, correct: false, message: choice.feedback };
  }

  function submitLab(state, mapping) {
    const scene = SCENES[state.sceneId];
    if (!scene || scene.kind !== 'lab') return { state: cloneState(state), correct: false, message: 'Hier gibt es keine Analysen.' };
    const next = cloneState(state);
    recordAttempt(next, scene.id);
    const values = Object.values(mapping || {});
    if (values.length !== scene.labRows.length || new Set(values).size !== values.length) {
      return { state: next, correct: false, message: 'Jedes Ergebnis muss genau einmal zugeordnet werden.' };
    }
    const correct = scene.labRows.every((row) => mapping[row.id] === scene.answer[row.id]);
    if (!correct) return { state: next, correct: false, message: 'Mindestens eine Zuordnung stimmt noch nicht. Prüfe Stoffe und Prozentwerte.' };
    markSolved(next, scene);
    return { state: next, correct: true, message: scene.success };
  }

  function submitCode(state, code) {
    const scene = SCENES[state.sceneId];
    if (!scene || scene.kind !== 'code') return { state: cloneState(state), correct: false, message: 'Hier gibt es kein Codefeld.' };
    const next = cloneState(state);
    recordAttempt(next, scene.id);
    if (String(code) !== scene.answer) return { state: next, correct: false, message: 'Der Code wird rot abgelehnt. Prüfe Reihenfolge und Schichtprotokoll.' };
    markSolved(next, scene);
    return { state: next, correct: true, message: scene.success };
  }

  function advance(state) {
    const scene = SCENES[state.sceneId];
    if (!scene || !scene.next) return cloneState(state);
    if (['choice', 'lab', 'code'].includes(scene.kind) && !isSolved(state, scene.id)) return cloneState(state);
    const next = cloneState(state);
    if (scene.kind === 'continue' && !next.solved.includes(scene.id)) next.solved.push(scene.id);
    next.sceneId = scene.next;
    return next;
  }

  function useHint(state) {
    const next = cloneState(state);
    if (!next.hintsUsed.includes(next.sceneId)) next.hintsUsed.push(next.sceneId);
    return next;
  }

  function restoreState(candidate) {
    if (!candidate || candidate.version !== VERSION || !SCENES[candidate.sceneId]) return createState();
    const clean = createState();
    clean.sceneId = candidate.sceneId;
    clean.solved = Array.isArray(candidate.solved) ? candidate.solved.filter((id) => SCENES[id]) : [];
    clean.inventory = Array.isArray(candidate.inventory) ? candidate.inventory.filter((item) => typeof item === 'string') : [];
    clean.tokens = candidate.tokens && typeof candidate.tokens === 'object' ? { ...candidate.tokens } : {};
    clean.attempts = candidate.attempts && typeof candidate.attempts === 'object' ? { ...candidate.attempts } : {};
    clean.hintsUsed = Array.isArray(candidate.hintsUsed) ? candidate.hintsUsed.filter((id) => SCENES[id]) : [];
    clean.startedAt = Number.isFinite(candidate.startedAt) ? candidate.startedAt : Date.now();
    return clean;
  }

  function progress(state) {
    const scene = SCENES[state.sceneId] || SCENES.intro;
    const solvedPuzzles = ['gas', 'valves', 'meter', 'lab', 'code'].filter((id) => isSolved(state, id)).length;
    return {
      chapter: scene.chapter,
      percent: scene.id === 'epilogue' ? 100 : Math.round((solvedPuzzles / 5) * 100),
      solvedPuzzles
    };
  }

  return deepFreeze({
    VERSION, STORAGE_KEY, SCENES, CHAPTERS,
    createState, restoreState, isSolved, submitChoice, submitLab, submitCode, advance, useHint, progress
  });
});
