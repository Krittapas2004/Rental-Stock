const Auth = {
  signup: false,

  init() {
    $('#loginBtn').onclick = () => this.login();
    $('#modeBtn').onclick = () => this.setMode(!this.signup);

    ['email', 'pw', 'shop'].forEach(id => {
      const el = $('#' + id);
      if (el) el.onkeydown = e => { if (e.key === 'Enter') this.login(); };
    });

    $('#logout').onclick = async () => {
      try { await API.request('/logout', { method: 'POST' }); } catch {}
      this.lock();
    };
  },

  setMode(isSignup) {
    this.signup = isSignup;
    $('#shopWrap').classList.toggle('hidden', !isSignup);
    $('#loginBtn').textContent = isSignup ? 'Create rental account' : 'Sign in';
    $('#modeBtn').textContent = isSignup ? 'I already have an account' : 'Create a new rental shop account';
    $('#loginErr').textContent = '';
    $('#authIntro').textContent = isSignup
      ? 'Set up your rental business. Your clothes, gear, and customer bookings remain private to you.'
      : 'Sign in to your rental management portal.';
  },

  async login() {
    try {
      $('#loginErr').textContent = '';
      const email = $('#email').value.trim();
      const password = $('#pw').value;
      const shop_name = $('#shop').value.trim();

      if (!email || !password) {
        throw new Error('Please enter both email and password.');
      }
      if (this.signup && !shop_name) {
        throw new Error('Please enter your rental store or shop name.');
      }

      const body = { email, password, shop_name };
      const endpoint = this.signup ? '/register' : '/login';

      const res = await fetch('/api' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      API.token = data.token;
      localStorage.setItem('token', API.token);
      App.start();
    } catch (err) {
      $('#loginErr').textContent = err.message;
    }
  },

  lock() {
    API.token = null;
    localStorage.removeItem('token');
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#pw').value = '';
    $('#email').focus();
  }
};
