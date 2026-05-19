(() => {
  'use strict';

  const STORAGE_KEY = 'spend-tracker-v1';
  const RECENT_LIMIT = 10;

  const CURRENCY_META = {
    VND: { locale: 'vi-VN', decimals: 0, sign: '₫' },
    USD: { locale: 'en-US', decimals: 2, sign: '$' },
    EUR: { locale: 'de-DE', decimals: 2, sign: '€' },
    GBP: { locale: 'en-GB', decimals: 2, sign: '£' },
    JPY: { locale: 'ja-JP', decimals: 0, sign: '¥' },
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    app: $('app'),
    modal: $('currencyModal'),
    modalNote: $('modalNote'),
    todayTotal: $('todayTotal'),
    todayCount: $('todayCount'),
    weekTotal: $('weekTotal'),
    monthTotal: $('monthTotal'),
    currencySign: $('currencySign'),
    amountInput: $('amountInput'),
    addBtn: $('addBtn'),
    form: $('entryForm'),
    chips: $('chips'),
    recentList: $('recentList'),
    recentEmpty: $('recentEmpty'),
    recentMore: $('recentMore'),
    exportBtn: $('exportBtn'),
    importBtn: $('importBtn'),
    importFile: $('importFile'),
    changeCurrencyBtn: $('changeCurrencyBtn'),
  };

  let state = { currency: null, entries: [] };
  let selectedCategory = null;
  let formatter = null;

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { currency: null, entries: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('bad shape');
      const entries = Array.isArray(parsed.entries) ? parsed.entries.filter(isValidEntry) : [];
      const currency = CURRENCY_META[parsed.currency] ? parsed.currency : null;
      return { currency, entries };
    } catch {
      return { currency: null, entries: [] };
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function isValidEntry(e) {
    return e && typeof e.id === 'string'
      && typeof e.ts === 'number' && Number.isFinite(e.ts)
      && typeof e.amount === 'number' && Number.isFinite(e.amount) && e.amount > 0
      && (e.category === null || typeof e.category === 'string');
  }

  // ---------- Formatting ----------
  function buildFormatter() {
    const meta = CURRENCY_META[state.currency];
    formatter = new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: state.currency,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    });
  }

  function fmt(amount) {
    return formatter ? formatter.format(amount) : String(amount);
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDateTime(ts) {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay) return fmtTime(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + fmtTime(ts);
  }

  // ---------- Time buckets ----------
  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function inToday(ts) {
    return ts >= startOfDay(Date.now());
  }

  function inLast7Days(ts) {
    return ts >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }

  function inThisMonth(ts) {
    const d = new Date(ts);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }

  function sum(entries, pred) {
    let s = 0;
    let n = 0;
    for (const e of entries) {
      if (pred(e.ts)) { s += e.amount; n++; }
    }
    return { sum: s, count: n };
  }

  // ---------- Parsing input ----------
  function parseAmount(raw) {
    if (raw == null) return NaN;
    let s = String(raw).trim();
    if (!s) return NaN;
    // Strip everything except digits, dot, comma, minus
    s = s.replace(/[^\d.,-]/g, '');
    // If both . and , present, treat the last one as decimal separator
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      const decSep = lastDot > lastComma ? '.' : ',';
      const thouSep = decSep === '.' ? ',' : '.';
      s = s.split(thouSep).join('');
      if (decSep === ',') s = s.replace(',', '.');
    } else if (lastComma >= 0) {
      // Only comma — could be decimal or thousands. If it has exactly 3 digits after, treat as thousands.
      const after = s.length - lastComma - 1;
      if (after === 3 && !/,/.test(s.slice(0, lastComma))) {
        s = s.replace(',', '');
      } else {
        s = s.replace(',', '.');
      }
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    const meta = CURRENCY_META[state.currency];
    return meta.decimals === 0 ? Math.round(n) : Math.round(n * 100) / 100;
  }

  // ---------- Rendering ----------
  function render() {
    const today = sum(state.entries, inToday);
    const week = sum(state.entries, inLast7Days);
    const month = sum(state.entries, inThisMonth);

    els.todayTotal.textContent = fmt(today.sum);
    els.todayCount.textContent = today.count === 1 ? '1 entry today' : `${today.count} entries today`;
    els.weekTotal.textContent = fmt(week.sum);
    els.monthTotal.textContent = fmt(month.sum);
    els.currencySign.textContent = CURRENCY_META[state.currency].sign;

    // Recent list
    const sorted = [...state.entries].sort((a, b) => b.ts - a.ts);
    const shown = sorted.slice(0, RECENT_LIMIT);
    els.recentList.innerHTML = '';
    for (const e of shown) {
      const li = document.createElement('li');
      const amt = document.createElement('span');
      amt.className = 'recent-amount';
      amt.textContent = fmt(e.amount);

      const meta = document.createElement('span');
      meta.className = 'recent-meta';
      if (e.category) {
        const cat = document.createElement('span');
        cat.className = 'recent-cat';
        cat.textContent = e.category;
        meta.appendChild(cat);
      }
      const time = document.createElement('span');
      time.textContent = fmtDateTime(e.ts);
      meta.appendChild(time);

      const del = document.createElement('button');
      del.className = 'del-btn';
      del.setAttribute('aria-label', 'Delete entry');
      del.textContent = '✕';
      del.addEventListener('click', () => deleteEntry(e.id));

      li.appendChild(amt);
      li.appendChild(meta);
      li.appendChild(del);
      els.recentList.appendChild(li);
    }

    const empty = sorted.length === 0;
    els.recentEmpty.hidden = !empty;
    els.recentMore.textContent = sorted.length > RECENT_LIMIT
      ? `+${sorted.length - RECENT_LIMIT} older`
      : '';
  }

  function updateAddBtn() {
    const n = parseAmount(els.amountInput.value);
    els.addBtn.disabled = !Number.isFinite(n) || n <= 0;
  }

  // ---------- Mutations ----------
  function addEntry() {
    const amount = parseAmount(els.amountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      amount,
      category: selectedCategory,
    };
    state.entries.push(entry);
    save();
    els.amountInput.value = '';
    clearCategory();
    updateAddBtn();
    render();
    els.amountInput.focus();
  }

  function deleteEntry(id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    const ok = confirm(`Delete ${fmt(entry.amount)}${entry.category ? ' (' + entry.category + ')' : ''}?`);
    if (!ok) return;
    state.entries = state.entries.filter(e => e.id !== id);
    save();
    render();
  }

  function clearCategory() {
    selectedCategory = null;
    els.chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
  }

  // ---------- Currency modal ----------
  function showEl(el) { el.hidden = false; el.style.display = ''; }
  function hideEl(el) { el.hidden = true; el.style.display = 'none'; }

  function showCurrencyModal(isChange) {
    els.modalNote.textContent = isChange
      ? 'Existing entries keep their numeric value — no FX conversion.'
      : 'You can change this later.';
    showEl(els.modal);
  }
  function hideCurrencyModal() {
    hideEl(els.modal);
  }

  function pickCurrency(code) {
    if (!CURRENCY_META[code]) return;
    state.currency = code;
    save();
    buildFormatter();
    hideCurrencyModal();
    showEl(els.app);
    render();
    els.amountInput.focus();
  }

  // ---------- Export / Import ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const ymd = d.toISOString().slice(0, 10);
    a.href = url;
    a.download = `spend-tracker-${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const currency = CURRENCY_META[parsed && parsed.currency] ? parsed.currency : state.currency;
        const entries = Array.isArray(parsed && parsed.entries) ? parsed.entries.filter(isValidEntry) : null;
        if (!entries) throw new Error('No valid entries');
        const ok = confirm(`Import ${entries.length} entries (${currency})? This replaces your current data.`);
        if (!ok) return;
        state = { currency, entries };
        save();
        buildFormatter();
        render();
      } catch (err) {
        alert('Could not import: ' + (err && err.message ? err.message : 'invalid file'));
      }
    };
    reader.readAsText(file);
  }

  // ---------- Wire up ----------
  function init() {
    state = load();

    // Chips
    els.chips.querySelectorAll('.chip').forEach(chip => {
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        const cat = chip.dataset.cat;
        if (selectedCategory === cat) {
          clearCategory();
        } else {
          clearCategory();
          selectedCategory = cat;
          chip.setAttribute('aria-pressed', 'true');
        }
        els.amountInput.focus();
      });
    });

    // Form
    els.amountInput.addEventListener('input', updateAddBtn);
    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      addEntry();
    });

    // Currency modal
    els.modal.querySelectorAll('.currency-btn').forEach(btn => {
      btn.addEventListener('click', () => pickCurrency(btn.dataset.currency));
    });
    els.changeCurrencyBtn.addEventListener('click', () => showCurrencyModal(true));

    // Export / Import
    els.exportBtn.addEventListener('click', exportData);
    els.importBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });

    // Boot
    if (!state.currency) {
      showCurrencyModal(false);
    } else {
      buildFormatter();
      showEl(els.app);
      render();
      els.amountInput.focus();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
