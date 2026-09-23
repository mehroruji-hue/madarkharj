import { db } from './store.js';
import { balances, settle } from './settle.js';
import { fa, esc, money, parseMoney, uid, copy, toast } from './util.js';
import { encodePlan, decodePlan, shareUrl, waLink, tgLink, nativeShare } from './share.js';

const $ = (s, r = document) => r.querySelector(s);
const main = $('#main');
let deferredInstall = null;

const nameOf = (plan, id) => plan.people.find((p) => p.id === id)?.name || '؟';

function totals(plan) {
  const bal = balances(plan.people, plan.expenses);
  const total = plan.expenses.reduce((s, e) => s + e.amount, 0);
  const paid = Object.fromEntries(plan.people.map((p) => [p.id, 0]));
  for (const e of plan.expenses) paid[e.payer] = (paid[e.payer] || 0) + e.amount;
  const share = Object.fromEntries(plan.people.map((p) => [p.id, paid[p.id] - bal[p.id]]));
  return { bal, total, paid, share, plan: settle(bal) };
}

// ---------- مسیرها ----------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [name, a, b] = parts;
  if (name === 'plan' && db.get(a)) viewPlan(db.get(a), b || 'people');
  else if (name === 'v' && a) viewShared(parts.slice(1).join('/'));
  else viewHome();
  window.scrollTo(0, 0);
}

// ---------- خانه ----------

function viewHome() {
  const plans = db.all();
  main.innerHTML = `
    <header class="hero">
      <div><h1>مادرخرج</h1><p class="muted">خرج دورهمی رو تقسیم کن، بگو کی به کی چقدر بده</p></div>
      ${deferredInstall ? '<button class="btn small" id="install">نصب</button>' : ''}
    </header>
    <button class="btn primary block" id="new">➕ پلن جدید</button>
    ${plans.length
      ? `<h3 class="section-title">پلن‌های من</h3>
         <ul class="list">${plans.map((p) => {
           const t = p.expenses.reduce((s, e) => s + e.amount, 0);
           return `<li><a href="#/plan/${p.id}">
             <span class="li-text"><b>${esc(p.name)}</b>
               <span class="muted small">${fa(p.people.length)} نفر · ${money(t)} تومان${p.imported ? ' · از لینک' : ''}</span></span>
             <span class="chev">›</span></a></li>`;
         }).join('')}</ul>`
      : `<div class="card empty"><p>هنوز پلنی نساختی.</p><p class="muted small">یه پلن بساز، اسم‌ها و خرج‌ها رو وارد کن، و در آخر لینک تسویه رو برای بقیه بفرست. گیرنده‌ها لازم نیست چیزی نصب کنن.</p></div>`}
    <div class="card how">
      <h3>چطور کار می‌کنه؟</h3>
      <ol>
        <li>اسم آدم‌های پلن رو وارد کن</li>
        <li>هر خرجی که شد، با اسم پرداخت‌کننده ثبت کن</li>
        <li>مادرخرج سهم هر نفر و <b>رندترین پلن پرداخت</b> رو می‌گه</li>
        <li>لینک رو برای بقیه بفرست</li>
      </ol>
    </div>`;
  $('#new').onclick = () => {
    const name = prompt('اسم پلن چیه؟ (مثلاً: شام جمعه، سفر شمال)', 'دورهمی');
    if (name === null) return;
    const p = db.create(name.trim() || 'دورهمی');
    location.hash = `#/plan/${p.id}`;
  };
  $('#install')?.addEventListener('click', async () => {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    viewHome();
  });
}

// ---------- صفحه‌ی پلن ----------

function viewPlan(plan, tab) {
  const t = totals(plan);
  main.innerHTML = `
    <a class="back" href="#/">→ همه‌ی پلن‌ها</a>
    <header class="plan-head">
      <h2 id="title">${esc(plan.name)}</h2>
      <button class="icon-btn" id="rename" title="تغییر نام">✏️</button>
    </header>
    <div class="sum">
      <div><span class="muted small">کل خرج</span><b>${money(t.total)}</b></div>
      <div><span class="muted small">نفرات</span><b>${fa(plan.people.length)}</b></div>
      <div><span class="muted small">سهم هر نفر</span><b>${plan.people.length ? money(t.total / plan.people.length) : '—'}</b></div>
    </div>
    <nav class="tabs">
      <a href="#/plan/${plan.id}/people" class="${tab === 'people' ? 'on' : ''}">افراد</a>
      <a href="#/plan/${plan.id}/expenses" class="${tab === 'expenses' ? 'on' : ''}">خرج‌ها</a>
      <a href="#/plan/${plan.id}/settle" class="${tab === 'settle' ? 'on' : ''}">تسویه</a>
    </nav>
    <div id="tab"></div>`;
  $('#rename').onclick = () => {
    const name = prompt('اسم جدید پلن:', plan.name);
    if (name?.trim()) {
      db.update(plan.id, (p) => { p.name = name.trim(); });
      route();
    }
  };
  ({ people: tabPeople, expenses: tabExpenses, settle: tabSettle })[tab](plan, t);
}

