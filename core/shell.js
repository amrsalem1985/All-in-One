/* core/shell.js
   The shell knows nothing about Finance, Family, or Personal specifically.
   It just: gates with a PIN, then renders whichever modules have
   registered themselves into window.APP_MODULES (see modules/*.js).

   TO ADD A NEW SECTION LATER:
     1. Create modules/whatever.js
     2. Call registerModule({ id, label, render }) in it
     3. Add one <script src="modules/whatever.js"></script> line to index.html
   Nothing in this file changes.
*/

window.APP_MODULES = window.APP_MODULES || [];

function registerModule(def) {
  window.APP_MODULES.push(def);
}

// ---------- PIN LOCK ----------
// sha256() lives in core/utils.js (loaded before this file) so modules can reuse it.

async function initLock() {
  const storedHash = await Storage.getSetting('pin_hash');
  const lockScreen = document.getElementById('lock-screen');
  const app = document.getElementById('app');
  const title = document.getElementById('lock-title');
  const input = document.getElementById('pin-input');
  const submit = document.getElementById('pin-submit');
  const error = document.getElementById('lock-error');

  const isFirstRun = !storedHash;
  title.textContent = isFirstRun ? 'Set a PIN to protect this app' : 'Enter your PIN';

  let confirmStage = null;

  submit.addEventListener('click', async () => {
    const val = input.value.trim();
    if (val.length < 4) {
      error.textContent = 'PIN must be at least 4 digits';
      return;
    }

    if (isFirstRun) {
      if (!confirmStage) {
        confirmStage = val;
        input.value = '';
        title.textContent = 'Confirm your PIN';
        error.textContent = '';
        return;
      }
      if (val !== confirmStage) {
        error.textContent = "PINs didn't match — start over";
        confirmStage = null;
        input.value = '';
        title.textContent = 'Set a PIN to protect this app';
        return;
      }
      await Storage.setSetting('pin_hash', await sha256(val));
      unlock(lockScreen, app);
      return;
    }

    const hash = await sha256(val);
    if (hash === storedHash) {
      unlock(lockScreen, app);
    } else {
      error.textContent = 'Incorrect PIN';
      input.value = '';
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit.click();
  });
}

function unlock(lockScreen, app) {
  lockScreen.classList.add('hidden');
  app.classList.remove('hidden');
  // Fire a generic per-module lifecycle hook. The shell doesn't know what any
  // module does with it — Finance uses it to record a daily net-worth snapshot.
  window.APP_MODULES.forEach((m) => {
    try { m.onUnlock && m.onUnlock(); } catch (e) { console.error('onUnlock failed for', m.id, e); }
  });
  renderActiveModule();
}

// ---------- MODULE NAVIGATION ----------

/* Tab-bar icons live here, keyed by module id, so modules stay untouched.
   24×24, stroke = currentColor. A module with no entry falls back to its
   own `icon` glyph. */
const TAB_ICONS = {
  finance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M7.5 19v-6"/><path d="M12 19V8"/><path d="M16.5 19v-4"/><path d="M6 9.5 11 5l3 2.5 4-4.5"/></svg>',
  family: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M16.5 6.4a3 3 0 0 1 0 5.7"/><path d="M17.5 14.3a5.5 5.5 0 0 1 3 4.9"/></svg>',
  personal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09c.2.63.77 1.09 1.51 1.09H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

let activeModuleId = null;

function initNav() {
  activeModuleId = window.APP_MODULES[0]?.id || null;
  const nav = document.getElementById('tab-bar');
  nav.innerHTML = '';
  window.APP_MODULES.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.type = 'button';
    btn.dataset.id = m.id;
    const icon = TAB_ICONS[m.id] || `<span class="tab-glyph">${m.icon || ''}</span>`;
    btn.innerHTML = `<span class="tab-icon">${icon}</span><span class="tab-label">${m.label}</span>`;
    btn.addEventListener('click', () => {
      if (activeModuleId === m.id) return;
      activeModuleId = m.id;
      renderActiveModule();
    });
    nav.appendChild(btn);
  });
}

/* Render into a detached node, then swap it in — the module's async render
   (Storage reads, sub-renders) finishes before anything hits the screen, so
   there's no "Loading…" flash on tab switches. */
async function renderActiveModule() {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === activeModuleId);
  });
  const host = document.getElementById('main-content');
  const actionSlot = document.getElementById('header-action');
  if (actionSlot) actionSlot.replaceChildren();   // module fills this during render if it wants
  const mod = window.APP_MODULES.find((m) => m.id === activeModuleId);
  if (!mod) {
    host.replaceChildren();
    host.insertAdjacentHTML('beforeend', '<div class="loading">No modules registered.</div>');
    return;
  }
  const staging = document.createElement('div');
  try {
    await mod.render(staging);
  } catch (e) {
    console.error('render failed for', mod.id, e);
    staging.innerHTML = '<div class="loading">Something went wrong loading this screen.</div>';
  }
  host.replaceChildren(staging);
  host.scrollTop = 0;
}

// ---------- BACKUP (shared by every module, lives in the shell) ----------

async function doExport() {
  const dump = await Storage.exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `app-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* doImport(onStatus)
   Opens a file picker, reads the chosen JSON, confirms the destructive replace,
   then wipes and restores. onStatus(message, isError) reports progress/errors so
   the calling screen can show them inline. Reloads on success. */
function doImport(onStatus) {
  const report = typeof onStatus === 'function' ? onStatus : () => {};
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let dump;
      try {
        dump = JSON.parse(reader.result);
      } catch (e) {
        report('That file isn’t valid JSON — nothing was changed.', true);
        return;
      }
      if (!dump || !Array.isArray(dump.kv) || !Array.isArray(dump.docs)) {
        report('That doesn’t look like an Anchor backup — nothing was changed.', true);
        return;
      }
      const count = dump.docs.length;
      if (!confirm(`Replace ALL current data with this backup (${count} records)?\n\nThis cannot be undone.`)) {
        report('Restore cancelled.', false);
        return;
      }
      try {
        report('Restoring…', false);
        await Storage.clearAll();
        await Storage.importAll(dump);
        report('Restored. Reloading…', false);
        setTimeout(() => location.reload(), 400);
      } catch (e) {
        report('Restore failed: ' + (e && e.message ? e.message : e), true);
      }
    };
    reader.onerror = () => report('Could not read that file.', true);
    reader.readAsText(file);
  });
  input.click();
}

// ---------- SERVICE WORKER (offline support) ----------
// Registers sw.js so the app keeps working with no network after the first
// load. When a new worker takes over (CACHE bumped in sw.js), reload once so
// the fresh files are used.

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}

// ---------- BOOT ----------

window.addEventListener('DOMContentLoaded', () => {
  initNav();
  initLock();
  initServiceWorker();
});
