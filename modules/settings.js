/* modules/settings.js
   The place to change what used to be one-time-set: currency and PIN.
   Also holds Backup (export + restore) — the app's only backup path since
   nothing ever leaves the phone.
*/

const CURRENCY_OPTIONS = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'EGP', 'QAR', 'KWD', 'BHD', 'OMR', 'INR', 'PKR'];

async function renderSettings(container) {
  const currency = await Storage.getSetting('currency', 'AED');

  container.innerHTML = `
    <div class="section-title">Settings</div>

    <div class="card">
      <div class="placeholder-title">Currency</div>
      <div class="placeholder-body">Used for every money value in the app.</div>
      <form id="currency-form" class="nw-add-form">
        <select id="currency-select">
          ${CURRENCY_OPTIONS.map((c) => `<option value="${c}" ${c === currency ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <button type="submit" class="btn-primary">Save currency</button>
      </form>
      <div class="save-hint" id="currency-hint"></div>
    </div>

    <div class="card">
      <div class="placeholder-title">Change PIN</div>
      <div class="placeholder-body">Gates the app on every open. Minimum 4 digits.</div>
      <form id="pin-form" class="nw-add-form">
        <input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Current PIN" id="pin-current" />
        <input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="New PIN" id="pin-new" />
        <input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Confirm new PIN" id="pin-confirm" />
        <button type="submit" class="btn-primary">Update PIN</button>
      </form>
      <div class="save-hint" id="pin-hint"></div>
    </div>

    <div class="card">
      <div class="placeholder-title">Backup</div>
      <div class="placeholder-body">There is no cloud copy. Export regularly and keep the file somewhere safe. Restoring replaces everything currently in the app.</div>
      <div class="settings-btn-row">
        <button id="export-btn" class="btn-secondary">Export backup file</button>
        <button id="import-btn" class="btn-secondary">Restore from file</button>
      </div>
      <div class="save-hint" id="backup-hint"></div>
    </div>

    <div class="card">
      <div class="placeholder-title">Storage &amp; data</div>
      <div class="about-row"><span>On-device size</span><span class="about-val" id="storage-size">—</span></div>
      <div class="about-row"><span>Protected from cleanup</span><span class="about-val" id="storage-persist">—</span></div>
      <div class="placeholder-body">Everything is stored only in this app on this phone. Export a backup before erasing.</div>
      <div class="settings-btn-row">
        <button id="erase-btn" class="btn-secondary btn-destructive">Erase all data</button>
      </div>
    </div>

    <div class="card">
      <div class="placeholder-title">About</div>
      <div class="about-row"><span>Build</span><span class="about-val" id="about-build">—</span></div>
      <div class="about-row"><span>Offline cache</span><span class="about-val" id="about-cache">checking…</span></div>
      <div class="placeholder-body">This should match the <code>CACHE</code> line in <code>&lt;your-site&gt;/sw.js</code>. If it doesn't, the phone is still on an older build.</div>
      <div class="settings-btn-row">
        <button id="update-btn" class="btn-secondary">Check for update</button>
      </div>
      <div class="save-hint" id="about-hint"></div>
    </div>
  `;

  // ---- about / version ----
  container.querySelector('#about-build').textContent = window.APP_BUILD || 'unknown';
  askServiceWorkerVersion().then((cache) => {
    const el = container.querySelector('#about-cache');
    if (el) el.textContent = cache || 'not active';
  });
  const aboutHint = container.querySelector('#about-hint');
  container.querySelector('#update-btn').addEventListener('click', async () => {
    aboutHint.style.color = '';
    aboutHint.textContent = 'Checking…';
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
      // If an update was found, shell.js reloads the page on controllerchange.
      aboutHint.textContent = 'Checked. If a new build is deploying, fully close and reopen the app.';
    } catch (e) {
      aboutHint.style.color = 'var(--rust)';
      aboutHint.textContent = 'Could not check: ' + (e && e.message ? e.message : e);
    }
  });

  // ---- currency ----
  const curHint = container.querySelector('#currency-hint');
  container.querySelector('#currency-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = container.querySelector('#currency-select').value;
    await Storage.setSetting('currency', val);
    curHint.textContent = 'Saved — reloading…';
    setTimeout(() => location.reload(), 400);
  });

  // ---- change PIN ----
  const pinHint = container.querySelector('#pin-hint');
  container.querySelector('#pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = container.querySelector('#pin-current').value.trim();
    const nw = container.querySelector('#pin-new').value.trim();
    const cf = container.querySelector('#pin-confirm').value.trim();
    pinHint.style.color = '';
    pinHint.textContent = '';

    const storedHash = await Storage.getSetting('pin_hash');
    if (storedHash && (await sha256(cur)) !== storedHash) {
      pinHint.style.color = 'var(--rust)';
      pinHint.textContent = 'Current PIN is incorrect.';
      return;
    }
    if (nw.length < 4) {
      pinHint.style.color = 'var(--rust)';
      pinHint.textContent = 'New PIN must be at least 4 digits.';
      return;
    }
    if (nw !== cf) {
      pinHint.style.color = 'var(--rust)';
      pinHint.textContent = 'New PIN and confirmation don’t match.';
      return;
    }
    await Storage.setSetting('pin_hash', await sha256(nw));
    container.querySelector('#pin-current').value = '';
    container.querySelector('#pin-new').value = '';
    container.querySelector('#pin-confirm').value = '';
    pinHint.style.color = 'var(--sage)';
    pinHint.textContent = 'PIN updated.';
  });

  // ---- backup ----
  const backupHint = container.querySelector('#backup-hint');
  container.querySelector('#export-btn').addEventListener('click', doExport);
  container.querySelector('#import-btn').addEventListener('click', () => {
    doImport((msg, isError) => {
      backupHint.style.color = isError ? 'var(--rust)' : 'var(--sage)';
      backupHint.textContent = msg;
    });
  });

  // ---- storage & data ----
  (async () => {
    const sizeEl = container.querySelector('#storage-size');
    const persistEl = container.querySelector('#storage-persist');
    try {
      const est = navigator.storage && navigator.storage.estimate && await navigator.storage.estimate();
      sizeEl.textContent = est && est.usage != null ? formatBytes(est.usage) : 'unknown';
    } catch (e) { sizeEl.textContent = 'unknown'; }
    try {
      const p = navigator.storage && navigator.storage.persisted && await navigator.storage.persisted();
      persistEl.textContent = p === true ? 'Yes' : p === false ? 'No' : 'unknown';
    } catch (e) { persistEl.textContent = 'unknown'; }
  })();

  container.querySelector('#erase-btn').addEventListener('click', async () => {
    const ok1 = await UI.confirmDialog({
      title: 'Erase all data?',
      message: 'Everything in Anchor — finances, family, will, emergency instructions — will be deleted from this phone.',
      confirmLabel: 'Continue',
    });
    if (!ok1) return;
    const ok2 = await UI.confirmDialog({
      title: 'Really erase everything?',
      message: 'There is no undo and no cloud copy. Make sure you exported a backup first.',
      confirmLabel: 'Erase everything',
    });
    if (!ok2) return;
    await Storage.clearAll();
    location.reload();
  });
}

// Ask the active service worker which CACHE it's serving. Resolves null when
// there's no controller (first load, private window, or the in-app preview).
function askServiceWorkerVersion() {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker;
    if (!sw || !sw.controller) { resolve(null); return; }
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), 600);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve((e.data && e.data.cache) || null); };
    sw.controller.postMessage('version', [ch.port2]);
  });
}

registerModule({
  id: 'settings',
  label: 'Settings',
  icon: '⚙',
  render: renderSettings,
});
