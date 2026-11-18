 'use strict';
window.RPointsUI = (() => {
  const instances = new WeakMap();
  function mount({ socket, mode = 'lobby', container = document.body }) {
    if (instances.has(socket)) return instances.get(socket);
    if (!container) throw new Error('RPointsUI: контейнер не найден.');
    const prefix = mode === 'game' ? 'game:rpoints-' : 'rpoints:';
    let state = null, busy = false, signature = '', visible = mode !== 'game', refreshing = false;
    function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    const root = el('section', 'rpoints-panel'); root.hidden = true; container.appendChild(root);
    const heading = el('h2', '', 'Роль за RPoint');
    const note = el('p', 'rpoints-hint', 'Выбор виден только тебе. Один билет списывается при успешном старте. Роль должна иметь место в настройках матча.');
    const content = el('div'), status = el('p', 'rpoints-status'); status.setAttribute('role', 'status');
    root.appendChild(heading); root.appendChild(note); root.appendChild(content); root.appendChild(status);
    function request(event, payload = {}) {
      return new Promise((resolve, reject) => {
        if (!socket.connected) { reject(new Error('Нет связи с сервером.')); return; }
        socket.timeout(10000).emit(event, payload, (error, result) => {
          if (error) reject(new Error('Нет подтверждения сервера. Запрос мог выполниться; обнови состояние.'));
          else if (!result?.success) reject(new Error(result?.error || 'Запрос отклонён.'));
          else resolve(result.rpoints);
        });
      });
    }
    function render(next, force = false) {
      if (!next) return; state = next; root.hidden = !visible;
      const key = JSON.stringify([next, busy]); if (!force && key === signature) return; signature = key;
      content.replaceChildren();
      const selectedTicket = next.tickets.find(ticket => ticket.id === next.selected?.ticketId);
      content.appendChild(el('p', 'rpoints-selected', selectedTicket ? `Выбрано: ${selectedTicket.name}` : 'Случайная роль — билет не используется'));
      const controls = el('div', 'rpoints-controls');
      const select = el('select'); select.setAttribute('aria-label', 'Билет для выбора роли');
      const empty = el('option', '', 'Выбери билет'); empty.value = ''; select.appendChild(empty);
      for (const ticket of next.tickets) {
        if (!ticket.amount && ticket.id !== next.selected?.ticketId) continue;
        const option = el('option', '', `${ticket.name} × ${ticket.amount}${ticket.supported ? '' : ' — роль недоступна'}`);
        option.value = ticket.id; option.disabled = !ticket.supported || ticket.amount < 1; select.appendChild(option);
      }
      select.value = next.selected?.ticketId ?? ''; select.disabled = busy || !next.selectionOpen;
      const apply = el('button', '', 'Выбрать'); apply.type = 'button';
      apply.disabled = busy || !next.selectionOpen || !select.value;
      select.addEventListener('change', () => { apply.disabled = busy || !next.selectionOpen || !select.value; });
      apply.addEventListener('click', () => choose(select.value));
      const cancel = el('button', '', 'Снять выбор'); cancel.type = 'button'; cancel.disabled = busy || !next.selectionOpen || !next.selected;
      cancel.addEventListener('click', () => choose(null));
      controls.appendChild(select); controls.appendChild(apply); controls.appendChild(cancel); content.appendChild(controls);
      if (!next.selectionOpen) content.appendChild(el('p', 'rpoints-hint', mode === 'game' ? 'Выбор закрыт: раунд уже начался.' : 'Матч подготовлен. Изменить выбор можно на игровом экране до старта.'));
    }
    async function choose(ticketId) {
      if (busy) return; busy = true; status.textContent = ''; render(state, true);
      try { render(await request(`${prefix}select`, { ticketId }), true); status.textContent = ticketId === null ? 'Выбор снят. Билет не потрачен.' : 'Выбор сохранён. Билет будет потрачен при старте.'; }
      catch (error) { status.textContent = error.message; }
      finally { busy = false; render(state, true); }
    }
    async function refresh() {
      if (refreshing || !socket.connected) return; refreshing = true;
      try { render(await request(`${prefix}sync`)); }
      catch (error) { if (mode === 'lobby') root.hidden = true; else status.textContent = error.message; }
      finally { refreshing = false; }
    }
    socket.on('connect', refresh);
    socket.on('disconnect', () => { root.hidden = true; });
    if (mode === 'lobby') {
      socket.on('lobby_update', refresh); socket.on('rpoints:state', next => render(next));
    } else {
      socket.on('game:state', next => { if (!next?.me) return; visible = next.phase === 'setup'; root.hidden = !visible; if (next.rolepoints) render(next.rolepoints); });
    }
    if (socket.connected) refresh();
    const api = { refresh, element: root }; instances.set(socket, api); return api;
  }
  return { mount };
})();
