const Inventory = {
  items: [],
  activeCategory: 'All',
  searchQuery: '',

  init() {
    $('#addNewItemBtn').onclick = () => this.openItemModal();
    $('#closeItemDlg').onclick = () => $('#itemDlg').close();
    $('#cancelItemBtn').onclick = () => $('#itemDlg').close();
    $('#submitItemBtn').onclick = () => this.saveItem();

    // Image upload handling
    const fileInput = $('#itemImgFile');
    const urlInput = $('#itemImgUrl');
    const preview = $('#itemImgPreview');

    if (fileInput) {
      fileInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          preview.src = ev.target.result;
          preview.style.display = 'block';
          urlInput.value = ev.target.result;
        };
        reader.readAsDataURL(file);
      };
    }

    if (urlInput) {
      urlInput.oninput = e => {
        const val = e.target.value.trim();
        if (val) {
          preview.src = val;
          preview.style.display = 'block';
        } else {
          preview.style.display = 'none';
        }
      };
    }

    // Search filter
    const searchInput = $('#invSearch');
    if (searchInput) {
      searchInput.oninput = e => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderCards();
      };
    }
  },

  async load() {
    try {
      this.items = await API.request('/items');
      this.renderCategories();
      this.renderCards();
    } catch (err) {
      toast(err.message, true);
    }
  },

  renderCategories() {
    const cats = ['All', ...new Set(this.items.map(i => i.category))];
    const container = $('#invCategoryFilters');
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
    const grid = $('#invGrid');
    if (!grid) return;

    let list = this.items;

    if (this.activeCategory !== 'All') {
      list = list.filter(i => i.category === this.activeCategory);
    }

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
          <div class="empty-state-icon">👗</div>
          <h3>No items in wardrobe or gear catalog</h3>
          <p>Click "+ Add New Item" above to add dresses, suits, tents, cameras, and equipment.</p>
        </div>
      `;
      return;
    }

    const cur = (App.cfg && App.cfg.currency) || 'thb';

    grid.innerHTML = list.map(item => {
      const isAvailToday = item.is_available;
      const imgHtml = item.image_url
        ? `<img src="${esc(item.image_url)}" alt="${esc(item.name)}">`
        : `<div class="card-placeholder-icon">${getCategoryIcon(item.category)}</div>`;

      let todayBadge = isAvailToday
        ? `<span class="badge badge-available">🟢 Available Today (${item.available_stock}/${item.stock})</span>`
        : `<span class="badge badge-rented">🔴 Rented Out Today</span>`;

      return `
        <div class="rental-card">
          <div class="card-img-wrap">
            ${imgHtml}
            <span class="card-category-badge">${esc(item.category)}</span>
            <div class="card-status-badge">${todayBadge}</div>
          </div>
          <div class="card-body">
            <div class="card-title">${esc(item.name)}</div>
            <div class="card-meta">
              ${item.size ? `<span>📏 <strong>${esc(item.size)}</strong></span> &bull; ` : ''}
              <span>Total Units: <strong>${item.stock}</strong></span>
            </div>
            ${item.description ? `<p style="font-size:12.5px;color:var(--muted);margin-bottom:0.5rem">${esc(item.description)}</p>` : ''}

            <div class="card-rate-row">
              <div class="card-price">
                ${formatMoney(item.price_per_day, cur)} <small>/ day</small>
              </div>
              ${item.deposit ? `<small class="text-muted">Deposit: ${formatMoney(item.deposit, cur)}</small>` : ''}
            </div>

            <div class="card-actions">
              <button class="primary btn-sm rent-btn" data-id="${item.id}">➕ Rent</button>
              <button class="btn-sm edit-btn" data-id="${item.id}">✏️ Edit</button>
              <button class="btn-sm danger-btn del-btn" data-id="${item.id}">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind action buttons
    grid.querySelectorAll('.rent-btn').forEach(btn => {
      btn.onclick = () => {
        Rentals.openNewRentalModal({ itemId: Number(btn.dataset.id) });
      };
    });

    grid.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = () => {
        const item = this.items.find(i => i.id === Number(btn.dataset.id));
        if (item) this.openItemModal(item);
      };
    });

    grid.querySelectorAll('.del-btn').forEach(btn => {
      btn.onclick = async () => {
        const item = this.items.find(i => i.id === Number(btn.dataset.id));
        if (!item) return;
        if (!confirm(`Are you sure you want to remove "${item.name}" from the catalog?`)) return;

        try {
          await API.request(`/items/${item.id}`, { method: 'DELETE' });
          toast(`"${item.name}" removed.`);
          await this.load();
          App.refreshDashboard();
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  },

  openItemModal(item = null) {
    const isEdit = !!item;
    $('#itemDlgTitle').textContent = isEdit ? 'Edit Rental Item' : 'Add New Rental Item';
    $('#itemId').value = isEdit ? item.id : '';
    $('#itemName').value = isEdit ? item.name : '';
    $('#itemCategory').value = isEdit ? item.category : 'Golf';
    $('#itemSize').value = isEdit ? (item.size || '') : '';
    $('#itemDailyRate').value = isEdit ? (item.price_per_day / 100).toFixed(2) : '';
    $('#itemDeposit').value = isEdit && item.deposit ? (item.deposit / 100).toFixed(2) : '';
    $('#itemStock').value = isEdit ? item.stock : '1';
    $('#itemDesc').value = isEdit ? (item.description || '') : '';

    const preview = $('#itemImgPreview');
    const urlInput = $('#itemImgUrl');
    const fileInput = $('#itemImgFile');
    if (fileInput) fileInput.value = '';

    if (isEdit && item.image_url) {
      urlInput.value = item.image_url;
      preview.src = item.image_url;
      preview.style.display = 'block';
    } else {
      urlInput.value = '';
      preview.style.display = 'none';
    }

    $('#itemDlg').showModal();
    $('#itemName').focus();
  },

  async saveItem() {
    const id = $('#itemId').value;
    const name = $('#itemName').value.trim();
    const category = $('#itemCategory').value;
    const size = $('#itemSize').value.trim();
    const rateVal = parseFloat($('#itemDailyRate').value);
    const depositVal = parseFloat($('#itemDeposit').value || '0');
    const stockVal = parseInt($('#itemStock').value, 10);
    const image_url = $('#itemImgUrl').value.trim();
    const description = $('#itemDesc').value.trim();

    if (!name) {
      toast('Please enter the item name.', true);
      $('#itemName').focus();
      return;
    }
    if (!Number.isFinite(rateVal) || rateVal < 0) {
      toast('Please enter a valid daily rental rate.', true);
      $('#itemDailyRate').focus();
      return;
    }
    if (!Number.isFinite(stockVal) || stockVal < 1) {
      toast('Total stock must be at least 1.', true);
      $('#itemStock').focus();
      return;
    }

    const body = {
      name,
      category,
      size,
      price_per_day: Math.round(rateVal * 100),
      deposit: Math.round((depositVal || 0) * 100),
      stock: stockVal,
      image_url,
      description
    };

    try {
      if (id) {
        await API.request(`/items/${id}`, { method: 'PUT', body });
        toast('Item updated successfully!');
      } else {
        await API.request('/items', { method: 'POST', body });
        toast('Item added to catalog!');
      }

      $('#itemDlg').close();
      await this.load();
      Availability.load();
      App.refreshDashboard();
    } catch (err) {
      toast(err.message, true);
    }
  }
};

