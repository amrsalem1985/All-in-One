/* modules/finance.js
   Matches notes section 1:
     A. Daily spending / Monthly overview — Fixed / Variable
     B. Debits — Loans / Installments
     C. Assets — Owned / To be owned
   Everything here is stored under collections prefixed "finance.".
*/

const CURRENCY_DEFAULT = 'AED';

const SPEND_CATEGORIES = {
  Fixed: ['Rent', 'Credit Card Payment', 'Gas', 'School Fees', 'School Transport', 'Telephone', 'Car Wash'],
  Variable: ['Food', 'Outing', 'Misc'],
};

const NW_TYPES = [
  { collection: 'finance.assets', label: 'Assets', categories: ['Owned Car', 'Flat (Owned)', 'Flat (Planned)', 'Other'] },
  { collection: 'finance.investments', label: 'Investments', categories: ['Stocks', 'Crypto', 'Fund', 'Other'] },
  { collection: 'finance.debts', label: 'Debits', categories: ['Loan — Credit Card', 'Loan — Friend', 'Loan — Family', 'Installment', 'Other'] },
];

const SNAPSHOTS = 'finance.networth_snapshots';

let financeSubtab = 'overview';

async function renderFinance(container) {
  container.innerHTML = `
    <div class="subtab-bar">
      <button class="subtab-btn" data-tab="overview">Overview</button>
      <button class="subtab-btn" data-tab="spending">Spending</button>
      <button class="subtab-btn" data-tab="networth">Net Worth</button>
      <button class="subtab-btn" data-tab="history">History</button>
    </div>
    <div id="finance-body"></div>
  `;
  container.querySelectorAll('.subtab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === financeSubtab);
    b.addEventListener('click', () => {
      financeSubtab = b.dataset.tab;
      renderFinance(container);
    });
  });

  const body = container.querySelector('#finance-body');
  if (financeSubtab === 'overview') return renderFinanceOverview(body);
  if (financeSubtab === 'spending') return renderSpending(body);
  if (financeSubtab === 'networth') return renderNetWorth(body);
  if (financeSubtab === 'history') return renderFinanceHistory(body);
}

// ---------- NET WORTH SNAPSHOTS ----------

async function computeNetWorth() {
  const [assets, investments, debts] = await Promise.all([
    Storage.getAll('finance.assets'),
    Storage.getAll('finance.investments'),
    Storage.getAll('finance.debts'),
  ]);
  return {
    assets: sumByValue(assets),
    investments: sumByValue(investments),
    debts: sumByValue(debts),
    value: sumByValue(assets) + sumByValue(investments) - sumByValue(debts),
  };
}

// Runs on every unlock (via the module's onUnlock hook). Keeps exactly one
// snapshot per calendar day, refreshed to the current number each unlock so the
// latest figure for "today" is always what's stored.
async function recordDailySnapshot() {
  const today = todayISO();
  const nw = await computeNetWorth();
  const existing = (await Storage.getAll(SNAPSHOTS)).find((s) => s.date === today);
  await Storage.put(SNAPSHOTS, { ...(existing || {}), date: today, ...nw });
}

// ---------- OVERVIEW ----------

