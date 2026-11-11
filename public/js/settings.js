const Settings = {
  CURRENCIES: ['thb', 'usd', 'eur', 'gbp', 'sgd', 'aud', 'cad', 'myr'],

  init() {
    $('#sSave').onclick = () => this.save();
  },

  render() {
    if (!App.cfg) return;

    $('#acctUserEmail').textContent = `Signed in as ${App.cfg.email}`;
    $('#sShop').value = App.cfg.shop_name || '';
    $('#sPhone').value = App.cfg.phone || '';
    $('#sAddr').value = App.cfg.address || '';
    $('#sTerms').value = App.cfg.rental_terms || '';

    const curSelect = $('#sCur');
    curSelect.innerHTML = this.CURRENCIES.map(c => `
      <option value="${c}" ${c === (App.cfg.currency || 'thb') ? 'selected' : ''}>
        ${c.toUpperCase()} (${c === 'thb' ? '฿ Baht' : c === 'usd' ? '$ USD' : c === 'eur' ? '€ Euro' : c})
      </option>
    `).join('');
  },

  async save() {
    const shop_name = $('#sShop').value.trim();
    const phone = $('#sPhone').value.trim();
    const address = $('#sAddr').value.trim();
    const currency = $('#sCur').value;
    const rental_terms = $('#sTerms').value.trim();

    if (!shop_name) {
      toast('Please enter your shop or rental business name.', true);
      return;
    }

    try {
      App.cfg = await API.request('/settings', {
        method: 'PUT',
        body: { shop_name, phone, address, currency, rental_terms }
      });

      $('#headerShopName').textContent = App.cfg.shop_name;
      toast('Store settings saved successfully!');
      this.render();
      if (typeof Availability !== 'undefined' && Availability.load) Availability.load().catch(() => {});
      if (typeof Inventory !== 'undefined' && Inventory.load) Inventory.load().catch(() => {});
      if (typeof Rentals !== 'undefined' && Rentals.load) Rentals.load().catch(() => {});
    } catch (err) {
      toast(err.message, true);
    }
  }
};
