/* modules/personal.js
   Habits / My Will / Emergency. Built on the shared UI kit.
   Collections:
     personal.habits        { name, createdAt }
     personal.habit_logs    { habitId, date }        one row per done-day
     personal.will          singleton { text, updatedAt }
     personal.emergency_items { text, order }
     personal.emergency_notes singleton { text, updatedAt }
*/

let personalSubtab = 'habits';
let emergencyIntroOpen = true;
const DEFAULT_HABITS = ['Prayer', 'Gym', 'Water'];

async function renderPersonal(container) {
  const seg = UI.segmented(
    [
      { id: 'habits', label: 'Habits' },
      { id: 'will', label: 'My Will' },
      { id: 'emergency', label: 'Emergency' },
    ],
    personalSubtab,
    (id) => { personalSubtab = id; renderPersonal(container); },
  );
  const body = UI.el('div', { id: 'personal-body' });
  container.replaceChildren(seg, body);

  const slot = document.getElementById('header-action');
  if (slot) {
    slot.replaceChildren();
    if (personalSubtab === 'habits') {
      slot.append(UI.el('button', { type: 'button', 'aria-label': 'Add habit', html: UI.icon('plus'), onClick: () => openHabitSheet(null, body) }));
    } else if (personalSubtab === 'emergency') {
      slot.append(UI.el('button', { type: 'button', 'aria-label': 'Add step', html: UI.icon('plus'), onClick: () => openStepSheet(null, body) }));
    }
  }

  if (personalSubtab === 'habits') return renderHabits(body);
  if (personalSubtab === 'will') return renderWill(body);
  if (personalSubtab === 'emergency') return renderEmergency(body);
}

// ---------- HABITS ----------

function computeStreak(habitLogs) {
  const dates = new Set(habitLogs.map((l) => l.date));
  const cursor = new Date();
  // if today isn't logged yet the streak still stands — count from yesterday
  if (!dates.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function openHabitSheet(existing, body) {
  const isNew = !existing;
  UI.openSheet({
    title: isNew ? 'Add habit' : 'Edit habit',
    submitLabel: isNew ? 'Add' : 'Save',
    fields: [{ name: 'name', label: 'Habit', type: 'text', value: existing?.name || '', required: true, placeholder: 'e.g. Read 10 pages' }],
    onSubmit: async (v) => {
      await Storage.put('personal.habits', { ...(existing || { createdAt: Date.now() }), name: v.name });
      UI.toast(isNew ? 'Added' : 'Saved');
      renderHabits(body);
    },
    onDelete: isNew ? null : async () => {
      await Storage.remove(existing.id);
      for (const l of await Storage.getAll('personal.habit_logs')) {
        if (l.habitId === existing.id) await Storage.remove(l.id);
      }
      UI.toast('Deleted');
      renderHabits(body);
    },
    deleteLabel: isNew ? null : `Delete “${existing.name}”`,
    deleteConfirm: isNew ? null : { title: `Delete “${existing.name}”?`, message: 'Removes the habit and its whole streak history.' },
  });
}

async function renderHabits(container) {
  let habits = await Storage.getAll('personal.habits');
  if (!habits.length) {
    for (let i = 0; i < DEFAULT_HABITS.length; i++) {
      await Storage.put('personal.habits', { name: DEFAULT_HABITS[i], createdAt: Date.now() + i });
    }
    habits = await Storage.getAll('personal.habits');
  }
  habits.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.name < b.name ? -1 : 1));

  const logs = await Storage.getAll('personal.habit_logs');
  const today = todayISO();
  const done = habits.filter((h) => logs.some((l) => l.habitId === h.id && l.date === today)).length;
  const pct = habits.length ? Math.round((done / habits.length) * 100) : 0;

  container.replaceChildren();

  container.append(UI.el('div', { class: 'card habit-today' },
    UI.el('div', { class: 'ht-head' },
      UI.el('span', { class: 'ht-date', text: 'Today · ' + weekdayLabel(today) }),
      UI.el('span', { class: 'ht-count', text: `${done} / ${habits.length}` })),
    UI.el('div', { class: 'prop-track' }, UI.el('div', { class: 'prop-fill', style: { width: pct + '%' } }))));

  container.append(UI.el('div', { class: 'card' }, UI.list(habits.map((h) => {
    const doneToday = logs.some((l) => l.habitId === h.id && l.date === today);
    const streak = computeStreak(logs.filter((l) => l.habitId === h.id));
    const toggle = UI.el('input', {
      type: 'checkbox', class: 'habit-toggle', checked: doneToday,
      'aria-label': (doneToday ? 'Mark not done: ' : 'Mark done: ') + h.name,
      onClick: (e) => e.stopPropagation(),
      onChange: async () => {
        const existing = (await Storage.getAll('personal.habit_logs')).find((l) => l.habitId === h.id && l.date === today);
        if (!existing) await Storage.put('personal.habit_logs', { habitId: h.id, date: today });
        else await Storage.remove(existing.id);
        renderHabits(container);
      },
    });
    return UI.listRow({
      leading: toggle,
      title: h.name,
      value: streak > 0 ? streak + 'd' : '—',
      tone: streak > 0 ? 'positive' : 'muted',
      onTap: () => openHabitSheet(h, container),
    });
  }))));
}

// ---------- MY WILL ----------

