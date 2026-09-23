const FA = '۰۱۲۳۴۵۶۷۸۹';
export const fa = (v) => String(v).replace(/\d/g, (d) => FA[d]);
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// «۱۲٬۵۰۰»
export const money = (v) => Math.round(v).toLocaleString('fa-IR').replace(/٫/g, '٬');

// ورودی کاربر: ارقام فارسی، عربی، جداکننده و فاصله را می‌پذیرد
export function parseMoney(str) {
  const s = String(str)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[^\d]/g, '');
  return s ? Number(s) : 0;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}
