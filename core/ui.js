/* core/ui.js — shared UI components (Phase 2).
   All render to real DOM nodes so event handlers wire up cleanly. Modules
   compose screens from these instead of hand-rolling markup + CSS.

   Exposes: window.UI = { el, icon, listRow, list, statGroup, emptyState,
                          proportionBars, segmented, confirmDialog, openSheet,
                          toast }
*/

window.UI = (function () {
  'use strict';

  // ---- tiny DOM builder --------------------------------------------------
  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in node) { try { node[k] = v; } catch (e) { node.setAttribute(k, v); } }
        else node.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  // ---- icons (inline SVG, currentColor) --------------------------------
  const ICON = {
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l5 5M4 20l1.5-5L16 4.5a2.1 2.1 0 0 1 3 3L8.5 18 4 20z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13M6 12l6 6 6-6"/></svg>',
  };
  const icon = (name) => ICON[name] || '';

  // ---- list + rows -----------------------------------------------------
  /* listRow({ title, subtitle, value, tone, tag, onTap, actions })
     tone     : 'positive' | 'negative' | 'muted' — colours the value
     tag      : small pill after the title
     onTap    : whole row becomes a button (chevron unless `trailing` is set)
     leading  : element shown before the title (e.g. an avatar chip)
     trailing : element shown on the right (e.g. a button); its clicks don't
                trigger onTap
     actions  : [{ icon:'trash'|'pencil'|..., label, danger, onClick }] */
  function listRow(o) {
    o = o || {};
    const titleEl = el('div', { class: 'lr-title' },
      el('span', { class: 'lr-title-text', text: o.title != null ? String(o.title) : '' }),
      o.tag ? el('span', { class: 'lr-tag', text: o.tag }) : null);
    const main = el('div', { class: 'lr-main' }, titleEl,
      o.subtitle ? el('div', { class: 'lr-sub', text: o.subtitle }) : null);

    const showChevron = o.onTap && !o.trailing;
    const right = el('div', { class: 'lr-right' },
      o.value != null ? el('div', { class: 'lr-value' + (o.tone ? ' is-' + o.tone : ''), text: String(o.value) }) : null,
      o.trailing ? el('div', { class: 'lr-trailing', onClick: (e) => e.stopPropagation() }, o.trailing) : null,
      ...((o.actions || []).map((a) => el('button', {
        class: 'lr-action' + (a.danger ? ' is-danger' : ''),
        type: 'button',
        'aria-label': a.label || 'action',
        title: a.label || '',
        html: a.icon ? icon(a.icon) : (a.label || ''),
        onClick: (e) => { e.stopPropagation(); a.onClick && a.onClick(e); },
      }))),
      showChevron ? el('span', { class: 'lr-chevron', html: ICON.chevron }) : null);

    const row = el('div', { class: 'list-row' + (o.onTap ? ' is-tappable' : '') },
      o.leading ? el('div', { class: 'lr-leading' }, o.leading) : null, main, right);
    if (o.onTap) {
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      const go = (e) => o.onTap(e);
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); }
      });
    }
    return row;
  }

  function list(rows, opts) {
    return el('div', { class: 'list' + ((opts && opts.class) ? ' ' + opts.class : '') }, ...(rows || []));
  }

  // ---- stat group (fixes the wrapping 3-up row) ----------------------
  /* statGroup(items, { bare }) -> a .card with evenly divided cells (or just
     the .stat-group div when bare, to drop into an existing card).
     Collapses to stacked label/value rows under ~340px (see style.css). */
  function statGroup(items, opts) {
    const group = el('div', { class: 'stat-group' },
      ...(items || []).map((it) => el('div', { class: 'stat-cell' },
        el('div', { class: 'sg-label', text: it.label }),
        el('div', { class: 'sg-value' + (it.tone ? ' is-' + it.tone : ''), text: String(it.value) }))));
    return (opts && opts.bare) ? group : el('div', { class: 'card' }, group);
  }

  // ---- empty state --------------------------------------------------
  function emptyState(o) {
    o = o || {};
    return el('div', { class: 'empty-state' },
      o.icon ? el('div', { class: 'es-icon', html: icon(o.icon) || o.icon }) : null,
      el('div', { class: 'es-title', text: o.title || 'Nothing here yet' }),
      o.hint ? el('div', { class: 'es-hint', text: o.hint }) : null,
      o.actionLabel ? el('button', {
        class: 'btn-secondary', type: 'button', text: o.actionLabel,
        onClick: () => o.onAction && o.onAction(),
      }) : null);
  }

  // ---- proportion bars (category breakdown) ------------------------
  /* proportionBars([{ label, value }], { currency }) -> element.
     Sorted desc, each row shows a bar (share of total), amount and %. */
  function proportionBars(rows, opts) {
    opts = opts || {};
    const cur = opts.currency || '';
    const data = (rows || []).map((r) => ({ label: String(r.label), value: Number(r.value) || 0 }))
      .sort((a, b) => b.value - a.value);
    const total = data.reduce((t, r) => t + r.value, 0) || 1;
    return el('div', { class: 'prop-list' }, ...data.map((r) => {
      const pct = (r.value / total) * 100;
      return el('div', { class: 'prop-row' },
        el('div', { class: 'prop-head' },
          el('span', { class: 'prop-name', text: r.label }),
          el('span', { class: 'prop-val', text: fmtMoney(r.value, cur) })),
        el('div', { class: 'prop-track' }, el('div', { class: 'prop-fill', style: { width: pct.toFixed(1) + '%' } })),
        el('div', { class: 'prop-pct', text: pct.toFixed(0) + '%' }));
    }));
  }

  // ---- segmented control (reusable sub-tabs) ----------------------
  function segmented(options, activeId, onChange) {
    return el('div', { class: 'subtab-bar', role: 'tablist' },
      ...(options || []).map((o) => el('button', {
        class: 'subtab-btn' + (o.id === activeId ? ' active' : ''),
        type: 'button', role: 'tab', text: o.label,
        onClick: () => { if (o.id !== activeId) onChange(o.id); },
      })));
  }

  // ---- overlay plumbing -------------------------------------------
  let openLayers = 0;
  function lockScroll(on) {
    openLayers += on ? 1 : -1;
    document.body.style.overflow = openLayers > 0 ? 'hidden' : '';
  }
  function focusables(root) {
    return [...root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
  }
  function trap(container, e) {
    if (e.key !== 'Tab') return;
    const f = focusables(container);
    if (!f.length) return;
    const first = f[0], lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  }

  // ---- confirm dialog -> Promise<boolean> ------------------------
  function confirmDialog(o) {
    o = o || {};
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const done = (val) => {
        window.removeEventListener('keydown', onKey, true);
        scrim.remove();
        lockScroll(false);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else trap(dialog, e);
      };
      const confirmBtn = el('button', {
        class: 'btn-primary' + (o.destructive === false ? '' : ' btn-destructive-solid'),
        type: 'button', text: o.confirmLabel || 'Delete',
        onClick: () => done(true),
      });
      const cancelBtn = el('button', {
        class: 'btn-secondary', type: 'button', text: o.cancelLabel || 'Cancel',
        onClick: () => done(false),
      });
      const dialog = el('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
        el('div', { class: 'dialog-title', text: o.title || 'Are you sure?' }),
        o.message ? el('div', { class: 'dialog-msg', text: o.message }) : null,
        el('div', { class: 'dialog-actions' }, confirmBtn, cancelBtn));
      const scrim = el('div', {
        class: 'dialog-scrim',
        onClick: (e) => { if (e.target === scrim) done(false); },
      }, dialog);
      document.body.append(scrim);
      lockScroll(true);
      window.addEventListener('keydown', onKey, true);
      confirmBtn.focus();
    });
  }

  // ---- bottom sheet with a form --------------------------------
  /* openSheet({ title, fields, submitLabel, onSubmit, extra, onDelete,
                deleteLabel, deleteConfirm })
     fields: [{ name, label, type, placeholder, required, options, min, step,
                inputmode, rows }]
       type: 'text' | 'number' | 'date' | 'select' | 'textarea'
       options: ['A','B'] or [{ value, label }]
     onSubmit(valuesObject): return/throw a string -> shown as error, stays open.
       Anything else (incl. a Promise resolving falsy) -> closes.
     extra: an element rendered below the fields (e.g. a read-only log).
     onDelete: if set, adds a destructive button; runs deleteConfirm (a
       confirmDialog opts object) first, then onDelete(), then closes.
     Returns a close() function. */
  function openSheet(o) {
    o = o || {};
    const prevFocus = document.activeElement;
    const fields = o.fields || [];
    const inputs = {};

    const fieldEls = fields.map((f) => {
      const id = 'sf_' + f.name;
      let input;
      if (f.type === 'select') {
        input = el('select', { id, name: f.name });
        (f.options || []).forEach((opt) => {
          const val = typeof opt === 'object' ? opt.value : opt;
          const lbl = typeof opt === 'object' ? opt.label : opt;
          input.append(el('option', { value: val, text: lbl }));
        });
        if (f.value != null) input.value = f.value;
      } else if (f.type === 'textarea') {
        input = el('textarea', { id, name: f.name, rows: f.rows || 4, placeholder: f.placeholder || '' });
        if (f.value != null) input.value = f.value;
      } else {
        input = el('input', {
          id, name: f.name, type: f.type || 'text',
          placeholder: f.placeholder || '',
          inputmode: f.inputmode || (f.type === 'number' ? 'decimal' : null),
        });
        if (f.min != null) input.min = f.min;
        if (f.step != null) input.step = f.step;
        if (f.value != null) input.value = f.value;
      }
      inputs[f.name] = { input, field: f };
      return el('label', { class: 'sf-row' },
        el('span', { class: 'sf-label', text: f.label || f.name }),
        input);
    });

    const errEl = el('div', { class: 'sheet-error', hidden: true });

    const submit = async () => {
      const values = {};
      for (const [name, { input, field }] of Object.entries(inputs)) {
        let v = input.value;
        if (field.type === 'number') v = v === '' ? '' : Number(v);
        else if (typeof v === 'string') v = v.trim();
        if (field.required && (v === '' || v == null || (field.type === 'number' && Number.isNaN(v)))) {
          showErr(`${field.label || name} is required.`);
          input.focus();
          return;
        }
        values[name] = v;
      }
      try {
        const res = await o.onSubmit(values);
        if (typeof res === 'string' && res) { showErr(res); return; }
        close();
      } catch (e) {
        showErr(e && e.message ? e.message : String(e));
      }
    };
    const showErr = (m) => { errEl.textContent = m; errEl.hidden = false; };

    const form = el('form', {
      class: 'ui-form',
      onSubmit: (e) => { e.preventDefault(); submit(); },
    }, ...fieldEls,
      o.extra || null,
      errEl,
      el('div', { class: 'sheet-actions' },
        el('button', { class: 'btn-primary', type: 'submit', text: o.submitLabel || 'Save' }),
        el('button', { class: 'btn-secondary', type: 'button', text: 'Cancel', onClick: () => close() })),
      o.onDelete ? el('button', {
        class: 'btn-plain sheet-delete', type: 'button',
        text: o.deleteLabel || 'Delete',
        onClick: async () => {
          const ok = await confirmDialog(o.deleteConfirm || { title: 'Delete this?', message: 'This cannot be undone.' });
          if (!ok) return;
          try { await o.onDelete(); close(); }
          catch (e) { showErr(e && e.message ? e.message : String(e)); }
        },
      }) : null);

    const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || 'Form' },
      el('div', { class: 'sheet-grip' }),
      o.title ? el('div', { class: 'sheet-title', text: o.title }) : null,
      form);

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else trap(sheet, e);
    };
    const scrim = el('div', {
      class: 'sheet-scrim',
      onClick: (e) => { if (e.target === scrim) close(); },
    }, sheet);

    function close() {
      window.removeEventListener('keydown', onKey, true);
      scrim.remove();
      lockScroll(false);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }

    document.body.append(scrim);
    lockScroll(true);
    window.addEventListener('keydown', onKey, true);
    const firstInput = fieldEls[0] && fieldEls[0].querySelector('input,select,textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
    return close;
  }

  // ---- toast (transient confirmation) ---------------------------
  let toastTimer = null;
  function toast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = el('div', { class: 'toast', role: 'status', text: msg });
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 1900);
  }

  return { el, icon, listRow, list, statGroup, emptyState, proportionBars, segmented, confirmDialog, openSheet, toast };
})();
