import * as db from './db.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  view: localStorage.getItem('view') || 'tab',
  list: localStorage.getItem('list') || 'groceries',
  tab: null,
  items: [],
  editingId: null,
};

// ---------- Helpers ----------
// R1 234.50 — dot decimals to match what people type into the amount field
const money = (cents) => 'R' + (Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function parseMoney(str) {
  const n = Number(String(str).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function timeAgo(ts) {
  const d = new Date(ts);
  const today = new Date();
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ` ${time}`;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

let toastTimer;
function toast(message, action) {
  const t = $('#toast');
  t.replaceChildren(el('span', { textContent: message }));
  if (action) {
    t.append(el('button', { type: 'button', textContent: action.label, onclick: () => { t.hidden = true; action.run(); } }));
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

const fail = (err) => (err instanceof db.AuthError ? showLogin() : toast(err.message));

// ---------- Auth ----------
function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
}

async function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  setView(state.view);
  setList(state.list);
  await refresh();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector('button');
  $('#login-error').textContent = '';
  button.disabled = true;
  try {
    await db.login(form.email.value, form.password.value);
    form.reset();
    await showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await db.logout().catch(() => {});
  showLogin();
});

// ---------- Navigation ----------
function setView(view) {
  state.view = view;
  localStorage.setItem('view', view);
  $('#tab-view').hidden = view !== 'tab';
  $('#shop-view').hidden = view !== 'shop';
  $('#view-title').textContent = view === 'tab' ? 'Bar Tab' : 'Shopping';
  document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

document.querySelectorAll('.bottom-nav button').forEach((b) =>
  b.addEventListener('click', () => { setView(b.dataset.view); refresh(); })
);

// ---------- Bar tab ----------
function renderTab() {
  const t = state.tab;
  if (!t) return;
  const card = $('#balance-card');
  const negative = t.balanceCents < 0;
  card.classList.toggle('negative', negative);
  $('#balance-status').textContent = negative ? 'In the red' : 'In the green';
  $('#balance-amount').textContent = (negative ? '−' : '') + money(t.balanceCents);
  $('#beer-price').textContent = money(t.beerPriceCents);
  $('#coke-price').textContent = money(t.cokePriceCents);

  const list = $('#history');
  if (t.transactions.length === 0) {
    list.replaceChildren(el('li', { className: 'empty', textContent: 'No transactions yet.' }));
    return;
  }
  list.replaceChildren(
    ...t.transactions.map((tx) =>
      el('li', {},
        el('div', { className: 'h-main' },
          el('div', { className: 'h-label', textContent: tx.label }),
          el('div', { className: 'h-meta', textContent: `${tx.user} · ${timeAgo(tx.createdAt)}` })
        ),
        el('span', { className: `h-amt ${tx.amountCents > 0 ? 'pos' : 'neg'}`, textContent: (tx.amountCents > 0 ? '+' : '−') + money(tx.amountCents) }),
        el('button', {
          className: 'icon-btn', type: 'button', textContent: '✕', ariaLabel: `Remove ${tx.label}`,
          onclick: () => {
            if (confirm(`Remove "${tx.label}" (${money(tx.amountCents)}) from the history?`)) {
              db.deleteTransaction(tx.id).then(setTab).catch(fail);
            }
          },
        })
      )
    )
  );
}

function setTab(tab, bump = false) {
  state.tab = tab;
  renderTab();
  if (bump) {
    const card = $('#balance-card');
    card.classList.remove('bump');
    void card.offsetWidth;
    card.classList.add('bump');
  }
}

async function addTransaction(amountCents, label) {
  const tab = await db.addTransaction(amountCents, label);
  setTab(tab, true);
  navigator.vibrate?.(15);
  const id = tab.transactions[0]?.id;
  toast(`${label} ${amountCents > 0 ? '+' : '−'}${money(amountCents)}`, {
    label: 'Undo',
    run: () => db.deleteTransaction(id).then(setTab).catch(fail),
  });
}

$('#add-beer').addEventListener('click', () => addTransaction(-state.tab.beerPriceCents, 'Beer').catch(fail));
$('#add-coke').addEventListener('click', () => addTransaction(-state.tab.cokePriceCents, 'Coke').catch(fail));

$('#custom-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sign = Number(e.submitter?.dataset.sign || 1);
  const cents = parseMoney($('#custom-amount').value);
  if (!cents || cents <= 0) {
    toast('Enter an amount first');
    $('#custom-amount').focus();
    return;
  }
  const note = $('#custom-note').value.trim() || (sign > 0 ? 'Added' : 'Subtracted');
  try {
    await addTransaction(sign * cents, note);
    $('#custom-amount').value = '';
    $('#custom-note').value = '';
    $('#custom-amount').blur();
    $('#custom-note').blur();
  } catch (err) {
    fail(err);
  }
});

$('#prices-btn').addEventListener('click', () => {
  $('#beer-input').value = (state.tab.beerPriceCents / 100).toFixed(2);
  $('#coke-input').value = (state.tab.cokePriceCents / 100).toFixed(2);
  $('#prices-dialog').showModal();
});

$('#prices-dialog').addEventListener('close', async () => {
  if ($('#prices-dialog').returnValue !== 'save') return;
  const beerPriceCents = parseMoney($('#beer-input').value);
  const cokePriceCents = parseMoney($('#coke-input').value);
  if (!(beerPriceCents > 0 && cokePriceCents > 0)) return toast('Prices must be more than R0');
  try {
    setTab(await db.setPrices(beerPriceCents, cokePriceCents));
    toast('Prices saved');
  } catch (err) {
    fail(err);
  }
});

// ---------- Shopping ----------
function setList(list) {
  state.list = list;
  state.editingId = null;
  localStorage.setItem('list', list);
  document.querySelectorAll('.segmented button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.list === list)));
  $('#new-item').placeholder = list === 'groceries' ? 'Add a grocery item…' : 'Add something to get on Takealot…';
}

document.querySelectorAll('.segmented button').forEach((b) =>
  b.addEventListener('click', async () => {
    setList(b.dataset.list);
    state.items = [];
    renderItems();
    await loadItems().catch(fail);
  })
);

function setItems(items) {
  state.items = items;
  renderItems();
}

const loadItems = async () => setItems(await db.getItems(state.list));

function renderItems() {
  const ul = $('#items');
  ul.replaceChildren(...state.items.map(renderItem));
  $('#items-empty').hidden = state.items.length > 0;
  $('#clear-done').hidden = !state.items.some((i) => i.done);
}

function renderItem(item) {
  const li = el('li', { className: `item${item.done ? ' done' : ''}` });
  const check = el('button', {
    className: 'check', type: 'button', ariaLabel: item.done ? `Untick ${item.text}` : `Tick ${item.text}`,
    onclick: () => {
      item.done = !item.done; // optimistic
      renderItems();
      db.updateItem(state.list, item.id, { done: item.done }).then(setItems).catch(fail);
    },
  });

  if (state.editingId === item.id) {
    const input = el('input', { className: 'edit-input', value: item.text, maxLength: 200, ariaLabel: 'Edit item' });
    let finished = false;
    const finish = async (save) => {
      if (finished) return;
      finished = true;
      state.editingId = null;
      const text = input.value.trim();
      if (save && text && text !== item.text) {
        await db.updateItem(state.list, item.id, { text }).then(setItems).catch(fail);
      } else {
        renderItems();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    li.append(check, input);
    queueMicrotask(() => { input.focus(); input.select(); });
    return li;
  }

  const text = el('span', {
    className: 'text', textContent: item.text, title: 'Tap to edit',
    onclick: () => { state.editingId = item.id; renderItems(); },
  });
  const del = el('button', {
    className: 'icon-btn', type: 'button', textContent: '✕', ariaLabel: `Delete ${item.text}`,
    onclick: async () => {
      try {
        const list = state.list;
        setItems(await db.deleteItem(list, item.id));
        toast(`Deleted "${item.text}"`, {
          label: 'Undo',
          run: () => db.addItem(list, item.text).then((items) => list === state.list && setItems(items)).catch(fail),
        });
      } catch (err) {
        fail(err);
      }
    },
  });
  li.append(check, text, del);
  return li;
}

$('#add-item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#new-item');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    setItems(await db.addItem(state.list, text));
  } catch (err) {
    input.value = text;
    fail(err);
  }
  input.focus();
});

$('#clear-done').addEventListener('click', async () => {
  const count = state.items.filter((i) => i.done).length;
  if (!confirm(`Remove ${count} ticked item${count === 1 ? '' : 's'}?`)) return;
  setItems(await db.clearDone(state.list).catch((err) => (fail(err), state.items)));
});

// ---------- Sync ----------
// Keep both phones roughly in sync: refresh on focus and every 10s while visible.
async function refresh() {
  if ($('#app-view').hidden) return;
  try {
    if (state.view === 'tab') setTab(await db.getTab());
    else if (state.editingId === null) await loadItems();
  } catch (err) {
    fail(err);
  }
}

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());
setInterval(() => document.visibilityState === 'visible' && state.editingId === null && refresh(), 10_000);

// ---------- Boot ----------
db.currentUser().then((user) => (user ? showApp() : showLogin())).catch(() => showLogin());

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
