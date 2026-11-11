const Sell = {
  cart: {},
  cat: 'All',

  async load() {
    App.products = await API.request('/products');
    this.renderCats();
    this.renderGrid();
    this.renderCart();
  },

  renderCats() {
    const cats = ['All', ...new Set(App.products.map(p => p.category))];
    $('#cats').innerHTML = cats.map(c => `<button aria-pressed="${c === this.cat}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
    $('#cats').querySelectorAll('button').forEach(b => b.onclick = () => { this.cat = b.dataset.c; this.renderCats(); this.renderGrid(); });
  },

  renderGrid() {
    const list = App.products.filter(p => this.cat === 'All' || p.category === this.cat);
    $('#grid').innerHTML = list.map(p => {
      const out = p.stock !== null && p.stock <= (this.cart[p.id] || 0);
      const imgTag = p.image_url ? `<img src="${esc(p.image_url)}" class="tile-img" alt="${esc(p.name)}">` : '';
      return `<button class="tile" data-id="${p.id}" ${out ? 'disabled' : ''}>${imgTag}<div class="tile-info"><span>${esc(p.name)}</span><span><b class="num">${App.money(p.price)}</b>${p.stock !== null ? `<br><small>${p.stock} left</small>` : ''}</span></div></button>`;
    }).join('') || '<p class="empty">No products yet. Add some in the Products tab.</p>';

    $('#grid').querySelectorAll('.tile').forEach(b => b.onclick = () => {
      this.cart[b.dataset.id] = (this.cart[b.dataset.id] || 0) + 1;
      this.renderGrid();
      this.renderCart();
    });
  },

  totals() {
    const sub = Object.entries(this.cart).reduce((s, [id, q]) => s + App.products.find(p => p.id == id).price * q, 0);
    const tax = Math.round(sub * App.cfg.tax_rate / 100);
    return { sub, tax, total: sub + tax };
  },

  renderCart() {
    for (const id of Object.keys(this.cart)) if (!App.products.find(p => p.id == id)) delete this.cart[id];
    const ids = Object.keys(this.cart);

    $('#lines').innerHTML = ids.length ? ids.map(id => {
      const p = App.products.find(p => p.id == id), q = this.cart[id];
      return `<div class="line"><span>${esc(p.name)}</span><span class="qty"><button data-d="-1" data-id="${id}">−</button><span class="num">${q}</span><button data-d="1" data-id="${id}">+</button></span><b class="num">${App.money(p.price * q)}</b></div>`;
    }).join('') : '<p class="empty">Tap a product to start an order.</p>';

    $('#lines').querySelectorAll('.qty button').forEach(b => b.onclick = () => {
      const p = App.products.find(p => p.id == b.dataset.id), n = (this.cart[p.id] || 0) + Number(b.dataset.d);
      if (n <= 0) delete this.cart[p.id]; else if (p.stock === null || n <= p.stock) this.cart[p.id] = n;
      this.renderGrid(); this.renderCart();
    });

    const t = this.totals();
    $('#sub').textContent = App.money(t.sub);
    $('#tax').textContent = App.money(t.tax);
    $('#total').textContent = App.money(t.total);
    $('#taxLabel').textContent = `Tax (${App.cfg.tax_rate}%)`;
    $('#payCash').disabled = !ids.length;
    $('#payCard').disabled = !ids.length || !App.cfg.card;
  },

  initPayEvents() {
    $('#clear').onclick = () => { this.cart = {}; this.renderGrid(); this.renderCart(); };
    $('#payCash').onclick = () => { $('#cashDue').textContent = App.money(this.totals().total); $('#cashIn').value = ''; $('#cashChange').textContent = '—'; $('#cashOk').disabled = true; $('#cashDlg').showModal(); $('#cashIn').focus(); };
    $('#cashIn').oninput = () => { const v = Math.round(parseFloat($('#cashIn').value) * 100), ok = v >= this.totals().total; $('#cashOk').disabled = !ok; $('#cashChange').textContent = ok ? App.money(v - this.totals().total) : '—'; };
    $('#cashCancel').onclick = () => $('#cashDlg').close();

    $('#cashOk').onclick = async () => {
      try {
        const items = Object.entries(this.cart).map(([id, qty]) => ({ id: Number(id), qty }));
        const o = await API.request('/orders', { method: 'POST', body: { items, method: 'cash', tendered: Math.round(parseFloat($('#cashIn').value) * 100) } });
        $('#cashDlg').close(); this.done(o);
      } catch (e) { toast(e.message); }
    };

    $('#payCard').onclick = async () => {
      $('#payCard').disabled = true;
      try {
        const items = Object.entries(this.cart).map(([id, qty]) => ({ id: Number(id), qty }));
        const o = await API.request('/orders', { method: 'POST', body: { items, method: 'card' } });
        location.href = o.checkout_url;
      } catch (e) { toast(e.message); this.renderCart(); }
    };
  },

  done(o) {
    this.cart = {};
    this.renderCart();
    App.showReceipt(o);
    this.load();
  }
};