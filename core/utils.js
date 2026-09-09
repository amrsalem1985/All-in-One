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

/* sparkline(series, opts)
   series: [{ date: 'YYYY-MM-DD', value: Number }, ...] (unsorted ok)
   opts:   { currency, width, height }
   Returns an <svg> string: a single gold line with a faint area fill,
   a zero baseline when the range crosses zero, and first/last date +
   min/max value labels. Returns '' when there are fewer than 2 points. */
function sparkline(series, opts = {}) {
  const pts = (series || [])
    .filter((p) => p && p.date != null && isFinite(Number(p.value)))
    .map((p) => ({ date: String(p.date), value: Number(p.value) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (pts.length < 2) return '';

  const currency = opts.currency || '';
  const W = opts.width || 320;
  const H = opts.height || 96;
  const padX = 8;
  const padTop = 10;
  const padBottom = 18;

  const values = pts.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }               // flat line -> give it room
  const includeZero = min > 0 && max > 0 ? false : true; // only stretch to 0 if it's near the range
  if (includeZero && min > 0) min = 0;
  if (includeZero && max < 0) max = 0;

  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const x = (i) => padX + (innerW * i) / (pts.length - 1);
  const y = (v) => padTop + innerH * (1 - (v - min) / (max - min));

  const linePts = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const areaPts = `${padX},${(padTop + innerH).toFixed(1)} ${linePts} ${(padX + innerW).toFixed(1)},${(padTop + innerH).toFixed(1)}`;

  const zeroLine = min < 0 && max > 0
    ? `<line x1="${padX}" y1="${y(0).toFixed(1)}" x2="${padX + innerW}" y2="${y(0).toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3"/>`
    : '';

  const lastV = pts[pts.length - 1].value;
  const dir = lastV >= pts[0].value ? 'var(--gold)' : 'var(--rust)';

  return `
<svg class="mini-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Net worth history">
  <polygon points="${areaPts}" fill="${dir}" fill-opacity="0.08" stroke="none"/>
  ${zeroLine}
  <polyline points="${linePts}" fill="none" stroke="${dir}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(lastV).toFixed(1)}" r="2.5" fill="${dir}"/>
  <text x="${padX}" y="${H - 6}" class="mini-chart-axis" text-anchor="start">${svgSafe(pts[0].date)}</text>
  <text x="${padX + innerW}" y="${H - 6}" class="mini-chart-axis" text-anchor="end">${svgSafe(pts[pts.length - 1].date)}</text>
  <text x="${padX}" y="${padTop}" class="mini-chart-axis" text-anchor="start">${svgSafe(fmtMoney(max, currency))}</text>
  <text x="${padX}" y="${padTop + innerH + 2}" class="mini-chart-axis" text-anchor="start">${svgSafe(fmtMoney(min, currency))}</text>
</svg>`;
}

/* groupedBars(rows, opts)
   rows: [{ label: 'Sep 2026', a: Number, b: Number }, ...] in display order
   opts: { currency, aLabel, bLabel, aColor, bColor, width, height }
   Returns an <svg> string: two bars per row group with a shared scale
   and a small legend. Returns '' when rows is empty. */
function groupedBars(rows, opts = {}) {
  const data = (rows || []).map((r) => ({
    label: String(r.label),
    a: Math.max(0, Number(r.a) || 0),
    b: Math.max(0, Number(r.b) || 0),
  }));
  if (!data.length) return '';

  const currency = opts.currency || '';
  const aColor = opts.aColor || 'var(--gold)';
  const bColor = opts.bColor || 'var(--sage)';
  const aLabel = opts.aLabel || 'A';
  const bLabel = opts.bLabel || 'B';

  const W = opts.width || 340;
  const H = opts.height || 150;
  const padX = 6;
  const padTop = 22;
  const padBottom = 22;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  const groupW = innerW / data.length;
  const barW = Math.min(16, (groupW - 6) / 2);
  const h = (v) => (innerH * v) / max;

  let bars = '';
  data.forEach((d, i) => {
    const cx = padX + groupW * i + groupW / 2;
    const ax = cx - barW - 1;
    const bx = cx + 1;
    const ay = padTop + innerH - h(d.a);
    const by = padTop + innerH - h(d.b);
    bars += `<rect x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" width="${barW.toFixed(1)}" height="${h(d.a).toFixed(1)}" fill="${aColor}" rx="1.5"/>`;
    bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${h(d.b).toFixed(1)}" fill="${bColor}" rx="1.5"/>`;
    bars += `<text x="${cx.toFixed(1)}" y="${H - 8}" class="mini-chart-axis" text-anchor="middle">${svgSafe(d.label)}</text>`;
  });

  const legend =
    `<rect x="${padX}" y="6" width="9" height="9" fill="${aColor}" rx="1.5"/>` +
    `<text x="${padX + 13}" y="14" class="mini-chart-axis" text-anchor="start">${svgSafe(aLabel)}</text>` +
    `<rect x="${padX + 70}" y="6" width="9" height="9" fill="${bColor}" rx="1.5"/>` +
    `<text x="${padX + 83}" y="14" class="mini-chart-axis" text-anchor="start">${svgSafe(bLabel)}</text>` +
    `<text x="${W - padX}" y="14" class="mini-chart-axis" text-anchor="end">max ${svgSafe(fmtMoney(max, currency))}</text>`;

  return `
<svg class="mini-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${svgSafe(aLabel)} versus ${svgSafe(bLabel)} by month">
  ${legend}
  <line x1="${padX}" y1="${padTop + innerH}" x2="${padX + innerW}" y2="${padTop + innerH}" stroke="var(--border)" stroke-width="1"/>
  ${bars}
</svg>`;
}

// ---------- crypto ----------

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
