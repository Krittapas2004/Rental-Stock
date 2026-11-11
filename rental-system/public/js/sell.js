const Sell = {
  items: [],
  init() {
    const el = document.getElementById('tab-sell');
    el.innerHTML = `
      <h2>New rental</h2>
      <form id="sl-form">
        <div class="panel row">
          <label>Rental starts <input type="date" id="sl-start" required></label>
          <label>Returns on <input type="date" id="sl-end" required></label>
        </div>
        <h3>Available on these dates</h3>
        <div id="sl-pick" class="pick"></div>
        <div class="panel grid2" style="margin-top:1rem">
          <label>Customer name <input id="sl-name" required></label>
          <label>Phone <input id="sl-phone" type="tel"></label>
        </div>
        <label>Notes <textarea id="sl-notes" rows="2" placeholder="Deposit, pickup time, fitting..."></textarea></label>
        <div class="total" id="sl-total"></div>
        <p class="error" id="sl-error"></p>
        <button class="btn primary" type="submit">Save rental</button>
      </form>`;
    ['sl-start', 'sl-end'].forEach((id) => document.getElementById(id).addEventListener('change', () => Sell.load()));
    document.getElementById('sl-pick').addEventListener('change', Sell.total);
    document.getElementById('sl-form').addEventListener('submit', Sell.submit);
  },
  async open() {
    const d = App.draft;
    const t = Util.today();
    document.getElementById('sl-start').value = d ? d.start : document.getElementById('sl-start').value || t;
    document.getElementById('sl-end').value = d ? d.end : document.getElementById('sl-end').value || Util.addDays(t, 1);
    App.draft = null;
    await Sell.load(d ? d.ids : null);
  },
  checked: () => [...document.querySelectorAll('#sl-pick input:checked')].map((i) => Number(i.value)),
  async load(preselect) {
    const start = document.getElementById('sl-start').value, end = document.getElementById('sl-end').value;
    const err = document.getElementById('sl-error');
    err.textContent = '';
    if (!start || !end || end < start) {
      document.getElementById('sl-pick').innerHTML = '<p class="muted">Choose a start date and a return date that is the same or later.</p>';
      return Sell.total();
    }
    const keep = preselect || Sell.checked();
    try {
      Sell.items = (await API.get(`/api/availability?start=${start}&end=${end}`)).filter((i) => i.available);
    } catch (ex) { err.textContent = ex.message; return; }
    document.getElementById('sl-pick').innerHTML = Sell.items.map((i) => `
      <label><input type="checkbox" value="${i.id}" ${keep.includes(i.id) ? 'checked' : ''}>
        <span>${Util.esc(i.name)} <span class="muted">${Util.esc(i.category)}${i.size ? ' · ' + Util.esc(i.size) : ''}</span></span>
        <span class="price">${Util.money(i.price_per_day)}/day</span></label>`).join('')
      || '<p class="muted">Nothing is free on these dates.</p>';
    Sell.total();
  },
  total() {
    const start = document.getElementById('sl-start').value, end = document.getElementById('sl-end').value;
    const ids = Sell.checked();
    if (!start || !end || end < start) { document.getElementById('sl-total').textContent = ''; return; }
    const n = Util.days(start, end);
    const sum = Sell.items.filter((i) => ids.includes(i.id)).reduce((s, i) => s + i.price_per_day * n, 0);
    document.getElementById('sl-total').textContent =
      `${n} day${n > 1 ? 's' : ''}, ${ids.length} item${ids.length === 1 ? '' : 's'}: ${Util.money(sum)}`;
  },
  async submit(e) {
    e.preventDefault();
    const err = document.getElementById('sl-error');
    err.textContent = '';
    try {
      await API.post('/api/orders', {
        customer_name: document.getElementById('sl-name').value,
        phone: document.getElementById('sl-phone').value,
        notes: document.getElementById('sl-notes').value,
        start_date: document.getElementById('sl-start').value,
        end_date: document.getElementById('sl-end').value,
        product_ids: Sell.checked(),
      });
      Util.toast('Rental saved');
      ['sl-name', 'sl-phone', 'sl-notes'].forEach((id) => (document.getElementById(id).value = ''));
      App.show('orders');
    } catch (ex) {
      err.textContent = ex.message;
      Sell.load();
    }
  },
};
