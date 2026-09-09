/* modules/personal.js
   Matches notes section 3:
     A. Habit building — Prayer, Gym, Water
     B. My Will
     (4.) Wife — in case of sudden death, a numbered "Do:" list
   The last two are private planning documents, not journaling —
   kept as a simple checklist + free text, nothing more.
*/

let personalSubtab = 'habits';
const DEFAULT_HABITS = ['Prayer', 'Gym', 'Water'];

async function renderPersonal(container) {
  container.innerHTML = `
    <div class="subtab-bar">
      <button class="subtab-btn" data-tab="habits">Habits</button>
      <button class="subtab-btn" data-tab="will">My Will</button>
      <button class="subtab-btn" data-tab="emergency">In Case Of...</button>
    </div>
    <div id="personal-body"></div>
  `;
  container.querySelectorAll('.subtab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === personalSubtab);
    b.addEventListener('click', () => {
      personalSubtab = b.dataset.tab;
      renderPersonal(container);
    });
  });

  const body = container.querySelector('#personal-body');
  if (personalSubtab === 'habits') return renderHabits(body);
  if (personalSubtab === 'will') return renderWill(body);
  if (personalSubtab === 'emergency') return renderEmergency(body);
}

// ---------- HABITS ----------

async function renderHabits(container) {
  let habits = await Storage.getAll('personal.habits');
  if (!habits.length) {
    for (const name of DEFAULT_HABITS) {
      await Storage.put('personal.habits', { name });
    }
    habits = await Storage.getAll('personal.habits');
  }

  const logs = await Storage.getAll('personal.habit_logs');
  const today = todayISO();

  container.innerHTML = `
    <div id="habit-list"></div>
    <div class="card">
      <form id="habit-form" class="nw-add-form">
        <input type="text" placeholder="New habit" class="habit-name" required />
        <button type="submit" class="btn-primary">Add habit</button>
      </form>
    </div>
  `;

  const list = container.querySelector('#habit-list');
  list.innerHTML = habits.map((h) => {
    const doneToday = logs.some((l) => l.habitId === h.id && l.date === today);
    const streak = computeStreak(logs.filter((l) => l.habitId === h.id));
    return `
      <div class="card habit-row" data-id="${h.id}">
        <label class="habit-check">
          <input type="checkbox" class="habit-toggle" ${doneToday ? 'checked' : ''} />
          <span>${escapeHtml(h.name)}</span>
        </label>
        <span class="habit-streak">${streak > 0 ? streak + 'd streak' : ''}</span>
        <button class="habit-delete" title="Remove habit">✕</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.habit-toggle').forEach((cb) => {
    cb.addEventListener('change', async (e) => {
      const habitId = e.target.closest('.habit-row').dataset.id;
      const existing = logs.find((l) => l.habitId === habitId && l.date === today);
      if (e.target.checked && !existing) {
        await Storage.put('personal.habit_logs', { habitId, date: today });
      } else if (!e.target.checked && existing) {
        await Storage.remove(existing.id);
      }
      renderHabits(container);
    });
  });
  list.querySelectorAll('.habit-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      await Storage.remove(e.target.closest('.habit-row').dataset.id);
      renderHabits(container);
    });
  });

  container.querySelector('#habit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = container.querySelector('.habit-name').value.trim();
    if (!name) return;
    await Storage.put('personal.habits', { name });
    renderHabits(container);
  });
}

function computeStreak(habitLogs) {
  const dates = new Set(habitLogs.map((l) => l.date));
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const iso = cursor.toISOString().slice(0, 10);
    if (dates.has(iso)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
}

// ---------- MY WILL ----------

async function renderWill(container) {
  const doc = await Storage.getSingleton('personal.will');
  container.innerHTML = `
    <div class="card">
      <div class="placeholder-title">My Will</div>
      <div class="placeholder-body">Private notes — wishes, instructions, whatever you want on record. Saved automatically, only on this phone.</div>
      <textarea id="will-text" class="notes-input" rows="12" placeholder="Start writing...">${escapeHtml(doc?.text || '')}</textarea>
      <div class="save-hint" id="will-save-hint"></div>
    </div>
  `;
  const textarea = container.querySelector('#will-text');
  const hint = container.querySelector('#will-save-hint');
  let saveTimer = null;
  textarea.addEventListener('input', () => {
    hint.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await Storage.putSingleton('personal.will', { text: textarea.value });
      hint.textContent = 'Saved';
    }, 500);
  });
}

// ---------- IN CASE OF... (Wife / sudden death instructions) ----------

async function renderEmergency(container) {
  const items = (await Storage.getAll('personal.emergency_items')).sort((a, b) => (a.order || 0) - (b.order || 0));
  const noteDoc = await Storage.getSingleton('personal.emergency_notes');

  container.innerHTML = `
    <div class="card">
      <div class="placeholder-title">If something happens to me</div>
      <div class="placeholder-body">A numbered list of what your wife (or whoever needs it) should do. Kept plain and practical.</div>
    </div>
    <div class="card">
      <div id="emergency-list"></div>
      <form id="emergency-form" class="nw-add-form">
        <input type="text" placeholder="Add a step" class="em-text" required />
        <button type="submit" class="btn-primary">Add step</button>
      </form>
    </div>
    <div class="card">
      <div class="placeholder-title">Additional notes</div>
      <textarea id="em-notes" class="notes-input" rows="6" placeholder="Account details, contacts, anything else...">${escapeHtml(noteDoc?.text || '')}</textarea>
      <div class="save-hint" id="em-save-hint"></div>
    </div>
  `;

  const list = container.querySelector('#emergency-list');
  list.innerHTML = items.length
    ? items.map((it, i) => `
        <div class="checklist-row" data-id="${it.id}">
          <span class="checklist-num">${i + 1}.</span>
          <span class="checklist-text">${escapeHtml(it.text)}</span>
          <button class="nw-delete" title="Remove">✕</button>
        </div>
      `).join('')
    : '<div class="empty-hint">No steps added yet</div>';

  list.querySelectorAll('.nw-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      await Storage.remove(e.target.closest('.checklist-row').dataset.id);
      renderEmergency(container);
    });
  });

  container.querySelector('#emergency-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = container.querySelector('.em-text').value.trim();
    if (!text) return;
    await Storage.put('personal.emergency_items', { text, order: items.length });
    renderEmergency(container);
  });

  const textarea = container.querySelector('#em-notes');
  const hint = container.querySelector('#em-save-hint');
  let saveTimer = null;
  textarea.addEventListener('input', () => {
    hint.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await Storage.putSingleton('personal.emergency_notes', { text: textarea.value });
      hint.textContent = 'Saved';
    }, 500);
  });
}

registerModule({
  id: 'personal',
  label: 'Personal',
  icon: '●',
  render: renderPersonal,
});
