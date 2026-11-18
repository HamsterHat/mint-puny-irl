'use strict';

window.CombatVFX = (() => {
  const cache = new Map();
  const seen = new Set();
  const queue = [];

  let gameId = null;
  let running = false;
  let generation = 0;

  const dialog = document.createElement('dialog');
  dialog.id = 'combat-vfx-dialog';
  dialog.setAttribute('aria-label', 'Игровая анимация');

  const canvas = document.createElement('canvas');
  dialog.appendChild(canvas);
  document.body.appendChild(dialog);

  const ctx = canvas.getContext('2d');

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
  });

  function resize() {
    canvas.width = Math.max(1, window.innerWidth);
    canvas.height = Math.max(1, window.innerHeight);
  }

  window.addEventListener('resize', resize);
  resize();

  function image(src) {
    if (!cache.has(src)) {
      cache.set(src, new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      }));
    }

    return cache.get(src);
  }

  async function loadSkin(player) {
    if (!player) return [];

    const e = player.equipped ?? {};

    const layers = [
      ['player', e.color],
      ['face', e.face],
      ['glasses', e.glasses],
      ['hats', e.hat]
    ];

    return (await Promise.all(layers.map(([folder, id]) => {
      if (typeof id !== 'string' || !id) return null;

      return image(
        `/assets/${folder}/${encodeURIComponent(id)}.png`
      );
    }))).filter(Boolean);
  }

  function drawSkin(layers, x, y, size, angle = 0, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;

    if (!layers.length) {
      ctx.fillStyle = '#73dc87';
      ctx.beginPath();
      ctx.ellipse(0, 0, size * .22, size * .38, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#15261b';
      ctx.fillRect(-size * .09, -size * .08, 5, 5);
      ctx.fillRect(size * .07, -size * .08, 5, 5);
    } else {
      const base = layers[0];
      const scale = size / Math.max(
        base.naturalWidth,
        base.naturalHeight
      );

      for (const img of layers) {
        const width = img.naturalWidth * scale;
        const height = img.naturalHeight * scale;
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
      }
    }

    ctx.restore();
  }

  function text(value, x, y, size = 22, color = '#102819') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function playTimeline(duration, draw, token) {
    return new Promise(resolve => {
      const start = performance.now();

      function frame(time) {
        if (token !== generation) {
          resolve();
          return;
        }

        const t = Math.min(1, (time - start) / duration);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        draw(t);

        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }

      requestAnimationFrame(frame);
    });
  }

  async function lull(event, duration, token) {
    const [attacker, target] = await Promise.all([
      loadSkin(event.attacker),
      loadSkin(event.target)
    ]);

    if (token !== generation) return;

    if (event.outcome === 'sleep') {
      window.GameAudio?.play('lull');
    }

    // Дискретные позы: подготовка, движение, атака, реакция.
    const poses = [
      [0, 0, 0],
      [4, 0, 0],
      [9, 0, 0],
      [12, 0, 0],
      [5, .15, 8],
      [0, .45, 20],
      [0, .85, 35],
      [0, 1.1, 42],
      [0, 1.1, 42],
      [0, 1.1, 42]
    ];

    await playTimeline(duration, t => {
      const w = canvas.width;
      const h = canvas.height;
      const bandH = Math.min(350, h * .55);
      const y = (h - bandH) / 2;

      const slide = t < .12
        ? 1 - t / .12
        : t > .88
          ? (t - .88) / .12
          : 0;

      const offset = slide * w;

      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(offset, 0);

      ctx.fillStyle = '#3f965e';
      ctx.fillRect(0, y - 16, w, bandH + 32);

      ctx.fillStyle = '#43ca76';
      ctx.fillRect(0, y, w, bandH);

      const index = Math.min(
        poses.length - 1,
        Math.floor(t * poses.length)
      );

      const [recoil, tilt, drop] = poses[index];
      const hit = index >= 4;
      const asleep = event.outcome === 'sleep';

      const left = w * .25;
      const right = w * .75;
      const centerY = h / 2;
      const size = Math.min(210, bandH * .7, w * .30);

      if (event.attacker) {
        drawSkin(attacker, left - recoil, centerY, size);

        text(
          event.attacker.username,
          left,
          y + bandH - 15,
          Math.min(20, w / 30)
        );

        // Условное устройство усыпления между персонажами.
        ctx.fillStyle = '#172b26';
        ctx.fillRect(left + size * .25, centerY - 15, size * .35, 16);
        ctx.fillRect(left + size * .25, centerY - 5, 12, 35);

        if (index === 3 || index === 4) {
          ctx.fillStyle = '#e9ffe3';
          ctx.beginPath();
          ctx.arc(left + size * .65, centerY - 7, 15, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        text('СОН ПОДКРАЛСЯ', left, centerY, Math.min(24, w / 25));
      }

      drawSkin(
        target,
        right,
        centerY + (asleep && hit ? drop : 0),
        size,
        asleep && hit ? tilt : 0
      );

      text(
        event.target?.username ?? '',
        right,
        y + bandH - 15,
        Math.min(20, w / 30)
      );

      if (hit && !asleep) {
        ctx.strokeStyle = '#d7fbff';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(
          right, centerY,
          size * .48, size * .6,
          0, 0, Math.PI * 2
        );
        ctx.stroke();

        text(
          event.outcome === 'shield' ? 'ЩИТ' : 'ИММУНИТЕТ',
          right,
          centerY - size * .65,
          24,
          '#efffff'
        );
      }

      if (asleep && index >= 7) {
        text('Z z z', right + size * .25, centerY - size * .35, 28);
      }

      ctx.restore();
    }, token);
  }

  async function explosion(event, duration, token) {
    const rocket = event.type === 'rocket';

    const particles = Array.from({ length: rocket ? 100 : 65 }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: .25 + Math.random() * .75,
      size: 3 + Math.random() * 12,
      smoke: Math.random() > .55
    }));

    let sounded = false;

    await playTimeline(duration, t => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w * .5;
      const cy = h * .52;
      const hitAt = rocket ? .25 : .08;
      const p = Math.max(0, (t - hitAt) / (1 - hitAt));

      ctx.fillStyle = `rgba(10,20,15,${Math.min(.8, t * 4)})`;
      ctx.fillRect(0, 0, w, h);

      if (rocket && t < hitAt) {
        const travel = t / hitAt;

        ctx.save();
        ctx.translate(
          w * .12 + w * .38 * travel,
          -80 + (cy + 80) * travel
        );
        ctx.rotate(-.4);

        ctx.fillStyle = '#dce5d9';
        ctx.fillRect(-12, -50, 24, 70);

        ctx.fillStyle = '#72cc7c';
        ctx.beginPath();
        ctx.moveTo(-12, -50);
        ctx.lineTo(0, -73);
        ctx.lineTo(12, -50);
        ctx.fill();

        ctx.fillStyle = '#ffb647';
        ctx.fillRect(-8, 20, 16, 35);
        ctx.restore();

        return;
      }

      if (p <= 0) return;

      if (!sounded) {
        sounded = true;
        window.GameAudio?.play(rocket ? 'rocket' : 'shot');
      }

      ctx.save();

      const shake = (1 - p) * 12;
      ctx.translate(
        (Math.random() - .5) * shake,
        (Math.random() - .5) * shake
      );

      const radius = Math.min(w, h) * p * 1.2;

      ctx.strokeStyle = `rgba(190,255,206,${1 - p})`;
      ctx.lineWidth = 8 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      for (const particle of particles) {
        const distance = radius * particle.speed;
        const x = cx + Math.cos(particle.angle) * distance;
        const y = cy + Math.sin(particle.angle) * distance + p * p * 100;

        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.fillStyle = particle.smoke ? '#708075' : '#ffd46b';

        ctx.beginPath();
        ctx.arc(
          x, y,
          particle.size * (particle.smoke ? 1 + p * 5 : 1),
          0, Math.PI * 2
        );
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      const flash = Math.max(0, 1 - p * 6);
      ctx.fillStyle = `rgba(234,255,222,${flash})`;
      ctx.fillRect(-20, -20, w + 40, h + 40);

      ctx.restore();

      if (p > .45) {
        text(
          rocket ? 'РАКЕТНЫЙ УДАР' : 'ВЗРЫВ МИН',
          cx,
          h * .8,
          Math.min(34, w / 18),
          '#e8ffec'
        );
      }
    }, token);
  }

  async function drain() {
    if (running) return;
    running = true;

    const token = generation;

    try {
      while (queue.length && token === generation) {
        const event = queue.shift();
        const duration = event.duration ?? 1800;

        resize();
        if (!dialog.open) dialog.showModal();

        if (event.type === 'lull') {
          await lull(event, duration, token);
        } else {
          await explosion(event, duration, token);
        }
      }
    } catch (error) {
      console.error('[CombatVFX]', error);
    } finally {
      running = false;
      if (dialog.open) dialog.close();
      if (queue.length) void drain();
    }
  }

  function observe(state) {
    if (!state) return;

    if (gameId !== state.gameId) {
      gameId = state.gameId;
      generation++;
      queue.length = 0;
      seen.clear();
      if (dialog.open) dialog.close();
    }

    for (const event of state.visualEvents ?? []) {
      if (event.type === 'lull' && event.outcome !== 'sleep') continue;
      if (seen.has(event.id)) continue;
      seen.add(event.id);

      if (
        state.serverTime >= event.time + event.duration ||
        !['lull', 'sapper', 'rocket'].includes(event.type)
      ) continue;

      queue.push(event);
    }

    while (seen.size > 300) {
      seen.delete(seen.values().next().value);
    }

    void drain();
  }

  return { observe };
})();