(() => {
  'use strict';

  const STORAGE_KEY = 'browser-games-style';
  const STYLES = new Set(['panda', 'night', 'contrast']);
  const root = document.documentElement;

  function readStyle() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return STYLES.has(saved) ? saved : 'panda';
    } catch (_error) {
      return 'panda';
    }
  }

  function applyStyle(style, persist) {
    const next = STYLES.has(style) ? style : 'panda';
    root.dataset.gameStyle = next;
    document.querySelectorAll('.game-style-control select').forEach(select => {
      if (select.value !== next) select.value = next;
    });
    if (persist) {
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch (_error) { /* Storage can be unavailable. */ }
    }
  }

  applyStyle(readStyle(), false);

  function createStylePicker() {
    const label = document.createElement('label');
    label.className = 'game-style-control';
    const text = document.createElement('span');
    text.textContent = 'Ansicht';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Darstellung wählen');
    const choices = [
      ['panda', 'Panda hell'],
      ['night', 'Nacht'],
      ['contrast', 'Kontrast']
    ];
    choices.forEach(([value, caption]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = caption;
      select.append(option);
    });
    select.value = root.dataset.gameStyle;
    select.addEventListener('change', () => applyStyle(select.value, true));
    label.append(text, select);
    return label;
  }

  const dialogState = new WeakMap();
  let lastPageFocus = null;
  document.addEventListener('focusin', event => {
    if (!event.target.closest('[role="dialog"]:not([hidden])')) lastPageFocus = event.target;
  }, true);

  function focusableElements(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]):not([hidden]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.closest('[hidden]'));
  }

  function activateDialog(dialog) {
    if (dialogState.has(dialog)) return;
    const inerted = [];
    let branch = dialog;
    while (branch.parentElement && branch.parentElement !== document.documentElement) {
      const parent = branch.parentElement;
      [...parent.children].forEach(sibling => {
        if (sibling !== branch && !sibling.inert) {
          sibling.inert = true;
          inerted.push(sibling);
        }
      });
      branch = parent;
      if (parent === document.body) break;
    }
    const active = document.activeElement;
    const state = { previous: dialog.contains(active) ? lastPageFocus : active, inerted };
    dialogState.set(dialog, state);
    const focusables = focusableElements(dialog);
    (focusables[0] || dialog).focus({ preventScroll: true });
  }

  function deactivateDialog(dialog) {
    const state = dialogState.get(dialog);
    if (!state) return;
    state.inerted.forEach(element => { element.inert = false; });
    dialogState.delete(dialog);
    if (state.previous && state.previous.isConnected && typeof state.previous.focus === 'function') {
      state.previous.focus({ preventScroll: true });
    }
  }

  function syncDialog(dialog) {
    if (dialog.hidden) deactivateDialog(dialog);
    else activateDialog(dialog);
  }

  function boot() {
    const header = document.querySelector('.site-header, header.top, body > header');
    if (header && !header.querySelector('.game-toolbar')) {
      const toolbar = document.createElement('div');
      toolbar.className = 'game-toolbar';
      const backLink = header.querySelector('a.back-link, a.back');
      if (backLink) {
        const formerParent = backLink.parentElement;
        backLink.textContent = '← Spieleübersicht';
        backLink.setAttribute('aria-label', 'Zur Spieleübersicht');
        toolbar.append(backLink);
        if (formerParent && formerParent.matches('nav') && formerParent.children.length === 0) formerParent.remove();
      }
      toolbar.append(createStylePicker());
      header.prepend(toolbar);
    }

    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    dialogs.forEach(dialog => {
      if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
      dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || dialog.hidden) return;
        const focusables = focusableElements(dialog);
        if (!focusables.length) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      syncDialog(dialog);
    });

    const observer = new MutationObserver(records => {
      records.forEach(record => syncDialog(record.target));
    });
    dialogs.forEach(dialog => observer.observe(dialog, { attributes: true, attributeFilter: ['hidden'] }));
  }

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) applyStyle(event.newValue, false);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
