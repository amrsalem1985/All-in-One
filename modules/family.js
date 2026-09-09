/* modules/family.js
   Matches notes section 2: Family — periodic calls reminder.
   Each contact has a call frequency; the list surfaces whoever is
   overdue first.
*/

async function renderFamily(container) {
  const contacts = await Storage.getAll('family.contacts');

  const withStatus = contacts.map((c) => {
    const last = c.lastCalledDate || null;
    const daysSince = last ? daysBetween(last, todayISO()) : Infinity;
    const overdueBy = daysSince - (Number(c.frequencyDays) || 7);
    return { ...c, daysSince, overdueBy };
  }).sort((a, b) => b.overdueBy - a.overdueBy);

  container.innerHTML = `
    <div class="section-title">Family — call reminders</div>
    <div id="family-list"></div>
    <div class="card">
      <form id="family-form" class="nw-add-form">
        <input type="text" placeholder="Name" class="fam-name" required />
        <input type="text" placeholder="Relation (e.g. Mom, Dad)" class="fam-relation" />
        <select class="fam-freq">
          <option value="1">Call daily</option>
          <option value="3">Every 3 days</option>
          <option value="7" selected>Weekly</option>
          <option value="14">Every 2 weeks</option>
          <option value="30">Monthly</option>
        </select>
        <button type="submit" class="btn-primary">Add family member</button>
      </form>
    </div>
  `;

  const list = container.querySelector('#family-list');
  if (!withStatus.length) {
    list.innerHTML = '<div class="card"><div class="empty-hint">No one added yet</div></div>';
  } else {
    list.innerHTML = withStatus.map((c) => {
      const overdue = c.overdueBy >= 0;
      const statusText = c.lastCalledDate
        ? (overdue ? `${c.overdueBy}d overdue` : `due in ${-c.overdueBy}d`)
        : 'never logged';
      return `
        <div class="card nw-row" data-id="${c.id}">
          <div>
            <div class="nw-row-name">${escapeHtml(c.name)}</div>
            <div class="nw-row-cat">${escapeHtml(c.relation || '')}${c.relation ? ' · ' : ''}every ${c.frequencyDays}d</div>
          </div>
          <div class="nw-row-value ${overdue ? 'negative' : ''}">${statusText}</div>
          <button class="fam-called btn-secondary" title="Mark called today">Called</button>
          <button class="nw-delete" title="Delete">✕</button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.fam-called').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('.nw-row').dataset.id;
        const rec = await Storage.get(id);
        await Storage.put('family.contacts', { ...rec, lastCalledDate: todayISO() });
        renderFamily(container);
      });
    });
    list.querySelectorAll('.nw-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        await Storage.remove(e.target.closest('.nw-row').dataset.id);
        renderFamily(container);
      });
    });
  }

  container.querySelector('#family-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = container.querySelector('.fam-name').value.trim();
    const relation = container.querySelector('.fam-relation').value.trim();
    const frequencyDays = parseInt(container.querySelector('.fam-freq').value, 10);
    if (!name) return;
    await Storage.put('family.contacts', { name, relation, frequencyDays, lastCalledDate: null });
    renderFamily(container);
  });
}

registerModule({
  id: 'family',
  label: 'Family',
  icon: '♥',
  render: renderFamily,
});
