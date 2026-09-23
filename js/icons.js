// آیکون‌های خطی، ۲۴ در ۲۴، با رنگِ متنِ والد
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M14.5 6.5 17.5 9.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18.5h2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5 6-5s6 1.8 6 5"/><path d="M16 6.2a3 3 0 0 1 0 5.6M18 19.8c0-2.2-.8-3.9-2.2-5"/>',
  userPlus: '<circle cx="10" cy="8" r="3.4"/><path d="M3.5 20c0-3.3 2.9-5.2 6.5-5.2 1 0 2 .15 2.8.44"/><path d="M17 14.5v5M14.5 17h5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15"/>',
  share: '<path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  link: '<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2"/><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2"/>',
  send: '<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z"/>',
  message: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5Z"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3.5"/><path d="M12 4v4M8.5 13.5h.01M15.5 13.5h.01M9.5 17h5"/>',
  receipt: '<path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.4V3Z"/><path d="M9 8h6M9 12h6"/>',
  wallet: '<path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h12a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M16 12.5h2.5"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  chevron: '<path d="M14 6 8 12l6 6"/>',
  back: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  arrow: '<path d="M4 12h14M12 6l6 6-6 6"/>',
  x: '<path d="M6 6 18 18M18 6 6 18"/>',
  refresh: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
  download: '<path d="M12 4v11M8.5 11.5 12 15l3.5-3.5"/><path d="M5 19h14"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// رنگ ثابت برای هر اسم، تا هر نفر همیشه همان رنگ را داشته باشد
export function hueOf(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

export const initial = (name) => String(name).trim().slice(0, 1) || '؟';

export const avatar = (name, size = '') =>
  `<span class="avatar ${size}" style="--h:${hueOf(name)}">${initial(name)}</span>`;
