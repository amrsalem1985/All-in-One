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
  `;

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
}

registerModule({
  id: 'settings',
  label: 'Settings',
  icon: '⚙',
  render: renderSettings,
});
