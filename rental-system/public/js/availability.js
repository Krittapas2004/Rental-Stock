const Availability = {
  items: [],
  init() {
    const el = document.getElementById('tab-availability');
    el.innerHTML = `
      <h2>What is available?</h2>
      <div class="panel row">
        <label>From <input type="date" id="av-start"></label>
        <label>To (return date) <input type="date" id="av-end"></label>
        <label>Type <select id="av-cat"><option value="">All</option></select></label>
        <label>Search <input id="av-q" placeholder="Name or size"></label>
      </div>
      <div id="av-summary" class="summary"></div>
      <div id="av-error" class="error"></div>
      <div id="av-list"></div>`;
    const t = Util.today();
    document.getElementById('av-start').value = t;
    document.getElementById('av-end').value = Util.addDays(t, 1);
    ['av-start', 'av-end'].forEach((id) => document.getElementById(id).addEventListener('change', Availability.load));
    ['av-cat', 'av-q'].forEach((id) => document.getElementById(id).addEventListener('input', Availability.render));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rent]');
      if (!b) return;
      App.draft = { start: Availability.range().start, end: Availability.range().end, ids: [Number(b.dataset.rent)] };
      App.show('sell');
    });
  },
  range: () => ({ start: document.getElementById('av-start').value, end: document.getElementById('av-end').value }),
  async load() {
    const { start, end } = Availability.range();
    const err = document.getElementById('av-error');
    err.textContent = '';
    if (!start || !end) return;
    if (end < start) {
      err.textContent = 'The return date must be the same day or later than the start date.';
      return;
    }
    try {
      Availability.items = await API.get(`/api/availability?start=${start}&end=${end}`);
      const cats = [...new Set(Availability.items.map((i) => i.category))];
      const sel = document.getElementById('av-cat');
      const cur = sel.value;
      sel.innerHTML = '<option value="">All</option>' + cats.map((c) => `<option>${Util.esc(c)}</option>`).join('');
      sel.value = cats.includes(cur) ? cur : '';
      Availability.render();
    } catch (ex) {
      err.textContent = ex.message;
    }
  },
  render() {
    const cat = document.getElementById('av-cat').value;
    const q = document.getElementById('av-q').value.toLowerCase();
    const list = Availability.items.filter((i) =>
      (!cat || i.category === cat) && (!q || (i.name + ' ' + i.size).toLowerCase().includes(q)));
    const free = list.filter((i) => i.available), busy = list.filter((i) => !i.available);
    document.getElementById('av-summary').innerHTML =
      `<span class="free">${free.length} available</span><span class="busy">${busy.length} not available</span>`;
    const card = (i) => `
      <div class="card ${i.available ? '' : 'busy'}">
        <h3>${Util.esc(i.name)}</h3>
        <div class="meta">${Util.esc(i.category)}${i.size ? ' · size ' + Util.esc(i.size) : ''} · ${Util.money(i.price_per_day)}/day</div>
        ${i.available
          ? `<button class="btn primary small" data-rent="${i.id}">Rent this</button>`
          : i.conflicts.map((c) => `<div class="out">Out with ${Util.esc(c.customer_name)}: ${Util.date(c.start_date)} to ${Util.date(c.end_date)}</div>`).join('')}
      </div>`;
    document.getElementById('av-list').innerHTML = !Availability.items.length
      ? '<p class="muted">No items yet. Add your first one in the Items tab.</p>'
      : `<h3>Available</h3><div class="cards">${free.map(card).join('') || '<p class="muted">Nothing free on these dates.</p>'}</div>
         <h3 style="margin-top:1.5rem">Not available</h3><div class="cards">${busy.map(card).join('') || '<p class="muted">Everything is free.</p>'}</div>`;
  },
};
