 'use strict';
(() => {
  if (window.WinnerSkins) return;
  let readState = () => typeof state !== 'undefined' ? state : null;
  let block = null, signature = '', generation = 0;
  const cache = new Map();
  function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
  function image(src) {
    if (!cache.has(src)) cache.set(src, new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { cache.delete(src); resolve(null); };
      img.src = src;
    }));
    return cache.get(src);
  }
  async function draw(canvas, equipped, token) {
    const layers = [['player',equipped.color],['face',equipped.face],['glasses',equipped.glasses],['hats',equipped.hat]];
    const images = await Promise.all(layers.map(([folder,id]) => typeof id === 'string' && id ? image(`/assets/${folder}/${encodeURIComponent(id)}.png`) : Promise.resolve(null)));
    if (token !== generation) return;
    const context = canvas.getContext('2d'); if (!context) return;
    context.clearRect(0,0,canvas.width,canvas.height); context.imageSmoothingEnabled = false;
    const valid = images.filter(Boolean);
    if (!valid.length) {
      context.fillStyle = '#c5dfcb'; context.beginPath(); context.ellipse(80,88,42,50,0,0,Math.PI*2); context.fill();
      context.fillStyle = '#51715d'; context.font = 'bold 27px sans-serif'; context.textAlign = 'center'; context.fillText('?',80,98); return;
    }
    const width = Math.max(...valid.map(img => img.naturalWidth)), height = Math.max(...valid.map(img => img.naturalHeight));
    const scale = Math.min(2,canvas.width*.92/width,canvas.height*.92/height);
    for (const img of valid) {
      const w = Math.round(img.naturalWidth*scale), h = Math.round(img.naturalHeight*scale);
      context.drawImage(img,Math.round((canvas.width-w)/2),Math.round((canvas.height-h)/2),w,h);
    }
  }
  function ensureBlock() {
    const root = document.getElementById('round-result'); if (!root) return false;
    if (!document.getElementById('winner-skins-style')) {
      const link = el('link'); link.id = 'winner-skins-style'; link.rel = 'stylesheet'; link.href = '/winner-skins.css'; document.head.appendChild(link);
    }
    if (!block || !root.contains(block)) {
      block = el('section','winner-skins'); block.id = 'winner-skins'; block.setAttribute('aria-label','Скины победителей');
      const anchor = document.getElementById('result-reward') ?? document.getElementById('result-return');
      if (anchor?.parentNode === root) root.insertBefore(block,anchor); else root.appendChild(block);
      signature = '';
    }
    return true;
  }
  function refresh() {
    let s; try { s = readState(); } catch { return; }
    if (!s || s.phase !== 'finished' || s.result?.cancelled || !Array.isArray(s.result?.winnerIds) || !s.result.winnerIds.length) {
      if (block) block.hidden = true;
      if (signature) { signature = ''; generation++; }
      return;
    }
    if (!ensureBlock()) return;
    const players = new Map((s.players ?? []).map(player => [player.id,player]));
    const winners = [...new Set(s.result.winnerIds)].map(id => players.get(id)).filter(Boolean);
    block.hidden = !winners.length;
    const key = JSON.stringify([s.gameId,winners.map(player => [player.id,player.username,player.equipped])]);
    if (key === signature) return; signature = key; const token = ++generation;
    block.replaceChildren(); block.appendChild(el('h2','winner-skins-title',winners.length===1?'Победитель':'Победители'));
    const lineup = el('div','winner-skins-lineup'); block.appendChild(lineup);
    for (const player of winners) {
      const card = el('article','winner-skin-card');
      const canvas = el('canvas','winner-skin-canvas'); canvas.width = 160; canvas.height = 160; canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',`Скин ${player.username}`);
      card.appendChild(canvas); card.appendChild(el('span','winner-skin-name',player.username)); lineup.appendChild(card);
      void draw(canvas,player.equipped ?? {},token);
    }
  }
  window.WinnerSkins = { refresh, setStateReader(fn) { if (typeof fn !== 'function') throw new Error('Нужна функция чтения состояния.'); readState = fn; signature = ''; refresh(); } };
  setInterval(refresh,150); refresh();
})();
