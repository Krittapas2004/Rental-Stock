const API = {
  token: localStorage.getItem('token'),

  async request(path, opts = {}) {
    const res = await fetch('/api' + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + this.token,
        ...(opts.headers || {})
      },
      body: opts.body && JSON.stringify(opts.body)
    });

    if (res.status === 401 && path !== '/login' && path !== '/register') {
      Auth.lock();
      throw new Error('Session expired, please sign in again.');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }
};

// UI Helpers
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

const toast = (msg, isError = false) => {
  const el = document.createElement('div');
  el.className = 'toast';
  if (isError) el.style.background = 'var(--danger)';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3400);
};

// Date Formatting (DD/MM/YYYY)
const formatDate = iso => {
  if (!iso) return '—';
  const clean = String(iso).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return clean;
};

// Date Formatting (e.g. 11 Nov 2026)
const formatDatePretty = iso => {
  if (!iso) return '—';
  try {
    const parts = String(iso).slice(0, 10).split('-');
    if (parts.length === 3) {
      const dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
    return iso;
  } catch {
    return iso;
  }
};

// Currency Formatting
const formatMoney = (amountInCents, currency = 'thb') => {
  const cur = (currency || 'thb').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format((amountInCents || 0) / 100);
  } catch {
    return `${((amountInCents || 0) / 100).toFixed(2)} ${cur}`;
  }
};

// Calculate calendar rental days
const calculateDays = (start, ret) => {
  if (!start || !ret) return 1;
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(ret + 'T00:00:00Z');
  const diffMs = e - s;
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
};

// Category Icon Mapper
const getCategoryIcon = cat => {
  const map = {
    'Dresses': '👗',
    'Suits & Formal': '🤵',
    'Camping & Outdoor': '⛺',
    'Camera & Tech': '📷',
    'Costumes & Themed': '🎭',
    'Accessories': '🎒',
    'Other': '📦'
  };
  return map[cat] || '📦';
};
