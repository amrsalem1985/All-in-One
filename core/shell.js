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

let activeModuleId = null;

function initNav() {
  activeModuleId = window.APP_MODULES[0]?.id || null;
  const nav = document.getElementById('tab-bar');
  nav.innerHTML = '';
  window.APP_MODULES.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.innerHTML = `<span class="tab-icon">${m.icon || ''}</span><span>${m.label}</span>`;
    btn.dataset.id = m.id;
    btn.addEventListener('click', () => {
      activeModuleId = m.id;
      renderActiveModule();
    });
    nav.appendChild(btn);
  });
}

function renderActiveModule() {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === activeModuleId);
  });
  const mod = window.APP_MODULES.find((m) => m.id === activeModuleId);
  const main = document.getElementById('main-content');
  if (!mod) {
    main.innerHTML = '<div class="loading">No modules registered.</div>';
    return;
  }
  main.innerHTML = '<div class="loading">Loading…</div>';
  mod.render(main);
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
