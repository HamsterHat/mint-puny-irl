'use strict';
window.MeetingUI = (() => {
  const $ = id => document.getElementById(id);
  let send, notify, state = null, gameId = null, viewerId = null, meetingId = null, selectedId = null;
  let voting = false, acting = false, locallyVotedId = null, shownResultId = null, generation = 0, terminationToken = 0;
  let doubleShot = null;
  let signature = '', actionSignature = '', actions = [], myTarget = null, myProtected = new Set();
  const SKIP = Symbol('skip'), cache = new Map(), suppressed = new Set(), terminations = new Set(), shots = new Map();

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function btn(cls, text, title, fn) { const n = el('button', cls, text); n.type = 'button'; n.title = title; n.setAttribute('aria-label', title); n.addEventListener('click', fn); return n; }
  function css(id, href) { if ($(id)) return; const n = el('link'); n.id = id; n.rel = 'stylesheet'; n.href = href; document.head.appendChild(n); }
  function script(src, global) { return new Promise((resolve, reject) => { if (window[global]) return resolve(); const n = el('script'); n.src = src; n.onload = resolve; n.onerror = () => reject(new Error(src)); document.head.appendChild(n); }); }
  function storageKey() { return state?.me ? 'punya:meeting-markers:' + encodeURIComponent(state.me.id) : null; }
  function save() { const k = storageKey(); if (!k || !state.meeting) return; try { sessionStorage.setItem(k, JSON.stringify({ gameId: state.gameId, meetingId: state.meeting.id, voted: locallyVotedId === state.meeting.id, target: myTarget, protected: [...myProtected] })); } catch {} }
  function restore() { myTarget = null; myProtected = new Set(); const k = storageKey(); if (!k) return; try { const v = JSON.parse(sessionStorage.getItem(k)); if (v?.gameId !== state.gameId || v?.meetingId !== state.meeting.id) return; const ids = new Set(state.players.map(p => p.id)); if (v.voted) { locallyVotedId = state.meeting.id; if (ids.has(v.target)) myTarget = v.target; } if (Array.isArray(v.protected)) myProtected = new Set(v.protected.filter(id => ids.has(id))); } catch {} }
  function image(src) { if (!cache.has(src)) cache.set(src, new Promise(resolve => { const n = new Image(); n.onload = () => resolve(n); n.onerror = () => { cache.delete(src); resolve(null); }; n.src = src; })); return cache.get(src); }
  async function draw(canvas, equipped = {}) { const layers = [['player', equipped.color], ['face', equipped.face], ['glasses', equipped.glasses], ['hats', equipped.hat]]; const imgs = await Promise.all(layers.map(([folder, id]) => typeof id === 'string' && id ? image(`/assets/${folder}/${encodeURIComponent(id)}.png`) : null)); const c = canvas.getContext('2d'); if (!c) return; c.clearRect(0, 0, canvas.width, canvas.height); c.imageSmoothingEnabled = false; const valid = imgs.filter(Boolean); if (!valid.length) { const fallback = await image('/assets/ui/gun-vfx/avatar-fallback.png'); if (fallback) c.drawImage(fallback, 0, 0, canvas.width, canvas.height); return; } for (const n of valid) c.drawImage(n, Math.round((canvas.width - n.naturalWidth) / 2), Math.round((canvas.height - n.naturalHeight) / 2)); }
  function action(id) { return actions.find(a => a.id === id); }
  function voted() { return !!(state?.meeting && (locallyVotedId === state.meeting.id || state.meeting.voted.includes(state.me?.id))); }
  function mayVote() { const m = state?.meeting, p = state?.me; return !!(m && m.phase === 'voting' && p && p.state === 'awake' && !voting && !acting && !voted() && m.eligible.includes(p.id)); }
  function mayAct(a) { const m = state?.meeting; return !!(a && !a.disabled && !acting && !voting && m && m.phase === 'voting' && state?.me?.state === 'awake'); }
  function mayGuess() { const m = state?.meeting; return !!(m && ['discussion', 'voting'].includes(m.phase) && state?.me?.state === 'awake'); }
  function validTarget(id, p) {
    if (id === 'blackjack-guess') return p.state === 'awake';
    if (id === 'double-shot') return p.state === 'awake';
    return id === 'judge' ? p.state !== 'exiled' : id === 'protect' ? p.state === 'awake' : false;
  }
  function error(text) { if ($('meeting-error')) $('meeting-error').textContent = text; if (text && !$('meeting-dialog').open) notify('Собрание', text); }

  async function vote(id) {
    if (!mayVote()) return;
    const mid = state.meeting.id, gid = state.gameId;
    voting = true; error(''); render(true); footer();
    try {
      await send('game:vote', { targetId: id });
      if (state?.gameId === gid && state.meeting?.id === mid) { locallyVotedId = mid; myTarget = id; save(); }
    } catch (e) { error(e.message); }
    finally { voting = false; selectedId = null; render(true); footer(); }
  }

  async function use(id, targetId) {
    const a = action(id);
    if (!mayAct(a)) return;
    if (id !== 'terminate') {
      const p = state.players.find(p => p.id === targetId);
      if (!state.meeting || !p || !validTarget(id, p)) return;
    }
    const gid = state.gameId, mid = state.meeting?.id;
    acting = true; error(''); render(true); footer(); ejectionActions();
    try {
      const payload = { ability: id };
      if (targetId !== undefined) payload.targetId = targetId;
      const result = await send('game:ability', payload);
      if (id === 'protect' && result?.blocked === false && state.gameId === gid && state.meeting?.id === mid) { myProtected.add(targetId); save(); }
      selectedId = null;
    } catch (e) { error(e.message); window.GameAudio?.play('error'); }
    finally { acting = false; render(true); footer(); ejectionActions(); }
  }

  function markers(plaque, p, m) {
    if (m.voted.includes(p.id) || (p.id === state.me?.id && locallyVotedId === m.id)) {
      const n = el('span', 'kick-vote-marker');
      n.title = 'Игрок проголосовал';
      n.appendChild(el('span', '', 'I'));
      n.appendChild(el('span', '', 'VOTED'));
      plaque.appendChild(n);
    }
    const protectedByMe = !!action('protect') && myProtected.has(p.id);
    if (protectedByMe || myTarget === p.id) {
      const n = el('span', 'kick-target-marker ' + (protectedByMe ? 'kick-defend-marker' : 'kick-voted-target'), protectedByMe ? '🛡' : '👎');
      n.title = protectedByMe ? 'Ты защитил этого игрока' : 'Твой голос против этого игрока';
      plaque.appendChild(n);
    }
  }

  function controls(p) {
    const wrap = el('div', 'meeting-confirm kick-target-controls');
    wrap.hidden = selectedId !== p.id;
    if (wrap.hidden) return wrap;
    for (const [id, label, fallback] of [['protect', 'DEFEND', '🛡'], ['judge', 'OVERRULE', '⚖']]) {
      const a = action(id);
      if (!a) continue;
      const b = btn('kick-role-action kick-' + id, '', `${label}: ${p.username} · ${a.name}`, () => use(id, p.id));
      if (a.image) { const img = el('img'); img.src = a.image; img.alt = ''; b.appendChild(img); }
      else b.appendChild(el('span', '', fallback));
      b.appendChild(el('span', 'kick-action-label', label));
      b.disabled = !mayAct(a) || !validTarget(id, p);
      wrap.appendChild(b);
    }
    const guess = action('blackjack-guess');
    if (guess) {
      const b = btn('kick-role-action kick-blackjack-guess', '', `Угадать роль: ${p.username}`, () => openBlackjackGuess(p.id, 'blackjack'));
      b.appendChild(el('span', '', '🎯'));
      b.appendChild(el('span', 'kick-action-label', 'УГАДАТЬ'));
      b.disabled = !mayAct(guess) || !validTarget('blackjack-guess', p);
      wrap.appendChild(b);
    }
    
    

    const yes = btn('kick-yes', '✓', 'Подтвердить голос', () => vote(p.id));
    yes.disabled = !mayVote() || !state.meeting.eligible.includes(p.id);
    wrap.appendChild(yes);
    const no = btn('kick-no', '×', 'Закрыть действия', () => { selectedId = null; render(true); footer(); });
    no.disabled = acting || voting;
    wrap.appendChild(no);
    return wrap;
  }

  function badge(plaque, p) {
    const id = p.equipped?.badge;
    const safe = typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : 'default';
    const path = `/assets/badges/${encodeURIComponent(safe)}.png`;
    plaque.style.backgroundImage = 'url("/assets/ui/gun-vfx/badge-paper.png")';
    image(path).then(img => { if (img && plaque.isConnected) plaque.style.backgroundImage = `url(${JSON.stringify(path)})`; });
  }

  function render(force = false) {
    const m = state?.meeting;
    if (!m) return;
    const sig = JSON.stringify([m.id, m.phase, m.eligible, m.voted, state.players, state.me?.id, state.me?.state, selectedId === SKIP ? '@skip' : selectedId, voting, acting, locallyVotedId, actions, myTarget, [...myProtected]]);
    if (!force && sig === signature) return;
    signature = sig;
    const container = $('meeting-players');
    container.replaceChildren();
    const eligible = !!(state.me?.state === 'awake' && m.eligible.includes(state.me.id));
    for (const p of state.players) {
      const card = el('article', 'meeting-player kick-player');
      card.dataset.playerId = p.id;
      card.classList.toggle('selected', selectedId === p.id);
      card.classList.toggle('inactive', p.state !== 'awake');
      const select = btn('meeting-select kick-player-select', '', p.username, () => { selectedId = selectedId === p.id ? null : p.id; render(true); footer(); });
      const hasDoubleShot = state.me?.modifiers?.some(
        modifier => modifier.id === 'double-shot'
      );

      const targetAction = [
        'judge',
        'protect',
        'blackjack-guess'
      ].some(
        id => mayAct(action(id)) && validTarget(id, p)
      ) || (
        hasDoubleShot &&
        validTarget('double-shot', p) &&
        state.meeting?.phase === 'voting' &&
        state.me?.state === 'awake'
      );
      select.disabled = acting || voting || !state.me || (!eligible && !targetAction) || (!m.eligible.includes(p.id) && !targetAction);
      select.setAttribute('aria-expanded', String(selectedId === p.id));
      const portrait = el('span', 'kick-portrait'), canvas = el('canvas');
      canvas.width = 100; canvas.height = 100;
      portrait.appendChild(canvas);
      if (p.state !== 'awake') portrait.appendChild(el('span', 'kick-sleep-cross', '×'));
      const plaque = el('span', 'kick-nameplate');
      badge(plaque, p);
      plaque.appendChild(el('span', 'meeting-name kick-name', p.username));
      if (p.state !== 'awake') plaque.appendChild(el('small', 'kick-player-state', p.state === 'exiled' ? 'Изгнан' : 'Спит'));
      markers(plaque, p, m);
      select.appendChild(portrait);
      select.appendChild(plaque);
      card.appendChild(select);
      
      card.appendChild(controls(p));
      container.appendChild(card);
      void draw(canvas, p.equipped);
    }
    $('meeting-vote-status').textContent = m.phase === 'voting'
      ? `Проголосовало: ${m.voted.length} / ${m.eligible.length}${voted() ? ' · Твой голос принят' : ''}`
      : m.phase === 'discussion'
        ? 'Обсуждение: голосование пока недоступно.'
        : 'Ожидание собрания.';
    window.GunUI?.refresh();
  }

  function waitingPanel() {
    const m = state?.meeting;
    if (!m || m.phase !== 'waiting') return null;
    const wrap = el('div', 'meeting-waiting');
    wrap.appendChild(el('h2', '', 'Ожидание собрания'));
    wrap.appendChild(el('p', '', 'Хост решает, все ли за столом.'));
    if (state.hostId === state.me?.id) {
        const all = btn('meeting-all-gathered-btn', 'Все в сборе!', 'Начать собрание', async () => {
        try { await send('game:meeting-all-gathered', {}); } catch (e) { error(e.message); }
        });
        wrap.appendChild(all);
    }
    return wrap;
   }

  function discussionPanel() {
    const m = state?.meeting;
    if (!m || m.phase !== 'discussion') return null;
    const wrap = el('div', 'meeting-discussion');
    wrap.appendChild(el('h2', '', 'Время на обсуждение'));
    wrap.appendChild(el('p', 'meeting-discussion-timer', `До голосования: ${Math.max(0, Math.ceil((m.discussionEndsAt - state.serverTime) / 1000))} сек.`));
    wrap.appendChild(el('p', '', 'Голосовать и использовать способности нельзя. Пушка — можно.'));
    if (state.hostId === state.me?.id) {
      const b = btn('meeting-start-voting-btn', 'К голосованию', 'Досрочно начать голосование', async () => {
        try { await send('game:meeting-start-voting', {}); } catch (e) { error(e.message); }
      });
      wrap.appendChild(b);
    }
    return wrap;
  }

  function terminateButton() {
    const a = action('terminate');
    if (!a) return null;
    const b = btn('kick-terminate', 'TERMINATE', 'Прервать собрание', () => use('terminate'));
    b.disabled = !mayAct(a);
    return b;
  }

  function doubleShotButton() {
    const hasDoubleShot = state.me?.modifiers?.some(
      modifier => modifier.id === 'double-shot'
    );

    if (!hasDoubleShot) return null;

    const b = btn(
      'kick-terminate double-shot-button',
      'DOUBLE SHOT',
      'Двойной выстрел',
      () => openDoubleShot()
    );

    return b;
  }

  function footer() {
    const skip = $('meeting-skip'), confirm = $('meeting-skip-confirm'), slot = $('meeting-terminate-slot');
    if (!skip || !confirm || !slot) return;
    const m = state?.meeting;
    const showVoting = m && m.phase === 'voting';
    skip.hidden = !showVoting || !state?.me;
    skip.disabled = !mayVote();
    confirm.hidden = selectedId !== SKIP || !showVoting || !state?.me;
    for (const b of confirm.querySelectorAll('button')) b.disabled = !mayVote();
    slot.replaceChildren();
    const t = showVoting ? terminateButton() : null;
    const d = showVoting ? doubleShotButton() : null;

    if (t) slot.appendChild(t);
    if (d) slot.appendChild(d);

    slot.hidden = !t && !d;
  }

  function ejectionActions() {
    const container = $('ejection-actions');
    if (!container) return;
    container.replaceChildren();
    const m = state?.meeting;
    const t = m && m.phase === 'voting' ? terminateButton() : null;
    const d = m && m.phase === 'voting' ? doubleShotButton() : null;

    if (t) container.appendChild(t);
    if (d) container.appendChild(d);

    const wrap = container.closest('.meeting-action-panel');

    if (wrap) wrap.hidden = !t && !d;
  }

  async function result(r) {
    if (shownResultId === r.id || suppressed.has(r.id) || r.cancelled || r.terminated) return;
    shownResultId = r.id;
    if (state.serverTime >= r.animateUntil) return;
    const token = ++generation, overlay = $('ejection-overlay'), canvas = $('ejection-player'), target = state.players.find(p => p.id === r.exiledId);
    canvas.classList.remove('flying');
    canvas.hidden = !target;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    $('ejection-title').textContent = target ? `${target.username} отправляется в пруд` : 'Никто не изгнан';
    overlay.hidden = false;
    const duration = Math.max(0, r.animateUntil - state.serverTime), deadline = Date.now() + duration;
    setTimeout(() => { if (token === generation) overlay.hidden = true; }, duration);
    if (target) {
      await draw(canvas, target.equipped);
      if (token !== generation || Date.now() >= deadline) return;
      void canvas.offsetWidth;
      canvas.classList.add('flying');
    }
  }

  function terminate(e) {
    if (e?.gameId && gameId && e.gameId !== gameId) return;
    if (e?.id && terminations.has(e.id)) return;
    if (e?.id) terminations.add(e.id);
    for (const id of [e?.meetingId, e?.resultId, state?.meetingResult?.id]) if (id != null) suppressed.add(id);
    generation++;
    $('ejection-overlay').hidden = true;
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    const overlay = $('termination-overlay');
    if (!overlay) { notify('TERMINATE', '<MEETING TERMINATED>'); return; }
    const token = ++terminationToken;
    overlay.hidden = false;
    window.GameAudio?.play('error');
    setTimeout(() => { if (token === terminationToken) overlay.hidden = true; }, 1800);
  }

  function layout() {
    const dialog = $('meeting-dialog');
    dialog.classList.add('kick-dialog');
    $('meeting-actions')?.closest('.meeting-action-panel')?.setAttribute('hidden', '');
    const oldFooter = $('meeting-skip').closest('.meeting-footer');
    oldFooter.classList.add('kick-footer');
    if (!$('meeting-skip-area')) {
      const area = el('div', 'kick-skip-area');
      area.id = 'meeting-skip-area';
      const skip = $('meeting-skip');
      skip.textContent = 'СКИП';
      oldFooter.prepend(area);
      area.appendChild(skip);
      const c = el('div', 'kick-skip-confirm');
      c.id = 'meeting-skip-confirm';
      c.hidden = true;
      c.appendChild(btn('kick-yes', '✓', 'Подтвердить СКИП', () => vote(null)));
      c.appendChild(btn('kick-no', '×', 'Отмена', () => { selectedId = null; render(true); footer(); }));
      area.appendChild(c);
    }
    if (!$('meeting-terminate-slot')) {
      const n = el('div', 'kick-terminate-slot');
      n.id = 'meeting-terminate-slot';
      oldFooter.appendChild(n);
    }
    $('meeting-players').classList.add('kick-grid');
    if (!$('meeting-grid-scroll')) {
      const n = el('div', 'kick-grid-scroll');
      n.id = 'meeting-grid-scroll';
      $('meeting-players').before(n);
      n.appendChild($('meeting-players'));
    }
    if (!$('meeting-phase-panel')) {
      const n = el('div', 'meeting-phase-panel');
      n.id = 'meeting-phase-panel';
      dialog.prepend(n);
    }
  }

  function setActions(next) {
    const sig = JSON.stringify(next ?? []);
    actions = next ?? [];
    if (sig === actionSignature) return;
    actionSignature = sig;
    render(true); footer(); ejectionActions();
  }

  function update(next) {
    if (!next) return;
    if (gameId !== next.gameId || viewerId !== (next.me?.id ?? null)) {
      gameId = next.gameId; viewerId = next.me?.id ?? null; meetingId = null; selectedId = null; locallyVotedId = null; shownResultId = null; voting = false; acting = false; myTarget = null; myProtected = new Set(); signature = ''; actionSignature = ''; generation++; suppressed.clear(); terminations.clear(); shots.clear();
      $('ejection-overlay').hidden = true;
    }
    state = next;
    const m = state.meeting, dialog = $('meeting-dialog');
    const panel = $('meeting-phase-panel');
    if (m) {
      if (meetingId !== m.id) { meetingId = m.id; selectedId = null; locallyVotedId = null; voting = false; signature = ''; restore(); error(''); }
      panel.replaceChildren();
      const w = waitingPanel();
      if (w) panel.appendChild(w);
      const d = discussionPanel();
      if (d) panel.appendChild(d);
      $('meeting-title').textContent = m.phase === 'waiting' ? 'Ожидание собрания' : m.phase === 'discussion' ? 'Обсуждение' : 'Кто будет изгнан?';
      $('meeting-time').textContent = m.phase === 'waiting'
        ? '—'
        : m.phase === 'discussion'
          ? `${Math.max(0, Math.ceil((m.discussionEndsAt - state.serverTime) / 1000))} сек.`
          : `${Math.max(0, Math.ceil((m.endsAt - state.serverTime) / 1000))} сек.`;
      render();
      footer();
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
      if (state.meetingResult) void result(state.meetingResult);
    }
    ejectionActions();
    window.GunUI?.refresh();
  }

  function init(options) {
    send = options.send;
    notify = options.notify;
    layout();
    css('meeting-gun-css', '/gun-ui.css');
    $('meeting-dialog').addEventListener('cancel', e => e.preventDefault());
    $('meeting-skip').addEventListener('click', () => {
      if (mayVote()) { selectedId = selectedId === SKIP ? null : SKIP; render(true); footer(); }
    });

    $('double-shot-cancel')?.addEventListener('click', () => {
      closeDoubleShot();
    });

    $('double-shot-fire')?.addEventListener('click', () => {
      submitDoubleShot();
    });

    options.socket?.on('game:meeting-terminated', terminate);
    options.socket?.on('game:gun-shot', shot => {
      if (shot?.id) {
        shots.set(shot.id, shot);
        while (shots.size > 100) shots.delete(shots.keys().next().value);
        window.GunUI?.receiveShot(shot);
      }
    });
    script('/gun-vfx.js', 'GunVFX').then(() => script('/gun-ui.js', 'GunUI')).catch(e => console.error('[MeetingUI local file]', e));
  }

  function openDoubleShot() {
    const hasDoubleShot = state.me?.modifiers?.some(
      modifier => modifier.id === 'double-shot'
    );

    if (!hasDoubleShot) return;

    const modal = $('double-shot-modal');
    const playerA = $('double-shot-player-a');
    const playerB = $('double-shot-player-b');
    const roleA = $('double-shot-role-a');
    const roleB = $('double-shot-role-b');

    if (!modal || !playerA || !playerB || !roleA || !roleB) return;



    const players = state.players.filter(
      p => p.id !== state.me.id && p.state === 'awake'
    );

    playerA.replaceChildren();
    playerB.replaceChildren();
    roleA.replaceChildren();
    roleB.replaceChildren();

    for (const player of players) {
      const optionA = el('option', '', player.username);
      optionA.value = player.id;

      const optionB = el('option', '', player.username);
      optionB.value = player.id;

      playerA.appendChild(optionA);
      playerB.appendChild(optionB);
    }

    const roles = state.roleChoices ?? state.gunRoles ?? [];

    for (const role of roles) {
      const roleId = typeof role === 'string' ? role : role.id;
      const roleTitle = typeof role === 'string'
        ? role
        : (role.name || role.displayName || role.title || role.id);

      const optionA = el('option', '', roleTitle);
      optionA.value = roleId;

      const optionB = el('option', '', roleTitle);
      optionB.value = roleId;

      roleA.appendChild(optionA);
      roleB.appendChild(optionB);
    }


    modal.hidden = false;
  }

  function closeDoubleShot() {
    const modal = $('double-shot-modal');

    if (modal) {
      modal.hidden = true;
    }
  }

  async function submitDoubleShot() {
    const playerA = $('double-shot-player-a');
    const playerB = $('double-shot-player-b');
    const roleA = $('double-shot-role-a');
    const roleB = $('double-shot-role-b');

    if (!playerA || !playerB || !roleA || !roleB) return;

    const targetAId = playerA.value;
    const targetBId = playerB.value;

    if (!targetAId || !targetBId) {
      error('Выбери две цели.');
      return;
    }

    if (targetAId === targetBId) {
      error('Нужно выбрать двух разных игроков.');
      return;
    }

    if (!roleA.value || !roleB.value) {
      error('Выбери обе роли.');
      return;
    }

    const gid = state.gameId;
    const mid = state.meeting?.id;

    acting = true;
    error('');
    render(true);
    footer();

    try {
      await send('game:ability', {
        ability: 'double-shot',
        targetId: targetAId,
        params: {
          targetBId,
          roleAGuess: roleA.value,
          roleBGuess: roleB.value
        }
      });

      if (state?.gameId === gid && state.meeting?.id === mid) {
        selectedId = null;
      }

      closeDoubleShot();
    } catch (e) {
      error(e.message);
      window.GameAudio?.play('error');
    } finally {
      acting = false;
      render(true);
      footer();
    }
  }

  return { init, update, setActions, getState: () => state, getGunShots: () => [...shots.values()], send: (event, payload) => send(event, payload) };
})();