// Autosaving free-text editor. Fills the card element it's given.
function docEditorInto(card, opts) {
  const ta = UI.el('textarea', { class: 'notes-input doc-fill', placeholder: opts.placeholder });
  ta.value = opts.text || '';
  const hint = UI.el('div', { class: 'save-hint' });
  const setHint = (updatedAt, saving) => {
    hint.textContent = saving ? 'Saving…' : (updatedAt ? 'Saved · ' + friendlyDateTime(updatedAt) : '');
  };
  setHint(opts.updatedAt, false);
  let timer;
  ta.addEventListener('input', () => {
    setHint(null, true);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const now = new Date().toISOString();
      await Storage.putSingleton(opts.collection, { text: ta.value, updatedAt: now });
      setHint(now, false);
    }, 500);
  });
  card.replaceChildren(...[
    UI.el('div', { class: 'placeholder-title', text: opts.title }),
    opts.blurb ? UI.el('div', { class: 'placeholder-body', text: opts.blurb }) : null,
    ta, hint,
  ].filter(Boolean));
}

async function renderWill(container) {
  const doc = await Storage.getSingleton('personal.will');
  container.replaceChildren();
  const card = UI.el('div', { class: 'card doc-card' });
  container.append(card);
  docEditorInto(card, {
    collection: 'personal.will',
    title: 'My Will',
    blurb: 'Private notes — wishes, instructions, whatever you want on record. Saved automatically, only on this phone.',
    placeholder: 'Start writing…',
    text: doc?.text || '',
    updatedAt: doc?.updatedAt,
  });
}

// ---------- EMERGENCY ----------

function openStepSheet(existing, body) {
  const isNew = !existing;
  UI.openSheet({
    title: isNew ? 'Add step' : 'Edit step',
    submitLabel: isNew ? 'Add' : 'Save',
    fields: [{ name: 'text', label: 'Step', type: 'textarea', rows: 3, value: existing?.text || '', required: true, placeholder: 'e.g. Call the lawyer, Ahmed Khalil' }],
    onSubmit: async (v) => {
      if (isNew) {
        const count = (await Storage.getAll('personal.emergency_items')).length;
        await Storage.put('personal.emergency_items', { text: v.text, order: count });
      } else {
        await Storage.put('personal.emergency_items', { ...existing, text: v.text });
      }
      UI.toast(isNew ? 'Added' : 'Saved');
      renderEmergency(body);
    },
    onDelete: isNew ? null : async () => {
      await Storage.remove(existing.id);
      UI.toast('Removed');
      renderEmergency(body);
    },
    deleteLabel: isNew ? null : 'Delete step',
    deleteConfirm: isNew ? null : { title: 'Remove this step?', message: existing.text },
  });
}

async function moveStep(items, i, dir, body) {
  const j = i + dir;
  if (j < 0 || j >= items.length) return;
  await Storage.put('personal.emergency_items', { ...items[i], order: j });
  await Storage.put('personal.emergency_items', { ...items[j], order: i });
  renderEmergency(body);
}

async function renderEmergency(container) {
  const items = (await Storage.getAll('personal.emergency_items')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // normalise order to 0..n-1 so up/down swaps are always clean
  for (let k = 0; k < items.length; k++) {
    if (items[k].order !== k) {
      await Storage.put('personal.emergency_items', { ...items[k], order: k });
      items[k].order = k;
    }
  }
  const noteDoc = await Storage.getSingleton('personal.emergency_notes');

  container.replaceChildren();

  const intro = UI.el('details', { class: 'intro' },
    UI.el('summary', { text: 'If something happens to me' }),
    UI.el('div', { class: 'placeholder-body', text: 'A numbered list of what your wife (or whoever needs it) should do. Kept plain and practical.' }));
  intro.open = emergencyIntroOpen;
  intro.addEventListener('toggle', () => { emergencyIntroOpen = intro.open; });
  container.append(intro);

  const stepsCard = UI.el('div', { class: 'card' });
  if (!items.length) {
    stepsCard.append(UI.emptyState({
      icon: 'plus', title: 'No steps yet',
      hint: 'Tap + in the top bar to add the first one.',
      actionLabel: 'Add step', onAction: () => openStepSheet(null, container),
    }));
  } else {
    stepsCard.append(UI.el('div', { class: 'steps' }, ...items.map((it, i) => UI.el('div', { class: 'step-row' },
      UI.el('span', { class: 'step-num', text: (i + 1) + '.' }),
      UI.el('button', { class: 'step-text-btn', type: 'button', text: it.text, onClick: () => openStepSheet(it, container) }),
      UI.el('div', { class: 'step-ctrl' },
        UI.el('button', { class: 'step-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, html: UI.icon('up'), onClick: () => moveStep(items, i, -1, container) }),
        UI.el('button', { class: 'step-btn', type: 'button', 'aria-label': 'Move down', disabled: i === items.length - 1, html: UI.icon('down'), onClick: () => moveStep(items, i, 1, container) }))))));
  }
  container.append(stepsCard);

  const notesCard = UI.el('div', { class: 'card doc-card' });
  container.append(notesCard);
  docEditorInto(notesCard, {
    collection: 'personal.emergency_notes',
    title: 'Additional notes',
    placeholder: 'Account details, contacts, anything else…',
    text: noteDoc?.text || '',
    updatedAt: noteDoc?.updatedAt,
  });
}

registerModule({
  id: 'personal',
  label: 'Personal',
  icon: '●',
  render: renderPersonal,
});
