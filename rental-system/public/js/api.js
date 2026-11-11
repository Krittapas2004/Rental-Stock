const API = {
  token: () => localStorage.getItem('token'),
  async req(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (API.token() || '') },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.includes('/auth/login')) Auth.logout();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  },
  get: (u) => API.req('GET', u),
  post: (u, b) => API.req('POST', u, b),
  put: (u, b) => API.req('PUT', u, b),
  patch: (u, b) => API.req('PATCH', u, b),
  del: (u) => API.req('DELETE', u),
};

const Util = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  // 2026-11-11 -> 11/11/2026
  date: (iso) => (iso ? iso.split('-').reverse().join('/') : ''),
  today: () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },
  addDays: (iso, n) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  },
  days: (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1,
  settings: { shop_name: 'Rental Manager', currency: '฿' },
  money: (n) => Util.settings.currency + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }),
  toast(msg, bad) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(Util._t);
    Util._t = setTimeout(() => (t.className = ''), 2800);
  },
};
