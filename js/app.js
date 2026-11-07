/**
 * Логика магазина. Схема работы:
 *   действие пользователя (DOM-событие)
 *     -> Bus.emit('что-то:запрошено')
 *     -> обработчик проверяет права и данные
 *     -> Bus.emit('что-то:выполнено' | 'что-то:отклонено')
 *     -> подписчики перерисовывают интерфейс, показывают уведомления и пишут в журнал
 *
 * Уровни доступа: guest (не авторизован), user, admin.
 */
(function () {
  'use strict';

  DB.init();

  const $ = (sel) => document.querySelector(sel);
  const money = (n) => Number(n).toLocaleString('ru-RU') + ' ₽';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let authMode = 'login';   // 'login' | 'register'
  let searchText = '';
  let pendingImage = '';    // выбранная картинка для формы товара

  // ---------- Доступ ----------
  function currentUser() {
    const name = DB.getSession();
    return name ? DB.getUser(name) || null : null;
  }
  function role() {
    const u = currentUser();
    return u ? u.role : 'guest';
  }
  const isAdmin = () => role() === 'admin';

  // ---------- Отрисовка ----------
  function renderUserPanel() {
    const u = currentUser();
    const panel = $('#userPanel');
    if (!u) {
      panel.innerHTML = `
        <span class="badge badge-guest">Гость</span>
        <button class="btn" data-action="open-login">Войти</button>
        <button class="btn btn-primary" data-action="open-register">Регистрация</button>`;
    } else {
      panel.innerHTML = `
        <span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">
          ${u.role === 'admin' ? 'Администратор' : 'Покупатель'}
        </span>
        <strong>${esc(u.username)}</strong>
        <span class="balance">Баланс: ${money(u.balance)}</span>
        <button class="btn btn-small" data-action="topup">+500 ₽</button>
        <button class="btn" data-action="logout">Выйти</button>`;
    }
    $('#addProductBtn').classList.toggle('hidden', !isAdmin());
  }

  function renderProducts() {
    const admin = isAdmin();
    const q = searchText.trim().toLowerCase();
    const list = DB.getProducts().filter((p) => p.name.toLowerCase().includes(q));

    if (!list.length) {
      $('#products').innerHTML = `<p class="empty">Ничего не найдено.${admin ? ' Добавьте товар кнопкой выше.' : ''}</p>`;
      return;
    }

    $('#products').innerHTML = list.map((p) => {
      const out = p.stock <= 0;
      const buyLabel = out ? 'Нет в наличии' : (currentUser() ? 'Купить' : 'Войдите, чтобы купить');
      return `
        <article class="card" data-id="${p.id}">
          <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
          <div class="card-body">
            <h3>${esc(p.name)}</h3>
            <p class="desc">${esc(p.description)}</p>
            <p class="meta">
              <span class="price">${money(p.price)}</span>
              <span class="stock ${out ? 'stock-out' : ''}">${out ? 'Закончился' : 'В наличии: ' + p.stock + ' шт.'}</span>
            </p>
            <button class="btn btn-primary btn-block" data-action="buy" data-id="${p.id}" ${out ? 'disabled' : ''}>${buyLabel}</button>
            ${admin ? `
              <div class="admin-row">
                <button class="btn btn-small" data-action="edit" data-id="${p.id}">Изменить</button>
                <button class="btn btn-small btn-danger" data-action="delete" data-id="${p.id}">Удалить</button>
              </div>` : ''}
          </div>
        </article>`;
    }).join('');
  }

  function renderAll() {
    renderUserPanel();
    renderProducts();
  }

  function toast(text, type = 'info') {
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ---------- Журнал событий ----------
  Bus.on('app:event', ({ name, data }) => {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString('ru-RU');
    const kind = name.split(':')[0];
    li.className = 'log-' + kind;
    li.innerHTML = `<span class="log-time">${time}</span> <b>${esc(name)}</b>` +
      (Object.keys(data).length ? `<code>${esc(JSON.stringify(data))}</code>` : '');
    const log = $('#log');
    log.prepend(li);
    while (log.children.length > 80) log.lastChild.remove();
  });

  // ---------- Вспомогательные для диалогов ----------
  function openAuth(mode) {
    authMode = mode;
    const reg = mode === 'register';
    $('#authTitle').textContent = reg ? 'Регистрация' : 'Вход';
    $('#authSubmit').textContent = reg ? 'Зарегистрироваться' : 'Войти';
    $('#authSwitch').textContent = reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
    $('#authError').textContent = '';
    $('#authForm').reset();
    if (!$('#authDialog').open) $('#authDialog').showModal();
  }

  function openProductForm(product) {
    const f = $('#productForm');
    f.reset();
    $('#productError').textContent = '';
    $('#productFormTitle').textContent = product ? 'Редактирование товара' : 'Новый товар';
    f.id.value = product ? product.id : '';
    f.name.value = product ? product.name : '';
    f.description.value = product ? product.description : '';
    f.price.value = product ? product.price : '';
    f.stock.value = product ? product.stock : '';
    pendingImage = product ? product.image : '';
    f.imageUrl.value = product && /^https?:/.test(product.image) ? product.image : '';
    updatePreview();
    $('#productDialog').showModal();
  }

  function updatePreview() {
    const img = $('#imagePreview');
    img.src = pendingImage || '';
    img.style.display = pendingImage ? 'block' : 'none';
  }

  // Уменьшаем загруженное фото, чтобы оно поместилось в localStorage
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, 480 / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // =====================================================
  // 1. DOM-события -> шина событий
  // =====================================================

  // Один обработчик кликов на весь документ (делегирование событий)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id ? Number(el.dataset.id) : undefined;

    if (action !== 'clear-log') Bus.emit('dom:click', { action, ...(id ? { id } : {}) });
    if (action === 'switch-auth') e.preventDefault();

    switch (action) {
      case 'open-login':    openAuth('login'); break;
      case 'open-register': openAuth('register'); break;
      case 'switch-auth':   openAuth(authMode === 'login' ? 'register' : 'login'); break;
      case 'close-dialog':  el.closest('dialog').close(); break;
      case 'logout':        Bus.emit('auth:logout:request'); break;
      case 'topup':         Bus.emit('balance:topup:request', { amount: 500 }); break;
      case 'buy':           Bus.emit('purchase:request', { id }); break;
      case 'add-product':   Bus.emit('product:add:request'); break;
      case 'edit':          Bus.emit('product:edit:request', { id }); break;
      case 'delete':        Bus.emit('product:delete:request', { id }); break;
      case 'clear-log':     $('#log').innerHTML = ''; break;
    }
  });

  $('#authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const { username, password } = e.target;
    Bus.emit('dom:submit', { form: 'auth', mode: authMode });
    Bus.emit(authMode === 'register' ? 'auth:register:request' : 'auth:login:request',
      { username: username.value.trim(), password: password.value });
  });

  $('#productForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    Bus.emit('dom:submit', { form: 'product' });
    Bus.emit('product:save:request', {
      id: f.id.value ? Number(f.id.value) : null,
      name: f.name.value.trim(),
      description: f.description.value.trim(),
      price: Number(f.price.value),
      stock: Number(f.stock.value),
      image: pendingImage
    });
  });

  $('#productForm').imageUrl.addEventListener('input', (e) => {
    pendingImage = e.target.value.trim();
    updatePreview();
  });

  $('#productForm').imageFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Bus.emit('dom:change', { field: 'imageFile', file: file.name });
    try {
      pendingImage = await fileToDataUrl(file);
      updatePreview();
    } catch (err) {
      $('#productError').textContent = 'Не удалось прочитать изображение';
    }
  });

  $('#searchInput').addEventListener('input', (e) => {
    searchText = e.target.value;
    Bus.emit('dom:input', { field: 'search', value: searchText });
    renderProducts();
  });

  // =====================================================
  // 2. Обработчики бизнес-логики (подписки на шину)
  // =====================================================

  // --- Регистрация / вход / выход ---
  Bus.on('auth:register:request', ({ username, password }) => {
    if (!/^[\p{L}\d_]{3,20}$/u.test(username)) {
      return Bus.emit('auth:register:failed', { reason: 'Логин: 3–20 символов, буквы, цифры, _' });
    }
    if (password.length < 4) {
      return Bus.emit('auth:register:failed', { reason: 'Пароль должен быть не короче 4 символов' });
    }
    if (DB.getUser(username)) {
      return Bus.emit('auth:register:failed', { reason: 'Такой логин уже занят' });
    }
    DB.addUser({ username, password, role: 'user', balance: 1000 });  // стартовый баланс 1000 ₽
    DB.setSession(username);
    Bus.emit('auth:register:success', { username });
    Bus.emit('auth:login:success', { username, role: 'user' });
  });

  Bus.on('auth:login:request', ({ username, password }) => {
    const user = DB.getUser(username);
    if (!user || user.password !== password) {
      return Bus.emit('auth:login:failed', { reason: 'Неверный логин или пароль' });
    }
    DB.setSession(user.username);
    Bus.emit('auth:login:success', { username: user.username, role: user.role });
  });

  Bus.on('auth:logout:request', () => {
    const u = currentUser();
    DB.clearSession();
    Bus.emit('auth:logout:success', { username: u ? u.username : null });
  });

  Bus.on('auth:register:failed', ({ reason }) => { $('#authError').textContent = reason; });
  Bus.on('auth:login:failed',    ({ reason }) => { $('#authError').textContent = reason; });

  Bus.on('auth:login:success', ({ username }) => {
    $('#authDialog').close();
    renderAll();
    toast('Добро пожаловать, ' + username + '!', 'ok');
  });
  Bus.on('auth:register:success', () => toast('Аккаунт создан. На баланс начислено 1 000 ₽', 'ok'));
  Bus.on('auth:logout:success', () => { renderAll(); toast('Вы вышли из аккаунта'); });

  // --- Баланс ---
  Bus.on('balance:topup:request', ({ amount }) => {
    const u = currentUser();
    if (!u) return Bus.emit('access:denied', { need: 'user' });
    DB.updateUser(u.username, { balance: u.balance + amount });
    Bus.emit('balance:topup:success', { amount, balance: u.balance + amount });
  });
  Bus.on('balance:topup:success', ({ amount }) => { renderUserPanel(); toast('Баланс пополнен на ' + money(amount), 'ok'); });

  // --- Покупка ---
  Bus.on('purchase:request', ({ id }) => {
    const user = currentUser();
    const product = DB.getProduct(id);

    if (!user)                 return Bus.emit('purchase:denied', { reason: 'guest' });
    if (!product || product.stock <= 0) return Bus.emit('purchase:denied', { reason: 'no-stock' });
    if (user.balance < product.price)
      return Bus.emit('purchase:denied', { reason: 'no-funds', missing: product.price - user.balance });

    DB.updateUser(user.username, { balance: user.balance - product.price });
    DB.updateProduct(product.id, { stock: product.stock - 1 });
    Bus.emit('purchase:success', { id: product.id, name: product.name, price: product.price });
  });

  Bus.on('purchase:success', ({ name, price }) => {
    renderAll();
    toast(`Куплено: ${name} (−${money(price)})`, 'ok');
  });

  Bus.on('purchase:denied', ({ reason, missing }) => {
    if (reason === 'guest') {
      toast('Покупать могут только авторизованные пользователи', 'error');
      openAuth('login');
    } else if (reason === 'no-funds') {
      toast('Недостаточно средств. Не хватает ' + money(missing), 'error');
    } else {
      toast('Товара нет в наличии', 'error');
    }
  });

  // --- Управление товарами (только администратор) ---
  // Любая админская операция сначала проходит проверку роли.
  function adminOnly(handler) {
    return (detail) => {
      if (!isAdmin()) return Bus.emit('access:denied', { need: 'admin', have: role() });
      handler(detail);
    };
  }

  Bus.on('access:denied', ({ need }) => toast('Нет доступа: нужна роль «' + need + '»', 'error'));

  Bus.on('product:add:request', adminOnly(() => openProductForm(null)));

  Bus.on('product:edit:request', adminOnly(({ id }) => {
    const p = DB.getProduct(id);
    if (p) openProductForm(p);
  }));

  Bus.on('product:save:request', adminOnly((data) => {
    if (!data.name) return ($('#productError').textContent = 'Укажите название');
    if (!(data.price >= 0) || !(data.stock >= 0)) return ($('#productError').textContent = 'Цена и количество не могут быть отрицательными');
    if (!data.image) data.image = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="100%" height="100%" fill="#e4e7ec"/>' +
      '<text x="50%" y="54%" font-size="110" text-anchor="middle" dominant-baseline="middle">📦</text></svg>');

    const { id, ...fields } = data;
    if (id) {
      DB.updateProduct(id, fields);
      Bus.emit('product:updated', { id, name: fields.name });
    } else {
      const created = DB.addProduct(fields);
      Bus.emit('product:added', { id: created.id, name: created.name });
    }
  }));

  Bus.on('product:delete:request', adminOnly(({ id }) => {
    const p = DB.getProduct(id);
    if (!p) return;
    if (!confirm('Удалить товар «' + p.name + '»?')) return;
    DB.deleteProduct(id);
    Bus.emit('product:deleted', { id, name: p.name });
  }));

  Bus.on('product:added',   ({ name }) => { $('#productDialog').close(); renderProducts(); toast('Товар добавлен: ' + name, 'ok'); });
  Bus.on('product:updated', ({ name }) => { $('#productDialog').close(); renderProducts(); toast('Товар обновлён: ' + name, 'ok'); });
  Bus.on('product:deleted', ({ name }) => { renderProducts(); toast('Товар удалён: ' + name); });

  Bus.on('storage:error', ({ message }) => toast(message, 'error'));

  // ---------- Старт ----------
  renderAll();
  Bus.emit('app:ready', { role: role(), products: DB.getProducts().length });
})();
