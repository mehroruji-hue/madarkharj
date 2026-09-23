// شیت پایین‌صفحه، جایگزین prompt و confirm خام مرورگر
import { esc } from './util.js';
import { icon } from './icons.js';

function open(html, wire) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  const close = (value) => {
    dlg.close();
    dlg.addEventListener('transitionend', () => dlg.remove(), { once: true });
    setTimeout(() => dlg.remove(), 400);
    dlg._resolve(value);
  };
  return new Promise((resolve) => {
    dlg._resolve = resolve;
    dlg.showModal();
    requestAnimationFrame(() => dlg.classList.add('in'));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      dlg.classList.remove('in');
      close(null);
    });
    dlg.querySelector('[data-close]')?.addEventListener('click', () => {
      dlg.classList.remove('in');
      close(null);
    });
    wire(dlg, (v) => {
      dlg.classList.remove('in');
      close(v);
    });
  });
}

/**
 * فرم کوتاه: fields = [{id, label, value, hint, type, inputmode, dir, placeholder}]
 * خروجی: شیئی از مقادیر، یا null اگر بسته شود
 */
export function askSheet({ title, note = '', fields = [], submit = 'ذخیره' }) {
  const body = fields
    .map(
      (f) => `<div class="field">
        <label for="s_${f.id}">${esc(f.label)}</label>
        <input id="s_${f.id}" name="${f.id}" value="${esc(f.value ?? '')}"
          ${f.type ? `type="${f.type}"` : ''} ${f.inputmode ? `inputmode="${f.inputmode}"` : ''}
          ${f.dir ? `dir="${f.dir}"` : ''} placeholder="${esc(f.placeholder || '')}" autocomplete="off">
        ${f.hint ? `<p class="hint">${f.hint}</p>` : ''}
      </div>`
    )
    .join('');
  return open(
    `<form method="dialog" class="sheet-in">
       <div class="sheet-head"><h3>${esc(title)}</h3>
         <button type="button" class="btn-icon" data-close aria-label="بستن">${icon('x')}</button></div>
       ${note ? `<p class="hint">${note}</p>` : ''}
       ${body}
       <button class="btn btn-primary btn-block" type="submit">${esc(submit)}</button>
     </form>`,
    (dlg, done) => {
      const form = dlg.querySelector('form');
      setTimeout(() => form.querySelector('input')?.focus(), 120);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        done(Object.fromEntries(fields.map((f) => [f.id, dlg.querySelector(`#s_${f.id}`).value])));
      });
    }
  );
}

/** تأیید کار: خروجی true یا false */
export function confirmSheet({ title, body = '', confirm = 'تأیید', danger = false }) {
  return open(
    `<div class="sheet-in">
       <div class="sheet-head"><h3>${esc(title)}</h3>
         <button type="button" class="btn-icon" data-close aria-label="بستن">${icon('x')}</button></div>
       ${body ? `<p class="hint">${body}</p>` : ''}
       <div class="row">
         <button class="btn btn-soft grow" type="button" data-close>انصراف</button>
         <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} grow" type="button" data-yes>${esc(confirm)}</button>
       </div>
     </div>`,
    (dlg, done) => {
      dlg.querySelector('[data-yes]').addEventListener('click', () => done(true));
      setTimeout(() => dlg.querySelector('[data-yes]')?.focus(), 120);
    }
  ).then((v) => v === true);
}
