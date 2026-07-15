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

  const audio = new Audio();
  audio.preload = 'metadata';
  let state = loadState();
  let message = '';
  let messageType = '';
  let autoNarrate = false;
  let fallbackSpeaking = false;

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

  function setMessage(text, type) {
    message = text;
    messageType = type || '';
    elements.status.textContent = message;
    elements.status.dataset.type = messageType;
  }

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
    const group = make('div', undefined, 'choice-list');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', scene.objective);
    scene.choices.forEach((choice) => {
      const button = make('button', choice.text, 'choice-button');
      button.type = 'button';
      button.dataset.choice = choice.id;
      button.disabled = logic.isSolved(state, scene.id);
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
      select.disabled = logic.isSolved(state, scene.id);
      wrapper.append(label, select);
      fieldset.appendChild(wrapper);
    });

    const submit = make('button', logic.isSolved(state, scene.id) ? 'Analysen freigegeben ✓' : 'Zuordnung prüfen', 'puzzle-submit');
    submit.type = 'submit';
    submit.disabled = logic.isSolved(state, scene.id);
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
    const form = make('form', undefined, 'code-form');
    const label = make('label', 'Vierstelliger Feierabendcode');
    label.htmlFor = 'final-code';
    const input = document.createElement('input');
    input.id = 'final-code';
    input.name = 'code';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]{4}';
    input.maxLength = 4;
    input.autocomplete = 'off';
    input.placeholder = '••••';
    input.required = true;
    input.disabled = logic.isSolved(state, scene.id);
    input.setAttribute('aria-describedby', 'code-order');
    const order = make('p', 'Reihenfolge: Ventile · Druck · Prüfgas · Analysen', 'code-order');
    order.id = 'code-order';
    const submit = make('button', logic.isSolved(state, scene.id) ? 'Tor geöffnet ✓' : 'Code bestätigen', 'puzzle-submit');
    submit.type = 'submit';
    submit.disabled = logic.isSolved(state, scene.id);
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

  function renderPuzzle(scene) {
    clear(elements.puzzle);
    if (scene.kind === 'choice') renderChoices(scene);
    if (scene.kind === 'lab') renderLab(scene);
    if (scene.kind === 'code') renderCode(scene);
  }

  function renderControls(scene) {
    const puzzleSolved = logic.isSolved(state, scene.id);
    const canContinue = scene.kind === 'continue' || puzzleSolved;
    elements.continue.hidden = !canContinue && scene.kind !== 'end';
    elements.hint.hidden = scene.kind === 'end';

    if (scene.kind === 'end') {
      elements.continue.hidden = false;
      elements.continue.textContent = 'Neue Schicht starten ↻';
    } else if (scene.id === 'intro') {
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
    audio.pause();
    audio.currentTime = 0;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    fallbackSpeaking = false;
  }

  function pickGermanVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('de'));
    return voices.find((voice) => /conrad|male|stefan|markus/i.test(voice.name)) || voices[0] || null;
  }

  function speakFallback(scene) {
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
    utterance.onend = () => { fallbackSpeaking = false; };
    fallbackSpeaking = true;
    window.speechSynthesis.speak(utterance);
  }

  function playNarration(scene) {
    stopNarration();
    audio.src = scene.audio;
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        if (!fallbackSpeaking) speakFallback(scene);
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
    if (autoNarrate) window.setTimeout(() => playNarration(scene), 120);
  }

  elements.continue.addEventListener('click', () => {
    const scene = currentScene();
    if (scene.kind === 'end') {
      elements.resetDialog.showModal();
      return;
    }
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

  audio.addEventListener('error', () => {
    if (autoNarrate && !fallbackSpeaking) speakFallback(currentScene());
  });

  function closeReset() {
    elements.resetDialog.close();
  }

  elements.resetButton.addEventListener('click', () => elements.resetDialog.showModal());
  elements.resetClose.addEventListener('click', closeReset);
  elements.resetCancel.addEventListener('click', closeReset);
  elements.resetConfirm.addEventListener('click', () => {
    state = logic.createState();
    message = '';
    messageType = '';
    autoNarrate = false;
    saveState();
    closeReset();
    render({ focus: true });
  });

  [elements.mapDialog, elements.resetDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  render();
})();
