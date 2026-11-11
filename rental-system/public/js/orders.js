const Orders = {
  rows: [],
  LABEL: { booked: 'Booked', picked_up: 'Picked up', returned: 'Returned', cancelled: 'Cancelled' },
  init() {
    const el = document.getElementById('tab-orders');
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-status]');
      if (!b) return;
      if (b.dataset.status === 'cancelled' && !confirm('Cancel this rental? The items become free again.')) return;
      try {
        await API.patch(`/api/orders/${b.dataset.id}/status`, { status: b.dataset.status });
        Util.toast('Rental updated');
        Orders.load();
      } catch (ex) { Util.toast(ex.message, true); }
    });
    el.addEventListener('input', (e) => { if (e.target.id === 'or-filter') Orders.render(); });
  },
  async load() {
    Orders.rows = await API.get('/api/orders');
    const el = document.getElementById('tab-orders');
    if (!document.getElementById('or-filter')) {
      el.innerHTML = `<h2>Rentals</h2>
        <div class="panel row"><label>Show
          <select id="or-filter"><option value="open">Open (booked and picked up)</option>
          <option value="all">All</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option></select></label></div>
        <div class="table-wrap" id="or-table"></div>`;
    }
    Orders.render();
  },
  render() {
    const f = document.getElementById('or-filter').value, today = Util.today();
    const rows = Orders.rows.filter((o) =>
      f === 'all' ? true : f === 'open' ? ['booked', 'picked_up'].includes(o.status) : o.status === f);
    document.getElementById('or-table').innerHTML = `<table>
      <tr><th>#</th><th>Customer</th><th>Items</th><th>Dates</th><th>Total</th><th>Status</th><th></th></tr>
      ${rows.map((o) => {
        const late = o.status === 'picked_up' && o.end_date < today;
        const act = o.status === 'booked'
          ? `<button class="btn small primary" data-id="${o.id}" data-status="picked_up">Picked up</button><button class="btn small danger" data-id="${o.id}" data-status="cancelled">Cancel</button>`
          : o.status === 'picked_up'
          ? `<button class="btn small primary" data-id="${o.id}" data-status="returned">Returned</button>` : '';
        return `<tr><td>${o.id}</td>
          <td>${Util.esc(o.customer_name)}<div class="muted">${Util.esc(o.phone)}</div></td>
          <td>${o.items.map((i) => Util.esc(i.name)).join('<br>')}</td>
          <td>${Util.date(o.start_date)} to ${Util.date(o.end_date)}</td>
          <td>${Util.money(o.total)}</td>
          <td><span class="badge ${o.status}">${Orders.LABEL[o.status]}</span>${late ? ' <span class="badge overdue">Overdue</span>' : ''}</td>
          <td class="actions">${act}</td></tr>`;
      }).join('') || '<tr><td colspan="7" class="muted">No rentals here yet.</td></tr>'}
    </table>`;
  },
};
