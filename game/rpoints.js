import { randomUUID } from 'node:crypto';
import { PLAYABLE_ROLES } from './role-selection.js';

export function attachRPoints({
  io, enqueue, commit, accountOf, getAccount, getTickets, findItem,
  ensureLobbyMember, getLobbySocketId, isSelectionOpen, syncAccount
}) {
  const choices = new Map();
  const supported = new Set(PLAYABLE_ROLES);
  const check = (ok, text) => { if (!ok) throw new Error(text); };
  const owns = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const validCount = n => Number.isSafeInteger(n) && n >= 0;
  function amount(account, ticketId) {
    const storage = account.inventory.rolepoints;
    return owns(storage, ticketId) ? storage[ticketId] : 0;
  }
  function liveChoice(username) {
    const choice = choices.get(username);
    if (!choice) return null;
    if (getLobbySocketId(username) !== choice.socketId || !io.sockets.sockets.get(choice.socketId)?.connected) {
      choices.delete(username); return null;
    }
    return choice;
  }
  function selection(username, ticketId) {
    if (ticketId === null) return null;
    check(typeof ticketId === 'string' && ticketId.length > 0, 'Выбери билет или передай null для отмены.');
    const ticket = findItem('rolepoints', ticketId);
    check(supported.has(ticket.role), 'Эта роль пока не поддерживается игрой.');
    const count = amount(getAccount(username), ticketId);
    check(validCount(count) && count > 0, 'У тебя нет этого билета.');
    return { username, ticketId, role: ticket.role, token: randomUUID() };
  }
  function privateState(username, selected = null, selectionOpen = true) {
    const account = getAccount(username);
    return {
      selectionOpen,
      selected: selected ? { ticketId: selected.ticketId, role: selected.role } : null,
      tickets: getTickets().map(ticket => ({
        id: ticket.id, name: ticket.name, asset: ticket.asset, role: ticket.role,
        amount: amount(account, ticket.id), supported: supported.has(ticket.role)
      }))
    };
  }
  function lobbyState(username) { return privateState(username, liveChoice(username), isSelectionOpen()); }
  function capture(members) {
    return members.flatMap(member => {
      const chosen = liveChoice(member.username);
      return chosen ? [{ username: member.username, playerId: member.id, ticketId: chosen.ticketId, role: chosen.role, token: chosen.token }] : [];
    });
  }
  function choosePrepared(username, playerId, ticketId) {
    return enqueue(() => {
      const chosen = selection(username, ticketId);
      return chosen ? { ...chosen, playerId } : null;
    });
  }
  async function consumeAndStart(selections, startCandidate) {
    if (!selections.length) { startCandidate(); return; }
    await enqueue(async () => {
      const names = await commit(database => {
        const seen = new Set();
        for (const chosen of selections) {
          check(!seen.has(chosen.username), 'Для одного аккаунта выбрано несколько билетов.');
          seen.add(chosen.username);
          const ticket = findItem('rolepoints', chosen.ticketId);
          check(supported.has(ticket.role) && ticket.role === chosen.role, 'Роль билета изменилась. Выбери билет заново.');
          const account = accountOf(database, chosen.username), storage = account.inventory.rolepoints;
          const current = amount(account, chosen.ticketId);
          check(validCount(current) && current > 0, `У участника ${chosen.username} больше нет выбранного билета.`);
          if (current === 1) delete storage[chosen.ticketId];
          else storage[chosen.ticketId] = current - 1;
        }
        // Only an isolated, unpublished Game may be started here.
        // If validation/role construction throws, commit never writes the database.
        const result = startCandidate();
        check(!result || typeof result.then !== 'function', 'Подготовка ролей должна быть синхронной.');
        return [...seen];
      });
      // commit has already saved the database: notification failures must not
      // turn successful consumption into a failed match start.
      for (const name of names) {
        const current = choices.get(name), used = selections.find(item => item.username === name);
        if (current?.token === used.token) choices.delete(name);
        try { syncAccount(name); } catch (error) { console.error('[rpoints sync]', error); }
      }
    });
  }
  io.on('connection', socket => {
    function handle(event, action) {
      socket.on(event, (payload, callback) => {
        const ack = typeof payload === 'function' ? payload : typeof callback === 'function' ? callback : () => {};
        const args = typeof payload === 'function' ? {} : payload ?? {};
        enqueue(() => {
          const username = ensureLobbyMember(socket);
          return action(username, args);
        }).then(state => {
          socket.emit('rpoints:state', state); ack({ success: true, rpoints: state });
        }).catch(error => ack({ error: error.message }));
      });
    }
    handle('rpoints:sync', username => lobbyState(username));
    handle('rpoints:select', (username, payload) => {
      check(isSelectionOpen(), 'Матч уже подготовлен. Измени билет на игровом экране до старта.');
      const chosen = selection(username, payload.ticketId);
      if (chosen) choices.set(username, { ...chosen, socketId: socket.id });
      else choices.delete(username);
      return lobbyState(username);
    });
    socket.on('disconnect', () => {
      const username = socket.data.username;
      if (choices.get(username)?.socketId === socket.id) choices.delete(username);
    });
  });
  return { capture, privateState, choosePrepared, consumeAndStart };
}
