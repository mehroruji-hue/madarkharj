// پلن را در خود آدرس اینترنتی جا می‌دهیم تا گیرنده به هیچ نصب و حسابی نیاز نداشته باشد

const b64 = {
  enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  },
};

// فشرده‌سازی دستی نام فیلدها تا آدرس کوتاه بماند
export function encodePlan(plan) {
  const idx = Object.fromEntries(plan.people.map((p, i) => [p.id, i]));
  const compact = {
    n: plan.name,
    p: plan.people.map((p) => [p.name, p.card || '', p.guests || 0]),
    e: plan.expenses.map((e) => [
      e.title || '',
      idx[e.payer],
      e.amount,
      (e.shares || []).length === plan.people.length ? [] : (e.shares || []).map((id) => idx[id]),
    ]),
    c: (plan.payments || []).map((c) => [idx[c.from], idx[c.to], c.amount, c.note || '']),
    r: plan.tol || 0,
  };
  return b64.enc(JSON.stringify(compact));
}

export function decodePlan(code) {
  const c = JSON.parse(b64.dec(code));
  const people = c.p.map(([name, card, guests], i) => ({ id: `p${i}`, name, card, guests: guests || 0 }));
  const expenses = c.e.map(([title, payer, amount, shares]) => ({
    title,
    payer: `p${payer}`,
    amount,
    shares: (shares?.length ? shares : people.map((_, i) => i)).map((i) => `p${i}`),
  }));
  const payments = (c.c || []).map(([from, to, amount, note]) => ({
    from: `p${from}`,
    to: `p${to}`,
    amount,
    note,
  }));
  return { name: c.n, people, expenses, payments, tol: Number(c.r) || 0 };
}

export const shareUrl = (plan) =>
  `${location.origin}${location.pathname}#/v/${encodePlan(plan)}`;

export const waLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const tgLink = (url, text) =>
  `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

export async function nativeShare(title, text, url) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title, text, url });
    return true;
  } catch {
    return false;
  }
}
