import { db } from './store.js';
import { ledger, settle, weightOf, totalWeight } from './settle.js';
import { fa, esc, money, parseMoney, uid, copy, toast } from './util.js';
import { encodePlan, decodePlan, shareUrl, waLink, tgLink, nativeShare } from './share.js';
import { tgStore, getMe, findChats, sendMessage, friendlyNetworkError } from './telegram.js';
import { smsStore, normalizePhone, isValidPhone, smsLink, PROVIDERS, friendlySmsError } from './sms.js';

const $ = (s, r = document) => r.querySelector(s);
const main = $('#main');
let deferredInstall = null;

const nameOf = (plan, id) => plan.people.find((p) => p.id === id)?.name || '؟';

function totals(plan) {
  const l = ledger(plan.people, plan.expenses, plan.payments || []);
  const total = plan.expenses.reduce((s, e) => s + e.amount, 0);
  const heads = totalWeight(plan.people); // نفرات به‌علاوه‌ی مهمان‌ها
  return { ...l, total, heads, plan: settle(l.bal) };
}

// ---------- مسیرها ----------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [name, a, b] = parts;
  if (name === 'plan' && db.get(a)) viewPlan(db.get(a), b || 'people');
  else if (name === 'tg' && db.get(a)) viewTelegram(db.get(a));
  else if (name === 'sms' && db.get(a)) viewSms(db.get(a));
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
    ${sumBar(plan, t)}
    <nav class="tabs">
      <a href="#/plan/${plan.id}/people" class="${tab === 'people' ? 'on' : ''}">افراد</a>
      <a href="#/plan/${plan.id}/expenses" class="${tab === 'expenses' ? 'on' : ''}">خرج‌ها</a>
      <a href="#/plan/${plan.id}/cash" class="${tab === 'cash' ? 'on' : ''}">پرداخت‌ها</a>
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
  const tabs = { people: tabPeople, expenses: tabExpenses, cash: tabCash, settle: tabSettle };
  (tabs[tab] || tabPeople)(plan, t);
}

// نوار بالای صفحه: کل خرج، تعداد سهم‌ها و سهم هر نفر
function sumBar(plan, t) {
  const guests = t.heads - plan.people.length;
  return `<div class="sum">
      <div><span class="muted small">کل خرج</span><b>${money(t.total)}</b></div>
      <div><span class="muted small">${guests ? 'نفر + همراه' : 'نفرات'}</span><b>${fa(plan.people.length)}${guests ? ` + ${fa(guests)}` : ''}</b></div>
      <div><span class="muted small">سهم هر نفر</span><b>${t.heads ? money(t.total / t.heads) : '—'}</b></div>
    </div>`;
}

