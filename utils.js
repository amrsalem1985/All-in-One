/* core/utils.js — tiny helpers shared across modules */

function fmtMoney(n, currency) {
  const sign = n < 0 ? '-' : '';
  return `${sign}${currency} ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function sumByValue(records) {
  return records.reduce((t, r) => t + (Number(r.value) || 0), 0);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return Math.round((b - a) / 86400000);
}

// "2026-09-10" -> "Today" / "Yesterday" / "Wed 10 Sep"
function friendlyDate(iso) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d)) return String(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${wd} ${d.getDate()} ${mo}`;
}

// "2026-09" -> "Sep 2026"  (also accepts a full "2026-09-14" date)
function monthLabel(monthKey) {
  const [y, m] = String(monthKey).split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = (parseInt(m, 10) || 1) - 1;
  return `${names[idx] || '?'} ${y || ''}`.trim();
}

// ---------- inline SVG charts (no library — the app is fully offline) ----------

// Escape a value for use inside an SVG/HTML attribute or text node.
function svgSafe(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// short money for chart axes: "AED 1.7M" / "AED 96k" / "AED 420"
function fmtMoneyShort(n, currency) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const cur = currency ? currency + ' ' : '';
  if (abs >= 1e6) return `${sign}${cur}${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}${cur}${Math.round(abs / 1e3)}k`;
  return `${sign}${cur}${Math.round(abs)}`;
}

/* sparkline(series, opts)
   series: [{ date: 'YYYY-MM-DD', value: Number }, ...] (unsorted ok)
   opts:   { currency }
   An <svg> string: gold (up) / rust (down) line + faint fill, a dashed
   reference line at the starting value, the latest value top-left, the
   % change top-right, and the date range along the bottom. Labels sit
   outside the plot so nothing overlaps. '' for fewer than 2 points. */
function sparkline(series, opts = {}) {
  const pts = (series || [])
    .filter((p) => p && p.date != null && isFinite(Number(p.value)))
    .map((p) => ({ date: String(p.date), value: Number(p.value) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (pts.length < 2) return '';

  const cur = opts.currency || '';
  const W = 300, H = 132;
  const L = 8, R = 8, T = 26, B = 24;
  const plotW = W - L - R;
  const plotH = H - T - B;

  const values = pts.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.1 || 1;
  min -= pad; max += pad;

  const x = (i) => L + (plotW * i) / (pts.length - 1);
  const y = (v) => T + plotH * (1 - (v - min) / (max - min));

  const linePts = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const areaPts = `${L},${(T + plotH).toFixed(1)} ${linePts} ${(L + plotW).toFixed(1)},${(T + plotH).toFixed(1)}`;

  const first = pts[0].value;
  const last = pts[pts.length - 1].value;
  const up = last >= first;
  const stroke = up ? 'var(--gold)' : 'var(--rust)';
  const pct = first ? ((last - first) / Math.abs(first)) * 100 : 0;
  const deltaTxt = `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`;

  return `
<svg class="mini-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Net worth history">
  <line class="mini-chart-grid" x1="${L}" y1="${y(first).toFixed(1)}" x2="${L + plotW}" y2="${y(first).toFixed(1)}"/>
  <polygon points="${areaPts}" fill="${stroke}" fill-opacity="0.09"/>
  <polyline points="${linePts}" fill="none" stroke="${stroke}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3" fill="${stroke}"/>
  <text class="mini-chart-label" x="${L}" y="15" text-anchor="start">${svgSafe(fmtMoney(last, cur))}</text>
  <text class="mini-chart-delta ${up ? 'is-up' : 'is-down'}" x="${W - R}" y="15" text-anchor="end">${svgSafe(deltaTxt)}</text>
  <text class="mini-chart-axis" x="${L}" y="${H - 7}" text-anchor="start">${svgSafe(pts[0].date)}</text>
  <text class="mini-chart-axis" x="${W - R}" y="${H - 7}" text-anchor="end">${svgSafe(pts[pts.length - 1].date)}</text>
</svg>`;
}

/* groupedBars(rows, opts)
   rows: [{ label: 'Sep 2026', a: Number, b: Number }, ...] in display order
   opts: { currency, aLabel, bLabel, aColor, bColor }
   Two bars per group on a shared scale, a legend, and 2 gridlines with
   the max labelled. Month labels thin out when there are many groups.
   '' when rows is empty. */
function groupedBars(rows, opts = {}) {
  const data = (rows || []).map((r) => ({
    label: String(r.label),
    a: Math.max(0, Number(r.a) || 0),
    b: Math.max(0, Number(r.b) || 0),
  }));
  if (!data.length) return '';

  const cur = opts.currency || '';
  const aColor = opts.aColor || 'var(--gold)';
  const bColor = opts.bColor || 'var(--sage)';
  const aLabel = opts.aLabel || 'A';
  const bLabel = opts.bLabel || 'B';

  const W = 300, H = 158;
  const L = 8, R = 8, T = 30, B = 22;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const baseY = T + plotH;

  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  const groupW = plotW / data.length;
  const barW = Math.max(4, Math.min(15, (groupW - 6) / 2));
  const h = (v) => (plotH * v) / max;

  // month-only labels (a full "Sep 2026" rarely fits), thinned out when dense
  const shortLabel = true;
  const every = data.length <= 8 ? 1 : data.length <= 12 ? 2 : 3;

  const grid = [0.5, 1].map((f) => {
    const gy = baseY - plotH * f;
    return `<line class="mini-chart-grid" x1="${L}" y1="${gy.toFixed(1)}" x2="${L + plotW}" y2="${gy.toFixed(1)}"/>`;
  }).join('');

  let bars = '';
  data.forEach((d, i) => {
    const cx = L + groupW * i + groupW / 2;
    const ax = cx - barW - 1;
    const bx = cx + 1;
    bars += `<rect x="${ax.toFixed(1)}" y="${(baseY - h(d.a)).toFixed(1)}" width="${barW.toFixed(1)}" height="${h(d.a).toFixed(1)}" fill="${aColor}" rx="2"/>`;
    bars += `<rect x="${bx.toFixed(1)}" y="${(baseY - h(d.b)).toFixed(1)}" width="${barW.toFixed(1)}" height="${h(d.b).toFixed(1)}" fill="${bColor}" rx="2"/>`;
    if (i % every === 0) {
      const lbl = shortLabel ? d.label.split(' ')[0] : d.label;
      bars += `<text class="mini-chart-axis" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${svgSafe(lbl)}</text>`;
    }
  });

  const legend =
    `<rect x="${L}" y="6" width="10" height="10" fill="${aColor}" rx="2"/>` +
    `<text class="mini-chart-axis" x="${L + 15}" y="14.5" text-anchor="start">${svgSafe(aLabel)}</text>` +
    `<rect x="${L + 72}" y="6" width="10" height="10" fill="${bColor}" rx="2"/>` +
    `<text class="mini-chart-axis" x="${L + 87}" y="14.5" text-anchor="start">${svgSafe(bLabel)}</text>` +
    `<text class="mini-chart-axis" x="${W - R}" y="14.5" text-anchor="end">${svgSafe(fmtMoneyShort(max, cur))}</text>`;

  return `
<svg class="mini-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${svgSafe(aLabel)} versus ${svgSafe(bLabel)} by month">
  ${legend}
  ${grid}
  <line x1="${L}" y1="${baseY}" x2="${L + plotW}" y2="${baseY}" stroke="var(--border)" stroke-width="1"/>
  ${bars}
</svg>`;
}

// ---------- crypto ----------

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
