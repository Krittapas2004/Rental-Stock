const Auth = {
  signup: false,

  init() {
    $('#loginBtn').onclick = () => this.login();
    $('#modeBtn').onclick = () => this.setMode(!this.signup);

    ['email', 'pw', 'shop'].forEach(id => {
      const el = $('#' + id);
      if (el) el.onkeydown = e => { if (e.key === 'Enter') this.login(); };
    });

    // Forgot password handlers
    $('#forgotPwBtn').onclick = () => this.showForgotPassword();
    $('#backToLoginBtn').onclick = () => this.hideForgotPassword();
    $('#sendResetBtn').onclick = () => this.sendResetLink();
    $('#forgotEmail').onkeydown = e => { if (e.key === 'Enter') this.sendResetLink(); };

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
    // Hide forgot password link in signup mode
    const forgotBtn = $('#forgotPwBtn');
    if (forgotBtn) forgotBtn.parentElement.style.display = isSignup ? 'none' : '';
  },

  showForgotPassword() {
    $('#loginForm').classList.add('hidden');
    $('#forgotPwForm').classList.remove('hidden');
    $('#authIntro').textContent = 'Enter the email address you used to sign up, and we\'ll send you a link to reset your password.';
    $('#forgotErr').textContent = '';
    $('#forgotSuccess').textContent = '';
    $('#forgotSuccess').classList.add('hidden');
    $('#forgotEmail').value = $('#email').value || '';
    $('#forgotEmail').focus();
  },

  hideForgotPassword() {
    $('#forgotPwForm').classList.add('hidden');
    $('#loginForm').classList.remove('hidden');
    $('#authIntro').textContent = this.signup
      ? 'Set up your rental business. Your clothes, gear, and customer bookings remain private to you.'
      : 'Sign in to your rental management portal.';
    $('#email').focus();
  },

  async sendResetLink() {
    try {
      $('#forgotErr').textContent = '';
      $('#forgotSuccess').textContent = '';
      $('#forgotSuccess').classList.add('hidden');
      const email = $('#forgotEmail').value.trim();

      if (!email) {
        throw new Error('Please enter your email address.');
      }

      $('#sendResetBtn').disabled = true;
      $('#sendResetBtn').textContent = 'Sending...';

      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      $('#forgotSuccess').textContent = data.message || 'If that email is registered, a reset link has been sent. Check your inbox (and spam folder).';
      $('#forgotSuccess').classList.remove('hidden');
      $('#sendResetBtn').textContent = '✓ Sent!';

      // Re-enable after 30 seconds
      setTimeout(() => {
        $('#sendResetBtn').disabled = false;
        $('#sendResetBtn').textContent = 'Send Reset Link';
      }, 30000);

    } catch (err) {
      $('#forgotErr').textContent = err.message;
      $('#sendResetBtn').disabled = false;
      $('#sendResetBtn').textContent = 'Send Reset Link';
    }
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
    // Reset to login form (not forgot password)
    $('#loginForm').classList.remove('hidden');
    $('#forgotPwForm').classList.add('hidden');
    $('#pw').value = '';
    $('#email').focus();
  }
};