function tabPeople(plan) {
  $('#tab').innerHTML = `
    <ul class="list">${plan.people.map((p) => `
      <li><div class="row-item person">
        <span class="li-text"><b>${esc(p.name)}${p.guests ? ` <span class="tag">+${fa(p.guests)} همراه</span>` : ''}</b>
          <span class="muted small">${p.card ? `کارت: ${fa(p.card)}` : 'شماره کارت ثبت نشده'}${p.phone ? ` · ${fa(p.phone)}` : ''}${p.guests ? ` · سهمش ${fa(weightOf(p))} برابره` : ''}</span></span>
        <button class="icon-btn" data-phone="${p.id}" title="شماره موبایل">📱</button>
        <button class="icon-btn" data-guests="${p.id}" title="مهمان همراه">👥</button>
        <button class="icon-btn" data-card="${p.id}" title="شماره کارت">💳</button>
        <button class="icon-btn" data-del="${p.id}" title="حذف">🗑️</button>
      </div></li>`).join('')}</ul>
    <form class="card" id="addp">
      <label>اسم نفر جدید</label>
      <div class="row">
        <input class="grow" id="pname" placeholder="مثلاً مریم" autocomplete="off" required>
        <button class="btn primary" type="submit">افزودن</button>
      </div>
      <p class="muted small">💳 شماره کارت اختیاریه، ولی اگه واردش کنی بقیه با یه کلیک کپی‌ش می‌کنن.<br>
      👥 اگه کسی مهمون همراه داره (مثلاً همسر یا بچه)، تعدادش رو ثبت کن تا سهمش چند برابر حساب بشه.<br>
      📱 شماره موبایل فقط برای یادآوری پیامکیه و <b>داخل لینک اشتراکی نمی‌ره</b>.</p>
    </form>`;
  $('#tab').querySelectorAll('[data-phone]').forEach((b) => {
    b.onclick = () => {
      const person = plan.people.find((x) => x.id === b.dataset.phone);
      const ans = prompt(`شماره موبایل ${person.name}: (برای یادآوری پیامکی)`, person.phone || '');
      if (ans === null) return;
      const phone = normalizePhone(ans);
      if (phone && !isValidPhone(phone)) return toast('شماره درست نیست. مثل ۰۹۱۲۳۴۵۶۷۸۹ بنویس');
      db.update(plan.id, (p) => { p.people.find((x) => x.id === person.id).phone = phone; });
      route();
    };
  });
  $('#tab').querySelectorAll('[data-guests]').forEach((b) => {
    b.onclick = () => {
      const person = plan.people.find((x) => x.id === b.dataset.guests);
      const ans = prompt(`${person.name} چند نفر مهمون همراه داره؟ (۰ یعنی تنهاست)`, String(person.guests || 0));
      if (ans === null) return;
      const n = Math.max(0, Math.min(20, parseMoney(ans)));
      db.update(plan.id, (p) => { p.people.find((x) => x.id === person.id).guests = n; });
      route();
    };
  });
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
        p.payments = (p.payments || []).filter((c) => c.from !== id && c.to !== id);
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

function tabCash(plan) {
  if (plan.people.length < 2) {
    $('#tab').innerHTML = `<div class="card empty"><p>اول حداقل دو نفر اضافه کن.</p>
      <a class="btn primary" href="#/plan/${plan.id}/people">رفتن به افراد</a></div>`;
    return;
  }
  const list = plan.payments || [];
  const opts = (sel) => plan.people.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#tab').innerHTML = `
    <div class="card">
      <h3>پرداخت نقدی بین اعضا</h3>
      <p class="muted small">اگه کسی همون‌جا نقدی یا کارت‌به‌کارت حساب کرد، اینجا ثبتش کن تا از سهمش کم بشه. این‌ها خرج پلن نیستن، فقط جابه‌جایی پول بین دو نفرن.</p>
    </div>
    <ul class="list">${list.map((c, i) => `
      <li><div class="row-item">
        <span class="li-text"><b>${esc(nameOf(plan, c.from))} <span class="arrow">←</span> ${esc(nameOf(plan, c.to))}</b>
          <span class="muted small">${esc(c.note || 'پرداخت نقدی')}</span></span>
        <b class="amount">${money(c.amount)}</b>
        <button class="icon-btn" data-del="${i}" title="حذف">🗑️</button>
      </div></li>`).join('')}</ul>
    <form class="card" id="addc">
      <label>پرداخت جدید</label>
      <div class="row">
        <select id="cfrom">${opts(plan.people[0].id)}</select>
        <span class="arrow">←</span>
        <select id="cto">${opts(plan.people[1].id)}</select>
      </div>
      <input id="camount" inputmode="numeric" placeholder="مبلغ به تومان" required>
      <input id="cnote" placeholder="توضیح (اختیاری)، مثلاً نقدی سر میز" autocomplete="off">
      <button class="btn primary block" type="submit">ثبت پرداخت</button>
    </form>`;
  $('#camount').oninput = (e) => {
    const v = parseMoney(e.target.value);
    e.target.value = v ? money(v) : '';
  };
  $('#addc').onsubmit = (e) => {
    e.preventDefault();
    const from = $('#cfrom').value;
    const to = $('#cto').value;
    const amount = parseMoney($('#camount').value);
    if (from === to) return toast('پرداخت‌کننده و گیرنده نمی‌تونن یکی باشن');
    if (amount <= 0) return toast('مبلغ رو وارد کن');
    db.update(plan.id, (p) => {
      p.payments = p.payments || [];
      p.payments.push({ from, to, amount, note: $('#cnote').value.trim() });
    });
    route();
  };
  $('#tab').querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      db.update(plan.id, (p) => p.payments.splice(Number(b.dataset.del), 1));
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
      <div class="row">
        <a class="btn grow" href="#/tg/${plan.id}">🤖 ربات تلگرام</a>
        <a class="btn grow" href="#/sms/${plan.id}">📱 پیامک</a>
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
    const extra = [
      t.cashOut[p.id] ? `نقدی داد ${money(t.cashOut[p.id])}` : '',
      t.cashIn[p.id] ? `نقدی گرفت ${money(t.cashIn[p.id])}` : '',
    ].filter(Boolean).join(' · ');
    return `<li><div class="row-item"><span class="li-text"><b>${esc(p.name)}${p.guests ? ` <span class="tag">+${fa(p.guests)} همراه</span>` : ''}</b>
        <span class="muted small">خرج کرده ${money(t.paid[p.id])} · سهمش ${money(t.share[p.id])}${extra ? ` · ${extra}` : ''}</span></span>
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

// ---------- ربات تلگرام ----------

// متن یادآوری گروهی و شخصی
function reminderText(plan, t, url, forPerson) {
  const line = (tr) => `• ${nameOf(plan, tr.from)} ← ${nameOf(plan, tr.to)}: ${money(tr.amount)} تومان`;
  if (forPerson) {
    const out = t.plan.transfers.filter((x) => x.from === forPerson.id);
    const head = `سلام ${forPerson.name} 👋\nتسویه‌ی «${plan.name}»`;
    if (!out.length) return `${head}\nتو تسویه‌ای، چیزی بدهکار نیستی 🎉\n${url}`;
    const cards = out
      .map((o) => {
        const to = plan.people.find((p) => p.id === o.to);
        return `${money(o.amount)} تومان به ${to.name}${to.card ? `\nشماره کارت: ${to.card}` : ''}`;
      })
      .join('\n');
    return `${head}\nسهم تو: ${money(t.share[forPerson.id])} تومان\n\n${cards}\n\nجزئیات: ${url}`;
  }
  return [
    `🧾 تسویه‌ی «${plan.name}»`,
    `کل خرج: ${money(t.total)} تومان · سهم هر نفر: ${money(t.total / t.heads)} تومان`,
    '',
    t.plan.transfers.length ? t.plan.transfers.map(line).join('\n') : 'همه تسویه‌ان 🎉',
    '',
    `سهم خودت رو اینجا ببین: ${url}`,
  ].join('\n');
}

function viewTelegram(plan) {
  const t = totals(plan);
  const url = shareUrl(plan);
  const cfg = tgStore.get();
  const chat = plan.tg?.chat;
  main.innerHTML = `
    <a class="back" href="#/plan/${plan.id}/settle">→ بازگشت به تسویه</a>
    <h2 class="page-title">🤖 یادآوری با ربات تلگرام</h2>
    <div class="card">
      <p class="muted small">مادرخرج سرور نداره، پس با <b>ربات خودت</b> کار می‌کنه. ساختن ربات رایگانه و یک دقیقه طول می‌کشه. توکن ربات فقط روی همین گوشی ذخیره می‌شه و هیچ‌وقت داخل لینکی که برای بقیه می‌فرستی نمی‌ره.</p>
    </div>

    <div class="card">
      <h3>قدم ۱: ساختن ربات</h3>
      <ol class="how-ol">
        <li>در تلگرام به <b class="cmd">@BotFather</b> پیام بده</li>
        <li>دستور <b class="cmd">/newbot</b> رو بفرست و یه اسم و یه یوزرنیم بده</li>
        <li>توکنی که می‌ده رو کپی کن و اینجا بذار</li>
      </ol>
      <div class="row">
        <input class="grow" id="token" placeholder="۱۲۳۴۵۶:ABC..." value="${esc(cfg.token || '')}" autocomplete="off" spellcheck="false" dir="ltr">
        <button class="btn primary" id="connect">اتصال</button>
      </div>
      <div id="botinfo" class="muted small">${cfg.bot ? `✅ وصل شده به <b>@${esc(cfg.bot)}</b>` : 'هنوز وصل نشده'}</div>
    </div>

    <div class="card">
      <h3>قدم ۲: انتخاب مقصد پیام</h3>
      <p class="muted small"><b>گروهی:</b> ربات رو به گروه دورهمی اضافه کن و در گروه <b class="cmd">/start@</b>اسم‌ربات رو بفرست.<br>
      <b>شخصی:</b> هر کسی که می‌خوای پیام خصوصی بگیره، یه بار ربات رو باز کنه و <b class="cmd">/start</b> بزنه.<br>
      بعد دکمه‌ی زیر رو بزن.</p>
      <button class="btn block" id="findchats">🔄 پیدا کردن چت‌ها</button>
      <div id="chats">${chat ? `<p class="good">مقصد فعلی: <b>${esc(chat.title)}</b></p>` : ''}</div>
    </div>

    <div class="card">
      <h3>قدم ۳: فرستادن یادآوری</h3>
      <label>متن پیام</label>
      <textarea id="msg" rows="9">${esc(reminderText(plan, t, url))}</textarea>
      <button class="btn primary block" id="send" ${chat ? '' : 'disabled'}>📨 فرستادن به ${chat ? esc(chat.title) : 'مقصد انتخاب‌شده'}</button>
      <button class="btn block" id="sendeach" ${chat ? '' : 'disabled'}>👤 فرستادن پیام جدا برای هر بدهکار</button>
      <p class="muted small">پیام جداگانه فقط برای کسانی می‌ره که چت خصوصیشون رو در قدم ۲ به اسمشون وصل کرده باشی.</p>
    </div>
    <div id="err"></div>`;

  const errBox = (e) => { $('#err').innerHTML = `<div class="alert">${esc(friendlyNetworkError(e))}</div>`; };
  const token = () => $('#token').value.trim();

  $('#connect').onclick = async () => {
    $('#err').innerHTML = '';
    try {
      const me = await getMe(token());
      tgStore.set({ ...tgStore.get(), token: token(), bot: me.username });
      $('#botinfo').innerHTML = `✅ وصل شده به <b>@${esc(me.username)}</b>`;
      toast('ربات وصل شد ✓');
    } catch (e) {
      errBox(e);
    }
  };

  $('#findchats').onclick = async () => {
    $('#err').innerHTML = '';
    try {
      const chats = await findChats(token());
      if (!chats.length) {
        $('#chats').innerHTML = '<p class="muted small">چتی پیدا نشد. یه پیام به ربات بفرست (در گروه: <b class="cmd">/start@</b>اسم‌ربات) و دوباره امتحان کن.</p>';
        return;
      }
      $('#chats').innerHTML = `<ul class="list">${chats.map((c) => `
        <li><div class="row-item">
          <span class="li-text"><b>${esc(c.title)}</b><span class="muted small">${c.type === 'private' ? 'چت خصوصی' : 'گروه'}</span></span>
          <button class="btn small" data-target="${c.id}" data-title="${esc(c.title)}">مقصد اصلی</button>
          ${c.type === 'private' ? `<select data-link="${c.id}"><option value="">— وصل به کسی نشده —</option>${plan.people.map((p) => `<option value="${p.id}"${plan.tg?.people?.[p.id] === c.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
        </div></li>`).join('')}</ul>`;
      $('#chats').querySelectorAll('[data-target]').forEach((b) => {
        b.onclick = () => {
          db.update(plan.id, (p) => {
            p.tg = { ...(p.tg || {}), chat: { id: Number(b.dataset.target), title: b.dataset.title } };
          });
          toast('مقصد ثبت شد ✓');
          route();
        };
      });
      $('#chats').querySelectorAll('[data-link]').forEach((sel) => {
        sel.onchange = () => {
          db.update(plan.id, (p) => {
            p.tg = { ...(p.tg || {}), people: { ...(p.tg?.people || {}) } };
            for (const [pid, cid] of Object.entries(p.tg.people)) {
              if (cid === Number(sel.dataset.link)) delete p.tg.people[pid];
            }
            if (sel.value) p.tg.people[sel.value] = Number(sel.dataset.link);
          });
          toast('ثبت شد ✓');
        };
      });
    } catch (e) {
      errBox(e);
    }
  };

  $('#send').onclick = async () => {
    $('#err').innerHTML = '';
    try {
      await sendMessage(token(), plan.tg.chat.id, $('#msg').value);
      toast('پیام فرستاده شد ✓');
    } catch (e) {
      errBox(e);
    }
  };

  $('#sendeach').onclick = async () => {
    $('#err').innerHTML = '';
    const map = plan.tg?.people || {};
    const debtors = plan.people.filter((p) => t.plan.transfers.some((x) => x.from === p.id));
    const targets = debtors.filter((p) => map[p.id]);
    if (!targets.length) return toast('هنوز چت خصوصی کسی وصل نشده');
    let ok = 0;
    const fails = [];
    for (const p of targets) {
      try {
        await sendMessage(token(), map[p.id], reminderText(plan, t, url, p));
        ok++;
      } catch (e) {
        fails.push(`${p.name}: ${friendlyNetworkError(e)}`);
      }
    }
    toast(`${fa(ok)} پیام فرستاده شد`);
    if (fails.length) $('#err').innerHTML = `<div class="alert">${fails.map(esc).join('<br>')}</div>`;
  };
}

// ---------- یادآوری با پیامک ----------

// متن کوتاه پیامک: هر کاراکتر فارسی پول است، پس خلاصه و بدون حاشیه
function smsText(plan, t, person, url) {
  const outs = t.plan.transfers.filter((x) => x.from === person.id);
  if (!outs.length) return `${person.name} عزیز، حساب «${plan.name}» تسویه‌ست. چیزی بدهکار نیستی.`;
  const body = outs
    .map((o) => {
      const to = plan.people.find((p) => p.id === o.to);
      return `${money(o.amount)} تومان به ${to.name}${to.card ? ` - کارت ${to.card}` : ''}`;
    })
    .join(' / ');
  return `${person.name} عزیز، سهم تو از «${plan.name}»: ${body}${url ? `\n${url}` : ''}`;
}

function viewSms(plan) {
  const t = totals(plan);
  const url = shareUrl(plan);
  const cfg = smsStore.get();
  const debtors = plan.people.filter((p) => t.plan.transfers.some((x) => x.from === p.id));
  const withPhone = debtors.filter((p) => p.phone);
  const provider = PROVIDERS[cfg.provider] || null;

  main.innerHTML = `
    <a class="back" href="#/plan/${plan.id}/settle">→ بازگشت به تسویه</a>
    <h2 class="page-title">📱 یادآوری با پیامک</h2>
    ${debtors.length
      ? `<div class="card">
          <label class="opt"><input type="checkbox" id="withlink"> لینک تسویه هم داخل پیامک باشه</label>
          <p class="muted small">لینک طولانیه و پیامک رو چند برابر می‌کنه. اگه فقط می‌خوای مبلغ و شماره کارت رو یادآوری کنی، تیک نزن.</p>
        </div>
        <h3 class="section-title">پیامک دستی (رایگان)</h3>
        <div class="card"><p class="muted small">با زدن هر دکمه، اپِ پیامکِ خود گوشیت با متن آماده باز می‌شه و فقط کافیه «ارسال» رو بزنی. از شماره‌ی خودت می‌ره، پس بقیه راحت‌تر اعتماد می‌کنن.</p></div>
        <ul class="list" id="manual"></ul>
        <h3 class="section-title">ارسال خودکار با پنل پیامکی (پولی)</h3>
        <div class="card">
          <p class="muted small">اگه پنل پیامکی داری، اپ می‌تونه همه‌ی پیامک‌ها رو یک‌جا بفرسته. کلید API فقط روی همین دستگاه ذخیره می‌شه و داخل لینک اشتراکی نمی‌ره.</p>
          <label>پنل</label>
          <select id="provider">
            <option value="">— انتخاب کن —</option>
            ${Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}"${cfg.provider === id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
          <div id="pfields"></div>
          <button class="btn primary block" id="sendall" ${withPhone.length ? '' : 'disabled'}>📨 فرستادن به ${fa(withPhone.length)} نفر</button>
          <p class="muted small">نکته: بیشتر پنل‌ها برای ارسال پیامک غیرتبلیغاتی، خط خدماتی یا متن تأییدشده می‌خوان.</p>
        </div>`
      : '<div class="card empty"><p>کسی بدهکار نیست 🎉</p></div>'}
    <div id="err"></div>`;

  if (!debtors.length) return;

  const renderManual = () => {
    const link = $('#withlink').checked ? url : '';
    $('#manual').innerHTML = debtors.map((p) => {
      const text = smsText(plan, t, p, link);
      return `<li><div class="row-item">
        <span class="li-text"><b>${esc(p.name)}</b>
          <span class="muted small">${p.phone ? fa(p.phone) : 'شماره موبایلش ثبت نشده'}</span></span>
        ${p.phone
          ? `<a class="btn small" href="${esc(smsLink(p.phone, text))}">باز کردن پیامک</a>`
          : `<a class="btn small" href="#/plan/${plan.id}/people">ثبت شماره</a>`}
        <button class="icon-btn" data-copytext="${esc(text)}" title="کپی متن">📋</button>
      </div></li>`;
    }).join('');
    $('#manual').querySelectorAll('[data-copytext]').forEach((b) => {
      b.onclick = async () => toast((await copy(b.dataset.copytext)) ? 'متن کپی شد ✓' : 'کپی نشد');
    });
  };

  const renderFields = () => {
    const id = $('#provider').value;
    const p = PROVIDERS[id];
    $('#pfields').innerHTML = p
      ? `${p.fields.map((f) => `<label>${esc(f.label)}</label>
           <input id="f_${f.id}" ${f.ltr ? 'dir="ltr" spellcheck="false"' : ''} autocomplete="off" value="${esc(cfg.provider === id ? cfg[f.id] || '' : '')}">`).join('')}
         <p class="muted small">${esc(p.help)}</p>`
      : '';
  };

  $('#withlink').onchange = renderManual;
  $('#provider').onchange = () => {
    renderFields();
    smsStore.set({ ...smsStore.get(), provider: $('#provider').value });
  };
  renderManual();
  renderFields();

  $('#sendall').onclick = async () => {
    $('#err').innerHTML = '';
    const id = $('#provider').value;
    const prov = PROVIDERS[id];
    if (!prov) return toast('اول پنل رو انتخاب کن');
    const conf = Object.fromEntries(prov.fields.map((f) => [f.id, $(`#f_${f.id}`).value.trim()]));
    if (!conf.key) return toast('کلید API رو وارد کن');
    smsStore.set({ provider: id, ...conf });
    const link = $('#withlink').checked ? url : '';
    if (!confirm(`برای ${withPhone.length} نفر پیامک فرستاده بشه؟ این کار از اعتبار پنل تو کم می‌کنه.`)) return;
    let ok = 0;
    const fails = [];
    for (const p of withPhone) {
      try {
        await prov.send(conf, p.phone, smsText(plan, t, p, link));
        ok++;
      } catch (e) {
        fails.push(`${p.name}: ${friendlySmsError(e)}`);
      }
    }
    toast(`${fa(ok)} پیامک فرستاده شد`);
    if (fails.length) $('#err').innerHTML = `<div class="alert">${fails.map(esc).join('<br>')}</div>`;
  };
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
    ${sumBar(plan, t)}
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
