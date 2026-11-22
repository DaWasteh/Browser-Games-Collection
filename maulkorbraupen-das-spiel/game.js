(function () {
  'use strict';

  const logic = window.MaulkorbraupenLogic;
  if (!logic) throw new Error('MaulkorbraupenLogic is required');

  const elements = {
    image: document.getElementById('scene-image'),
    chip: document.getElementById('scene-chip'),
    kicker: document.getElementById('scene-kicker'),
    title: document.getElementById('scene-title'),
    story: document.getElementById('story-text'),
    objective: document.getElementById('objective-text'),
    puzzle: document.getElementById('puzzle-area'),
    status: document.getElementById('game-status'),
    hint: document.getElementById('hint-button'),
    continue: document.getElementById('continue-button'),
    inventory: document.getElementById('inventory-list'),
    progressLabel: document.getElementById('progress-label'),
    progressPercent: document.getElementById('progress-percent'),
    progressBar: document.getElementById('progress-bar'),
    mapButton: document.getElementById('map-button'),
    mapDialog: document.getElementById('map-dialog'),
    mapClose: document.getElementById('map-close'),
    chapterList: document.getElementById('chapter-list'),
    audioButton: document.getElementById('audio-button'),
    resetButton: document.getElementById('reset-button'),
    resetDialog: document.getElementById('reset-dialog'),
    resetClose: document.getElementById('reset-close'),
    resetCancel: document.getElementById('reset-cancel'),
    resetConfirm: document.getElementById('reset-confirm')
  };

  const STATS_KEY = 'maulkorbraupen-stats-v1';
  const audio = new Audio();
  audio.preload = 'metadata';
  let state = loadState();
  let stats = loadStats();
  let cachedVoices = [];
  let message = '';
  let messageType = '';
  let autoNarrate = false;
  let fallbackSpeaking = false;
  let narrationToken = 0;
  let narrationTimer = null;
  let narrationSceneId = null;

  function defaultStats() {
    return { completions: 0, bestTimeSec: null, bestAttempts: null, bestScore: 0, lastRecordedStart: null, lastRun: null };
  }

  function loadStats() {
    try {
      const raw = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return defaultStats();
      const numOrNull = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
      return {
        completions: Number.isFinite(raw.completions) && raw.completions >= 0 ? Math.floor(raw.completions) : 0,
        bestTimeSec: numOrNull(raw.bestTimeSec),
        bestAttempts: numOrNull(raw.bestAttempts),
        bestScore: Number.isFinite(raw.bestScore) && raw.bestScore >= 0 ? Math.floor(raw.bestScore) : 0,
        lastRecordedStart: Number.isFinite(raw.lastRecordedStart) ? raw.lastRecordedStart : null,
        lastRun: raw.lastRun && typeof raw.lastRun === 'object' ? raw.lastRun : null
      };
    } catch (_) {
      return defaultStats();
    }
  }

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (_) {
      // Storage is optional.
    }
  }

  function formatDuration(sec) {
    const total = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function computeShiftMetrics() {
    const timeSec = Math.max(1, Math.round((Date.now() - (state.startedAt || Date.now())) / 1000));
    const attempts = Object.values(state.attempts || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
    const hints = Array.isArray(state.hintsUsed) ? state.hintsUsed.length : 0;
    const score = Math.max(200, 2000 - Math.max(0, attempts - 5) * 120 - hints * 150 - Math.min(600, Math.floor(timeSec / 2)));
    return { timeSec, attempts, hints, score };
  }

  function ensureShiftRecorded() {
    if (stats.lastRecordedStart === state.startedAt && stats.lastRun) return stats.lastRun;
    const run = computeShiftMetrics();
    stats.completions += 1;
    if (stats.bestTimeSec === null || run.timeSec < stats.bestTimeSec) stats.bestTimeSec = run.timeSec;
    if (stats.bestAttempts === null || run.attempts < stats.bestAttempts) stats.bestAttempts = run.attempts;
    if (run.score > stats.bestScore) stats.bestScore = run.score;
    stats.lastRecordedStart = state.startedAt;
    stats.lastRun = run;
    saveStats();
    if (window.GameScores) {
      window.GameScores.record('maulkorbraupen-das-spiel', {
        score: run.score,
        timeSec: run.timeSec,
        won: true,
        label: `Bestzeit ${formatDuration(stats.bestTimeSec)} · ${stats.completions}× gelöst`,
        meta: { completions: stats.completions, bestAttempts: stats.bestAttempts, hints: run.hints }
      });
    }
    return run;
  }

  function syncSharedScores() {
    if (!window.GameScores || stats.completions <= 0) return;
    window.GameScores.sync('maulkorbraupen-das-spiel', {
      score: stats.bestScore,
      timeSec: stats.bestTimeSec !== null ? stats.bestTimeSec : undefined,
      label: `Bestzeit ${formatDuration(stats.bestTimeSec)} · ${stats.completions}× gelöst`,
      meta: { completions: stats.completions, bestAttempts: stats.bestAttempts }
    });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(logic.STORAGE_KEY);
      return logic.restoreState(raw ? JSON.parse(raw) : null);
    } catch (_) {
      return logic.createState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(logic.STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // The game remains fully playable when storage is unavailable.
    }
  }

  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function make(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function currentScene() {
    return logic.SCENES[state.sceneId];
  }

  function sfx(name) { if (window.GameAudio) window.GameAudio.play(name); }

  function setMessage(text, type) {
    message = text;
    messageType = type || '';
    elements.status.textContent = message;
    elements.status.dataset.type = messageType;
    if (type === 'success') { sfx('success'); if (window.GameFX) window.GameFX.pulse(elements.status); }
    else if (type === 'error') { sfx('error'); if (window.GameFX) window.GameFX.shake(elements.status); }
    else if (type === 'hint') sfx('hint');
  }

  let celebratedEnd = false;

  function renderStory(scene) {
    elements.image.src = scene.image;
    elements.image.alt = scene.alt;
    elements.chip.textContent = scene.label === 'Zwischenszene' ? scene.label : `Kapitel ${scene.chapter}`;
    elements.kicker.textContent = scene.label;
    elements.title.textContent = scene.title;
    elements.objective.textContent = scene.objective;
    clear(elements.story);
    scene.narrative.forEach((paragraph) => elements.story.appendChild(make('p', paragraph)));
  }

  function renderChoices(scene) {
    const solved = logic.isSolved(state, scene.id);
    const group = make('div', undefined, 'choice-list');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', scene.objective);
    scene.choices.forEach((choice) => {
      const isSolvedChoice = solved && choice.correct;
      const button = make('button', isSolvedChoice ? `${choice.text} ✓` : choice.text, isSolvedChoice ? 'choice-button is-correct' : 'choice-button');
      button.type = 'button';
      button.dataset.choice = choice.id;
      if (isSolvedChoice) button.setAttribute('aria-pressed', 'true');
      button.disabled = solved;
      button.addEventListener('click', () => {
        const result = logic.submitChoice(state, choice.id);
        state = result.state;
        saveState();
        setMessage(result.message, result.correct ? 'success' : 'error');
        renderControls(scene);
        renderInventory();
        renderProgress();
        if (result.correct) renderPuzzle(scene);
      });
      group.appendChild(button);
    });
    elements.puzzle.appendChild(group);
  }

  function renderLab(scene) {
    const solved = logic.isSolved(state, scene.id);
    const form = make('form', undefined, 'lab-form');
    const fieldset = document.createElement('fieldset');
    fieldset.appendChild(make('legend', 'Analyseergebnisse zuordnen'));

    scene.labRows.forEach((row) => {
      const wrapper = make('div', undefined, 'lab-row');
      const label = make('label', row.label);
      const select = document.createElement('select');
      select.name = row.id;
      select.id = `probe-${row.id}`;
      select.required = true;
      label.htmlFor = select.id;
      const placeholder = make('option', 'Ergebnis wählen …');
      placeholder.value = '';
      select.appendChild(placeholder);
      scene.labOptions.forEach((option) => {
        const optionNode = make('option', option);
        optionNode.value = option;
        select.appendChild(optionNode);
      });
      if (solved && scene.answer && scene.answer[row.id]) {
        select.value = scene.answer[row.id];
      }
      select.disabled = solved;
      wrapper.append(label, select);
      fieldset.appendChild(wrapper);
    });

    const submit = make('button', solved ? 'Analysen freigegeben ✓' : 'Zuordnung prüfen', 'puzzle-submit');
    submit.type = 'submit';
    submit.disabled = solved;
    fieldset.appendChild(submit);
    form.appendChild(fieldset);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const mapping = Object.fromEntries(scene.labRows.map((row) => [row.id, data.get(row.id)]));
      const result = logic.submitLab(state, mapping);
      state = result.state;
      saveState();
      setMessage(result.message, result.correct ? 'success' : 'error');
      renderControls(scene);
      renderInventory();
      renderProgress();
      if (result.correct) renderPuzzle(scene);
    });
    elements.puzzle.appendChild(form);
  }

  function renderCode(scene) {
    const solved = logic.isSolved(state, scene.id);
    const form = make('form', undefined, 'code-form');
    const label = make('label', 'Vierstelliger Feierabendcode');
    label.htmlFor = 'final-code';
    const input = document.createElement('input');
    input.id = 'final-code';
    input.name = 'code';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 12;
    input.autocomplete = 'off';
    input.placeholder = '••••';
    input.required = true;
    if (solved) input.value = scene.answer;
    input.disabled = solved;
    input.setAttribute('aria-describedby', 'code-order');
    const order = make('p', 'Reihenfolge: Ventile · Druck · Prüfgas · Analysen', 'code-order');
    order.id = 'code-order';
    const submit = make('button', solved ? 'Tor geöffnet ✓' : 'Code bestätigen', 'puzzle-submit');
    submit.type = 'submit';
    submit.disabled = solved;
    form.append(label, input, order, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = logic.submitCode(state, input.value);
      state = result.state;
      saveState();
      setMessage(result.message, result.correct ? 'success' : 'error');
      renderControls(scene);
      renderInventory();
      renderProgress();
      if (result.correct) renderPuzzle(scene);
    });
    elements.puzzle.appendChild(form);
  }

  function renderShiftSummary() {
    const run = ensureShiftRecorded();
    const box = make('section', undefined, 'shift-summary');
    box.setAttribute('aria-label', 'Schicht-Auswertung');
    box.appendChild(make('h3', 'Schicht-Auswertung'));
    const grid = make('div', undefined, 'shift-summary-grid');
    const items = [
      ['Schichtdauer', formatDuration(run.timeSec)],
      ['Versuche', String(run.attempts)],
      ['Hinweise', String(run.hints)],
      ['Wertung', run.score.toLocaleString('de-DE')],
      ['Bestzeit', stats.bestTimeSec !== null ? formatDuration(stats.bestTimeSec) : formatDuration(run.timeSec)],
      ['Schichten', String(stats.completions)]
    ];
    items.forEach(([label, val]) => {
      const cell = make('div', undefined, 'summary-cell');
      cell.append(make('span', label), make('strong', val));
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    elements.puzzle.appendChild(box);
  }

  function renderPuzzle(scene) {
    clear(elements.puzzle);
    if (scene.kind === 'choice') renderChoices(scene);
    if (scene.kind === 'lab') renderLab(scene);
    if (scene.kind === 'code') renderCode(scene);
    if (scene.id === 'finale' || scene.id === 'epilogue') renderShiftSummary();
  }

  function renderControls(scene) {
    const puzzleSolved = logic.isSolved(state, scene.id);
    const canContinue = scene.kind === 'continue' || puzzleSolved;
    elements.continue.hidden = !canContinue && scene.kind !== 'end';
    elements.hint.hidden = scene.kind === 'end';

    if (scene.kind === 'end') {
      elements.continue.hidden = false;
      elements.continue.textContent = 'Neue Schicht starten ↻';
      if (!celebratedEnd) {
        celebratedEnd = true;
        sfx('fanfare');
        if (window.GameFX) window.GameFX.celebrate({ count: 70 });
      }
    } else if (scene.id === 'intro') {
      celebratedEnd = false;
      elements.continue.textContent = 'Schicht beginnen →';
    } else if (scene.id === 'finale') {
      elements.continue.textContent = 'Epilog ansehen →';
    } else {
      elements.continue.textContent = 'Weiter zur nächsten Station →';
    }
  }

  function renderInventory() {
    clear(elements.inventory);
    if (!state.inventory.length) {
      elements.inventory.appendChild(make('li', 'Noch keine Freigaben gesammelt.', 'empty-item'));
      return;
    }

    const tokenLabels = {
      'Prüfgasflasche': ['Prüfgas', state.tokens.gas],
      'Ventil-Freigabe': ['Ventile', state.tokens.valves],
      'Geprüfte Messwerte': ['Druck', state.tokens.pressure],
      'Vollständige Analysen': ['Analysen', state.tokens.analyses],
      'Geöffnetes Feierabendtor': ['Tor', '✓']
    };
    state.inventory.forEach((item) => {
      const data = tokenLabels[item] || [item, '✓'];
      const entry = make('li');
      entry.append(make('span', data[0]), make('strong', data[1] || '✓'));
      elements.inventory.appendChild(entry);
    });
  }

  function renderProgress() {
    const progress = logic.progress(state);
    elements.progressLabel.textContent = `Kapitel ${progress.chapter} von 7`;
    elements.progressPercent.textContent = `${progress.percent} %`;
    elements.progressBar.style.width = `${progress.percent}%`;
  }

  function renderChapterList() {
    clear(elements.chapterList);
    const currentChapter = currentScene().chapter;
    logic.CHAPTERS.forEach((title, index) => {
      const chapter = index + 1;
      const item = make('li');
      if (chapter < currentChapter || state.sceneId === 'epilogue') item.classList.add('completed');
      if (chapter === currentChapter && state.sceneId !== 'epilogue') {
        item.classList.add('current');
        item.setAttribute('aria-current', 'step');
      }
      item.append(make('span', chapter < currentChapter || state.sceneId === 'epilogue' ? '✓' : String(chapter)), make('span', title));
      elements.chapterList.appendChild(item);
    });
  }

  function stopNarration() {
    narrationToken += 1;
    if (narrationTimer !== null) {
      window.clearTimeout(narrationTimer);
      narrationTimer = null;
    }
    narrationSceneId = null;
    audio.pause();
    if (audio.readyState > 0) {
      try { audio.currentTime = 0; } catch (_) { /* optional */ }
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    fallbackSpeaking = false;
  }

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    cachedVoices = window.speechSynthesis.getVoices() || [];
  }
  if ('speechSynthesis' in window) {
    refreshVoices();
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    }
  }

  function pickGermanVoice() {
    if (!('speechSynthesis' in window)) return null;
    const all = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
    const voices = all.filter((voice) => voice.lang.toLowerCase().startsWith('de'));
    return voices.find((voice) => /conrad|male|stefan|markus/i.test(voice.name)) || voices[0] || null;
  }

  function speakFallback(scene, token) {
    if (token !== narrationToken || !autoNarrate || currentScene().id !== scene.id) return;
    if (!('speechSynthesis' in window)) {
      setMessage('Auf diesem Gerät ist leider keine Sprachausgabe verfügbar.', 'error');
      autoNarrate = false;
      updateAudioButton();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(scene.narrative.join(' '));
    utterance.lang = 'de-DE';
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.voice = pickGermanVoice();
    const finishSpeech = () => {
      fallbackSpeaking = false;
      if (token === narrationToken) {
        autoNarrate = false;
        updateAudioButton();
      }
    };
    utterance.onend = finishSpeech;
    utterance.onerror = finishSpeech;
    fallbackSpeaking = true;
    window.speechSynthesis.speak(utterance);
  }

  function playNarration(scene) {
    stopNarration();
    const token = narrationToken;
    narrationSceneId = scene.id;
    audio.src = scene.audio;
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        if (token === narrationToken && !fallbackSpeaking) speakFallback(scene, token);
      });
    }
  }

  function updateAudioButton() {
    elements.audioButton.setAttribute('aria-pressed', String(autoNarrate));
    elements.audioButton.classList.toggle('active', autoNarrate);
    const label = elements.audioButton.querySelector('span');
    label.textContent = autoNarrate ? 'Stopp' : 'Vorlesen';
  }

  function render(options) {
    const scene = currentScene();
    const shouldFocus = options && options.focus;
    stopNarration();
    renderStory(scene);
    renderPuzzle(scene);
    renderControls(scene);
    renderInventory();
    renderProgress();
    setMessage(message, messageType);
    updateAudioButton();

    if (shouldFocus) {
      elements.title.tabIndex = -1;
      elements.title.focus({ preventScroll: true });
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector('.game-shell').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    if (autoNarrate) {
      const token = narrationToken;
      narrationTimer = window.setTimeout(() => {
        narrationTimer = null;
        if (token === narrationToken && autoNarrate && currentScene().id === scene.id) playNarration(scene);
      }, 120);
    }
  }

  function startNewShift() {
    state = logic.createState();
    message = '';
    messageType = '';
    autoNarrate = false;
    celebratedEnd = false;
    saveState();
    render({ focus: true });
  }

  elements.continue.addEventListener('click', () => {
    const scene = currentScene();
    if (scene.kind === 'end') {
      startNewShift();
      return;
    }
    sfx('swoosh');
    state = logic.advance(state);
    message = '';
    messageType = '';
    saveState();
    render({ focus: true });
  });

  elements.hint.addEventListener('click', () => {
    state = logic.useHint(state);
    saveState();
    setMessage(`Hinweis: ${currentScene().hint}`, 'hint');
  });

  elements.mapButton.addEventListener('click', () => {
    renderChapterList();
    elements.mapDialog.showModal();
  });
  elements.mapClose.addEventListener('click', () => elements.mapDialog.close());

  elements.audioButton.addEventListener('click', () => {
    autoNarrate = !autoNarrate;
    if (autoNarrate) playNarration(currentScene());
    else stopNarration();
    updateAudioButton();
  });

  audio.addEventListener('ended', () => {
    narrationSceneId = null;
    autoNarrate = false;
    updateAudioButton();
  });

  audio.addEventListener('error', () => {
    const scene = currentScene();
    if (autoNarrate && !fallbackSpeaking && narrationSceneId === scene.id) speakFallback(scene, narrationToken);
  });

  window.addEventListener('pagehide', () => {
    stopNarration();
  });

  const sceneVisual = document.querySelector('.scene-visual');
  function toggleImageZoom(force) {
    if (!sceneVisual) return;
    const next = typeof force === 'boolean' ? force : !sceneVisual.classList.contains('is-zoomed');
    sceneVisual.classList.toggle('is-zoomed', next);
    elements.image.setAttribute('aria-expanded', String(next));
  }
  elements.image.addEventListener('click', () => toggleImageZoom());
  elements.image.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleImageZoom();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sceneVisual && sceneVisual.classList.contains('is-zoomed')) {
      toggleImageZoom(false);
    }
  });

  function closeReset() {
    elements.resetDialog.close();
  }

  elements.resetButton.addEventListener('click', () => {
    if (currentScene().kind === 'end') {
      startNewShift();
      return;
    }
    elements.resetDialog.showModal();
  });
  elements.resetClose.addEventListener('click', closeReset);
  elements.resetCancel.addEventListener('click', closeReset);
  elements.resetConfirm.addEventListener('click', () => {
    closeReset();
    startNewShift();
  });

  [elements.mapDialog, elements.resetDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  syncSharedScores();
  render();
})();
