// اتصال مستقیم مرورگر به ربات تلگرامِ خود کاربر (بدون سرور)
// توکن فقط روی همین دستگاه ذخیره می‌شود و هیچ‌وقت داخل لینک اشتراکی نمی‌رود.

const KEY = 'madarkharj.tg';

export const tgStore = {
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
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  },
};

export async function api(token, method, params = {}) {
  // فرم‌انکود، چون با JSON مرورگر یک درخواست preflight می‌فرستد که تلگرام جواب نمی‌دهد
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body });
  const data = await res.json().catch(() => ({ ok: false, description: 'پاسخ نامفهوم از تلگرام' }));
  if (!data.ok) throw new Error(tgError(data));
  return data.result;
}

function tgError(data) {
  const d = data.description || '';
  if (data.error_code === 401) return 'توکن ربات درست نیست.';
  if (/chat not found/i.test(d)) return 'چت پیدا نشد. مطمئن شو ربات هنوز در گروهه یا طرف یه بار به ربات پیام داده.';
  if (/bot was blocked/i.test(d)) return 'این کاربر ربات رو بلاک کرده.';
  if (/bot can't initiate/i.test(d)) return 'ربات نمی‌تونه اول پیام بده. طرف باید یه بار به ربات /start بزنه.';
  return d || 'خطای ناشناخته از تلگرام';
}

export const getMe = (token) => api(token, 'getMe');

// چت‌هایی که ربات اخیراً در آن‌ها پیام دیده است
export async function findChats(token) {
  const updates = await api(token, 'getUpdates', { limit: 100, timeout: 0 });
  const chats = new Map();
  for (const u of updates) {
    const msg = u.message || u.edited_message || u.channel_post;
    const chat = msg?.chat;
    if (!chat) continue;
    chats.set(chat.id, {
      id: chat.id,
      type: chat.type,
      title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id),
      username: chat.username,
    });
  }
  return [...chats.values()];
}

export const sendMessage = (token, chatId, text) =>
  api(token, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: false });

// اگر تلگرام در دسترس نباشد، fetch خطای شبکه می‌دهد
export function friendlyNetworkError(e) {
  if (e instanceof TypeError || /failed to fetch|networkerror/i.test(e.message)) {
    return 'به تلگرام وصل نشدم. اگه تلگرام روی اینترنتت باز نمی‌شه، اول فیلترشکن رو روشن کن و دوباره امتحان کن.';
  }
  return e.message;
}
