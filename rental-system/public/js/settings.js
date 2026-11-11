const Settings = {
  init() {
    document.getElementById('tab-settings').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        if (e.target.id === 'st-shop') {
          await API.put('/api/settings', {
            shop_name: document.getElementById('st-name').value,
            currency: document.getElementById('st-cur').value,
          });
          await Settings.refresh();
          Util.toast('Settings saved');
        } else {
          await API.post('/api/auth/password', {
            current: document.getElementById('st-cur-pw').value,
            next: document.getElementById('st-new-pw').value,
          });
          e.target.reset();
          Util.toast('Password changed');
        }
      } catch (ex) { Util.toast(ex.message, true); }
    });
  },
  async refresh() {
    Util.settings = await API.get('/api/settings');
    document.getElementById('shop-name').textContent = Util.settings.shop_name;
    document.title = Util.settings.shop_name;
  },
  render() {
    const admin = Auth.isAdmin();
    document.getElementById('tab-settings').innerHTML = `<h2>Settings</h2>
      ${admin ? `<form class="panel grid2" id="st-shop">
        <label>Shop name <input id="st-name" value="${Util.esc(Util.settings.shop_name)}"></label>
        <label>Currency symbol <input id="st-cur" value="${Util.esc(Util.settings.currency)}"></label>
        <div><button class="btn primary" type="submit">Save settings</button></div></form>` : ''}
      <form class="panel grid2" id="st-pw">
        <label>Current password <input id="st-cur-pw" type="password" required></label>
        <label>New password <input id="st-new-pw" type="password" minlength="6" required></label>
        <div><button class="btn" type="submit">Change password</button></div></form>`;
  },
};
