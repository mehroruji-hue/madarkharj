import { db } from './store.js';
import { ledger, settle, weightOf, totalWeight } from './settle.js';
import { fa, esc, money, parseMoney, uid, copy, toast } from './util.js';
import { decodePlan, shareUrl, waLink, tgLink, nativeShare } from './share.js';
import { tgStore, getMe, findChats, sendMessage, friendlyNetworkError } from './telegram.js';
import { smsStore, normalizePhone, isValidPhone, smsLink, PROVIDERS, friendlySmsError } from './sms.js';
import { icon, avatar } from './icons.js';
import { askSheet, confirmSheet } from './sheet.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = $('#main');
let deferredInstall = null;

const person = (plan, id) => plan.people.find((p) => p.id === id);
const nameOf = (plan, id) => person(plan, id)?.name || '؟';
const toman = (v) => `${money(v)} <span class="unit">تومان</span>`;

function totals(plan) {
  const l = ledger(plan.people, plan.expenses, plan.payments || []);
  const total = plan.expenses.reduce((s, e) => s + e.amount, 0);
  const heads = totalWeight(plan.people);
  return { ...l, total, heads, plan: settle(l.bal, { round: !!plan.round }) };
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

const backLink = (href, text) => `<a class="back-link" href="${href}">${icon('back')}${esc(text)}</a>`;

// ---------- خانه ----------

function viewHome() {
  const plans = db.all();
  main.innerHTML = `
    <header class="masthead">
      <div>
        <h1 class="logo display">مادرخرج</h1>
        <p class="tagline">خرج دورهمی رو تقسیم کن، بگو کی به کی چقدر بده</p>
      </div>
      ${deferredInstall ? '<button class="btn btn-soft btn-sm" id="install">نصب</button>' : ''}
    </header>

    <button class="btn btn-primary btn-block" id="new">${icon('plus')} پلن جدید</button>

    ${plans.length
      ? `<p class="section-label">پلن‌های من</p>
         <ul class="rows">${plans.map(planCard).join('')}</ul>`
      : `<div class="panel empty">
           <span class="art">${icon('receipt')}</span>
           <h3>اولین پلنت رو بساز</h3>
           <p class="hint">اسم‌ها و خرج‌ها رو وارد کن. مادرخرج سهم هر نفر و رندترین پلن پرداخت رو درمیاره و یه لینک می‌ده که بقیه لازم نیست چیزی نصب کنن.</p>
         </div>`}

    <div class="panel quiet">
      <h3>چطور کار می‌کنه؟</h3>
      <ol class="steps">
        <li><span>اسم آدم‌های دورهمی رو وارد کن</span></li>
        <li><span>هر خرجی که شد، با اسم پرداخت‌کننده ثبت کن</span></li>
        <li><span>سهم هر نفر و <b>رندترین پلن پرداخت</b> رو تحویل بگیر</span></li>
        <li><span>لینک تسویه رو برای بقیه بفرست</span></li>
      </ol>
    </div>`;

  $('#new').onclick = async () => {
    const v = await askSheet({
      title: 'پلن جدید',
      fields: [{ id: 'name', label: 'اسم پلن', value: '', placeholder: 'شام جمعه، سفر شمال، ...' }],
      submit: 'بساز',
    });
    if (!v) return;
    const p = db.create(v.name.trim() || 'دورهمی');
    location.hash = `#/plan/${p.id}`;
  };
  $('#install')?.addEventListener('click', async () => {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    viewHome();
  });
}

function planCard(p) {
  const total = p.expenses.reduce((s, e) => s + e.amount, 0);
  const faces = p.people.slice(0, 4).map((x) => avatar(x.name, 'sm')).join('');
  const more = p.people.length > 4 ? `<span class="tag">+${fa(p.people.length - 4)}</span>` : '';
  return `<li><a class="plan-card" href="#/plan/${p.id}">
      <span class="stack">${faces || avatar('؟', 'sm')}</span>${more}
      <span class="plan-meta">
        <b>${esc(p.name)}</b>
        <span class="num">${money(total)} تومان · ${fa(p.people.length)} نفر${p.imported ? ' · از لینک' : ''}</span>
      </span>
      <span class="chev">${icon('chevron')}</span>
    </a></li>`;
}

// ---------- صفحه‌ی پلن ----------

function viewPlan(plan, tab) {
  const t = totals(plan);
  main.innerHTML = `
    <div class="topbar">
      ${backLink('#/', 'همه‌ی پلن‌ها')}
    </div>
    <div class="row">
      <h2 class="page-title display grow">${esc(plan.name)}</h2>
      <button class="btn-icon" id="rename" aria-label="تغییر نام پلن">${icon('pencil')}</button>
    </div>
    ${summaryBar(plan, t)}
    <nav class="tabs">
      ${[['people', 'افراد'], ['expenses', 'خرج‌ها'], ['cash', 'پرداخت‌ها'], ['settle', 'تسویه']]
        .map(([id, label]) => `<a href="#/plan/${plan.id}/${id}" class="${tab === id ? 'on' : ''}">${label}</a>`)
        .join('')}
    </nav>
    <div id="tab" class="wrap-inner" style="display:flex;flex-direction:column;gap:12px"></div>`;

  $('#rename').onclick = async () => {
    const v = await askSheet({ title: 'تغییر نام پلن', fields: [{ id: 'name', label: 'اسم پلن', value: plan.name }] });
    if (!v?.name.trim()) return;
    db.update(plan.id, (p) => { p.name = v.name.trim(); });
    route();
  };
  ({ people: tabPeople, expenses: tabExpenses, cash: tabCash, settle: tabSettle }[tab] || tabPeople)(plan, t);
}

function summaryBar(plan, t) {
  const guests = t.heads - plan.people.length;
  return `<div class="summary">
      <div><span>کل خرج</span><b class="lead">${money(t.total)}</b></div>
      <div><span>${guests ? 'نفر + همراه' : 'نفرات'}</span><b>${fa(plan.people.length)}${guests ? ` + ${fa(guests)}` : ''}</b></div>
      <div><span>سهم هر نفر</span><b>${t.heads ? money(t.total / t.heads) : '—'}</b></div>
    </div>`;
}

const needPeople = (plan) => `<div class="panel empty">
    <span class="art">${icon('users')}</span>
    <h3>اول آدم‌ها رو اضافه کن</h3>
    <p class="hint">حداقل دو نفر لازمه تا بشه خرج‌ها رو تقسیم کرد.</p>
    <a class="btn btn-primary" href="#/plan/${plan.id}/people">رفتن به افراد</a>
  </div>`;

// ---------- تب افراد ----------

function tabPeople(plan) {
  $('#tab').innerHTML = `
    <ul class="rows">${plan.people.map((p) => {
      const bits = [
        p.card ? `کارت ${fa(p.card.slice(-4))}` : '',
        p.phone ? fa(p.phone) : '',
        p.guests ? `سهم ${fa(weightOf(p))} برابر` : '',
      ].filter(Boolean);
      return `<li><div class="row-item">
        ${avatar(p.name)}
        <span class="row-main">
          <b>${esc(p.name)}${p.guests ? `<span class="tag">+${fa(p.guests)} همراه</span>` : ''}</b>
          <span class="sub">${bits.length ? bits.join(' · ') : 'فقط اسم ثبت شده'}</span>
        </span>
        <button class="btn-icon" data-edit="${p.id}" aria-label="ویرایش ${esc(p.name)}">${icon('pencil')}</button>
        <button class="btn-icon danger" data-del="${p.id}" aria-label="حذف ${esc(p.name)}">${icon('trash')}</button>
      </div></li>`;
    }).join('')}</ul>

    <form class="panel" id="addp">
      <h3>${icon('userPlus')} افزودن نفر</h3>
      <div class="row">
        <input class="grow" id="pname" placeholder="مثلاً مریم" autocomplete="off" required>
        <button class="btn btn-primary" type="submit">افزودن</button>
      </div>
      <p class="hint">شماره کارت و موبایل رو بعداً با دکمه‌ی ویرایش اضافه کن. شماره موبایل فقط برای پیامکه و <b>داخل لینک اشتراکی نمی‌ره</b>.</p>
    </form>`;

  $('#addp').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#pname').value.trim();
    if (!name) return;
    db.update(plan.id, (p) => p.people.push({ id: uid(), name }));
    route();
  };

  $$('[data-edit]', $('#tab')).forEach((b) => {
    b.onclick = async () => {
      const who = person(plan, b.dataset.edit);
      const v = await askSheet({
        title: `ویرایش ${who.name}`,
        fields: [
          { id: 'name', label: 'اسم', value: who.name },
          { id: 'card', label: 'شماره کارت (اختیاری)', value: who.card || '', inputmode: 'numeric', dir: 'ltr', hint: 'بقیه می‌تونن با یه کلیک کپی‌ش کنن.' },
          { id: 'phone', label: 'شماره موبایل (اختیاری)', value: who.phone || '', inputmode: 'tel', dir: 'ltr', hint: 'فقط برای یادآوری پیامکی. داخل لینک اشتراکی نمی‌ره.' },
          { id: 'guests', label: 'چند مهمون همراه دارد؟', value: fa(who.guests || 0), inputmode: 'numeric', hint: 'مثلاً ۲ یعنی سهمش ۳ برابر حساب می‌شه.' },
        ],
      });
      if (!v) return;
      const phone = normalizePhone(v.phone);
      if (phone && !isValidPhone(phone)) return toast('شماره موبایل درست نیست');
      db.update(plan.id, (p) => {
        const x = p.people.find((y) => y.id === who.id);
        x.name = v.name.trim() || x.name;
        x.card = v.card.replace(/[^\d۰-۹-]/g, '').trim();
        x.phone = phone;
        x.guests = Math.max(0, Math.min(20, parseMoney(v.guests)));
      });
      route();
    };
  });

  $$('[data-del]', $('#tab')).forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.del;
      const used = plan.expenses.some((e) => e.payer === id);
      const ok = await confirmSheet({
        title: `${nameOf(plan, id)} حذف بشه؟`,
        body: used ? 'خرج‌هایی که این نفر پرداخت کرده هم پاک می‌شن.' : '',
        confirm: 'حذف',
        danger: true,
      });
      if (!ok) return;
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

// ورودی مبلغ با جداکننده‌ی خودکار و دکمه‌های میان‌بر
function wireMoney(input, quickWrap) {
  input.oninput = () => {
    const v = parseMoney(input.value);
    input.value = v ? money(v) : '';
  };
  if (quickWrap) {
    $$('button', quickWrap).forEach((b) => {
      b.onclick = () => {
        input.value = money(parseMoney(input.value) + Number(b.dataset.add));
        input.focus();
      };
    });
  }
}

const quickAmounts = `<div class="quick" id="quick">
    ${[[50000, 'پنجاه هزار'], [100000, 'صد هزار'], [500000, 'پانصد هزار']]
      .map(([v, label]) => `<button class="chip" type="button" data-add="${v}">${label}</button>`).join('')}
  </div>`;

// ---------- تب خرج‌ها ----------

function tabExpenses(plan) {
  if (plan.people.length < 2) return void ($('#tab').innerHTML = needPeople(plan));
  const all = plan.people.map((p) => p.id);
  $('#tab').innerHTML = `
    ${plan.expenses.length
      ? `<ul class="rows">${plan.expenses.map((e, i) => {
          const partial = (e.shares || all).length !== plan.people.length;
          return `<li><div class="row-item">
            ${avatar(nameOf(plan, e.payer))}
            <span class="row-main">
              <b>${esc(e.title || 'خرج')}${partial ? `<span class="tag">سهم ${fa((e.shares || []).length)} نفر</span>` : ''}</b>
              <span class="sub">${esc(nameOf(plan, e.payer))} پرداخت کرد</span>
            </span>
            <b class="row-amount">${money(e.amount)}</b>
            <button class="btn-icon danger" data-del="${i}" aria-label="حذف">${icon('trash')}</button>
          </div></li>`;
        }).join('')}</ul>`
      : `<div class="panel empty"><span class="art">${icon('wallet')}</span>
           <h3>هنوز خرجی ثبت نشده</h3>
           <p class="hint">هر چیزی که کسی حساب کرد رو همین‌جا ثبت کن.</p></div>`}

    <form class="panel" id="adde">
      <h3>${icon('plus')} خرج جدید</h3>
      <div class="field">
        <label for="etitle">بابت چی؟</label>
        <input id="etitle" placeholder="مثلاً شام، بنزین، اجاره ویلا" autocomplete="off">
      </div>
      <div class="field">
        <label for="eamount">مبلغ</label>
        <div class="money-field"><input id="eamount" inputmode="numeric" placeholder="۰" required><span class="unit">تومان</span></div>
      </div>
      ${quickAmounts}
      <div class="field">
        <label for="epayer">کی پرداخت کرد؟</label>
        <select id="epayer">${plan.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      </div>
      <details>
        <summary>سهم چه کسانی؟ (پیش‌فرض: همه)</summary>
        <div class="chips" id="shares">${plan.people.map((p) =>
          `<label class="chip on"><input type="checkbox" value="${p.id}" checked>${esc(p.name)}</label>`).join('')}</div>
      </details>
      <button class="btn btn-primary btn-block" type="submit">ثبت خرج</button>
    </form>`;

  wireMoney($('#eamount'), $('#quick'));
  $$('#shares .chip').forEach((label) => {
    label.querySelector('input').onchange = (e) => label.classList.toggle('on', e.target.checked);
  });
  $('#adde').onsubmit = (e) => {
    e.preventDefault();
    const amount = parseMoney($('#eamount').value);
    if (amount <= 0) return toast('مبلغ رو وارد کن');
    const shares = $$('#shares input:checked').map((c) => c.value);
    if (!shares.length) return toast('حداقل یک نفر باید سهم داشته باشه');
    db.update(plan.id, (p) =>
      p.expenses.push({ title: $('#etitle').value.trim(), payer: $('#epayer').value, amount, shares })
    );
    route();
  };
  $$('[data-del]', $('#tab')).forEach((b) => {
    b.onclick = () => {
      db.update(plan.id, (p) => p.expenses.splice(Number(b.dataset.del), 1));
      route();
    };
  });
}

// ---------- تب پرداخت‌های نقدی ----------

function tabCash(plan) {
  if (plan.people.length < 2) return void ($('#tab').innerHTML = needPeople(plan));
  const list = plan.payments || [];
  const opts = (sel) => plan.people.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#tab').innerHTML = `
    <div class="panel quiet">
      <h3>${icon('cash')} پرداخت نقدی بین اعضا</h3>
      <p class="hint">پولی که همون‌جا نقدی یا کارت‌به‌کارت رد و بدل شد رو اینجا ثبت کن تا از سهم کم بشه. این‌ها خرج پلن نیستن.</p>
    </div>
    ${list.length
      ? `<ul class="rows">${list.map((c, i) => `
          <li><div class="row-item">
            ${avatar(nameOf(plan, c.from))}
            <span class="row-main">
              <b>${esc(nameOf(plan, c.from))} <span class="arrow">${icon('arrow')}</span> ${esc(nameOf(plan, c.to))}</b>
              <span class="sub">${esc(c.note || 'پرداخت نقدی')}</span>
            </span>
            <b class="row-amount">${money(c.amount)}</b>
            <button class="btn-icon danger" data-del="${i}" aria-label="حذف">${icon('trash')}</button>
          </div></li>`).join('')}</ul>`
      : ''}
    <form class="panel" id="addc">
      <h3>${icon('plus')} ثبت پرداخت</h3>
      <div class="row">
        <div class="field grow"><label for="cfrom">از</label><select id="cfrom">${opts(plan.people[0].id)}</select></div>
        <div class="field grow"><label for="cto">به</label><select id="cto">${opts(plan.people[1].id)}</select></div>
      </div>
      <div class="field">
        <label for="camount">مبلغ</label>
        <div class="money-field"><input id="camount" inputmode="numeric" placeholder="۰" required><span class="unit">تومان</span></div>
      </div>
      <div class="field">
        <label for="cnote">توضیح (اختیاری)</label>
        <input id="cnote" placeholder="مثلاً نقدی سر میز" autocomplete="off">
      </div>
      <button class="btn btn-primary btn-block" type="submit">ثبت پرداخت</button>
    </form>`;

  wireMoney($('#camount'));
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
  $$('[data-del]', $('#tab')).forEach((b) => {
    b.onclick = () => {
      db.update(plan.id, (p) => p.payments.splice(Number(b.dataset.del), 1));
      route();
    };
  });
}

// ---------- تب تسویه ----------

function tabSettle(plan, t) {
  if (!plan.expenses.length) {
    $('#tab').innerHTML = `<div class="panel empty"><span class="art">${icon('receipt')}</span>
      <h3>هنوز خرجی ثبت نشده</h3>
      <a class="btn btn-primary" href="#/plan/${plan.id}/expenses">ثبت اولین خرج</a></div>`;
    return;
  }
  const url = shareUrl(plan);
  const text = `${plan.name} — تسویه‌حساب\nکل خرج: ${money(t.total)} تومان، ${fa(plan.people.length)} نفر\nسهم هر نفر: ${money(t.total / t.heads)} تومان\nلینک جزئیات و سهم خودت:`;
  $('#tab').innerHTML = `
    ${receiptCard(plan, t)}
    <div class="panel quiet">
      <label class="switch"><input type="checkbox" id="roundamt" ${plan.round ? 'checked' : ''}> رند کردن مبالغ</label>
      <p class="hint" id="roundhint"></p>
    </div>
    ${balancesCard(plan, t)}
    <div class="panel">
      <h3>${icon('share')} فرستادن برای بقیه</h3>
      <p class="hint">گیرنده لازم نیست چیزی نصب کنه. لینک رو باز می‌کنه، اسمش رو می‌زنه و سهمش رو می‌بینه.</p>
      <div class="row">
        <button class="btn btn-soft grow" id="copy">${icon('link')} کپی لینک</button>
        <button class="btn btn-soft grow" id="share">${icon('share')} ارسال</button>
      </div>
      <div class="row">
        <a class="btn btn-ghost grow" href="${waLink(`${text}\n${url}`)}" target="_blank" rel="noopener">واتساپ</a>
        <a class="btn btn-ghost grow" href="${tgLink(url, text)}" target="_blank" rel="noopener">تلگرام</a>
      </div>
      <div class="row">
        <a class="btn btn-ghost grow" href="#/tg/${plan.id}">${icon('bot')} ربات تلگرام</a>
        <a class="btn btn-ghost grow" href="#/sms/${plan.id}">${icon('message')} پیامک</a>
      </div>
    </div>
    <button class="btn btn-danger btn-block" id="delplan">${icon('trash')} حذف این پلن</button>`;

  const roundHint = () => {
    const off = settle(t.bal, { round: false });
    const on = settle(t.bal, { round: true });
    const diff = on.unit > 1 ? `با رند کردن، مبالغ سرراست می‌شن ولی تا ${money(on.residual)} تومان اختلاف ایجاد می‌شه.` : 'با این اعداد، رند کردن فرقی نمی‌کنه.';
    const pays = (p) => `${fa(p.transfers.length)} پرداخت${p.singlePayment ? '، هر نفر یک بار' : '، بعضی‌ها دو بار'}`;
    $('#roundhint').innerHTML = plan.round
      ? `${diff} بدون رند کردن: ${pays(off)}.`
      : `الان مبالغ دقیقن: ${pays(off)}. ${diff}`;
  };
  roundHint();
  $('#roundamt').onchange = (e) => {
    db.update(plan.id, (p) => { p.round = e.target.checked; });
    route();
  };

  $('#copy').onclick = async () => toast((await copy(url)) ? 'لینک کپی شد ✓' : 'کپی نشد');
  $('#share').onclick = async () => {
    if (!(await nativeShare(plan.name, text, url))) toast('این دستگاه ارسال مستقیم نداره؛ لینک رو کپی کن');
  };
  $('#delplan').onclick = async () => {
    if (!(await confirmSheet({ title: 'این پلن پاک بشه؟', body: 'همه‌ی خرج‌ها و تسویه‌ش پاک می‌شه.', confirm: 'حذف پلن', danger: true }))) return;
    db.remove(plan.id);
    location.hash = '#/';
  };
  bindCopyButtons();
}

function receiptCard(plan, t) {
  const { transfers, singlePayment, residual, unit } = t.plan;
  if (!transfers.length) {
    return `<div class="panel empty"><span class="art">${icon('check')}</span>
      <h3>همه تسویه‌ان</h3><p class="hint">کسی به کسی بدهکار نیست.</p></div>`;
  }
  const rows = transfers.map((tr) => {
    const to = person(plan, tr.to);
    return `<div class="pay-row">
        <div class="pay-who">
          ${avatar(nameOf(plan, tr.from), 'sm')}<span>${esc(nameOf(plan, tr.from))}</span>
          <span class="arrow">${icon('arrow')}</span>
          ${avatar(to.name, 'sm')}<span class="to">${esc(to.name)}</span>
        </div>
        <div class="pay-foot">
          <span class="pay-amount">${toman(tr.amount)}</span>
          <span class="leader"></span>
          ${to.card ? `<button class="btn btn-sm btn-soft" data-copy="${esc(to.card)}">${icon('copy')} کارت</button>` : ''}
        </div>
      </div>`;
  }).join('');
  const note = unit > 1
    ? `مبالغ به نزدیک‌ترین ${money(unit)} تومان رند شدن، پس تا ${money(residual)} تومان اختلاف هست.`
    : 'مبالغ دقیقن.';
  return `<section class="receipt">
      <div class="receipt-head">
        <h3 class="display">پلن پرداخت</h3>
        <span class="eyebrow">${fa(transfers.length)} پرداخت</span>
      </div>
      ${rows}
      <span class="stamp ${singlePayment ? '' : 'warn'}">${icon(singlePayment ? 'check' : 'info')}${singlePayment ? 'هر نفر فقط یک بار' : 'بعضی‌ها دو بار پرداخت دارن'}</span>
      ${note ? `<p class="hint">${note}</p>` : ''}
    </section>`;
}

function balancesCard(plan, t) {
  const rows = plan.people.map((p) => {
    const b = t.bal[p.id];
    const settled = Math.abs(b) < 1;
    const state = settled ? 'تسویه' : b > 0 ? `${money(b)} طلبکار` : `${money(-b)} بدهکار`;
    const extra = [
      t.cashOut[p.id] ? `نقدی داد ${money(t.cashOut[p.id])}` : '',
      t.cashIn[p.id] ? `نقدی گرفت ${money(t.cashIn[p.id])}` : '',
    ].filter(Boolean).join(' · ');
    return `<li class="balance-row">
        ${avatar(p.name, 'sm')}
        <span class="row-main">
          <b>${esc(p.name)}${p.guests ? `<span class="tag">+${fa(p.guests)} همراه</span>` : ''}</b>
          <span class="sub num">خرج کرده ${money(t.paid[p.id])} · سهمش ${money(t.share[p.id])}${extra ? ` · ${extra}` : ''}</span>
        </span>
        <span class="balance-state num ${settled ? 'muted' : b > 0 ? 'good' : 'owe'}">${state}</span>
      </li>`;
  }).join('');
  return `<div class="panel"><h3>جزئیات هر نفر</h3><ul>${rows}</ul></div>`;
}

function bindCopyButtons() {
  $$('[data-copy]').forEach((b) => {
    b.onclick = async () => toast((await copy(b.dataset.copy)) ? 'شماره کارت کپی شد ✓' : 'کپی نشد');
  });
}

// ---------- ربات تلگرام ----------

function reminderText(plan, t, url, forPerson) {
  const line = (tr) => `• ${nameOf(plan, tr.from)} ← ${nameOf(plan, tr.to)}: ${money(tr.amount)} تومان`;
  if (forPerson) {
    const out = t.plan.transfers.filter((x) => x.from === forPerson.id);
    const head = `سلام ${forPerson.name}\nتسویه‌ی «${plan.name}»`;
    if (!out.length) return `${head}\nتو تسویه‌ای، چیزی بدهکار نیستی.\n${url}`;
    const cards = out.map((o) => {
      const to = person(plan, o.to);
      return `${money(o.amount)} تومان به ${to.name}${to.card ? `\nشماره کارت: ${to.card}` : ''}`;
    }).join('\n');
    return `${head}\nسهم تو: ${money(t.share[forPerson.id])} تومان\n\n${cards}\n\nجزئیات: ${url}`;
  }
  return [
    `تسویه‌ی «${plan.name}»`,
    `کل خرج: ${money(t.total)} تومان · سهم هر نفر: ${money(t.total / t.heads)} تومان`,
    '',
    t.plan.transfers.length ? t.plan.transfers.map(line).join('\n') : 'همه تسویه‌ان',
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
    <div class="topbar">${backLink(`#/plan/${plan.id}/settle`, 'بازگشت به تسویه')}</div>
    <h2 class="page-title display">یادآوری با ربات تلگرام</h2>
    <p class="hint">مادرخرج سرور نداره، پس با <b>ربات خودت</b> کار می‌کنه. ساختن ربات رایگانه و یک دقیقه طول می‌کشه. توکن فقط روی همین گوشی می‌مونه و داخل لینک اشتراکی نمی‌ره.</p>

    <div class="panel">
      <h3>قدم ۱ — ساختن ربات</h3>
      <ol class="steps">
        <li><span>در تلگرام به <b class="cmd">@BotFather</b> پیام بده</span></li>
        <li><span>دستور <b class="cmd">/newbot</b> رو بفرست و یه اسم و یوزرنیم بده</span></li>
        <li><span>توکنی که می‌ده رو اینجا بذار</span></li>
      </ol>
      <div class="row">
        <input class="grow" id="token" placeholder="123456:ABC..." value="${esc(cfg.token || '')}" autocomplete="off" spellcheck="false" dir="ltr">
        <button class="btn btn-primary" id="connect">اتصال</button>
      </div>
      <div id="botinfo" class="hint">${cfg.bot ? `وصل شده به <b class="cmd">@${esc(cfg.bot)}</b>` : 'هنوز وصل نشده'}</div>
    </div>

    <div class="panel">
      <h3>قدم ۲ — مقصد پیام</h3>
      <p class="hint"><b>گروهی:</b> ربات رو به گروه اضافه کن و در گروه <b class="cmd">/start@</b>اسم‌ربات رو بفرست.<br>
      <b>شخصی:</b> هر کسی که می‌خوای پیام خصوصی بگیره، یه بار ربات رو باز کنه و <b class="cmd">/start</b> بزنه.</p>
      <button class="btn btn-soft btn-block" id="findchats">${icon('refresh')} پیدا کردن چت‌ها</button>
      <div id="chats">${chat ? `<p class="good">مقصد فعلی: <b>${esc(chat.title)}</b></p>` : ''}</div>
    </div>

    <div class="panel">
      <h3>قدم ۳ — فرستادن</h3>
      <div class="field"><label for="msg">متن پیام</label><textarea id="msg" rows="8">${esc(reminderText(plan, t, url))}</textarea></div>
      <button class="btn btn-primary btn-block" id="send" ${chat ? '' : 'disabled'}>${icon('send')} فرستادن به ${chat ? esc(chat.title) : 'مقصد'}</button>
      <button class="btn btn-ghost btn-block" id="sendeach" ${chat ? '' : 'disabled'}>${icon('users')} پیام جدا برای هر بدهکار</button>
      <p class="hint">پیام جداگانه فقط برای کسانی می‌ره که چت خصوصیشون رو در قدم ۲ به اسمشون وصل کردی.</p>
    </div>
    <div id="err"></div>`;

  const errBox = (e) => { $('#err').innerHTML = `<div class="alert">${esc(friendlyNetworkError(e))}</div>`; };
  const token = () => $('#token').value.trim();

  $('#connect').onclick = async () => {
    $('#err').innerHTML = '';
    try {
      const me = await getMe(token());
      tgStore.set({ ...tgStore.get(), token: token(), bot: me.username });
      $('#botinfo').innerHTML = `وصل شده به <b class="cmd">@${esc(me.username)}</b>`;
      toast('ربات وصل شد ✓');
    } catch (e) { errBox(e); }
  };

  $('#findchats').onclick = async () => {
    $('#err').innerHTML = '';
    try {
      const chats = await findChats(token());
      if (!chats.length) {
        $('#chats').innerHTML = '<p class="hint">چتی پیدا نشد. یه پیام به ربات بفرست و دوباره امتحان کن.</p>';
        return;
      }
      $('#chats').innerHTML = `<ul class="rows">${chats.map((c) => `
        <li><div class="row-item">
          <span class="row-main"><b>${esc(c.title)}</b><span class="sub">${c.type === 'private' ? 'چت خصوصی' : 'گروه'}</span></span>
          <button class="btn btn-sm btn-soft" data-target="${c.id}" data-title="${esc(c.title)}">مقصد اصلی</button>
          ${c.type === 'private'
            ? `<select data-link="${c.id}"><option value="">— کسی —</option>${plan.people.map((p) =>
                `<option value="${p.id}"${plan.tg?.people?.[p.id] === c.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`
            : ''}
        </div></li>`).join('')}</ul>`;
      $$('[data-target]', $('#chats')).forEach((b) => {
        b.onclick = () => {
          db.update(plan.id, (p) => { p.tg = { ...(p.tg || {}), chat: { id: Number(b.dataset.target), title: b.dataset.title } }; });
          toast('مقصد ثبت شد ✓');
          route();
        };
      });
      $$('[data-link]', $('#chats')).forEach((sel) => {
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
    } catch (e) { errBox(e); }
  };

  $('#send').onclick = async () => {
    $('#err').innerHTML = '';
    try {
      await sendMessage(token(), plan.tg.chat.id, $('#msg').value);
      toast('پیام فرستاده شد ✓');
    } catch (e) { errBox(e); }
  };

  $('#sendeach').onclick = async () => {
    $('#err').innerHTML = '';
    const map = plan.tg?.people || {};
    const targets = plan.people.filter((p) => t.plan.transfers.some((x) => x.from === p.id) && map[p.id]);
    if (!targets.length) return toast('هنوز چت خصوصی کسی وصل نشده');
    let ok = 0;
    const fails = [];
    for (const p of targets) {
      try {
        await sendMessage(token(), map[p.id], reminderText(plan, t, url, p));
        ok++;
      } catch (e) { fails.push(`${p.name}: ${friendlyNetworkError(e)}`); }
    }
    toast(`${fa(ok)} پیام فرستاده شد`);
    if (fails.length) $('#err').innerHTML = `<div class="alert">${fails.map(esc).join('<br>')}</div>`;
  };
}

// ---------- پیامک ----------

function smsText(plan, t, who, url) {
  const outs = t.plan.transfers.filter((x) => x.from === who.id);
  if (!outs.length) return `${who.name} عزیز، حساب «${plan.name}» تسویه‌ست. چیزی بدهکار نیستی.`;
  const body = outs.map((o) => {
    const to = person(plan, o.to);
    return `${money(o.amount)} تومان به ${to.name}${to.card ? ` - کارت ${to.card}` : ''}`;
  }).join(' / ');
  return `${who.name} عزیز، سهم تو از «${plan.name}»: ${body}${url ? `\n${url}` : ''}`;
}

function viewSms(plan) {
  const t = totals(plan);
  const url = shareUrl(plan);
  const cfg = smsStore.get();
  const debtors = plan.people.filter((p) => t.plan.transfers.some((x) => x.from === p.id));
  const withPhone = debtors.filter((p) => p.phone);

  main.innerHTML = `
    <div class="topbar">${backLink(`#/plan/${plan.id}/settle`, 'بازگشت به تسویه')}</div>
    <h2 class="page-title display">یادآوری با پیامک</h2>
    ${debtors.length
      ? `<div class="panel">
           <label class="switch"><input type="checkbox" id="withlink"> لینک تسویه داخل پیامک باشه</label>
           <p class="hint">لینک طولانیه و پیامک رو چند برابر می‌کنه. برای یادآوری مبلغ و شماره کارت لازم نیست.</p>
         </div>
         <p class="section-label">پیامک دستی — رایگان</p>
         <p class="hint">با هر دکمه، اپِ پیامکِ خود گوشیت با متن آماده باز می‌شه. از شماره‌ی خودت می‌ره، پس بقیه راحت‌تر اعتماد می‌کنن.</p>
         <ul class="rows" id="manual"></ul>
         <p class="section-label">ارسال خودکار — با پنل پیامکی</p>
         <div class="panel">
           <p class="hint">اگه پنل پیامکی داری، همه‌ی پیامک‌ها یک‌جا فرستاده می‌شن. کلید API فقط روی همین دستگاه ذخیره می‌شه.</p>
           <div class="field">
             <label for="provider">پنل</label>
             <select id="provider">
               <option value="">— انتخاب کن —</option>
               ${Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}"${cfg.provider === id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
             </select>
           </div>
           <div id="pfields"></div>
           <button class="btn btn-primary btn-block" id="sendall" ${withPhone.length ? '' : 'disabled'}>${icon('send')} فرستادن به ${fa(withPhone.length)} نفر</button>
           <p class="hint">بیشتر پنل‌ها برای پیامک غیرتبلیغاتی، خط خدماتی یا متن تأییدشده می‌خوان.</p>
         </div>`
      : `<div class="panel empty"><span class="art">${icon('check')}</span><h3>کسی بدهکار نیست</h3></div>`}
    <div id="err"></div>`;

  if (!debtors.length) return;

  const renderManual = () => {
    const link = $('#withlink').checked ? url : '';
    $('#manual').innerHTML = debtors.map((p) => {
      const text = smsText(plan, t, p, link);
      return `<li><div class="row-item">
          ${avatar(p.name)}
          <span class="row-main"><b>${esc(p.name)}</b>
            <span class="sub num">${p.phone ? fa(p.phone) : 'شماره موبایلش ثبت نشده'}</span></span>
          ${p.phone
            ? `<a class="btn btn-sm btn-soft" href="${esc(smsLink(p.phone, text))}">${icon('message')} پیامک</a>`
            : `<a class="btn btn-sm btn-ghost" href="#/plan/${plan.id}/people">ثبت شماره</a>`}
          <button class="btn-icon" data-copytext="${esc(text)}" aria-label="کپی متن">${icon('copy')}</button>
        </div></li>`;
    }).join('');
    $$('[data-copytext]', $('#manual')).forEach((b) => {
      b.onclick = async () => toast((await copy(b.dataset.copytext)) ? 'متن کپی شد ✓' : 'کپی نشد');
    });
  };

  const renderFields = () => {
    const id = $('#provider').value;
    const p = PROVIDERS[id];
    $('#pfields').innerHTML = p
      ? p.fields.map((f) => `<div class="field">
            <label for="f_${f.id}">${esc(f.label)}</label>
            <input id="f_${f.id}" ${f.ltr ? 'dir="ltr" spellcheck="false"' : ''} autocomplete="off"
              value="${esc(cfg.provider === id ? cfg[f.id] || '' : '')}">
          </div>`).join('') + `<p class="hint">${esc(p.help)}</p>`
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
    const ok = await confirmSheet({
      title: `برای ${fa(withPhone.length)} نفر پیامک بره؟`,
      body: 'این کار از اعتبار پنل تو کم می‌کنه.',
      confirm: 'بفرست',
    });
    if (!ok) return;
    const link = $('#withlink').checked ? url : '';
    let sent = 0;
    const fails = [];
    for (const p of withPhone) {
      try {
        await prov.send(conf, p.phone, smsText(plan, t, p, link));
        sent++;
      } catch (e) { fails.push(`${p.name}: ${friendlySmsError(e)}`); }
    }
    toast(`${fa(sent)} پیامک فرستاده شد`);
    if (fails.length) $('#err').innerHTML = `<div class="alert">${fails.map(esc).join('<br>')}</div>`;
  };
}

// ---------- صفحه‌ی لینک اشتراکی ----------

function viewShared(code) {
  let plan;
  try {
    plan = decodePlan(code);
  } catch {
    main.innerHTML = `<div class="panel empty"><span class="art">${icon('info')}</span>
      <h3>این لینک کار نمی‌کنه</h3><p class="hint">احتمالاً ناقص کپی شده.</p>
      <a class="btn btn-primary" href="#/">صفحه‌ی اصلی</a></div>`;
    return;
  }
  plan.people.forEach((p, i) => (p.id = `p${i}`));
  const t = totals(plan);
  const mine = sessionStorage.getItem(`mk.me.${code.slice(0, 24)}`);
  main.innerHTML = `
    <header class="masthead">
      <div>
        <p class="eyebrow">تسویه‌حساب دورهمی</p>
        <h1 class="page-title display">${esc(plan.name)}</h1>
      </div>
    </header>
    ${summaryBar(plan, t)}
    <div class="panel">
      <h3>تو کدومی؟</h3>
      <div class="chips" id="who">${plan.people.map((p) =>
        `<button class="chip ${mine === p.id ? 'on' : ''}" data-me="${p.id}">${esc(p.name)}</button>`).join('')}</div>
      <div id="mine"></div>
    </div>
    ${receiptCard(plan, t)}
    ${balancesCard(plan, t)}
    <div class="panel quiet">
      <p class="hint">این صفحه فقط نمایشه و تغییراتش برای بقیه فرستاده نمی‌شه.</p>
      <button class="btn btn-ghost btn-block" id="import">${icon('download')} ذخیره در گوشی من</button>
      <a class="btn btn-primary btn-block" href="#/">ساختن پلن خودم</a>
    </div>`;

  $('#import').onclick = () => {
    const saved = db.importPlan(plan);
    location.hash = `#/plan/${saved.id}/settle`;
    toast('در پلن‌های تو ذخیره شد ✓');
  };

  const showMine = (id) => {
    sessionStorage.setItem(`mk.me.${code.slice(0, 24)}`, id);
    const outs = t.plan.transfers.filter((x) => x.from === id);
    const ins = t.plan.transfers.filter((x) => x.to === id);
    $('#mine').innerHTML = `
      <div class="pay-row" style="border-bottom:0">
        <p class="hint">سلام ${esc(nameOf(plan, id))} · خرج کردی ${money(t.paid[id])} · سهمت ${money(t.share[id])} تومان</p>
        ${outs.length
          ? outs.map((o) => {
              const to = person(plan, o.to);
              return `<div class="pay-amount big owe">${toman(o.amount)}</div>
                <p class="hint">به ${esc(to.name)}${to.card ? ` · کارت ${fa(to.card)}` : ''}</p>
                <div class="row">
                  ${to.card ? `<button class="btn btn-soft grow" data-copy="${esc(to.card)}">${icon('copy')} کپی کارت</button>` : ''}
                  <a class="btn btn-primary grow" href="${waLink(`سهمم از «${plan.name}» رو پرداخت کردم: ${money(o.amount)} تومان به ${to.name}`)}" target="_blank" rel="noopener">${icon('check')} پرداخت کردم</a>
                </div>`;
            }).join('')
          : ins.length
            ? `<p class="good">تو طلبکاری. ${ins.map((i2) => `${esc(nameOf(plan, i2.from))} باید ${money(i2.amount)} تومان بهت بده.`).join(' ')}</p>`
            : '<p class="good">تو تسویه‌ای. نه بدهکاری نه طلبکار.</p>'}
      </div>`;
    bindCopyButtons();
  };

  $$('[data-me]', $('#who')).forEach((b) => {
    b.onclick = () => {
      $$('.chip', $('#who')).forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
      showMine(b.dataset.me);
    };
  });
  if (mine) showMine(mine);
  bindCopyButtons();
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
