/**
 * «База данных» в localStorage (JSON).
 * Ключи: shop_users, shop_products, shop_session.
 * ВНИМАНИЕ: пароли хранятся открытым текстом — это учебный пример без сервера.
 */
const DB = (() => {
  const KEYS = { users: 'shop_users', products: 'shop_products', session: 'shop_session' };

  // Картинка-заглушка (SVG с эмодзи), чтобы проект работал без интернета
  function placeholder(emoji, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260">` +
      `<rect width="100%" height="100%" fill="${color}"/>` +
      `<text x="50%" y="54%" font-size="110" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  const SEED_USERS = [
    { username: 'admin', password: 'admin123', role: 'admin', balance: 10000 }
  ];

  const SEED_PRODUCTS = [
    { id: 1, name: 'Кофе в зёрнах', description: 'Арабика, обжарка средняя, 250 г.', price: 650, stock: 12, image: placeholder('☕', '#e7d9c9') },
    { id: 2, name: 'Керамическая кружка', description: 'Объём 350 мл, подходит для посудомойки.', price: 420, stock: 5, image: placeholder('🍵', '#d5e8e4') },
    { id: 3, name: 'Блокнот А5', description: '96 листов в линейку, твёрдая обложка.', price: 300, stock: 20, image: placeholder('📓', '#dde3f0') },
    { id: 4, name: 'Наушники', description: 'Накладные, беспроводные, до 20 часов работы.', price: 3200, stock: 3, image: placeholder('🎧', '#f0dede') },
    { id: 5, name: 'Настольная лампа', description: 'Светодиодная, 3 режима яркости.', price: 1900, stock: 0, image: placeholder('💡', '#f3ecc8') }
  ];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      Bus.emit('storage:error', { message: 'Не удалось сохранить (переполнено хранилище?)' });
      return false;
    }
  }

  function init() {
    if (!localStorage.getItem(KEYS.users)) write(KEYS.users, SEED_USERS);
    if (!localStorage.getItem(KEYS.products)) write(KEYS.products, SEED_PRODUCTS);
  }

  return {
    init,
    reset() {
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
      init();
    },

    // --- пользователи ---
    getUsers: () => read(KEYS.users, []),
    getUser(username) {
      return this.getUsers().find((u) => u.username.toLowerCase() === String(username).toLowerCase());
    },
    addUser(user) {
      const users = this.getUsers();
      users.push(user);
      write(KEYS.users, users);
    },
    updateUser(username, patch) {
      const users = this.getUsers().map((u) => (u.username === username ? { ...u, ...patch } : u));
      write(KEYS.users, users);
    },

    // --- сессия ---
    getSession: () => read(KEYS.session, null),
    setSession: (username) => write(KEYS.session, username),
    clearSession: () => localStorage.removeItem(KEYS.session),

    // --- товары ---
    getProducts: () => read(KEYS.products, []),
    getProduct(id) {
      return this.getProducts().find((p) => p.id === Number(id));
    },
    addProduct(data) {
      const products = this.getProducts();
      const id = products.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      const product = { ...data, id };
      products.push(product);
      write(KEYS.products, products);
      return product;
    },
    updateProduct(id, patch) {
      const products = this.getProducts().map((p) => (p.id === Number(id) ? { ...p, ...patch } : p));
      write(KEYS.products, products);
    },
    deleteProduct(id) {
      write(KEYS.products, this.getProducts().filter((p) => p.id !== Number(id)));
    }
  };
})();
