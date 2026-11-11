const Products = {
  render() {
    $('#prodRows').innerHTML = App.products.map(p => `<tr data-id="${p.id}">
      <td>
        <div class="img-picker">
          <img src="${esc(p.image_url || '')}" class="img-preview" ${!p.image_url ? 'style="display:none"' : ''}>
          <button type="button" style="padding:.2rem .4rem;font-size:12px" data-a="img">📷</button>
          <input type="file" accept="image/*" class="img-file">
          <input type="hidden" data-f="image_url" value="${esc(p.image_url || '')}">
        </div>
      </td>
      <td><input value="${esc(p.name)}" data-f="name"></td>
      <td><input value="${esc(p.category)}" data-f="category"></td>
      <td><input type="number" step="0.01" min="0" value="${p.price / 100}" data-f="price"></td>
      <td><input type="number" min="0" value="${p.stock ?? ''}" data-f="stock"></td>
      <td style="white-space:nowrap"><button data-a="save">Save</button> <button data-a="del">Delete</button></td>
    </tr>`).join('') +
    `<tr id="newRow">
      <td>
        <div class="img-picker">
          <img src="" class="img-preview" style="display:none">
          <button type="button" style="padding:.2rem .4rem;font-size:12px" data-a="img">📷</button>
          <input type="file" accept="image/*" class="img-file">
          <input type="hidden" data-f="image_url" value="">
        </div>
      </td>
      <td><input placeholder="New product name" data-f="name"></td>
      <td><input placeholder="Category" data-f="category"></td>
      <td><input type="number" step="0.01" min="0" placeholder="0.00" data-f="price"></td>
      <td><input type="number" min="0" data-f="stock"></td>
      <td><button class="primary" data-a="add">Add</button></td>
    </tr>`;

    // Bind Image Upload
    $('#prodRows').querySelectorAll('tr').forEach(tr => {
      const fileInput = tr.querySelector('.img-file');
      const imgBtn = tr.querySelector('[data-a="img"]');
      const imgPreview = tr.querySelector('.img-preview');
      const hiddenUrl = tr.querySelector('[data-f="image_url"]');

      if (imgBtn && fileInput) {
        imgBtn.addEventListener('click', () => fileInput.click());
        fileInput.onchange = e => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
            hiddenUrl.value = ev.target.result;
            imgPreview.src = ev.target.result;
            imgPreview.style.display = 'block';
          };
          reader.readAsDataURL(file);
        };
      }
    });

    // Bind Action Buttons
    $('#prodRows').querySelectorAll('button:not([data-a="img"])').forEach(b => b.onclick = async () => {
      const tr = b.closest('tr'), body = {}; 
      tr.querySelectorAll('input').forEach(i => body[i.dataset.f] = i.value); 
      body.price = Math.round(parseFloat(body.price) * 100);
      try {
        if (b.dataset.a === 'add') await API.request('/products', { method: 'POST', body });
        if (b.dataset.a === 'save') await API.request('/products/' + tr.dataset.id, { method: 'PUT', body });
        if (b.dataset.a === 'del') { if (!confirm('Delete this product?')) return; await API.request('/products/' + tr.dataset.id, { method: 'DELETE' }); }
        App.products = await API.request('/products'); 
        this.render(); 
        toast('Saved');
      } catch (e) { toast(e.message); }
    });
  }
};