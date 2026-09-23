// محاسبه‌ی سهم‌ها و پیدا کردن رندترین پلن پرداخت

// وزن هر نفر: خودش به‌علاوه‌ی مهمان‌های همراهش
export const weightOf = (p) => 1 + Math.max(0, p.guests || 0);
export const totalWeight = (people) => people.reduce((s, p) => s + weightOf(p), 0);

/**
 * دفتر کامل حساب‌ها.
 * expenses: {title, payer, amount, shares: [id...]}
 * payments: پرداخت نقدی بین دو نفر {from, to, amount}
 * خروجی: {paid, share, cashOut, cashIn, bal}
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

const UNITS = [500000, 100000, 50000, 10000, 5000, 1000, 500, 100, 50, 10, 1];
const roundTo = (v, unit) => (unit > 1 ? Math.round(v / unit) * unit : Math.round(v));

/**
 * پلن پرداخت.
 * هدف اول: هر بدهکار فقط یک بار پرداخت کند و مبالغ تا حد ممکن رند باشند.
 * اگر ممکن نشد: پلن حریصانه، که در آن ممکن است کسی دو بار پرداخت کند.
 * خروجی: {transfers, unit, singlePayment, residual}
 */
export function settle(bal, { units = UNITS, round = false } = {}) {
  if (!round) units = [1]; // مبلغ دقیق، بدون رند کردن
  const entries = Object.entries(bal);
  const debtors = entries.filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, amount: -v }));
  const creditors = entries.filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, amount: v }));
  if (!debtors.length || !creditors.length) {
    return { transfers: [], unit: 1, singlePayment: true, residual: 0 };
  }
  const smallest = Math.min(...debtors.map((d) => d.amount));
  const totalDebt = debtors.reduce((s, d) => s + d.amount, 0);
  // هیچ‌کس نباید به خاطر رند کردن بیشتر از یک درصدِ کل (یا یک واحد) ضرر کند
  const acceptable = (unit) => Math.max(unit, 0.01 * totalDebt);

  for (const unit of units) {
    if (unit > smallest / 2 && unit > 1) continue; // واحدی که بدهی کوچک را صفر کند به درد نمی‌خورد
    const plan = singlePaymentPlan(debtors, creditors, unit);
    if (!plan) continue;
    const residual = residualOf(plan, bal);
    if (residual > acceptable(unit)) continue; // خیلی درشت رند شده، واحد کوچک‌تر را امتحان کن
    return { transfers: plan, unit, singlePayment: true, residual };
  }

  // اگر «هر نفر یک پرداخت» ممکن نشد: پلن حریصانه، ولی با مبالغ تا حد ممکن رند
  const plan = greedyPlan(debtors, creditors);
  for (const unit of units) {
    if (unit === 1) break;
    if (unit > Math.min(...plan.map((t) => t.amount)) / 4) continue;
    const rounded = plan.map((t) => ({ ...t, amount: roundTo(t.amount, unit) }));
    if (residualOf(rounded, bal) <= acceptable(unit)) {
      return { transfers: rounded, unit, singlePayment: false, residual: residualOf(rounded, bal) };
    }
  }
  return { transfers: plan, unit: 1, singlePayment: false, residual: residualOf(plan, bal) };
}

// آیا می‌توان هر بدهکار را به یک طلبکار نسبت داد، طوری که با رند کردن جور دربیاید؟
function singlePaymentPlan(debtors, creditors, unit) {
  const ds = debtors
    .map((d) => ({ ...d, paid: Math.max(unit, roundTo(d.amount, unit)) }))
    .sort((a, b) => b.paid - a.paid);
  const nc = creditors.length;
  // بزرگ‌ترین طلبکار، باقی‌مانده‌ی رند کردن را جذب می‌کند (معمولاً خودش هم راضی است)
  const absorber = creditors.reduce((bi, c, i, a) => (c.amount > a[bi].amount ? i : bi), 0);
  const got = new Array(nc).fill(0);
  const cnt = new Array(nc).fill(0);
  const assign = new Array(ds.length).fill(-1);
  let best = null;
  let nodes = 0;

  const search = (i) => {
    if (nodes++ > 200000) return;
    if (i === ds.length) {
      let err = 0;
      for (let k = 0; k < nc; k++) {
        // هر طلبکار حداکثر نصف واحد رند به ازای هر پرداختی که می‌گیرد اختلاف داشته باشد
        const tol = k === absorber ? Infinity : cnt[k] * unit * 0.5 + 0.5;
        const diff = Math.abs(got[k] - creditors[k].amount);
        if (diff > tol) return;
        if (cnt[k] === 0) return; // طلبکاری که هیچ پرداختی نمی‌گیرد یعنی پلن ناقص است
        err += diff;
      }
      if (!best || err < best.err) best = { err, assign: [...assign] };
      return;
    }
    for (let k = 0; k < nc; k++) {
      if (k !== absorber && got[k] + ds[i].paid - creditors[k].amount > unit) continue; // هرس کردن
      got[k] += ds[i].paid;
      cnt[k]++;
      assign[i] = k;
      search(i + 1);
      got[k] -= ds[i].paid;
      cnt[k]--;
      assign[i] = -1;
    }
  };

  search(0);
  if (!best) return null;
  return ds.map((d, i) => ({ from: d.id, to: creditors[best.assign[i]].id, amount: d.paid }));
}

function greedyPlan(debtors, creditors) {
  const ds = debtors.map((d) => ({ ...d })).sort((a, b) => b.amount - a.amount);
  const cs = creditors.map((c) => ({ ...c })).sort((a, b) => b.amount - a.amount);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < ds.length && j < cs.length) {
    const amount = Math.min(ds[i].amount, cs[j].amount);
    if (amount > 0.5) out.push({ from: ds[i].id, to: cs[j].id, amount: Math.round(amount) });
    ds[i].amount -= amount;
    cs[j].amount -= amount;
    if (ds[i].amount <= 0.5) i++;
    if (cs[j].amount <= 0.5) j++;
  }
  return out;
}

// بیشترین اختلافی که رند کردن برای یک نفر ایجاد کرده
export function residualOf(transfers, bal) {
  const net = Object.fromEntries(Object.keys(bal).map((id) => [id, 0]));
  for (const t of transfers) {
    net[t.from] += t.amount;
    net[t.to] -= t.amount;
  }
  return Math.max(0, ...Object.keys(bal).map((id) => Math.abs(bal[id] + net[id])));
}
