/* modules/finance.js
   Overview / Spending / Net Worth / History. Every collection is prefixed
   "finance.". Built on the shared UI kit (window.UI): rows, bottom-sheet
   forms, confirm dialogs, stat groups, charts.
*/

const CURRENCY_DEFAULT = 'AED';
const SNAPSHOTS = 'finance.networth_snapshots';

const SPEND_CATEGORIES = {
  Fixed: ['Rent', 'Credit Card Payment', 'Gas', 'School Fees', 'School Transport', 'Telephone', 'Car Wash'],
  Variable: ['Food', 'Outing', 'Misc'],
};
const ALL_CATEGORIES = [...SPEND_CATEGORIES.Fixed, ...SPEND_CATEGORIES.Variable];
function catType(cat) {
  return SPEND_CATEGORIES.Variable.includes(cat) ? 'Variable' : 'Fixed';
}

const NW_TYPES = [
  { collection: 'finance.assets', label: 'Assets', categories: ['Owned Car', 'Flat (Owned)', 'Flat (Planned)', 'Other'] },
  { collection: 'finance.investments', label: 'Investments', categories: ['Stocks', 'Crypto', 'Fund', 'Other'] },
  { collection: 'finance.debts', label: 'Debts', categories: ['Loan — Credit Card', 'Loan — Friend', 'Loan — Family', 'Installment', 'Other'] },
];

let financeSubtab = 'overview';

