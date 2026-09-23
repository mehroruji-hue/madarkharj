// محاسبه‌ی سهم‌ها و ساختن پلن پرداخت

export const weightOf = (p) => 1 + Math.max(0, p.guests || 0);
export const totalWeight = (people) => people.reduce((s, p) => s + weightOf(p), 0);

/**
 * دفتر حساب.
 * expenses: {title, payer, amount, shares: [id...]}
 * payments: پرداخت نقدی بین دو نفر {from, to, amount}
 */
export function ledger(people, expenses = [], payments = []) {
  const zero = () => Object.fromEntries(people.map((p) => [p.id, 0]));
  const w = Object.fromEntries(people.map((p) => [p.id, weightOf(p)]));
  const paid = zero();
  const share = zero();
  const cashOut = zero();
  const cashIn = zero();

  for (const e of expenses) {
    const ids = (e.shares?.length ? e.shares : people.map((p) => p.id)).filter((id) => id in w);
    if (!ids.length || !(e.payer in w)) continue;
    const tw = ids.reduce((s, id) => s + w[id], 0) || 1;
    paid[e.payer] += e.amount;
    for (const id of ids) share[id] += (e.amount * w[id]) / tw;
  }
  for (const c of payments) {
    if (!(c.from in w) || !(c.to in w) || c.from === c.to) continue;
    cashOut[c.from] += c.amount;
    cashIn[c.to] += c.amount;
  }

  const bal = Object.fromEntries(
    people.map((p) => [p.id, paid[p.id] - share[p.id] + cashOut[p.id] - cashIn[p.id]])
  );
  return { paid, share, cashOut, cashIn, bal };
}

export const balances = (people, expenses, payments) => ledger(people, expenses, payments).bal;

// پله‌های گردی، از گردترین به ریزترین
const STEPS = [500000, 100000, 50000, 10000, 5000, 1000, 500, 100];

/**
 * گردترین مبلغ‌هایی که فاصله‌شان تا عدد دقیق از «tol» بیشتر نیست.
 * مثال: ۱۹۹٬۴۰۰ با تحمل ۱۰۰۰ ← ۲۰۰٬۰۰۰ (گردتر) و ۱۹۹٬۵۰۰ و ۱۹۹٬۴۰۰
 */
export function niceAmounts(exact, tol) {
  const out = new Map();
  for (const step of STEPS) {
    const v = Math.round(exact / step) * step;
    if (v > 0 && Math.abs(v - exact) <= tol && !out.has(v)) out.set(v, step);
  }
  const plain = Math.round(exact);
  if (!out.has(plain)) out.set(plain, 1);
  return [...out.entries()]
    .map(([v, step]) => ({ v, step, off: Math.abs(v - exact) }))
    .sort((a, b) => b.step - a.step || a.off - b.off);
}

/**
 * پلن پرداخت.
 * tol = حداکثر اختلافی که کاربر برای گرد شدن مبالغ قبول کرده (۰ یعنی مبلغ دقیق)
 * خروجی: {transfers:[{from,to,amount,exact}], singlePayment, residual, tol}
 */
export function settle(bal, { tol = 0 } = {}) {
  const entries = Object.entries(bal);
  const debtors = entries.filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, amount: -v }));
  const creditors = entries.filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, amount: v }));
  if (!debtors.length || !creditors.length) {
    return { transfers: [], singlePayment: true, residual: 0, tol };
  }

  const single = singlePaymentPlan(debtors, creditors, tol);
  if (single) return { transfers: single, singlePayment: true, residual: residualOf(single, bal), tol };

  const plan = roundPlan(greedyPlan(debtors, creditors), tol, bal);
  return { transfers: plan, singlePayment: false, residual: residualOf(plan, bal), tol };
}

// هر بدهکار فقط یک پرداخت: هر نفر را به یک طلبکار نسبت می‌دهیم
function singlePaymentPlan(debtors, creditors, tol) {
  const ds = [...debtors]
    .sort((a, b) => b.amount - a.amount)
    .map((d) => ({ ...d, options: niceAmounts(d.amount, tol) }));
  const nc = creditors.length;
  const got = new Array(nc).fill(0);
  const pick = new Array(ds.length).fill(null);
  let best = null;
  let nodes = 0;

  const search = (i) => {
    if (nodes++ > 300000 || (best && best.score === 0)) return;
    if (i === ds.length) {
      let err = 0;
      for (let k = 0; k < nc; k++) {
        const diff = Math.abs(got[k] - creditors[k].amount);
        if (diff > tol + 0.5) return;
        err += diff;
      }
      // هرچه مبالغ گردتر و اختلاف کمتر، بهتر
      const roundness = pick.reduce((s, p) => s + Math.log10(p.step), 0);
      const score = err - roundness * 1000;
      if (!best || score < best.score) best = { score, pick: pick.map((p) => ({ ...p })), to: [...assign] };
      return;
    }
    for (const opt of ds[i].options) {
      for (let k = 0; k < nc; k++) {
        if (got[k] + opt.v - creditors[k].amount > tol + 0.5) continue;
        got[k] += opt.v;
        pick[i] = opt;
        assign[i] = k;
        search(i + 1);
        got[k] -= opt.v;
        pick[i] = null;
        assign[i] = -1;
      }
    }
  };
  const assign = new Array(ds.length).fill(-1);
  search(0);
  if (!best) return null;
  return ds.map((d, i) => ({
    from: d.id,
    to: creditors[best.to[i]].id,
    amount: best.pick[i].v,
    exact: Math.round(d.amount),
  }));
}

function greedyPlan(debtors, creditors) {
  const ds = debtors.map((d) => ({ ...d })).sort((a, b) => b.amount - a.amount);
  const cs = creditors.map((c) => ({ ...c })).sort((a, b) => b.amount - a.amount);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < ds.length && j < cs.length) {
    const amount = Math.min(ds[i].amount, cs[j].amount);
    if (amount > 0.5) out.push({ from: ds[i].id, to: cs[j].id, amount: Math.round(amount), exact: Math.round(amount) });
    ds[i].amount -= amount;
    cs[j].amount -= amount;
    if (ds[i].amount <= 0.5) i++;
    if (cs[j].amount <= 0.5) j++;
  }
  return out;
}

/**
 * گرد کردن پرداخت‌ها، طوری که اختلافِ هیچ‌کس از «tol» بیشتر نشود.
 * چون ممکن است یک نفر چند پرداخت داشته باشد، بودجه‌ی گرد کردن را کم‌کم نصف می‌کنیم
 * تا وقتی اختلاف واقعی هیچ‌کس از حد مجاز بیشتر نباشد.
 */
function roundPlan(transfers, tol, bal) {
  if (tol <= 0) return transfers;
  for (let budget = tol; budget >= 1; budget = Math.floor(budget / 2)) {
    const cand = transfers.map((t) => ({ ...t, amount: niceAmounts(t.exact, budget)[0].v }));
    if (residualOf(cand, bal) <= tol + 0.5) return cand;
  }
  return transfers;
}

// بیشترین اختلافی که گرد کردن برای یک نفر ایجاد کرده
export function residualOf(transfers, bal) {
  const net = Object.fromEntries(Object.keys(bal).map((id) => [id, 0]));
  for (const t of transfers) {
    net[t.from] += t.amount;
    net[t.to] -= t.amount;
  }
  return Math.max(0, ...Object.keys(bal).map((id) => Math.abs(bal[id] + net[id])));
}
