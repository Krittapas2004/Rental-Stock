const Orders = {
  async load() {
    const { orders, today } = await API.request('/orders');
    const sum = today.reduce((s, r) => s + r.total, 0), n = today.reduce((s, r) => s + r.n, 0);
    
    $('#stats').innerHTML = `<div class="stat"><b class="num">${App.money(sum)}</b>Sales today (${n} orders)</div>` + 
      today.map(r => `<div class="stat"><b class="num">${App.money(r.total)}</b>${esc(r.method)} (${r.n})</div>`).join('');
    
    $('#orderRows').innerHTML = orders.map(o => `<tr><td>${o.id}</td><td>${new Date(o.created_at + 'Z').toLocaleString()}</td><td>${o.item_count ?? 0}</td><td>${esc(o.method || '')}</td><td class="num">${App.money(o.total)}</td><td><span class="badge ${esc(o.status)}">${esc(o.status)}</span></td><td>${o.status === 'paid' ? `<button data-id="${o.id}">Receipt</button>` : o.status === 'pending' && o.method === 'card' ? `<button data-id="${o.id}">Check payment</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No orders yet.</td></tr>';
    
    $('#orderRows').querySelectorAll('button').forEach(b => b.onclick = async () => {
      try { 
        const o = await API.request(`/orders/${b.dataset.id}/confirm`); 
        if (o.status === 'paid') App.showReceipt(o); 
        else toast('Not paid yet.'); 
        this.load(); 
      } catch (e) { toast(e.message); }
    });
  }
};