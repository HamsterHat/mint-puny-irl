 'use strict';
window.GameAudio = (() => {
  const names = ['click', 'error', 'task', 'lull', 'shot', 'tea', 'emergency', 'report', 'rocket', 'wifi', 'repair', 'eject', 'splash', 'round-start', 'round-end', 'vote'];
  const buffers = new Map();
  const loading = new Map();
  let context = null, master = null, previous = null, alarmAt = 0;
  let enabled = true;
  try { enabled = localStorage.getItem('punya-sound') !== 'off'; } catch {}
  function refreshButton() {
    const button = document.getElementById('sound-button');
    if (!button) return;
    button.textContent = enabled ? '🔊 Звук' : '🔇 Звук';
    button.setAttribute('aria-pressed', String(enabled));
  }
  function load(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (loading.has(name)) return loading.get(name);
    const promise = fetch(`/assets/sounds/${name}.wav`, { cache: 'force-cache' })
      .then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer(); })
      .then(bytes => context.decodeAudioData(bytes))
      .then(buffer => { buffers.set(name, buffer); return buffer; })
      .catch(error => { console.warn('[sound]', name, error.message); return null; });
    loading.set(name, promise);
    return promise;
  }
  function unlock() {
    if (!enabled) return;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0.42;
        master.connect(context.destination);
        names.forEach(load);
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch (error) { console.warn('[audio]', error); }
  }
  async function play(name) {
    if (!enabled || !context || context.state !== 'running') return;
    const buffer = await load(name);
    if (!buffer || !enabled || context.state !== 'running') return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    source.start();
    source.onended = () => source.disconnect();
  }
  function observe(state) {
    const key = state.gameId ?? 'game';
    const same = previous && previous.gameId === key;
    if (same) {
      if (previous.phase !== 'playing' && state.phase === 'playing') play('round-start');
      if (previous.phase !== 'finished' && state.phase === 'finished') play('round-end');
      if (state.meeting && previous.meetingId !== state.meeting.id) play(state.meeting.reason === 'report' ? 'report' : 'emergency');
      const result = state.meetingResult;
      if (result && previous.resultId !== result.id && state.serverTime < result.animateUntil && result.exiledId !== null) {
        play('eject');
        const delay = Math.max(0, Math.min(3000, result.animateUntil - state.serverTime - 800));
        const token = key;
        setTimeout(() => { if (previous?.gameId === token) play('splash'); }, delay);
      }
      if (!previous.wifi && state.wifi) play('wifi');
      if (previous.rocket && !state.rocket && state.phase === 'playing') play('repair');
    }
    if (same && state.phase === 'playing' && state.rocket && Date.now() - alarmAt > 2500) {
      alarmAt = Date.now(); play('rocket');
    }
    previous = { gameId: key, phase: state.phase, meetingId: state.meeting?.id ?? null, resultId: state.meetingResult?.id ?? null, rocket: Boolean(state.rocket), wifi: Boolean(state.wifi) };
  }
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  const button = document.getElementById('sound-button');
  button?.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('punya-sound', enabled ? 'on' : 'off'); } catch {}
    if (master) master.gain.value = enabled ? 0.42 : 0;
    if (enabled) { unlock(); play('click'); }
    refreshButton();
  });
  refreshButton();
  return { unlock, play, observe };
})();
