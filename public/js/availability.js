const Availability = {
  startDate: '',
  returnDate: '',
  items: [],
  activeFilter: 'all', // 'all' | 'available' | 'rented'
  activeCategory: 'All',
  searchQuery: '',

  init() {
    // Default to today and 4 days later (e.g. 2026-11-11 to 2026-11-15)
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const plus4Days = new Date(today);
    plus4Days.setDate(today.getDate() + 4);
    const returnStr = plus4Days.toISOString().slice(0, 10);

    this.startDate = todayStr;
    this.returnDate = returnStr;

    const startInput = $('#availStartDate');
    const returnInput = $('#availReturnDate');
    if (startInput) startInput.value = this.startDate;
    if (returnInput) returnInput.value = this.returnDate;

    // Check button
    $('#availCheckBtn').onclick = () => {
      this.startDate = $('#availStartDate').value;
      this.returnDate = $('#availReturnDate').value;
      this.load();
    };

    // Auto-update if start date changes to keep return date valid
    if (startInput) {
      startInput.onchange = () => {
        if (returnInput && returnInput.value < startInput.value) {
          returnInput.value = startInput.value;
        }
      };
    }

    // Quick date preset pills
    $$('.preset-pill').forEach(btn => {
      btn.onclick = () => this.applyPreset(btn.dataset.preset);
    });

    // Sub-filters (All / Available Only / Rented Out)
    $$('#availSummaryBanner .filter-btn').forEach(btn => {
      btn.onclick = () => {
        $$('#availSummaryBanner .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.dataset.avfilter;
        this.renderCards();
      };
    });

    // Search filter
    const searchInput = $('#availSearch');
    if (searchInput) {
      searchInput.oninput = e => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderCards();
      };
    }
  },

  applyPreset(preset) {
    const now = new Date();
    const formatIso = d => d.toISOString().slice(0, 10);

    let start = new Date(now);
    let ret = new Date(now);

    if (preset === 'today') {
      // Same day
    } else if (preset === 'weekend') {
      // Next Friday to Sunday
      const day = now.getDay();
      const diffToFri = (5 - day + 7) % 7;
      start.setDate(now.getDate() + (diffToFri === 0 ? 0 : diffToFri));
      ret = new Date(start);
      ret.setDate(start.getDate() + 2); // Friday to Sunday
    } else if (preset === '3days') {
      ret.setDate(now.getDate() + 2);
    } else if (preset === '5days') {
      ret.setDate(now.getDate() + 4);
    } else if (preset === 'nextweek') {
      const day = now.getDay();
      const diffToMon = (1 - day + 7) % 7 || 7;
      start.setDate(now.getDate() + diffToMon);
      ret = new Date(start);
      ret.setDate(start.getDate() + 4); // Mon to Fri
    }

    this.startDate = formatIso(start);
    this.returnDate = formatIso(ret);

    $('#availStartDate').value = this.startDate;
    $('#availReturnDate').value = this.returnDate;
    this.load();
  },

  async load() {
    if (!this.startDate || !this.returnDate) {
      this.startDate = $('#availStartDate').value || new Date().toISOString().slice(0, 10);
      this.returnDate = $('#availReturnDate').value || this.startDate;
    }

    if (this.startDate > this.returnDate) {
      toast('Return date cannot be earlier than start date.', true);
      return;
    }

    try {
      const res = await API.request(`/availability?start_date=${this.startDate}&return_date=${this.returnDate}`);
      this.items = res.items || [];
      this.renderSummary();
      this.renderCategories();
      this.renderCards();
    } catch (err) {
      toast(err.message, true);
    }
  },

  renderSummary() {
    const days = calculateDays(this.startDate, this.returnDate);
    const total = this.items.length;
    const available = this.items.filter(i => i.is_available).length;
    const rented = total - available;

    const startPretty = formatDatePretty(this.startDate);
    const returnPretty = formatDatePretty(this.returnDate);
    const startNum = formatDate(this.startDate);
    const returnNum = formatDate(this.returnDate);

    $('#availSummaryText').innerHTML = `
      <div>
        <strong>Rental Period:</strong> ${startNum} → ${returnNum}
        <span class="text-muted">(${startPretty} – ${returnPretty}, ${days} ${days === 1 ? 'day' : 'days'})</span>
        &nbsp;|&nbsp; 
        <strong class="text-success">${available} Available</strong>, 
        <strong class="text-danger">${rented} Rented Out</strong>
      </div>
    `;

    // Update filter counts
    const allBtn = $('[data-avfilter="all"]');
    const avBtn = $('[data-avfilter="available"]');
    const renBtn = $('[data-avfilter="rented"]');

    if (allBtn) allBtn.textContent = `All (${total})`;
    if (avBtn) avBtn.textContent = `🟢 Available (${available})`;
    if (renBtn) renBtn.textContent = `🔴 Rented Out (${rented})`;
  },

  renderCategories() {
    const cats = ['All', ...new Set(this.items.map(i => i.category))];
    const container = $('#availCategoryFilters');
    if (!container) return;

    container.innerHTML = cats.map(c => `
      <button class="filter-btn ${c === this.activeCategory ? 'active' : ''}" data-cat="${esc(c)}">
        ${getCategoryIcon(c)} ${esc(c)}
      </button>
    `).join('');

    container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.dataset.cat;
        this.renderCards();
      };
    });
  },

  renderCards() {
    const grid = $('#availGrid');
    if (!grid) return;

    let list = this.items;

    // Filter by category
    if (this.activeCategory !== 'All') {
      list = list.filter(i => i.category === this.activeCategory);
    }

    // Filter by availability state
    if (this.activeFilter === 'available') {
      list = list.filter(i => i.is_available);
    } else if (this.activeFilter === 'rented') {
      list = list.filter(i => !i.is_available);
    }

    // Filter by search query
    if (this.searchQuery) {
      list = list.filter(i =>
        i.name.toLowerCase().includes(this.searchQuery) ||
        (i.size && i.size.toLowerCase().includes(this.searchQuery)) ||
        (i.description && i.description.toLowerCase().includes(this.searchQuery)) ||
        i.category.toLowerCase().includes(this.searchQuery)
      );
    }

    if (!list.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1">
          <div class="empty-state-icon">🔍</div>
          <h3>No matching items found</h3>
          <p>Try selecting another date range or clearing your search filters.</p>
        </div>
      `;
      return;
    }

    const cur = (App.cfg && App.cfg.currency) || 'thb';

    grid.innerHTML = list.map(item => {
      const isAvail = item.is_available;
      const statusClass = isAvail ? 'card-available' : 'card-unavailable';

      // Photo or placeholder icon
      const imgHtml = item.image_url
        ? `<img src="${esc(item.image_url)}" alt="${esc(item.name)}">`
        : `<div class="card-placeholder-icon">${getCategoryIcon(item.category)}</div>`;

      // Status Badge
      let badgeHtml = '';
      if (isAvail) {
        badgeHtml = `<span class="badge badge-available">🟢 Available (${item.available_stock}/${item.stock})</span>`;
      } else {
        badgeHtml = `<span class="badge badge-rented">🔴 Rented Out (0/${item.stock})</span>`;
      }

      // Booking details banner if rented
      let bookedInfoHtml = '';
      if (!isAvail && item.active_rentals && item.active_rentals.length) {
        const topRental = item.active_rentals[0];
        const dueNum = formatDate(topRental.return_date);
        const duePretty = formatDatePretty(topRental.return_date);
        bookedInfoHtml = `
          <div class="card-avail-details details-rented">
            <strong>Rented to:</strong> ${esc(topRental.customer_name)}<br>
            <strong>Dates:</strong> ${formatDate(topRental.start_date)} → ${dueNum}<br>
            <strong>Due Back:</strong> ${duePretty}
            ${topRental.customer_phone ? `<br><strong>Tel:</strong> <a href="tel:${esc(topRental.customer_phone)}">${esc(topRental.customer_phone)}</a>` : ''}
          </div>
        `;
      } else if (isAvail && item.booked_qty > 0) {
        // Some units booked, but still has stock left
        bookedInfoHtml = `
          <div class="card-avail-details details-available">
            ${item.available_stock} of ${item.stock} unit(s) available for these dates (${item.booked_qty} rented).
          </div>
        `;
      }

      // Action button
      let actionBtn = '';
      if (isAvail) {
        actionBtn = `
          <button class="primary btn-sm rent-now-btn" data-id="${item.id}" style="width:100%">
            <span>➕</span> Rent for these dates
          </button>
        `;
      } else {
        actionBtn = `
          <button class="btn-sm text-danger view-rental-btn" data-id="${item.id}" style="width:100%">
            View Current Booking
          </button>
        `;
      }

      return `
        <div class="rental-card ${statusClass}">
          <div class="card-img-wrap">
            ${imgHtml}
            <span class="card-category-badge">${esc(item.category)}</span>
            <div class="card-status-badge">${badgeHtml}</div>
          </div>
          <div class="card-body">
            <div class="card-title">${esc(item.name)}</div>
            <div class="card-meta">
              ${item.size ? `<span>📏 <strong>${esc(item.size)}</strong></span> &bull; ` : ''}
              <span>Total Units: <strong>${item.stock}</strong></span>
            </div>
            ${item.description ? `<p style="font-size:12.5px;color:var(--muted);margin-bottom:0.5rem">${esc(item.description)}</p>` : ''}
            
            ${bookedInfoHtml}

            <div class="card-rate-row">
              <div class="card-price">
                ${formatMoney(item.price_per_day, cur)} <small>/ day</small>
              </div>
              ${item.deposit ? `<small class="text-muted">Deposit: ${formatMoney(item.deposit, cur)}</small>` : ''}
            </div>

            <div class="card-actions">
              ${actionBtn}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind "Rent for these dates" buttons
    grid.querySelectorAll('.rent-now-btn').forEach(btn => {
      btn.onclick = () => {
        const itemId = Number(btn.dataset.id);
        Rentals.openNewRentalModal({
          itemId,
          startDate: this.startDate,
          returnDate: this.returnDate
        });
      };
    });

    // Bind "View Current Booking" buttons
    grid.querySelectorAll('.view-rental-btn').forEach(btn => {
      btn.onclick = () => {
        const itemId = Number(btn.dataset.id);
        App.showTab('rentals');
        Rentals.filterByItem(itemId);
      };
    });
  }
};

