const App = {
  cfg: null,
  activeTab: 'availability',

  init() {
    Auth.init();
    Availability.init();
    Inventory.init();
    Rentals.init();
    Settings.init();

    // Tab buttons in nav
    $$('nav button').forEach(btn => {
      btn.onclick = () => this.showTab(btn.dataset.tab);
    });

    if (API.token) {
      this.start();
    } else {
      Auth.lock();
    }
  },

  async start() {
    try {
      this.cfg = await API.request('/me');
    } catch {
      Auth.lock();
      return;
    }

    $('#headerShopName').textContent = this.cfg.shop_name || 'RentWear';
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');

    await this.refreshDashboard();
    await this.showTab(this.activeTab);
  },

  async showTab(tabName) {
    this.activeTab = tabName;

    // Update active nav button
    $$('nav button').forEach(btn => {
      btn.setAttribute('aria-current', btn.dataset.tab === tabName);
    });

    // Show corresponding page, hide others
    ['availability', 'rentals', 'inventory', 'settings'].forEach(id => {
      const page = $('#' + id);
      if (page) page.classList.toggle('hidden', id !== tabName);
    });

    // Load data for active tab
    if (tabName === 'availability') {
      await Availability.load();
    } else if (tabName === 'rentals') {
      await Rentals.load();
    } else if (tabName === 'inventory') {
      await Inventory.load();
    } else if (tabName === 'settings') {
      Settings.render();
    }

    this.refreshDashboard();
  },

  async refreshDashboard() {
    try {
      const d = await API.request('/dashboard');
      if ($('#kpiTotalItems')) $('#kpiTotalItems').textContent = d.total_items ?? 0;
      if ($('#kpiCurrentlyOut')) $('#kpiCurrentlyOut').textContent = d.currently_out ?? 0;
      if ($('#kpiDueToday')) $('#kpiDueToday').textContent = d.due_today ?? 0;
      if ($('#kpiOverdue')) $('#kpiOverdue').textContent = d.overdue ?? 0;
    } catch {}
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