async function renderFinance(container) {
  const seg = UI.segmented(
    [
      { id: 'overview', label: 'Overview' },
      { id: 'spending', label: 'Spending' },
      { id: 'networth', label: 'Net Worth' },
      { id: 'history', label: 'History' },
    ],
    financeSubtab,
    (id) => { financeSubtab = id; renderFinance(container); },
  );
  const body = UI.el('div', { id: 'finance-body' });
  container.replaceChildren(seg, body);

  // header "+" only on the tab where you add data
  const slot = document.getElementById('header-action');
  if (slot) {
    slot.replaceChildren();
    if (financeSubtab === 'spending') {
      slot.append(UI.el('button', {
        type: 'button', 'aria-label': 'Add transaction',
        html: UI.icon('plus'),
        onClick: () => openTxnSheet(null, body),
      }));
    }
  }

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

// Runs on every unlock (module onUnlock hook). One snapshot per calendar day,
// refreshed to the current figure each unlock.
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

  const ym = todayISO().slice(0, 7);
  const monthTx = txns.filter((t) => t.date && t.date.startsWith(ym));
  const fixed = sumByValue(monthTx.filter((t) => t.type === 'Fixed'));
  const variable = sumByValue(monthTx.filter((t) => t.type === 'Variable'));

  container.replaceChildren();

  container.append(UI.el('div', { class: 'card hero-card' },
    UI.el('div', { class: 'hero-label', text: 'Net Worth' }),
    UI.el('div', { class: 'hero-value ' + (nw.value >= 0 ? 'positive' : 'negative'), text: fmtMoney(nw.value, currency) })));

  container.append(UI.statGroup([
    { label: 'This month — Fixed', value: fmtMoney(fixed, currency), tone: 'muted' },
    { label: 'Variable', value: fmtMoney(variable, currency) },
    { label: 'Total', value: fmtMoney(fixed + variable, currency), tone: 'negative' },
  ]));

  const series = snapshots
    .map((s) => ({ date: s.date, value: Number(s.value) || 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const chart = sparkline(series, { currency });
  container.append(UI.el('div', { class: 'card' },
    sectionHeader('Net Worth — history'),
    chart
      ? UI.el('div', { class: 'mini-chart', html: chart })
      : UI.el('div', { class: 'empty-hint', text: 'History builds as you use the app — check back in a few days.' })));

  const catCard = UI.el('div', { class: 'card' }, sectionHeader('Top categories — ' + monthLabel(ym)));
  if (monthTx.length) {
    const byCat = {};
    monthTx.forEach((t) => { const k = t.category || 'Other'; byCat[k] = (byCat[k] || 0) + (Number(t.value) || 0); });
    catCard.append(UI.proportionBars(Object.entries(byCat).map(([label, value]) => ({ label, value })), { currency }));
  } else {
    catCard.append(UI.el('div', { class: 'empty-hint', text: 'No spending logged this month yet.' }));
  }
  container.append(catCard);
}

// ---------- SPENDING ----------

function openTxnSheet(existing, body) {
  UI.openSheet({
    title: existing ? 'Edit transaction' : 'Add transaction',
    submitLabel: existing ? 'Save' : 'Add',
    fields: [
      { name: 'date', label: 'Date', type: 'date', value: existing?.date || todayISO(), required: true },
      { name: 'category', label: 'Category', type: 'select', options: ALL_CATEGORIES, value: existing?.category || ALL_CATEGORIES[0] },
      { name: 'value', label: 'Amount', type: 'number', value: existing?.value ?? '', placeholder: '0', required: true, inputmode: 'decimal' },
      { name: 'note', label: 'Note', type: 'text', value: existing?.note || '', placeholder: 'Optional' },
    ],
    onSubmit: async (v) => {
      if (!(Number(v.value) > 0)) return 'Amount must be more than zero.';
      await Storage.put('finance.transactions', {
        ...(existing || {}),
        date: v.date, category: v.category, type: catType(v.category),
        value: Number(v.value), note: v.note,
      });
      UI.toast(existing ? 'Updated' : 'Added');
      renderSpending(body);
    },
  });
}

async function renderSpending(container) {
  const currency = await Storage.getSetting('currency', CURRENCY_DEFAULT);
  const txns = (await Storage.getAll('finance.transactions'))
    .filter((t) => t.date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  container.replaceChildren();

  if (!txns.length) {
    container.append(UI.el('div', { class: 'card' }, UI.emptyState({
      icon: 'plus',
      title: 'No transactions yet',
      hint: 'Tap + in the top bar to add your first one.',
      actionLabel: 'Add transaction',
      onAction: () => openTxnSheet(null, container),
    })));
    return;
  }

  const ym = todayISO().slice(0, 7);
  const monthTx = txns.filter((t) => t.date.startsWith(ym));
  const mf = sumByValue(monthTx.filter((t) => t.type === 'Fixed'));
  const mv = sumByValue(monthTx.filter((t) => t.type === 'Variable'));
  container.append(UI.statGroup([
    { label: monthLabel(ym) + ' — Fixed', value: fmtMoney(mf, currency), tone: 'muted' },
    { label: 'Variable', value: fmtMoney(mv, currency) },
    { label: 'Total', value: fmtMoney(mf + mv, currency), tone: 'negative' },
  ]));

  const byDay = new Map();
  txns.forEach((t) => { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); });

  for (const [date, rows] of byDay) {
    container.append(UI.el('div', { class: 'card' },
      UI.el('div', { class: 'day-head' },
        UI.el('span', { class: 'day-date', text: friendlyDate(date) }),
        UI.el('span', { class: 'day-total', text: fmtMoney(sumByValue(rows), currency) })),
      UI.list(rows.map((t) => UI.listRow({
        title: t.category,
        tag: t.type,
        subtitle: t.note || '',
        value: fmtMoney(Number(t.value) || 0, currency),
        onTap: () => openTxnSheet(t, container),
        actions: [{
          icon: 'trash', label: 'Delete', danger: true,
          onClick: async () => {
            const ok = await UI.confirmDialog({
              title: 'Delete this transaction?',
              message: `${t.category} · ${fmtMoney(Number(t.value) || 0, currency)}`,
            });
            if (ok) { await Storage.remove(t.id); UI.toast('Deleted'); renderSpending(container); }
          },
        }],
      })))));
  }
}

// ---------- NET WORTH ----------

function openNwSheet(typeDef, existing, container) {
  UI.openSheet({
    title: existing ? `Edit — ${typeDef.label}` : `Add — ${typeDef.label}`,
    submitLabel: existing ? 'Save' : 'Add',
    fields: [
      { name: 'name', label: 'Name', type: 'text', value: existing?.name || '', required: true, placeholder: typeDef.label === 'Debts' ? 'e.g. Car loan' : 'e.g. Flat' },
      { name: 'category', label: 'Category', type: 'select', options: typeDef.categories, value: existing?.category || typeDef.categories[0] },
      { name: 'value', label: 'Value', type: 'number', value: existing?.value ?? '', required: true, inputmode: 'decimal', placeholder: '0' },
    ],
    onSubmit: async (v) => {
      if (!(Number(v.value) >= 0)) return 'Value cannot be negative.';
      await Storage.put(typeDef.collection, {
        ...(existing || {}),
        name: v.name, category: v.category, value: Number(v.value), updatedAt: new Date().toISOString(),
      });
      UI.toast(existing ? 'Updated' : 'Added');
      renderNetWorth(container);
    },
  });
}

async function renderNetWorth(container) {
  const currency = await Storage.getSetting('currency', CURRENCY_DEFAULT);
  const nw = await computeNetWorth();

  container.replaceChildren();
  container.append(UI.el('div', { class: 'card hero-card' },
    UI.el('div', { class: 'hero-label', text: 'Net Worth' }),
    UI.el('div', { class: 'hero-value ' + (nw.value >= 0 ? 'positive' : 'negative'), text: fmtMoney(nw.value, currency) })));

  for (const typeDef of NW_TYPES) {
    const records = (await Storage.getAll(typeDef.collection))
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    const total = sumByValue(records);

    const header = UI.el('div', { class: 'nw-section-header' },
      UI.el('span', { text: typeDef.label }),
      UI.el('div', { class: 'nw-head-right' },
        UI.el('span', { class: 'nw-section-total', text: fmtMoney(total, currency) }),
        UI.el('button', {
          class: 'section-add', type: 'button', 'aria-label': 'Add to ' + typeDef.label,
          html: UI.icon('plus'),
          onClick: () => openNwSheet(typeDef, null, container),
        })));

    const bodyEl = records.length
      ? UI.list(records.map((r) => UI.listRow({
          title: r.name,
          subtitle: r.category,
          value: fmtMoney(Number(r.value) || 0, currency),
          tone: typeDef.label === 'Debts' ? 'negative' : undefined,
          onTap: () => openNwSheet(typeDef, r, container),
          actions: [{
            icon: 'trash', label: 'Delete', danger: true,
            onClick: async () => {
              const ok = await UI.confirmDialog({
                title: `Delete “${r.name}”?`,
                message: 'This removes it from your net worth.',
              });
              if (ok) { await Storage.remove(r.id); UI.toast('Deleted'); renderNetWorth(container); }
            },
          }],
        })))
      : UI.emptyState({ title: 'Nothing added', hint: `Tap + to add ${typeDef.label.toLowerCase()}.` });

    container.append(UI.el('div', { class: 'card nw-section' }, header, bodyEl));
  }
}

// ---------- HISTORY ----------

let historyMonth = null;

async function renderFinanceHistory(container) {
  const currency = await Storage.getSetting('currency', CURRENCY_DEFAULT);
  const txns = await Storage.getAll('finance.transactions');

  container.replaceChildren();

  if (!txns.length) {
    container.append(UI.el('div', { class: 'card' }, UI.emptyState({
      title: 'No history yet',
      hint: 'Add transactions on the Spending tab to see trends here.',
    })));
    return;
  }

  const byMonth = {};
  txns.forEach((t) => {
    if (!t.date) return;
    const k = t.date.slice(0, 7);
    (byMonth[k] || (byMonth[k] = [])).push(t);
  });
  const monthsDesc = Object.keys(byMonth).sort().reverse();
  if (!historyMonth || !byMonth[historyMonth]) historyMonth = monthsDesc[0];

  const trendRows = monthsDesc.slice(0, 12).reverse().map((k) => ({
    label: monthLabel(k),
    a: sumByValue(byMonth[k].filter((t) => t.type === 'Fixed')),
    b: sumByValue(byMonth[k].filter((t) => t.type === 'Variable')),
  }));
  container.append(UI.el('div', { class: 'card' },
    sectionHeader(`Fixed vs Variable — last ${trendRows.length} month${trendRows.length === 1 ? '' : 's'}`),
    UI.el('div', { class: 'mini-chart', html: groupedBars(trendRows, {
      currency, aLabel: 'Fixed', bLabel: 'Variable', aColor: 'var(--gold)', bColor: 'var(--sage)',
    }) })));

  const sel = UI.el('select', { class: 'month-select', 'aria-label': 'Month' },
    ...monthsDesc.map((k) => UI.el('option', { value: k, text: monthLabel(k), selected: k === historyMonth })));
  sel.addEventListener('change', () => { historyMonth = sel.value; renderFinanceHistory(container); });

  const mrows = byMonth[historyMonth];
  const mf = sumByValue(mrows.filter((t) => t.type === 'Fixed'));
  const mv = sumByValue(mrows.filter((t) => t.type === 'Variable'));
  container.append(UI.el('div', { class: 'card' },
    sel,
    UI.statGroup([
      { label: 'Fixed', value: fmtMoney(mf, currency), tone: 'muted' },
      { label: 'Variable', value: fmtMoney(mv, currency) },
      { label: 'Total', value: fmtMoney(mf + mv, currency), tone: 'negative' },
    ], { bare: true })));

  const byCat = {};
  mrows.forEach((t) => { const k = t.category || 'Other'; byCat[k] = (byCat[k] || 0) + (Number(t.value) || 0); });
  container.append(UI.el('div', { class: 'card' },
    sectionHeader(monthLabel(historyMonth) + ' — by category'),
    UI.proportionBars(Object.entries(byCat).map(([label, value]) => ({ label, value })), { currency })));
}

// ---------- shared ----------

function sectionHeader(text) {
  return UI.el('div', { class: 'nw-section-header' }, UI.el('span', { text }));
}

registerModule({
  id: 'finance',
  label: 'Finance',
  icon: '◆',
  render: renderFinance,
  onUnlock: recordDailySnapshot,
});