function tabPeople(plan) {
  $('#tab').innerHTML = `
    <ul class="list">${plan.people.map((p) => `
      <li><div class="row-item person">
        <span class="li-text"><b>${esc(p.name)}</b>
          <span class="muted small">${p.card ? `کارت: ${fa(p.card)}` : 'شماره کارت ثبت نشده'}</span></span>
        <button class="icon-btn" data-card="${p.id}" title="شماره کارت">💳</button>
        <button class="icon-btn" data-del="${p.id}" title="حذف">🗑️</button>
      </div></li>`).join('')}</ul>
    <form class="card" id="addp">
      <label>اسم نفر جدید</label>
      <div class="row">
        <input class="grow" id="pname" placeholder="مثلاً مریم" autocomplete="off" required>
        <button class="btn primary" type="submit">افزودن</button>
      </div>
      <p class="muted small">شماره کارت اختیاریه، ولی اگه واردش کنی بقیه می‌تونن با یه کلیک کپی‌ش کنن.</p>
    </form>`;
  $('#addp').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#pname').value.trim();
    if (!name) return;
    db.update(plan.id, (p) => p.people.push({ id: uid(), name }));
    route();
  };
  $('#tab').querySelectorAll('[data-card]').forEach((b) => {
    b.onclick = () => {
      const person = plan.people.find((x) => x.id === b.dataset.card);
      const card = prompt(`شماره کارت ${person.name}:`, person.card || '');
      if (card === null) return;
      db.update(plan.id, (p) => {
        p.people.find((x) => x.id === person.id).card = card.replace(/[^\d۰-۹-]/g, '').trim();
      });
      route();
    };
  });
  $('#tab').querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.del;
      const used = plan.expenses.some((e) => e.payer === id);
      if (used && !confirm('این نفر خرجی ثبت کرده. با حذفش، اون خرج‌ها هم پاک می‌شن. مطمئنی؟')) return;
      db.update(plan.id, (p) => {
        p.people = p.people.filter((x) => x.id !== id);
        p.expenses = p.expenses.filter((e) => e.payer !== id);
        p.expenses.forEach((e) => { e.shares = (e.shares || []).filter((s) => s !== id); });
      });
      route();
    };
  });
}

function tabExpenses(plan) {
  if (plan.people.length < 2) {
    $('#tab').innerHTML = `<div class="card empty"><p>اول حداقل دو نفر اضافه کن.</p>
      <a class="btn primary" href="#/plan/${plan.id}/people">رفتن به افراد</a></div>`;
    return;
  }
  const all = plan.people.map((p) => p.id);
  $('#tab').innerHTML = `
    <ul class="list">${plan.expenses.map((e, i) => {
      const partial = (e.shares || all).length !== plan.people.length;
      return `<li><div class="row-item">
        <span class="li-text"><b>${esc(e.title || 'خرج')}</b>
          <span class="muted small">${esc(nameOf(plan, e.payer))} پرداخت کرد${partial ? ` · سهم ${fa((e.shares || []).length)} نفر` : ''}</span></span>
        <b class="amount">${money(e.amount)}</b>
        <button class="icon-btn" data-del="${i}" title="حذف">🗑️</button>
      </div></li>`;
    }).join('')}</ul>
    <form class="card" id="adde">
      <label>خرج جدید</label>
      <input id="etitle" placeholder="بابت چی؟ مثلاً شام" autocomplete="off">
      <div class="row">
        <input class="grow" id="eamount" inputmode="numeric" placeholder="مبلغ به تومان" required>
        <select id="epayer">${plan.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      </div>
      <details>
        <summary>سهم چه کسانی؟ (پیش‌فرض: همه)</summary>
        <div class="chips">${plan.people.map((p) => `
          <label class="chip"><input type="checkbox" value="${p.id}" checked> ${esc(p.name)}</label>`).join('')}</div>
      </details>
      <button class="btn primary block" type="submit">ثبت خرج</button>
    </form>`;
  $('#adde').onsubmit = (e) => {
    e.preventDefault();
    const amount = parseMoney($('#eamount').value);
    if (amount <= 0) return toast('مبلغ رو وارد کن');
    const shares = [...$('#tab').querySelectorAll('.chip input:checked')].map((c) => c.value);
    if (!shares.length) return toast('حداقل یک نفر باید سهم داشته باشه');
    db.update(plan.id, (p) =>
      p.expenses.push({ title: $('#etitle').value.trim(), payer: $('#epayer').value, amount, shares })
    );
    route();
  };
  $('#eamount').oninput = (e) => {
    const v = parseMoney(e.target.value);
    e.target.value = v ? money(v) : '';
  };
  $('#tab').querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      db.update(plan.id, (p) => p.expenses.splice(Number(b.dataset.del), 1));
      route();
    };
  });
}