async function renderFinanceOverview(container) {
  const currency = await Storage.getSetting('currency', CURRENCY_DEFAULT);
  const [txns, snapshots] = await Promise.all([
    Storage.getAll('finance.transactions'),
    Storage.getAll(SNAPSHOTS),
  ]);
  const nw = await computeNetWorth();
  const netWorth = nw.value;

  const thisMonth = todayISO().slice(0, 7);
  const monthTxns = txns.filter((t) => t.date && t.date.startsWith(thisMonth));
  const fixedTotal = sumByValue(monthTxns.filter((t) => t.type === 'Fixed'));
  const variableTotal = sumByValue(monthTxns.filter((t) => t.type === 'Variable'));

  const series = snapshots
    .map((s) => ({ date: s.date, value: Number(s.value) || 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const chart = sparkline(series, { currency });
  const historyBody = chart
    ? `<div class="mini-chart">${chart}</div>`
    : '<div class="empty-hint">History builds as you use the app — check back in a few days.</div>';

  container.innerHTML = `
    <div class="card hero-card">
      <div class="hero-label">Net Worth</div>
      <div class="hero-value ${netWorth >= 0 ? 'positive' : 'negative'}">${fmtMoney(netWorth, currency)}</div>
    </div>
    <div class="grid-3">
      <div class="card stat-card">
        <div class="stat-label">This month — Fixed</div>
        <div class="stat-value">${fmtMoney(fixedTotal, currency)}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">This month — Variable</div>
        <div class="stat-value">${fmtMoney(variableTotal, currency)}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">This month — Total</div>
        <div class="stat-value negative">${fmtMoney(fixedTotal + variableTotal, currency)}</div>
      </div>
    </div>
    <div class="card">
      <div class="nw-section-header"><span>Net Worth — history</span></div>
      ${historyBody}
    </div>
  `;
}

// ---------- SPENDING ----------

async function renderSpending(container) {
  const currency = await Storage.getSetting('currency', CURRENCY_DEFAULT);
  const txns = (await Storage.getAll('finance.transactions')).sort((a, b) => (a.date < b.date ? 1 : -1));

  container.innerHTML = `
    <div class="card">
      <form id="txn-form" class="nw-add-form">
        <input type="date" class="txn-date" value="${todayISO()}" required />
        <select class="txn-type">
          <option value="Fixed">Fixed</option>
          <option value="Variable">Variable</option>
        </select>
        <select class="txn-category"></select>
        <input type="number" placeholder="Amount" class="txn-amount" required />
        <input type="text" placeholder="Note (optional)" class="txn-note" />
        <button type="submit" class="btn-primary">Add transaction</button>
      </form>
    </div>
    <div id="txn-list"></div>
  `;

  const typeSelect = container.querySelector('.txn-type');
  const categorySelect = container.querySelector('.txn-category');
  function refreshCategories() {
    categorySelect.innerHTML = SPEND_CATEGORIES[typeSelect.value].map((c) => `<option value="${c}">${c}</option>`).join('');
  }
  typeSelect.addEventListener('change', refreshCategories);
  refreshCategories();

  const list = container.querySelector('#txn-list');
  if (!txns.length) {
    list.innerHTML = '<div class="card"><div class="empty-hint">No transactions yet</div></div>';
  } else {
    list.innerHTML = txns.map((t) => `
      <div class="card nw-row" data-id="${t.id}">
        <div>
          <div class="nw-row-name">${escapeHtml(t.category)} <span class="tag">${t.type}</span></div>
          <div class="nw-row-cat">${escapeHtml(t.date)}${t.note ? ' · ' + escapeHtml(t.note) : ''}</div>
        </div>
        <div class="nw-row-value">${fmtMoney(Number(t.value) || 0, currency)}</div>
        <button class="nw-delete" title="Delete">✕</button>
      </div>
    `).join('');
    list.querySelectorAll('.nw-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        await Storage.remove(e.target.closest('.nw-row').dataset.id);
        renderSpending(container);
      });
    });
  }

  container.querySelector('#txn-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = container.querySelector('.txn-date').value;
    const type = typeSelect.value;
    const category = categorySelect.value;
    const value = parseFloat(container.querySelector('.txn-amount').value);
    const note = container.querySelector('.txn-note').value.trim();
    if (!date || isNaN(value)) return;
    await Storage.put('finance.transactions', { date, type, category, value, note });
    renderSpending(container);
  });
}

// ---------- NET WORTH ----------

async function renderNetWorth(container) {
  const currency = await Storage.getSetting('currency', CURRENCY_DEFAULT);
  container.innerHTML = '<div id="nw-sections"></div>';
  const wrap = container.querySelector('#nw-sections');

  for (const typeDef of NW_TYPES) {
    const records = await Storage.getAll(typeDef.collection);
    const section = document.createElement('div');
    section.className = 'card nw-section';
    section.innerHTML = `
      <div class="nw-section-header">
        <span>${typeDef.label}</span>
        <span class="nw-section-total">${fmtMoney(sumByValue(records), currency)}</span>
      </div>
      <div class="nw-list">
        ${records.length ? records.map((r) => `
          <div class="nw-row" data-id="${r.id}">
            <div>
              <div class="nw-row-name">${escapeHtml(r.name)}</div>
              <div class="nw-row-cat">${escapeHtml(r.category)}</div>
            </div>
            <div class="nw-row-value">${fmtMoney(Number(r.value) || 0, currency)}</div>
            <button class="nw-delete" title="Delete">✕</button>
          </div>
        `).join('') : '<div class="empty-hint">Nothing added yet</div>'}
      </div>
      <form class="nw-add-form">
        <input type="text" placeholder="Name" class="nw-name" required />
        <select class="nw-category">
          ${typeDef.categories.map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <input type="number" placeholder="Value" class="nw-value" required />
        <button type="submit" class="btn-primary">Add</button>
      </form>
    `;
    wrap.appendChild(section);

    section.querySelector('.nw-add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = section.querySelector('.nw-name').value.trim();
      const category = section.querySelector('.nw-category').value;
      const value = parseFloat(section.querySelector('.nw-value').value);
      if (!name || isNaN(value)) return;
      await Storage.put(typeDef.collection, { name, category, value, updatedAt: new Date().toISOString() });
      renderNetWorth(container);
    });

    section.querySelectorAll('.nw-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        await Storage.remove(e.target.closest('.nw-row').dataset.id);
        renderNetWorth(container);
      });
    });
  }
}

