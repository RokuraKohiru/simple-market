/**
 * Шина событий — основа событийного подхода в проекте.
 *
 * Любая часть приложения НЕ вызывает другую напрямую, а сообщает о том,
 * что произошло: Bus.emit('auth:login', {...}).
 * Остальные части подписаны через Bus.on(...) и реагируют сами.
 * Дополнительно каждое событие дублируется в 'app:event' — его слушает журнал.
 */
const Bus = {
  emit(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
    document.dispatchEvent(new CustomEvent('app:event', { detail: { name, data: detail } }));
  },
  on(name, handler) {
    document.addEventListener(name, (e) => handler(e.detail, e));
  }
};
