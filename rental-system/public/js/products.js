const Products = {
  items: [],
  init() {
    const el = document.getElementById('tab-products');
    el.addEventListener('submit', Products.save);
    el.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]'), rm = e.target.closest('[data-del]');
      if (ed) Products.fill(Products.items.find((i) => i.id == ed.dataset.edit));
      if (e.target.id === 'pr-cancel') Products.fill(null);
      if (rm && confirm('Remove this item from the catalogue?')) {
        try { await API.del('/api/products/' + rm.dataset.del); Util.toast('Item removed'); Products.load(); }
        catch (ex) { Util.toast(ex.message, true); }
      }
    });
  },
  async load() {
    Products.items = await API.get('/api/products');
    Products.render();
  },
  render() {
    const admin = Auth.isAdmin();
    document.getElementById('tab-products').innerHTML = `
      <h2>Items</h2>
      ${admin ? `<form class="panel" id="pr-form">
        <input type="hidden" id="pr-id">
        <div class="grid2">
          <label>Name <input id="pr-name" required placeholder="Red satin evening dress"></label>
          <label>Type <input id="pr-cat" list="pr-cats" value="Dress" placeholder="Dress, Gear, Suit..."></label>
          <label>Size <input id="pr-size" placeholder="M"></label>
          <label>Price per day <input id="pr-price" type="number" min="0" step="any" required></label>
        </div>
        <label style="margin-top:.75rem">Notes <input id="pr-desc" placeholder="Colour, condition, accessories included"></label>
        <datalist id="pr-cats">${[...new Set(Products.items.map((i) => i.category))].map((c) => `<option value="${Util.esc(c)}">`).join('')}</datalist>
        <p class="error" id="pr-error"></p>
        <button class="btn primary" type="submit" id="pr-submit">Add item</button>
        <button class="btn" type="button" id="pr-cancel" hidden>Cancel edit</button>
      </form>` : '<p class="muted">Only admins can add or change items.</p>'}
      <div class="table-wrap"><table>
        <tr><th>Name</th><th>Type</th><th>Size</th><th>Price/day</th><th>Notes</th><th></th></tr>
        ${Products.items.map((i) => `<tr><td>${Util.esc(i.name)}</td><td>${Util.esc(i.category)}</td><td>${Util.esc(i.size)}</td>
          <td>${Util.money(i.price_per_day)}</td><td>${Util.esc(i.description)}</td>
          <td class="actions">${admin ? `<button class="btn small" data-edit="${i.id}">Edit</button><button class="btn small danger" data-del="${i.id}">Remove</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="6" class="muted">No items yet.</td></tr>'}
      </table></div>`;
  },
  fill(i) {
    document.getElementById('pr-id').value = i ? i.id : '';
    document.getElementById('pr-name').value = i ? i.name : '';
    document.getElementById('pr-cat').value = i ? i.category : 'Dress';
    document.getElementById('pr-size').value = i ? i.size : '';
    document.getElementById('pr-price').value = i ? i.price_per_day : '';
    document.getElementById('pr-desc').value = i ? i.description : '';
    document.getElementById('pr-submit').textContent = i ? 'Save changes' : 'Add item';
    document.getElementById('pr-cancel').hidden = !i;
    if (i) document.getElementById('pr-name').focus();
  },
  async save(e) {
    if (e.target.id !== 'pr-form') return;
    e.preventDefault();
    const id = document.getElementById('pr-id').value;
    const body = {
      name: document.getElementById('pr-name').value,
      category: document.getElementById('pr-cat').value,
      size: document.getElementById('pr-size').value,
      price_per_day: document.getElementById('pr-price').value,
      description: document.getElementById('pr-desc').value,
    };
    try {
      if (id) await API.put('/api/products/' + id, body); else await API.post('/api/products', body);
      Util.toast(id ? 'Changes saved' : 'Item added');
      await Products.load();
    } catch (ex) {
      document.getElementById('pr-error').textContent = ex.message;
    }
  },
};