function tabSettle(plan, t) {
  if (!plan.expenses.length) {
    $('#tab').innerHTML = `<div class="card empty"><p>هنوز خرجی ثبت نشده.</p>
      <a class="btn primary" href="#/plan/${plan.id}/expenses">ثبت خرج</a></div>`;
    return;
  }
  const url = shareUrl(plan);
  const text = `${plan.name} — تسویه‌حساب\nکل خرج: ${money(t.total)} تومان، ${fa(plan.people.length)} نفر\nسهم هر نفر: ${money(t.total / plan.people.length)} تومان\nلینک جزئیات و سهم خودت:`;
  $('#tab').innerHTML = `
    ${settleCards(plan, t)}
    <div class="card">
      <h3>فرستادن برای بقیه</h3>
      <p class="muted small">گیرنده لازم نیست چیزی نصب کنه. لینک رو باز می‌کنه، اسمش رو می‌زنه و سهمش رو می‌بینه.</p>
      <div class="row">
        <button class="btn grow" id="copy">📋 کپی لینک</button>
        <button class="btn grow" id="share">📤 ارسال</button>
      </div>
      <div class="row">
        <a class="btn grow" id="wa" href="${waLink(`${text}\n${url}`)}" target="_blank" rel="noopener">واتساپ</a>
        <a class="btn grow" href="${tgLink(url, text)}" target="_blank" rel="noopener">تلگرام</a>
      </div>
    </div>
    <button class="btn danger block" id="delplan">حذف این پلن</button>`;
  $('#copy').onclick = async () => toast((await copy(url)) ? 'لینک کپی شد ✓' : 'کپی نشد');
  $('#share').onclick = async () => {
    if (!(await nativeShare(plan.name, text, url))) toast('روی این دستگاه ارسال مستقیم نداریم؛ لینک رو کپی کن');
  };
  $('#delplan').onclick = () => {
    if (confirm('این پلن پاک بشه؟')) {
      db.remove(plan.id);
      location.hash = '#/';
    }
  };
  bindCopyCards();
}

function settleCards(plan, t) {
  const { transfers, singlePayment, residual, unit } = t.plan;
  const rows = plan.people.map((p) => {
    const b = t.bal[p.id];
    const state = Math.abs(b) < 1 ? 'تسویه' : b > 0 ? `${money(b)} طلبکار` : `${money(-b)} بدهکار`;
    return `<li><div class="row-item"><span class="li-text"><b>${esc(p.name)}</b>
        <span class="muted small">خرج کرده ${money(t.paid[p.id])} · سهمش ${money(t.share[p.id])}</span></span>
      <span class="${Math.abs(b) < 1 ? 'muted' : b > 0 ? 'good' : 'warn'}">${state}</span></div></li>`;
  }).join('');
  return `
    <div class="card">
      <h3>پلن پرداخت</h3>
      ${transfers.length
        ? `<ol class="pay">${transfers.map((tr) => {
            const to = plan.people.find((p) => p.id === tr.to);
            return `<li>
              <div class="pay-line"><b>${esc(nameOf(plan, tr.from))}</b> <span class="arrow">←</span> <b>${esc(to.name)}</b></div>
              <div class="pay-amount">${money(tr.amount)} <span class="muted small">تومان</span></div>
              ${to.card ? `<button class="btn small" data-copy="${esc(to.card)}">📋 کپی شماره کارت</button>` : ''}
            </li>`;
          }).join('')}</ol>
          <p class="muted small">${singlePayment ? '✅ هر نفر فقط <b>یک بار</b> پرداخت می‌کنه.' : '⚠️ با این اعداد، «هر نفر یک پرداخت» ممکن نشد. بعضی‌ها دو بار پرداخت دارن.'}
          ${unit > 1 ? ` مبالغ به نزدیک‌ترین ${money(unit)} تومان رند شدن${residual >= 1 ? `، پس تا ${money(residual)} تومان اختلاف ناچیز هست.` : '.'}` : ''}</p>`
        : '<p>همه تسویه‌ان. کسی به کسی بدهکار نیست 🎉</p>'}
    </div>
    <div class="card">
      <h3>جزئیات هر نفر</h3>
      <ul class="list plain">${rows}</ul>
    </div>`;
}

