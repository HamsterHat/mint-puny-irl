import { Game } from './Game.js';
import { settingsSchema, validateSettings } from './settings.js';
import { guess } from './Gun.js';
import { randomUUID } from 'node:crypto';

export function attachGame({
  io, getLobbyMembers, getLobbyHost, getInternalScreen = () => null,
  authenticateSocket = socket => socket.data.username, awardRound = null,
  rolepoints = null
}) {
  let game = null, preparedRolepoints = [], gameQueue = Promise.resolve(), actionRunning = false;
  const room = username => `ingame-user:${username}`;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  function participant(socket) { check(game, 'Матч не подготовлен.'); return game.player(socket.data.username); }
  function host(socket) { const player = participant(socket); check(player.id === game.hostId, 'Только хост.'); return player; }
  function personalRPoints(playerId) {
    if (!rolepoints) return null;
    const player = game.player(playerId);
    return rolepoints.privateState(player.username, preparedRolepoints.find(item => item.playerId === playerId) ?? null, game.phase === 'setup');
  }
  function snapshot(playerId) {
    const state = game.snapshot(playerId);
    if (rolepoints) state.rolepoints = personalRPoints(playerId);
    return state;
  }
  function announce(event, payload) {
    if (!game) return;
    for (const player of game.players.values()) io.to(room(player.id)).emit(event, payload);
    io.to('ingame-internal').emit(event, payload);
  }
  function publish() {
    if (!game) return;
    for (const player of game.players.values()) io.to(room(player.id)).emit('game:state', snapshot(player.id));
    io.to('ingame-internal').emit('game:state', game.internalSnapshot());
    for (const effect of game.effects.splice(0)) io.to(room(effect.targetId)).emit('game:lull', effect);
  }
  async function settle(g) {
    if (g.phase !== 'finished' || g.rewardStatus === 'paid' || g.rewardStatus === 'pending' || Date.now() < g.rewardRetryAt) return;
    g.rewardStatus = 'pending'; publish();
    try {
      check(typeof awardRound === 'function', 'Не подключено начисление наград.');
      g.rewardPayments = await awardRound({ gameId: g.id, awards: g.rewardPlan }); g.rewardStatus = 'paid';
    } catch (error) { g.rewardStatus = 'error'; g.rewardRetryAt = Date.now() + 5000; console.error('[round rewards]', error); }
    if (game === g) publish();
  }
  const hackLabels = { lull:'Усыпление', gun:'Выстрел', sabotage:'Поломки', rocket:'Ракетный удар', wifi:'Wi-Fi', tea:'Чай', poke:'POKE', fix:'FIX', 'fix-confirm':'Подтверждение FIX', 'spy-reveal':'Вскрытие роли', reveal:'Вскрытие роли', judge:'Приговор', protect:'Защита', hack:'HACK', terminate:'TERMINATE', antimint: 'ПРОТИВОМЯТА', mine: 'Заминировать', detonate: 'АКТИВИРОВАТЬ' };
  io.on('connection', socket => {
    const username = socket.data.username; if (!username) return;
    const internal = getInternalScreen(username);
    socket.join(room(username)); if (internal) socket.join('ingame-internal');
    function handle(event, action) {
      socket.on(event, (payload, callback) => {
        const ack = typeof payload === 'function' ? payload : typeof callback === 'function' ? callback : () => {};
        const args = typeof payload === 'function' ? {} : payload ?? {};
        const operation = gameQueue.then(async () => {
          actionRunning = true;
          try {
            check(socket.connected, 'Соединение закрыто.');
            authenticateSocket(socket);
            const result = await action(args);
            publish();
            if (game?.phase === 'finished') void settle(game);
            return result;
          } catch (error) {
            try { publish(); } catch (publishError) { console.error('[game publish]', publishError); }
            throw error;
          } finally { actionRunning = false; }
        });
        gameQueue = operation.catch(() => {});
        operation.then(result => ack({ success: true, ...result }), error => ack({ error: error.message }));
      });
    }
    handle('game:prepare', () => {
      check(!internal && username === getLobbyHost(), 'Только хост лобби.');
      check(!game || game.phase === 'finished' && game.rewardStatus === 'paid', 'Предыдущий матч ещё идёт или награды ещё сохраняются.');
      const members = getLobbyMembers();
      const candidate = new Game(members, username);
      const selected = rolepoints ? rolepoints.capture(members) : [];
      game = candidate; preparedRolepoints = selected;
      for (const player of game.players.values()) io.to(room(player.id)).emit('game:open');
    });
    handle('game:sync', () => {
      check(game, 'Матч не подготовлен.'); game.tick();
      if (internal) return { internalScreen: internal, state: game.internalSnapshot() };
      participant(socket); return { schema: settingsSchema, state: snapshot(username) };
    });
    handle('game:settings', payload => { host(socket); check(game.phase === 'setup', 'Настройки уже зафиксированы.'); game.settings = validateSettings(payload.settings); });
    handle('game:rpoints-sync', () => {
      participant(socket); check(rolepoints, 'RPoints не подключены.');
      return { rpoints: personalRPoints(username) };
    });
    handle('game:rpoints-select', async payload => {
      const player = participant(socket); check(rolepoints, 'RPoints не подключены.');
      check(game.phase === 'setup', 'Выбор роли уже закрыт.');
      const chosen = await rolepoints.choosePrepared(player.username, player.id, payload.ticketId);
      preparedRolepoints = preparedRolepoints.filter(item => item.playerId !== player.id);
      if (chosen) preparedRolepoints.push(chosen);
      return { rpoints: personalRPoints(player.id) };
    });
    handle('game:start', async () => {
      host(socket); check(game.phase === 'setup', 'Раунд уже начался.');
      const original = game;
      const members = [...original.players.values()].map(player => ({ id: player.id, username: player.username, equipped: { ...player.equipped } }));
      // Never mutate the published setup Game before the database write succeeds.
      const candidate = new Game(members, original.hostId, original.settings);
      candidate.id = original.id;
      const chosen = preparedRolepoints.map(item => ({ ...item }));
      const start = () => {
        candidate.start({ roleSelections: chosen });
        check(candidate._rolepointAssignmentsApplied === true, 'Не обновлён Game.start(): примени Game-start-replacement.txt. Билеты не списаны.');
        for (const selected of chosen) check(candidate.player(selected.playerId).role.constructor.id === selected.role, 'Выбранная роль не назначена. Билеты не списаны.');
      };
      if (rolepoints) await rolepoints.consumeAndStart(chosen, start);
      else { check(!chosen.length, 'RPoints не подключены.'); start(); }
      // Intro begins after successful persistence, not while the disk write runs.
      candidate.introStartedAt = Date.now();
      candidate.playStartsAt = candidate.introStartedAt + 2000 + (candidate.settings.introFactionSeconds + candidate.settings.introRoleSeconds) * 1000;
      candidate.meetings.nextEmergencyAt = candidate.playStartsAt + candidate.settings.meetingCooldown * 1000;
      game = candidate; preparedRolepoints = [];
    });
    handle('game:hack-options', payload => {
      const actor = participant(socket); game.tick(); actor.assertCanAct();
      check(actor.role?.constructor.id === 'glitch', 'HACK доступен только Глитчу.');
      actor.requireReady('hack', Date.now());
      const target = game.player(payload.targetId); game.assertTarget(actor, target);
      const ids = target.role?.hackableIds; check(Array.isArray(ids), 'У цели нет доступных для взлома способностей.');
      const traps = game.hacks.get(target.id);
      return { targetId: target.id, targetName: target.username, options: [...new Set(ids)].map(id => ({ id, name: hackLabels[id] ?? id, hacked: Boolean(traps?.has(id)) })) };
    });
    handle('game:ability', payload => {
      participant(socket);
      const wasTerminable = Boolean(game.meetings.terminable);
      const cancelledMeetingId = game.meetings.current?.id ?? game.meetings.lastResult?.id ?? null;
      const result = game.use(username, payload.ability, payload.targetId, payload.params ?? {});
      if (
        payload.ability === 'headhunter-shot' &&
        result &&
        !result.blocked &&
        !result.hacked
      ) {
        socket.broadcast.emit('game:headhunter-shot');
      }
      if (payload.ability === 'terminate' && wasTerminable && !game.meetings.terminable && game.phase === 'playing') {
        announce('game:meeting-terminated', { id: `${game.id}:${Date.now()}`, gameId: game.id, meetingId: cancelledMeetingId, resultId: game.meetings.lastResult?.id ?? null, time: Date.now() });
      }
      return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
    });
    handle('game:interrogation-reply', payload => {
      const player = participant(socket);
      const interrogation = game.pendingInterrogations.get(player.id);
      check(interrogation, 'Тебя никто не допрашивает.');
      check(Date.now() <= interrogation.expiresAt, 'Время на ответ истекло.');
      game.pendingInterrogations.delete(player.id);
      const tracker = game.player(interrogation.askedBy);
      const answer = String(payload.answer ?? '').trim().slice(0, 300) || '(...молчание...)';
      tracker.notify(`${player.username}: ${answer}`);
      return { answered: true };
    });

    handle('game:tracker-note', payload => {
      const player = participant(socket);
      check(player.role?.constructor.id === 'tracker', 'Только Следопыт.');
      player.role.addNote(payload.text);
    });



    handle('game:journalist-photo', payload => {
      const player = participant(socket);
      check(player.role?.constructor.id === 'journalist', 'Только Журналист.');
      check(typeof payload.image === 'string' && payload.image.startsWith('data:image/'), 'Некорректное фото.');
      player.role.takePhoto(Date.now());
      player.role.photo = payload.image;
      return { ok: true };
    });

    handle('game:journalist-send', () => {
      const player = participant(socket);
      check(player.role?.constructor.id === 'journalist', 'Только Журналист.');
      player.role.sendPhoto(Date.now());
      const image = player.role.photo;
      for (const target of game.players.values()) {
        if (target.awake) io.to(room(target.id)).emit('game:journalist-photo-broadcast', {
          sender: player.username,
          image
        });
      }
      return { ok: true };
    });


    handle('game:exam-submit', payload => {
      const player = participant(socket);

      const answers = Array.isArray(payload?.answers)
        ? payload.answers
        : [];

      console.log('[exam submit]', {
        player: player.id,
        answers
      });

      return game.submitExam(player.id, answers);
    });

    handle('game:dev-console-open', () => {
      const player = participant(socket);
      check(player.role?.constructor.id === 'developer', 'Только Разработчик.');
      player.role.openConsole(Date.now());
      const password = randomUUID().replace(/-/g, '').slice(0, 8);
      game.devConsole = {
        password,
        attempts: 0,
        playerId: player.id,
        expiresAt: Date.now() + 60000
      };
      return { password };
    });

    handle('game:dev-console-unlock', payload => {
      const player = participant(socket);
      const console_ = game.devConsole;
      check(console_ && console_.playerId === player.id, 'Консоль не открыта.');
      check(Date.now() <= console_.expiresAt, 'Время сессии истекло.');
      if (payload.password !== console_.password) {
        console_.attempts++;
        if (console_.attempts >= 3) {
          game.devConsole = null;
          return { failed: true, closed: true, attemptsLeft: 0 };
        }
        return { failed: true, closed: false, attemptsLeft: 3 - console_.attempts };
      }
      player.role.spendUse();
      const data = game.devConsoleSnapshot();
      game.devConsole = null;
      return { success: true, data };
    });
    handle('game:task', payload => { participant(socket); game.completeTask(username, payload.taskId); });
    handle('game:meeting', () => { check(internal === 'emergency', 'Недоступно этому аккаунту.'); check(game, 'Матч не подготовлен.'); game.tick(); game.meetings.start({ reason: 'emergency' }); });
    handle('game:report', payload => {
      participant(socket);
      game.tick();
      const reporter = game.player(username);
      const target = game.player(payload.targetId);
      game.applyTag(reporter, target);
      game.meetings.start({ reason: 'report', reporterId: username, targetId: payload.targetId });
    });
    handle('game:vote', payload => { participant(socket); game.tick(); game.meetings.vote(username, payload.targetId); });

    handle('game:meeting-all-gathered', () => {
      host(socket);
      game.tick();
      game.meetings.confirmAllGathered(username);
    });

    handle('game:meeting-start-voting', () => {
      host(socket);
      game.tick();
      game.meetings.startVoting(username);
    });
    handle('game:missile-switch', payload => { check(internal === 'missile', 'Недоступно этому аккаунту.'); check(game, 'Матч не подготовлен.'); game.toggleMissileSwitch(payload.index); });
    handle('game:host-action', payload => {
      host(socket); game.tick(); check(game.phase === 'playing' && !game.meetings.blocked, 'Дождись окончания собрания; раунд должен идти.');
      const target = game.player(payload.targetId);
      if (payload.action === 'wake') target.getUp(); else if (payload.action === 'exile') target.exile(); else throw new Error('Неизвестное действие.');
      game.resolveStateChanges();
    });
    handle('game:guess', payload => {
      const shooter = participant(socket);
      const target = game.player(payload.targetId);

      // Здесь цель уже усыпляется, если попадание прошло.
      const result = guess(
        target,
        shooter,
        payload.roleId
      );

      // Анимация отправляется после реального эффекта.
      for (const shot of result.shots) {
        announce('game:gun-shot', shot);
      }

      // Обычное досрочное завершение сохраняется:
      // после попадания все оставшиеся могли уже проголосовать.
      game.meetings.checkCompletion(Date.now());

      return result;
    });
    handle('game:finish', () => { host(socket); game.finish(null, 'Раунд отменён хостом', { cancelled: true }); });
  });
  const timer = setInterval(() => {
    if (!game || actionRunning) return;
    try {
      if (game.phase === 'intro' || game.phase === 'playing') { game.tick(); publish(); }
      if (game.phase === 'finished') void settle(game);
    } catch (error) { console.error('[game tick]', error); }
  }, 150);
  timer.unref();
  return { getGame: () => game, dispose() { clearInterval(timer); } };
}
