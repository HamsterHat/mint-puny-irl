 'use strict';
(() => {
  if (window.IntroAudio) return;
  const roles = new Set(['puny','policeman','technician','spy','judge','lawyer','mint-punya','mint-cook','glitch','jester','alarm', 'hacker','mint-punik', 'blackjack', 'chemist', 'executioner', 'headhunter', 'menthol', 'sapper', 'tracker', 'veteran']);
  const raw = new Map(), decoded = new Map();
  let context = null, output = null, active = null, phaseKey = null, playedKey = null, loadingKey = null;
  let forcedEnabled = null, hint = null, observer = null, observedRoot = null, timer = null;
  let lastServerTime = null, localOffset = 0;
  const warned = new Set();
  let stateReader = () => typeof state !== 'undefined' ? state : null;
  const $ = id => document.getElementById(id);
  function enabled() {
    if (forcedEnabled !== null) return forcedEnabled;
    return $('sound-button')?.getAttribute('aria-pressed') !== 'false';
  }
  function snapshot() { try { return stateReader(); } catch { return null; } }
  function clock(s) {
    if (typeof clockOffset === 'number' && Number.isFinite(clockOffset)) return Date.now() + clockOffset;
    if (s.serverTime !== lastServerTime && Number.isFinite(s.serverTime)) { lastServerTime = s.serverTime; localOffset = s.serverTime - Date.now(); }
    return Date.now() + localOffset;
  }
  function visible(node) { return Boolean(node && !node.hidden && getComputedStyle(node).display !== 'none'); }
  function phase() {
    const s = snapshot(), root = $('round-intro');
    if (!s || s.phase !== 'intro' || !s.intro || !visible(root)) return null;
    let kind, start, end, file;
    if (visible($('intro-role'))) {
      kind = 'role'; start = s.intro.factionEndsAt; end = s.intro.endsAt;
      const id = s.me?.role?.id ?? s.me?.roleId;
      if (roles.has(id)) file = id;
      else {
        const key = `${s.gameId}:${String(id)}`;
        if (!warned.has(key)) { warned.add(key); console.warn('[IntroAudio] Не найден ID роли в state.me.role.id:', id); }
      }
    } else if (visible($('intro-faction'))) {
      kind = 'faction'; start = s.intro.shushEndsAt; end = s.intro.factionEndsAt; file = 'faction';
    } else if (visible($('intro-shush'))) {
      kind = 'shush'; start = s.intro.shushEndsAt - 2000; end = s.intro.shushEndsAt; file = 'shush';
    } else return null;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { key: `${s.gameId}:${kind}:${file ?? 'unknown'}`, file, start, end, now: clock(s) };
  }
  function rawBuffer(file) {
    if (!raw.has(file)) {
      const promise = fetch(`/assets/audio/intro/${encodeURIComponent(file)}.wav`, { cache: 'force-cache' })
        .then(response => { if (!response.ok) throw new Error(`Audio HTTP ${response.status}`); return response.arrayBuffer(); })
        .catch(error => { raw.delete(file); throw error; });
      raw.set(file, promise);
    }
    return raw.get(file);
  }
  async function buffer(file) {
    if (!decoded.has(file)) {
      const promise = rawBuffer(file).then(data => context.decodeAudioData(data.slice(0))).catch(error => { decoded.delete(file); throw error; });
      decoded.set(file, promise);
    }
    return decoded.get(file);
  }
  function stop(fade = .055) {
    const item = active; active = null;
    if (!item || !context) return;
    const t = context.currentTime;
    try {
      item.gain.gain.cancelScheduledValues(t);
      item.gain.gain.setValueAtTime(Math.max(0, item.gain.gain.value), t);
      item.gain.gain.linearRampToValueAtTime(0, t + fade);
      item.source.stop(t + fade + .015);
    } catch {}
  }
  async function tryStart(p) {
    if (!p?.file || !context || context.state !== 'running' || !enabled() || document.hidden || playedKey === p.key || loadingKey === p.key) return;
    loadingKey = p.key;
    try {
      const audio = await buffer(p.file), current = phase();
      if (!current || current.key !== p.key || phaseKey !== p.key || !enabled() || document.hidden || context.state !== 'running') return;
      const offset = Math.max(0, (current.now - current.start) / 1000);
      const duration = Math.min(audio.duration - offset, (current.end - current.now) / 1000);
      if (duration <= .045) { playedKey = p.key; return; }
      if (playedKey === p.key) return;
      stop();
      const source = context.createBufferSource(), gain = context.createGain(); source.buffer = audio;
      source.connect(gain); gain.connect(output);
      const at = context.currentTime, attack = Math.min(.025, duration / 3), release = Math.min(.12, duration / 3);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(1, at + attack);
      gain.gain.setValueAtTime(1, at + duration - release); gain.gain.linearRampToValueAtTime(0, at + duration);
      const item = { source, gain, key: p.key }; active = item;
      source.onended = () => { try { source.disconnect(); gain.disconnect(); } catch {} if (active === item) active = null; };
      source.start(at, offset, duration); source.stop(at + duration + .02); playedKey = p.key;
    } catch (error) { console.warn('[IntroAudio]', error); }
    finally { if (loadingKey === p.key) loadingKey = null; }
  }
  function refreshHint(p) {
    if (!hint) return;
    const show = Boolean(p && enabled() && (!context || context.state !== 'running') && !document.hidden);
    if (hint.hidden === show) hint.hidden = !show;
  }
  function sync() {
    const root = $('round-intro');
    if (root && root !== observedRoot) {
      observer?.disconnect(); observedRoot = root;
      observer = new MutationObserver(sync); observer.observe(root, { attributes: true, subtree: true, attributeFilter: ['hidden','class','style'] });
    }
    const s = snapshot(), role = s?.me?.role?.id ?? s?.me?.roleId;
    if (s?.phase === 'intro' && roles.has(role)) rawBuffer(role).catch(() => {});
    const p = phase(), key = p?.key ?? null;
    if (key !== phaseKey) { stop(); phaseKey = key; playedKey = null; }
    if (!enabled() || document.hidden) { stop(); playedKey = null; }
    else if (p) void tryStart(p);
    refreshHint(p);
  }
  async function unlock() {
    if (!enabled()) return;
    try {
      if (!context || context.state === 'closed') {
        const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return;
        context = new Audio({ latencyHint: 'interactive' }); output = context.createGain(); output.gain.value = .72; output.connect(context.destination);
        context.addEventListener('statechange', sync);
      }
      if (context.state !== 'running') await context.resume();
      sync();
    } catch (error) { console.warn('[IntroAudio unlock]', error); }
  }
  function boot() {
    hint = document.createElement('button'); hint.id = 'intro-audio-unlock'; hint.type = 'button'; hint.hidden = true;
    hint.textContent = '🔊 Нажми, чтобы включить звуки интро';
    hint.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:350;padding:11px 16px;border:2px solid #92b6a0;border-radius:14px;background:#fffef5;color:#344e43;font:14px sans-serif;box-shadow:3px 4px 0 #45654a33;cursor:pointer;';
    document.body.appendChild(hint); hint.addEventListener('click', unlock);
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', event => { if (['Enter',' ','Spacebar'].includes(event.key)) void unlock(); }, { capture: true });
    document.addEventListener('visibilitychange', sync);
    const sound = $('sound-button'); if (sound) new MutationObserver(sync).observe(sound, { attributes: true, attributeFilter: ['aria-pressed'] });
    for (const file of ['shush','faction']) rawBuffer(file).catch(() => {});
    timer = setInterval(sync, 80); sync();
  }
  window.IntroAudio = {
    unlock,
    setEnabled(value) { forcedEnabled = Boolean(value); sync(); },
    followSoundButton() { forcedEnabled = null; sync(); },
    setVolume(value) { if (output && Number.isFinite(value)) output.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), context.currentTime, .04); },
    setStateReader(fn) { if (typeof fn !== 'function') throw new Error('Ожидалась функция чтения состояния.'); stateReader = fn; sync(); },
    stop() { stop(); },
    status() { return { audioState: context?.state ?? 'locked', phaseKey, playedKey, enabled: enabled(), loaded: [...decoded.keys()] }; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