function bindCopyCards() {
  document.querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = async () => toast((await copy(b.dataset.copy)) ? 'شماره کارت کپی شد ✓' : 'کپی نشد');
  });
}

// ---------- صفحه‌ی لینک اشتراکی ----------

function viewShared(code) {
  let plan;
  try {
    plan = decodePlan(code);
  } catch {
    main.innerHTML = '<div class="card empty"><p>این لینک درست نیست یا ناقص کپی شده.</p><a class="btn primary" href="#/">صفحه‌ی اصلی</a></div>';
    return;
  }
  plan.people.forEach((p, i) => (p.id = `p${i}`));
  const t = totals(plan);
  const mine = sessionStorage.getItem(`mk.me.${code.slice(0, 24)}`);
  main.innerHTML = `
    <header class="hero"><div><h1>${esc(plan.name)}</h1><p class="muted">تسویه‌حساب دورهمی</p></div></header>
    <div class="sum">
      <div><span class="muted small">کل خرج</span><b>${money(t.total)}</b></div>
      <div><span class="muted small">نفرات</span><b>${fa(plan.people.length)}</b></div>
      <div><span class="muted small">سهم هر نفر</span><b>${money(t.total / plan.people.length)}</b></div>
    </div>
    <div class="card">
      <h3>تو کدومی؟</h3>
      <div class="chips" id="who">${plan.people.map((p) =>
        `<button class="chip btn ${mine === p.id ? 'on' : ''}" data-me="${p.id}">${esc(p.name)}</button>`).join('')}</div>
      <div id="mine"></div>
    </div>
    ${settleCards(plan, t)}
    <div class="card">
      <p class="muted small">این صفحه فقط نمایشه و تغییراتش برای بقیه فرستاده نمی‌شه.</p>
      <button class="btn block" id="import">📥 ذخیره‌ی این پلن در گوشی من</button>
      <a class="btn primary block" href="#/">ساختن پلن خودم</a>
    </div>`;
  $('#import').onclick = () => {
    const saved = db.importPlan(plan);
    location.hash = `#/plan/${saved.id}/settle`;
    toast('در پلن‌های تو ذخیره شد ✓');
  };
  const showMine = (id) => {
    sessionStorage.setItem(`mk.me.${code.slice(0, 24)}`, id);
    const b = t.bal[id];
    const outs = t.plan.transfers.filter((x) => x.from === id);
    const ins = t.plan.transfers.filter((x) => x.to === id);
    const name = nameOf(plan, id);
    $('#mine').innerHTML = `
      <div class="me">
        <p>سلام ${esc(name)} 👋 تو ${money(t.paid[id])} تومان خرج کردی و سهمت ${money(t.share[id])} تومان شده.</p>
        ${outs.length
          ? outs.map((o) => {
              const to = plan.people.find((p) => p.id === o.to);
              return `<div class="pay-amount big">${money(o.amount)} <span class="muted small">تومان به</span> ${esc(to.name)}</div>
                ${to.card ? `<button class="btn" data-copy="${esc(to.card)}">📋 کپی شماره کارت ${esc(to.name)}</button>` : ''}
                <a class="btn primary block" href="${waLink(`سهمم از «${plan.name}» رو پرداخت کردم: ${money(o.amount)} تومان به ${to.name}`)}" target="_blank" rel="noopener">✅ پرداخت کردم، خبر بده</a>`;
            }).join('')
          : ins.length
            ? `<p class="good">تو طلبکاری. ${ins.map((i2) => `${esc(nameOf(plan, i2.from))} باید ${money(i2.amount)} تومان بهت بده.`).join(' ')}</p>`
            : `<p class="good">تو تسویه‌ای. نه بدهکاری نه طلبکار 🎉</p>`}
      </div>`;
    bindCopyCards();
  };
  $('#who').querySelectorAll('[data-me]').forEach((b) => {
    b.onclick = () => {
      $('#who').querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
      showMine(b.dataset.me);
    };
  });
  if (mine) showMine(mine);
  bindCopyCards();
}

// ---------- راه‌اندازی ----------

window.addEventListener('hashchange', route);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (!location.hash || location.hash === '#/') viewHome();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
route();
