// یادآوری با پیامک، در دو حالت:
// ۱) دستی و رایگان: اپِ پیامکِ خود گوشی با متن آماده باز می‌شود
// ۲) خودکار: با پنل پیامکی خود کاربر (کلید فقط روی همین دستگاه ذخیره می‌شود)

const KEY = 'madarkharj.sms';

export const smsStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  },
  set(v) {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {}
  },
};

// ۰۹۱۲۳۴۵۶۷۸۹ / +۹۸۹۱۲... / ۹۸۹۱۲... را یکدست می‌کند
export function normalizePhone(raw) {
  const digits = String(raw)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[^\d+]/g, '');
  if (/^\+98\d{10}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^98\d{10}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  if (/^0\d{10}$/.test(digits)) return digits;
  return digits; // شماره‌ی غیرایرانی یا ناقص، همان‌طور که هست
}

export const isValidPhone = (p) => /^0\d{10}$/.test(p) || /^\+\d{8,15}$/.test(p);

// لینکی که اپِ پیامک گوشی را با متن آماده باز می‌کند (اندروید و آی‌اواس)
export const smsLink = (phone, text) => `sms:${phone}?&body=${encodeURIComponent(text)}`;

export const PROVIDERS = {
  kavenegar: {
    name: 'کاوه‌نگار',
    fields: [{ id: 'key', label: 'کلید API', ltr: true }, { id: 'sender', label: 'شماره خط (اختیاری)', ltr: true }],
    help: 'از پنل کاوه‌نگار: تنظیمات ← انتخاب و تنظیم API',
    async send({ key, sender }, to, text) {
      const q = new URLSearchParams({ receptor: to, message: text });
      if (sender) q.set('sender', sender);
      const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(key)}/sms/send.json`, {
        method: 'POST',
        body: q,
      });
      const data = await res.json().catch(() => null);
      if (!data || data.return?.status !== 200) {
        throw new Error(data?.return?.message || `خطای پنل (کد ${res.status})`);
      }
      return data.entries?.[0];
    },
  },
  smsir: {
    name: 'SMS.ir',
    fields: [{ id: 'key', label: 'کلید API', ltr: true }, { id: 'line', label: 'شماره خط', ltr: true }],
    help: 'از پنل SMS.ir: توسعه‌دهندگان ← کلید API',
    async send({ key, line }, to, text) {
      const res = await fetch('https://api.sms.ir/v1/send/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, Accept: 'application/json' },
        body: JSON.stringify({ lineNumber: line, messageText: text, mobiles: [to] }),
      });
      const data = await res.json().catch(() => null);
      if (!data || data.status !== 1) throw new Error(data?.message || `خطای پنل (کد ${res.status})`);
      return data.data;
    },
  },
};

export function friendlySmsError(e) {
  if (e instanceof TypeError || /failed to fetch|networkerror/i.test(e.message)) {
    return 'به پنل پیامکی وصل نشدم. اینترنت یا آدرس پنل رو بررسی کن.';
  }
  return e.message;
}
