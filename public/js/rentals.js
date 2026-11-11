const Rentals = {
  rentals: [],
  activeFilter: 'all',
  searchQuery: '',
  pendingReturnId: null,

  init() {
    // Open rental modal button in header & page
    $('#openNewRentalBtn').onclick = () => this.openNewRentalModal();
    $('#newRentalFromRentalsBtn').onclick = () => this.openNewRentalModal();

    // Dialog controls
    $('#closeRentalDlg').onclick = () => $('#rentalDlg').close();
    $('#cancelRentalBtn').onclick = () => $('#rentalDlg').close();
    $('#submitRentalBtn').onclick = () => this.createRental();

    // Return confirm dialog controls
    $('#closeReturnConfirmDlg').onclick = () => $('#returnConfirmDlg').close();
    $('#cancelReturnConfirmBtn').onclick = () => $('#returnConfirmDlg').close();
    $('#confirmReturnOkBtn').onclick = () => this.executeReturn();

    // Printable slip dialog controls
    $('#closeSlipDlg').onclick = () => $('#slipDlg').close();
    $('#closeSlipBtn').onclick = () => $('#slipDlg').close();
    $('#printSlipBtn').onclick = () => window.print();

    // Filter tabs
    $$('#rentalFilterButtons .filter-btn').forEach(btn => {
      btn.onclick = () => {
        $$('#rentalFilterButtons .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.dataset.rfilter;
        this.load();
      };
    });

    // Search box
    const searchInput = $('#rentalSearch');
    if (searchInput) {
      searchInput.oninput = e => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderTable();
      };
    }

    // Modal date change and item change calculations
    ['rItemSelect', 'rStartDate', 'rReturnDate', 'rQty'].forEach(id => {
      const el = $('#' + id);
      if (el) el.onchange = () => this.updateModalCalculations();
    });
  },

  async load() {
    try {
      const url = this.activeFilter === 'all' ? '/rentals' : `/rentals?status=${this.activeFilter}`;
      this.rentals = await API.request(url);
      this.renderTable();
    } catch (err) {
      toast(err.message, true);
    }
  },

  filterByItem(itemId) {
    $$('#rentalFilterButtons .filter-btn').forEach(b => b.classList.remove('active'));
    $('[data-rfilter="all"]').classList.add('active');
    this.activeFilter = 'all';
    API.request(`/rentals?item_id=${itemId}`).then(data => {
      this.rentals = data;
      this.renderTable();
    }).catch(err => toast(err.message, true));
  },

  renderTable() {
    const tbody = $('#rentalRows');
    if (!tbody) return;

    let list = this.rentals;
    if (this.searchQuery) {
      list = list.filter(r =>
        (r.customer_name && r.customer_name.toLowerCase().includes(this.searchQuery)) ||
        (r.customer_phone && r.customer_phone.toLowerCase().includes(this.searchQuery)) ||
        (r.item_name && r.item_name.toLowerCase().includes(this.searchQuery)) ||
        (r.notes && r.notes.toLowerCase().includes(this.searchQuery))
      );
    }

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-state">
            <div class="empty-state-icon">📅</div>
            <h3>No rentals found</h3>
            <p>Click "New Rental" to create a gear or dress rental booking.</p>
          </td>
        </tr>
      `;
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const cur = (App.cfg && App.cfg.currency) || 'thb';

    tbody.innerHTML = list.map(r => {
      const isOverdue = r.status === 'active' && r.return_date < todayStr;
      const isDueToday = r.status === 'active' && r.return_date === todayStr;

      // Status Badge
      let badgeHtml = '';
      if (r.status === 'returned') {
        badgeHtml = `<span class="badge badge-returned">✓ Returned</span>`;
      } else if (isOverdue) {
        badgeHtml = `<span class="badge badge-overdue">⚠️ Overdue (${formatDate(r.return_date)})</span>`;
      } else if (isDueToday) {
        badgeHtml = `<span class="badge badge-warning">⏰ Due Today</span>`;
      } else if (r.status === 'active') {
        badgeHtml = `<span class="badge badge-available">🟢 Currently Out</span>`;
      } else if (r.status === 'reserved') {
        badgeHtml = `<span class="badge badge-reserved">🗓️ Reserved</span>`;
      } else {
        badgeHtml = `<span class="badge badge-returned">${esc(r.status)}</span>`;
      }

      // Actions
      let actionsHtml = `<button class="btn-sm slip-btn" data-id="${r.id}" title="Print Agreement / Receipt">📄 Slip</button> `;
      if (r.status === 'active' || r.status === 'reserved') {
        actionsHtml += `<button class="primary btn-sm return-btn" data-id="${r.id}">✓ Return</button> `;
      }
      actionsHtml += `<button class="btn-sm danger-btn del-rental-btn" data-id="${r.id}" title="Delete or cancel">🗑️</button>`;

      const startPretty = formatDate(r.start_date);
      const returnPretty = formatDate(r.return_date);

      return `
        <tr data-id="${r.id}" class="${isOverdue ? 'row-overdue' : ''}">
          <td>
            <div style="display:flex;align-items:center;gap:0.75rem">
              ${r.item_image ? `<img src="${esc(r.item_image)}" class="thumb-preview">` : `<span style="font-size:1.6rem">${getCategoryIcon(r.item_category)}</span>`}
              <div>
                <strong>${esc(r.item_name)}</strong>
                <div style="font-size:12px;color:var(--muted)">
                  ${r.item_size ? `Size: ${esc(r.item_size)} &bull; ` : ''}${esc(r.item_category || '')}
                  ${r.qty > 1 ? ` &bull; <strong>×${r.qty}</strong>` : ''}
                </div>
              </div>
            </div>
          </td>
          <td>
            <strong>${esc(r.customer_name)}</strong>
            ${r.customer_phone ? `<div style="font-size:12px"><a href="tel:${esc(r.customer_phone)}">${esc(r.customer_phone)}</a></div>` : ''}
          </td>
          <td>
            <div>${startPretty} → <strong>${returnPretty}</strong></div>
            <div style="font-size:12px;color:var(--muted)">${formatDatePretty(r.start_date)} - ${formatDatePretty(r.return_date)}</div>
          </td>
          <td>
            <span class="badge badge-info">${r.days} ${r.days === 1 ? 'day' : 'days'}</span>
          </td>
          <td class="num">${formatMoney(r.daily_rate, cur)}</td>
          <td class="num fw-bold">${formatMoney(r.total_price, cur)}</td>
          <td class="num text-muted">${r.deposit_amount ? formatMoney(r.deposit_amount, cur) : '—'}</td>
          <td>${badgeHtml}</td>
          <td style="text-align:right;white-space:nowrap">${actionsHtml}</td>
        </tr>
      `;
    }).join('');

    // Bind action events
    tbody.querySelectorAll('.return-btn').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        const r = this.rentals.find(x => x.id === id);
        if (r) this.openReturnConfirmModal(r);
      };
    });

    tbody.querySelectorAll('.slip-btn').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        const r = this.rentals.find(x => x.id === id);
        if (r) this.openRentalSlip(r);
      };
    });

    tbody.querySelectorAll('.del-rental-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = Number(btn.dataset.id);
        const r = this.rentals.find(x => x.id === id);
        if (!r) return;
        if (!confirm(`Cancel or delete booking #${id} for ${r.customer_name}?`)) return;

        try {
          await API.request(`/rentals/${id}`, { method: 'DELETE' });
          toast('Rental booking removed.');
          await this.load();
          Availability.load();
          App.refreshDashboard();
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  },

  async openNewRentalModal(preset = {}) {
    // Populate items in select
    try {
      const items = await API.request('/items');
      const select = $('#rItemSelect');
      select.innerHTML = items.map(item => `
        <option value="${item.id}" data-rate="${item.price_per_day}" data-deposit="${item.deposit || 0}" data-stock="${item.stock}">
          ${getCategoryIcon(item.category)} ${esc(item.name)} ${item.size ? `(${esc(item.size)})` : ''} — ${formatMoney(item.price_per_day, App.cfg?.currency)}/day [Stock: ${item.stock}]
        </option>
      `).join('');

      if (preset.itemId) {
        select.value = preset.itemId;
      }

      // Default dates
      const todayStr = new Date().toISOString().slice(0, 10);
      const defaultReturn = new Date();
      defaultReturn.setDate(new Date().getDate() + 4);
      const returnStr = defaultReturn.toISOString().slice(0, 10);

      $('#rStartDate').value = preset.startDate || todayStr;
      $('#rReturnDate').value = preset.returnDate || returnStr;
      $('#rQty').value = 1;
      $('#rCustomerName').value = '';
      $('#rCustomerPhone').value = '';
      $('#rCustomerEmail').value = '';
      $('#rNotes').value = '';

      this.updateModalCalculations();
      $('#rentalDlg').showModal();
      $('#rCustomerName').focus();
    } catch (err) {
      toast(err.message, true);
    }
  },

  async updateModalCalculations() {
    const select = $('#rItemSelect');
    const selectedOpt = select.selectedOptions[0];
    if (!selectedOpt) return;

    const rate = Number(selectedOpt.dataset.rate || 0);
    const deposit = Number(selectedOpt.dataset.deposit || 0);
    const totalStock = Number(selectedOpt.dataset.stock || 1);

    const start = $('#rStartDate').value;
    const ret = $('#rReturnDate').value;
    const qty = Math.max(1, parseInt($('#rQty').value || '1', 10));

    if (start && ret && ret < start) {
      $('#rReturnDate').value = start;
    }

    const finalStart = $('#rStartDate').value;
    const finalRet = $('#rReturnDate').value;
    const days = calculateDays(finalStart, finalRet);

    const total = rate * days * qty;
    const totalDeposit = deposit * qty;
    const cur = (App.cfg && App.cfg.currency) || 'thb';

    $('#rCalcDays').textContent = `${days} ${days === 1 ? 'day' : 'days'}`;
    $('#rCalcRate').textContent = `${formatMoney(rate, cur)} / day`;
    $('#rCalcDeposit').textContent = formatMoney(totalDeposit, cur);
    $('#rCalcTotal').textContent = formatMoney(total, cur);

    // Overlap conflict check for selected dates
    const warnEl = $('#rAvailWarning');
    if (finalStart && finalRet && select.value) {
      try {
        const availRes = await API.request(`/availability?start_date=${finalStart}&return_date=${finalRet}`);
        const found = (availRes.items || []).find(i => i.id === Number(select.value));
        if (found) {
          if (qty > found.available_stock) {
            warnEl.style.display = 'block';
            warnEl.className = 'form-full card-avail-details details-rented';
            warnEl.innerHTML = `
              <strong>⚠️ Overlap Conflict:</strong> Only ${found.available_stock} of ${found.stock} units available between ${formatDate(finalStart)} and ${formatDate(finalRet)}.
              ${found.active_rentals && found.active_rentals.length ? `<br>Currently booked by ${esc(found.active_rentals[0].customer_name)} (${formatDate(found.active_rentals[0].start_date)} - ${formatDate(found.active_rentals[0].return_date)})` : ''}
            `;
          } else {
            warnEl.style.display = 'block';
            warnEl.className = 'form-full card-avail-details details-available';
            warnEl.innerHTML = `
              <strong>🟢 Available:</strong> ${found.available_stock} of ${found.stock} units ready for ${formatDate(finalStart)} → ${formatDate(finalRet)}.
            `;
          }
        }
      } catch {}
    } else {
      warnEl.style.display = 'none';
    }
  },

  async createRental() {
    const item_id = Number($('#rItemSelect').value);
    const customer_name = $('#rCustomerName').value.trim();
    const customer_phone = $('#rCustomerPhone').value.trim();
    const customer_email = $('#rCustomerEmail').value.trim();
    const start_date = $('#rStartDate').value;
    const return_date = $('#rReturnDate').value;
    const qty = parseInt($('#rQty').value || '1', 10);
    const notes = $('#rNotes').value.trim();

    if (!item_id) {
      toast('Please select an item to rent.', true);
      return;
    }
    if (!customer_name) {
      toast('Please enter customer full name.', true);
      $('#rCustomerName').focus();
      return;
    }
    if (!start_date || !return_date) {
      toast('Please select both rental start and return dates.', true);
      return;
    }
    if (start_date > return_date) {
      toast('Return date cannot be earlier than start date.', true);
      return;
    }

    const body = {
      item_id,
      customer_name,
      customer_phone,
      customer_email,
      start_date,
      return_date,
      qty,
      notes
    };

    try {
      const created = await API.request('/rentals', { method: 'POST', body });
      toast(`Rental booked for ${created.customer_name}!`);
      $('#rentalDlg').close();

      await this.load();
      Availability.load();
      App.refreshDashboard();

      // Ask if employee wants to print receipt/slip
      if (confirm('Rental booked! Would you like to view/print the rental agreement slip?')) {
        this.openRentalSlip(created);
      }
    } catch (err) {
      toast(err.message, true);
    }
  },

  openReturnConfirmModal(rental) {
    this.pendingReturnId = rental.id;
    const cur = (App.cfg && App.cfg.currency) || 'thb';

    $('#retConfirmItemName').textContent = `${rental.item_name} ${rental.item_size ? `(${rental.item_size})` : ''}`;
    $('#retConfirmCustomer').textContent = rental.customer_name;
    $('#retConfirmDueDate').textContent = `${formatDate(rental.return_date)} (${formatDatePretty(rental.return_date)})`;
    $('#retConfirmDeposit').textContent = rental.deposit_amount ? formatMoney(rental.deposit_amount, cur) : 'None';

    $('#returnConfirmDlg').showModal();
  },

  async executeReturn() {
    if (!this.pendingReturnId) return;

    try {
      await API.request(`/rentals/${this.pendingReturnId}/return`, { method: 'PUT' });
      toast('Item marked as returned and back in stock!');
      $('#returnConfirmDlg').close();
      this.pendingReturnId = null;

      await this.load();
      Availability.load();
      App.refreshDashboard();
    } catch (err) {
      toast(err.message, true);
    }
  },

  openRentalSlip(rental) {
    const cur = (App.cfg && App.cfg.currency) || 'thb';
    const shop = App.cfg || {};

    const slip = `
      <div class="slip-header">
        <div class="slip-shop">${esc(shop.shop_name || 'RentWear')}</div>
        ${shop.address ? `<div style="font-size:12px;color:#4b5563">${esc(shop.address)}</div>` : ''}
        ${shop.phone ? `<div style="font-size:12px;color:#4b5563">Tel: ${esc(shop.phone)}</div>` : ''}
        <div class="slip-title">RENTAL AGREEMENT & RECEIPT #${rental.id}</div>
        <div style="font-size:12px;color:#6b7280">${new Date().toLocaleString()}</div>
      </div>

      <div class="slip-section">
        <div class="slip-row"><span>Customer:</span> <strong>${esc(rental.customer_name)}</strong></div>
        ${rental.customer_phone ? `<div class="slip-row"><span>Phone:</span> <strong>${esc(rental.customer_phone)}</strong></div>` : ''}
        ${rental.customer_email ? `<div class="slip-row"><span>Email:</span> ${esc(rental.customer_email)}</div>` : ''}
      </div>

      <div class="slip-divider"></div>

      <div class="slip-section">
        <div class="slip-row"><span>Item Rented:</span> <strong>${esc(rental.item_name)}</strong></div>
        ${rental.item_size ? `<div class="slip-row"><span>Size / Specs:</span> ${esc(rental.item_size)}</div>` : ''}
        <div class="slip-row"><span>Quantity:</span> ${rental.qty}</div>
        <div class="slip-row"><span>Pick-up Date:</span> <strong>${formatDate(rental.start_date)}</strong> (${formatDatePretty(rental.start_date)})</div>
        <div class="slip-row"><span>Due Return Date:</span> <strong>${formatDate(rental.return_date)}</strong> (${formatDatePretty(rental.return_date)})</div>
        <div class="slip-row"><span>Total Duration:</span> ${rental.days} days</div>
      </div>

      <div class="slip-divider"></div>

      <div class="slip-section">
        <div class="slip-row"><span>Daily Rate:</span> ${formatMoney(rental.daily_rate, cur)}</div>
        <div class="slip-row"><span>Rental Fee (${rental.days} days):</span> <strong>${formatMoney(rental.total_price, cur)}</strong></div>
        <div class="slip-row"><span>Security Deposit (Refundable):</span> <strong>${rental.deposit_amount ? formatMoney(rental.deposit_amount, cur) : '0.00'}</strong></div>
        ${rental.notes ? `<div style="margin-top:0.5rem;font-size:12px;color:#4b5563"><em>Notes: ${esc(rental.notes)}</em></div>` : ''}
      </div>

      ${shop.rental_terms ? `
        <div class="slip-divider"></div>
        <div style="font-size:11.5px;color:#4b5563;line-height:1.4">
          <strong>Terms & Conditions:</strong><br>${esc(shop.rental_terms)}
        </div>
      ` : ''}

      <div class="slip-signatures">
        <div>
          Customer Signature:
          <div class="sig-line">${esc(rental.customer_name)}</div>
        </div>
        <div>
          Store Staff Signature:
          <div class="sig-line">Authorized Signatory</div>
        </div>
      </div>
    `;

    $('#slipContent').innerHTML = slip;
    $('#slipDlg').showModal();
  }
};

