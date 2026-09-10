/* modules/family.js
   Periodic-call reminders. Surfaces who needs a call now vs. who's coming up.
   Collections: "family.contacts" ({ name, relation, frequencyDays,
   lastCalledDate }) and "family.calls" ({ contactId, date }) — one row per
   logged call, so the detail sheet can show a history.
*/

const FREQ_OPTIONS = [
  { value: '1', label: 'Every day' },
  { value: '3', label: 'Every 3 days' },
  { value: '7', label: 'Every week' },
  { value: '14', label: 'Every 2 weeks' },
  { value: '30', label: 'Every month' },
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const s = (parts[0] ? parts[0][0] : '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return s.toUpperCase() || '?';
}

function contactStatus(c, today) {
  const freq = Number(c.frequencyDays) || 7;
  if (!c.lastCalledDate) return { neverCalled: true, freq, daysSince: null, overdueBy: null, needsCall: true };
  const daysSince = daysBetween(c.lastCalledDate, today);
  const overdueBy = daysSince - freq;
  return { neverCalled: false, freq, daysSince, overdueBy, needsCall: overdueBy >= 0 };
}

function statusText(s) {
  if (s.neverCalled) return 'start calling';
  if (s.overdueBy > 0) return `${s.overdueBy}d overdue`;
  if (s.overdueBy === 0) return 'due today';
  return `due in ${-s.overdueBy}d`;
}

function lastCalledText(s) {
  if (s.neverCalled) return 'never called';
  if (s.daysSince === 0) return 'called today';
  if (s.daysSince === 1) return 'called yesterday';
  return `called ${s.daysSince}d ago`;
}

async function markCalled(c, container) {
  const today = todayISO();
  const dupe = (await Storage.getAll('family.calls')).find((k) => k.contactId === c.id && k.date === today);
  if (dupe) { UI.toast('Already logged today'); return; }
  await Storage.put('family.calls', { contactId: c.id, date: today });
  await Storage.put('family.contacts', { ...c, lastCalledDate: today });
  UI.toast('Logged · ' + c.name);
  renderFamily(container);
}

function openContactSheet(existing, container) {
  const isNew = !existing;
  const buildExtra = async () => {
    if (isNew) return null;
    const calls = (await Storage.getAll('family.calls'))
      .filter((k) => k.contactId === existing.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 8);
    return UI.el('div', { class: 'call-log' },
      UI.el('span', { class: 'sf-label', text: 'Recent calls' }),
      calls.length
        ? UI.el('div', { class: 'call-log-list' },
            ...calls.map((k) => UI.el('span', { class: 'call-log-item', text: friendlyDate(k.date) })))
        : UI.el('div', { class: 'empty-hint', text: 'No calls logged yet.' }));
  };

  buildExtra().then((extra) => {
    UI.openSheet({
      title: isNew ? 'Add family member' : existing.name,
      submitLabel: isNew ? 'Add' : 'Save',
      fields: [
        { name: 'name', label: 'Name', type: 'text', value: existing?.name || '', required: true, placeholder: 'e.g. Mom' },
        { name: 'relation', label: 'Relation', type: 'text', value: existing?.relation || '', placeholder: 'e.g. Mother' },
        { name: 'frequencyDays', label: 'Call frequency', type: 'select', options: FREQ_OPTIONS, value: String(existing?.frequencyDays || 7) },
      ],
      extra,
      onSubmit: async (v) => {
        await Storage.put('family.contacts', {
          ...(existing || { lastCalledDate: null }),
          name: v.name, relation: v.relation, frequencyDays: Number(v.frequencyDays),
        });
        UI.toast(isNew ? 'Added' : 'Saved');
        renderFamily(container);
      },
      onDelete: isNew ? null : async () => {
        await Storage.remove(existing.id);
        for (const k of await Storage.getAll('family.calls')) {
          if (k.contactId === existing.id) await Storage.remove(k.id);
        }
        UI.toast('Deleted');
        renderFamily(container);
      },
      deleteLabel: isNew ? null : `Delete ${existing.name}`,
      deleteConfirm: isNew ? null : { title: `Delete “${existing.name}”?`, message: 'Removes the contact and its call history.' },
    });
  });
}

function contactRow(c, s, container) {
  const calledToday = s.daysSince === 0;
  const calledBtn = UI.el('button', {
    class: 'btn-called' + (calledToday ? ' is-done' : ''),
    type: 'button',
    disabled: calledToday,
    html: calledToday ? UI.icon('check') + '<span>Today</span>' : '<span>Called</span>',
    onClick: (e) => { e.stopPropagation(); markCalled(c, container); },
  });
  return UI.listRow({
    leading: UI.el('div', { class: 'avatar', text: initials(c.name) }),
    title: c.name,
    subtitle: [c.relation, lastCalledText(s)].filter(Boolean).join(' · '),
    value: statusText(s),
    tone: s.needsCall ? 'negative' : 'muted',
    trailing: calledBtn,
    onTap: () => openContactSheet(c, container),
  });
}

async function renderFamily(container) {
  const contacts = await Storage.getAll('family.contacts');
  const today = todayISO();

  const slot = document.getElementById('header-action');
  if (slot) {
    slot.replaceChildren();
    slot.append(UI.el('button', {
      type: 'button', 'aria-label': 'Add family member',
      html: UI.icon('plus'),
      onClick: () => openContactSheet(null, container),
    }));
  }

  container.replaceChildren();

  if (!contacts.length) {
    container.append(UI.el('div', { class: 'card' }, UI.emptyState({
      icon: 'plus',
      title: 'No one added yet',
      hint: 'Add the people you want to keep in regular touch with.',
      actionLabel: 'Add family member',
      onAction: () => openContactSheet(null, container),
    })));
    return;
  }

  const rows = contacts.map((c) => ({ c, s: contactStatus(c, today) }));
  const needs = rows.filter((r) => r.s.needsCall).sort((a, b) => {
    if (a.s.neverCalled !== b.s.neverCalled) return a.s.neverCalled ? -1 : 1;
    return (b.s.overdueBy || 0) - (a.s.overdueBy || 0);
  });
  const upcoming = rows.filter((r) => !r.s.needsCall).sort((a, b) => b.s.overdueBy - a.s.overdueBy);

  container.append(UI.el('div', { class: 'family-summary' },
    UI.el('span', { text: `${contacts.length} ${contacts.length === 1 ? 'person' : 'people'}` }),
    UI.el('span', {
      class: needs.length ? 'fs-alert' : '',
      text: needs.length ? `${needs.length} need${needs.length === 1 ? 's' : ''} a call` : 'all caught up',
    })));

  if (needs.length) {
    container.append(UI.el('div', { class: 'card' },
      UI.el('div', { class: 'group-head is-alert', text: 'Needs a call' }),
      UI.list(needs.map((r) => contactRow(r.c, r.s, container)))));
  }
  if (upcoming.length) {
    container.append(UI.el('div', { class: 'card' },
      UI.el('div', { class: 'group-head', text: 'Coming up' }),
      UI.list(upcoming.map((r) => contactRow(r.c, r.s, container)))));
  }
}

registerModule({
  id: 'family',
  label: 'Family',
  icon: '♥',
  render: renderFamily,
});
