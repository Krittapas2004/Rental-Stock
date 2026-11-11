const Auth = {
  user: null,
  init() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('login-error');
      err.textContent = '';
      try {
        const r = await API.post('/api/auth/login', {
          username: document.getElementById('login-user').value.trim(),
          password: document.getElementById('login-pass').value,
        });
        localStorage.setItem('token', r.token);
        Auth.user = r.user;
        document.getElementById('login-pass').value = '';
        App.start();
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
    document.getElementById('logout').addEventListener('click', Auth.logout);
  },
  async check() {
    if (!API.token()) return Auth.showLogin();
    try {
      Auth.user = (await API.get('/api/auth/me')).user;
      App.start();
    } catch {
      Auth.showLogin();
    }
  },
  showLogin() {
    document.getElementById('app-view').hidden = true;
    document.getElementById('login-view').hidden = false;
  },
  logout() {
    localStorage.removeItem('token');
    Auth.user = null;
    Auth.showLogin();
  },
  isAdmin: () => Auth.user && Auth.user.role === 'admin',
};
