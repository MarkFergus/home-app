// Data layer: talks to Supabase directly. Row Level Security in supabase/schema.sql
// restricts every table to the users listed in home_members.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export class AuthError extends Error {}

let names = {}; // user_id → display name

function check({ data, error }) {
  if (error) {
    if (error.status === 401 || /JWT/i.test(error.message)) throw new AuthError('Not logged in');
    throw new Error(error.message);
  }
  return data;
}

async function loadMembers() {
  const rows = check(await supabase.from('home_members').select('user_id, name'));
  names = Object.fromEntries(rows.map((r) => [r.user_id, r.name]));
}

// ---------- Auth ----------
export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) return null;
  await loadMembers();
  return names[id] || null;
}

export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
  const user = await currentUser();
  if (!user) {
    await supabase.auth.signOut();
    throw new Error("This account isn't on the allowlist yet (see README).");
  }
  return user;
}

export const logout = () => supabase.auth.signOut();

// ---------- Bar tab ----------
export async function getTab() {
  const [balance, settings, txs] = await Promise.all([
    supabase.rpc('home_tab_balance'),
    supabase.from('home_settings').select('key, value'),
    supabase.from('home_tab_transactions').select('id, amount_cents, label, created_by, created_at').order('id', { ascending: false }).limit(100),
  ]);
  const prices = Object.fromEntries(check(settings).map((s) => [s.key, s.value]));
  return {
    balanceCents: Number(check(balance)),
    beerPriceCents: prices.beer_price_cents,
    cokePriceCents: prices.coke_price_cents,
    transactions: check(txs).map((t) => ({
      id: t.id,
      amountCents: t.amount_cents,
      label: t.label,
      user: names[t.created_by] || '?',
      createdAt: Date.parse(t.created_at),
    })),
  };
}

export async function addTransaction(amountCents, label) {
  check(await supabase.from('home_tab_transactions').insert({ amount_cents: amountCents, label: label.slice(0, 80) }));
  return getTab();
}

export async function deleteTransaction(id) {
  check(await supabase.from('home_tab_transactions').delete().eq('id', id));
  return getTab();
}

export async function setPrices(beerPriceCents, cokePriceCents) {
  check(await supabase.from('home_settings').upsert([
    { key: 'beer_price_cents', value: beerPriceCents },
    { key: 'coke_price_cents', value: cokePriceCents },
  ]));
  return getTab();
}

// ---------- Shopping lists ----------
// Unticked first (newest on top), then ticked (most recently ticked on top)
export async function getItems(list) {
  const rows = check(await supabase.from('home_items').select('id, text, done, created_by, updated_at').eq('list', list));
  return rows
    .sort((a, b) => a.done - b.done || (a.done ? b.updated_at.localeCompare(a.updated_at) : b.id - a.id))
    .map((r) => ({ id: r.id, text: r.text, done: r.done, createdBy: names[r.created_by] || '?' }));
}

export async function addItem(list, text) {
  check(await supabase.from('home_items').insert({ list, text: text.slice(0, 200) }));
  return getItems(list);
}

export async function updateItem(list, id, patch) {
  check(await supabase.from('home_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
  return getItems(list);
}

export async function deleteItem(list, id) {
  check(await supabase.from('home_items').delete().eq('id', id));
  return getItems(list);
}

export async function clearDone(list) {
  check(await supabase.from('home_items').delete().eq('list', list).eq('done', true));
  return getItems(list);
}