// ---------- HISTORY (past months + Fixed vs Variable trend) ----------

let historyMonth = null; // selected month key, e.g. "2026-09"

async function renderFinanceHistory(container) {
  const currency = await Storage.getSetting('currency', CURRENCY_DEFAULT);
  const txns = await Storage.getAll('finance.transactions');

  if (!txns.length) {
    container.innerHTML = '<div class="card"><div class="empty-hint">No transactions yet — add some on the Spending tab.</div></div>';
    return;
  }

  // group by month key
  const byMonth = {};
  txns.forEach((t) => {
    if (!t.date) return;
    const key = t.date.slice(0, 7);
    (byMonth[key] || (byMonth[key] = [])).push(t);
  });
  const monthsDesc = Object.keys(byMonth).sort().reverse();
  if (!historyMonth || !byMonth[historyMonth]) historyMonth = monthsDesc[0];

  // trend: last up-to-12 months, oldest -> newest
  const trendRows = monthsDesc.slice(0, 12).reverse().map((key) => {
    const rows = byMonth[key];
    return {
      label: monthLabel(key),
      a: sumByValue(rows.filter((t) => t.type === 'Fixed')),
      b: sumByValue(rows.filter((t) => t.type === 'Variable')),
    };
  });
  const trendSvg = groupedBars(trendRows, {
    currency, aLabel: 'Fixed', bLabel: 'Variable',
    aColor: 'var(--gold)', bColor: 'var(--sage)',
  });

  // selected-month breakdown
  const monthRows = byMonth[historyMonth].slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const fixedTotal = sumByValue(monthRows.filter((t) => t.type === 'Fixed'));
  const variableTotal = sumByValue(monthRows.filter((t) => t.type === 'Variable'));

  const byCategory = {};
  monthRows.forEach((t) => {
    const k = `${t.type} · ${t.category}`;
    byCategory[k] = (byCategory[k] || 0) + (Number(t.value) || 0);
  });
  const catRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  container.innerHTML = `
    <div class="card">
      <div class="nw-section-header"><span>Fixed vs Variable — last ${trendRows.length} month${trendRows.length === 1 ? '' : 's'}</span></div>
      ${trendSvg ? `<div class="mini-chart">${trendSvg}</div>` : '<div class="empty-hint">Not enough data yet.</div>'}
    </div>
    <div class="card">
      <form class="nw-add-form" style="border-top:none;padding-top:0;">
        <select id="history-month">
          ${monthsDesc.map((k) => `<option value="${k}" ${k === historyMonth ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}
        </select>
      </form>
      <div class="grid-3" style="margin-top:12px;margin-bottom:0;">
        <div class="stat-card"><div class="stat-label">Fixed</div><div class="stat-value">${fmtMoney(fixedTotal, currency)}</div></div>
        <div class="stat-card"><div class="stat-label">Variable</div><div class="stat-value">${fmtMoney(variableTotal, currency)}</div></div>
        <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value negative">${fmtMoney(fixedTotal + variableTotal, currency)}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="nw-section-header"><span>${escapeHtml(monthLabel(historyMonth))} — by category</span></div>
      <div class="nw-list">
        ${catRows.map(([name, val]) => `
          <div class="nw-row">
            <div><div class="nw-row-name">${escapeHtml(name)}</div></div>
            <div class="nw-row-value">${fmtMoney(val, currency)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelector('#history-month').addEventListener('change', (e) => {
    historyMonth = e.target.value;
    renderFinanceHistory(container);
  });
}

registerModule({
  id: 'finance',
  label: 'Finance',
  icon: '◆',
  render: renderFinance,
  onUnlock: recordDailySnapshot,
});
