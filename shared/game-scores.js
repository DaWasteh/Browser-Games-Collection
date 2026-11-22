/* === Gemeinsamer lokaler Punktestand-Speicher (seit v2.6) ===
   window.GameScores speichert Spielstände, Bestwerte, Bestzeiten, Siege und
   Serien lokal im Browser (localStorage) unter einem gemeinsamen Schlüssel
   ('browser-games-scores-v1'), ohne bestehende spielspezifische Speicherstände
   anzutasten. So können sowohl jedes Spiel selbst als auch die Spieleübersicht
   persönliche Bestwerte anzeigen. */
(() => {
  'use strict';

  const STORAGE_KEY = 'browser-games-scores-v1';
  const MAX_RECENT = 10;

  function readStore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function sanitizeNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor(total / 60) % 60;
    const s = total % 60;
    const pad = v => String(v).padStart(2, '0');
    return h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(Math.floor(total / 60))}:${pad(s)}`;
  }

  function get(gameId) {
    if (!gameId) return null;
    const store = readStore();
    const entry = store[String(gameId)];
    return entry && typeof entry === 'object' ? Object.assign({}, entry) : null;
  }

  function getAll() {
    return readStore();
  }

  /* Speichert/aktualisiert einen Eintrag für gameId:
     {
       score?: number,          // höher ist besser (bestScore)
       lowScore?: number,       // niedriger ist besser (z. B. Züge/Par)
       timeSec?: number,        // kürzer ist besser (bestTimeSec)
       won?: boolean,           // zählt wins & streak hoch
       played?: boolean,        // zählt gamesPlayed hoch (default: true)
       level?: number,          // höchstes erreichtes Level / Etage
       label?: string,          // fertige Kurz-Zusammenfassung für die Übersicht
       meta?: object            // beliebige Zusatzfelder
     }
     Gibt { entry, isNewBestScore, isNewBestTime } zurück. */
  function record(gameId, data) {
    if (!gameId || !data || typeof data !== 'object') {
      return { entry: null, isNewBestScore: false, isNewBestTime: false };
    }
    const id = String(gameId);
    const store = readStore();
    const prev = store[id] && typeof store[id] === 'object' ? store[id] : {};
    const next = Object.assign({
      gamesPlayed: 0,
      wins: 0,
      streak: 0,
      bestStreak: 0,
      bestScore: null,
      bestLowScore: null,
      bestTimeSec: null,
      bestLevel: null,
      lastScore: null,
      lastPlayed: null,
      label: '',
      recent: []
    }, prev);

    if (data.played !== false) {
      next.gamesPlayed = Math.min(1000000, (Number(next.gamesPlayed) || 0) + 1);
    }

    if (data.won === true) {
      next.wins = Math.min(1000000, (Number(next.wins) || 0) + 1);
      next.streak = Math.min(100000, (Number(next.streak) || 0) + 1);
      next.bestStreak = Math.max(Number(next.bestStreak) || 0, next.streak);
    } else if (data.won === false) {
      next.streak = 0;
    }

    let isNewBestScore = false;
    const score = sanitizeNumber(data.score, 0, 1e12);
    if (score != null) {
      next.lastScore = Math.round(score);
      if (next.bestScore == null || score > next.bestScore) {
        next.bestScore = Math.round(score);
        isNewBestScore = true;
      }
    }

    const lowScore = sanitizeNumber(data.lowScore, -1e6, 1e9);
    if (lowScore != null) {
      if (next.bestLowScore == null || lowScore < next.bestLowScore) {
        next.bestLowScore = Math.round(lowScore);
      }
    }

    let isNewBestTime = false;
    const timeSec = sanitizeNumber(data.timeSec, 0, 604800);
    if (timeSec != null) {
      const rounded = Math.round(timeSec);
      if (next.bestTimeSec == null || rounded < next.bestTimeSec) {
        next.bestTimeSec = rounded;
        isNewBestTime = true;
      }
    }

    const level = sanitizeNumber(data.level, 0, 100000);
    if (level != null) {
      if (next.bestLevel == null || level > next.bestLevel) {
        next.bestLevel = Math.round(level);
      }
    }

    if (data.meta && typeof data.meta === 'object') {
      next.meta = Object.assign({}, next.meta || {}, data.meta);
    }

    next.lastPlayed = new Date().toISOString().slice(0, 10);

    if (typeof data.label === 'string' && data.label.trim()) {
      next.label = data.label.trim().slice(0, 60);
    } else {
      next.label = summarize(next);
    }

    if (score != null || timeSec != null) {
      const history = Array.isArray(next.recent) ? next.recent.slice(0, MAX_RECENT - 1) : [];
      history.unshift({
        score: score != null ? Math.round(score) : null,
        timeSec: timeSec != null ? Math.round(timeSec) : null,
        won: data.won === true,
        date: next.lastPlayed
      });
      next.recent = history;
    }

    store[id] = next;
    writeStore(store);
    return { entry: Object.assign({}, next), isNewBestScore, isNewBestTime };
  }

  /* Synchronisiert bestehende Spiel-Statistiken ohne gamesPlayed hochzuzählen. */
  function sync(gameId, data) {
    return record(gameId, Object.assign({}, data, { played: false }));
  }

  function summarize(entry) {
    if (!entry || typeof entry !== 'object') return '';
    if (entry.label) return entry.label;
    const parts = [];
    if (entry.bestScore != null && entry.bestScore > 0) parts.push(`Bestwert ${entry.bestScore.toLocaleString('de-DE')}`);
    if (entry.bestTimeSec != null) parts.push(`Bestzeit ${formatDuration(entry.bestTimeSec)}`);
    if (entry.wins > 0) parts.push(`${entry.wins} ${entry.wins === 1 ? 'Sieg' : 'Siege'}`);
    if (!parts.length && entry.bestLevel != null && entry.bestLevel > 0) parts.push(`Stufe ${entry.bestLevel}`);
    if (!parts.length && entry.gamesPlayed > 0) parts.push(`${entry.gamesPlayed}× gespielt`);
    return parts.slice(0, 2).join(' · ');
  }

  function clear(gameId) {
    if (!gameId) {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (_error) { /* optional */ }
      return;
    }
    const store = readStore();
    delete store[String(gameId)];
    writeStore(store);
  }

  window.GameScores = Object.freeze({
    STORAGE_KEY,
    get,
    getAll,
    record,
    sync,
    clear,
    summarize,
    formatDuration
  });
})();
