const App = {
  draft: null,
  started: false,
  async start() {
    document.getElementById('login-view').hidden = true;
    document.getElementById('app-view').hidden = false;
    document.getElementById('who-name').textContent = Auth.user.username;
    if (!App.started) {
      App.started = true;
      Availability.init(); Products.init(); Sell.init(); Orders.init(); Settings.init();
      document.getElementById('tabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]');
        if (b) App.show(b.dataset.tab);
      });
    }
    await Settings.refresh();
    App.show('availability');
  },
  async show(tab) {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== 'tab-' + tab));
    try {
      if (tab === 'availability') await Availability.load();
      if (tab === 'sell') await Sell.open();
      if (tab === 'orders') await Orders.load();
      if (tab === 'products') await Products.load();
      if (tab === 'settings') Settings.render();
    } catch (ex) { Util.toast(ex.message, true); }
  },
};
Auth.init();
Auth.check();
