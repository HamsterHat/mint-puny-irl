'use strict';

/* ==================== Вспомогательные функции ==================== */

const $ = id => document.getElementById(id);

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function cloneTemplate(id) {
  return $(id).content.firstElementChild.cloneNode(true);
}

function showEmpty(container, text) {
  const element = cloneTemplate('empty-template');

  element.textContent = text;
  container.appendChild(element);
}

/* ==================== Состояние ==================== */

const CATEGORIES = [
  'colors',
  'faces',
  'hats',
  'glasses',
  'badges',
  'pets',
  'rolepoints',
  'chests'
];

const EQUIPMENT = {
  colors: 'color',
  faces: 'face',
  hats: 'hat',
  glasses: 'glasses',
  badges: 'badge'
};

const FOLDERS = {
  colors: 'player',
  faces: 'face',
  hats: 'hats',
  glasses: 'glasses',
  badges: 'badges',
  pets: 'pets',
  rolepoints: 'rolepoints',
  chests: 'chests'
};

const EMPTY_EQUIPMENT = {
  hat: 'no_hat',
  glasses: 'not_a_glasses'
};

let user = null;
let socket = null;

let authBusy = false;
let chatReady = false;
let chatSending = false;
let equipmentBusy = false;
let moderationNotice = null;

let shopCategory = 'hats';

const catalog = {};
const indexes = {};

const pendingPurchases = new Set();
const pendingChests = new Set();
const pendingModeration = new Set();

const imageCache = new Map();
const renderVersions = new WeakMap();
const players = new Map();
const chatIds = new Set();

for (const category of CATEGORIES) {
  catalog[category] = [];
  indexes[category] = new Map();
}

const shopDialog = $('shop-dialog');
const messageDialog = $('message-dialog');

/*
 * Блокируем обычную отправку форм сразу.
 * Остальная логика вызывается через функции ниже.
 */

$('auth-form').addEventListener('submit', event => {
  event.preventDefault();
  authenticate('/api/login');
});

$('chat-form').addEventListener('submit', event => {
  event.preventDefault();
  sendChat();
});

/* ==================== Окна ==================== */

function showMessage(title, text) {
  if (shopDialog.open) {
    shopDialog.close();
  }

  $('message-title').textContent = title;
  $('message-text').textContent = String(text ?? '');

  if (!messageDialog.open) {
    messageDialog.showModal();
  }
}

$('message-close').addEventListener('click', () => {
  messageDialog.close();
});

$('shop-close').addEventListener('click', () => {
  shopDialog.close();
});

$('btn-shop').addEventListener('click', () => {
  if (!user) return;

  renderStore();

  if (!shopDialog.open) {
    shopDialog.showModal();
  }
});

/* ==================== Вкладки ==================== */

document.querySelectorAll('[data-category]').forEach(button => {
  button.addEventListener('click', () => {
    const category = button.dataset.category;

    document.querySelectorAll('[data-category]').forEach(tab => {
      tab.setAttribute(
        'aria-pressed',
        String(tab.dataset.category === category)
      );
    });

    document.querySelectorAll('[data-panel]').forEach(panel => {
      panel.hidden = panel.dataset.panel !== category;
    });
  });
});

document.querySelectorAll('[data-shop-category]').forEach(button => {
  button.addEventListener('click', () => {
    shopCategory = button.dataset.shopCategory;
    renderStore();
  });
});

document.querySelectorAll('[data-social]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-social]').forEach(tab => {
      const selected = tab === button;

      tab.setAttribute('aria-pressed', String(selected));
      $(tab.dataset.social).hidden = !selected;
    });

    if (button.dataset.social === 'chat-panel') {
      scrollChat();
    }
  });
});

/* ==================== HTTP ==================== */

async function request(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
      signal: controller.signal
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Сервер вернул некорректный ответ (${response.status}).`
      );
    }

    if (!response.ok || data?.error) {
      throw new Error(
        data?.error || `Ошибка запроса: ${response.status}.`
      );
    }

    return data;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        'Сервер не ответил вовремя. Операция могла выполниться. ' +
        'Проверь баланс и инвентарь перед повтором.'
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        'Нет связи с сервером. Проверь подключение к локальной сети.'
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/* ==================== Авторизация ==================== */

$('btn-reg').addEventListener('click', () => {
  if ($('auth-form').reportValidity()) {
    authenticate('/api/register');
  }
});

async function authenticate(url) {
  if (authBusy) return;

  const username = $('username-in').value.trim();

  // Пароль не обрезаем и не преобразуем.
  const password = $('password-in').value;

  if (!username || !password) {
    showMessage('Вход', 'Заполни никнейм и пароль.');
    return;
  }

  authBusy = true;

  $('btn-login').disabled = true;
  $('btn-reg').disabled = true;

  try {
    const account = await request(url, {
      username,
      password
    });

    if (account.internalScreen) {
      location.assign('/internal.html');
      return;
    }

    await loadCatalog();

    $('auth-screen').hidden = true;
    $('app').hidden = false;
    $('password-in').value = '';

    applyAccount(account);
    connectSocket();
  } catch (error) {
    console.error('[auth]', error);
    showMessage('Вход', error.message);
  } finally {
    authBusy = false;

    $('btn-login').disabled = false;
    $('btn-reg').disabled = false;
  }
}

/* ==================== Каталог и аккаунт ==================== */

async function loadCatalog() {
  const data = await request('/api/economy/shop');

  for (const category of CATEGORIES) {
    catalog[category] = Array.isArray(data[category])
      ? data[category]
      : [];

    indexes[category] = new Map(
      catalog[category].map(item => [item.id, item])
    );
  }
}

function applyAccount(account) {
  if (!account || typeof account.username !== 'string') return;

  user = account;

  $('player-nick').textContent = user.username;
  $('user-balance').textContent = user.coins ?? 0;
  $('user-punium').textContent = user.punium ?? 0;

  renderInventory();
  drawPlayer($('my-canvas'), user.equipped);

  if (shopDialog.open) {
    renderStore();
  }
}

function owns(category, id) {
  const inventory = user?.inventory?.[category];

  return Array.isArray(inventory) && inventory.includes(id);
}

function count(category, id) {
  const storage = user?.inventory?.[category];

  return storage && has(storage, id)
    ? storage[id]
    : 0;
}

function asset(category, item) {
  const fallback =
    `/assets/${FOLDERS[category]}/${encodeURIComponent(item.id)}.png`;

  try {
    const url = new URL(item.asset || fallback, location.href);

    return url.origin === location.origin
      ? url.href
      : fallback;
  } catch {
    return fallback;
  }
}

function itemCard(category, item) {
  const card = cloneTemplate('item-template');
  const image = card.querySelector('.item-preview');

  image.src = asset(category, item);

  image.addEventListener('error', () => {
    image.hidden = true;
  }, { once: true });

  card.querySelector('.item-name').textContent =
    item.name || item.id;

  return card;
}

/* ==================== Инвентарь ==================== */

function renderInventory() {
  if (!user) return;

  for (const category of CATEGORIES) {
    const container = $(`inventory-${category}`);

    container.replaceChildren();

    const stackable =
      category === 'chests' ||
      category === 'rolepoints';

    for (const item of catalog[category]) {
      if (stackable) {
        const amount = count(category, item.id);

        if (!amount) continue;

        const card = itemCard(category, item);

        card.querySelector('.item-count').textContent =
          `Количество: ${amount}`;

        const actions = card.querySelector('.item-actions');

        if (category === 'chests') {
          const button = document.createElement('button');

          button.type = 'button';
          button.textContent = pendingChests.has(item.id)
            ? 'Открываем…'
            : 'Открыть';

          button.disabled = pendingChests.has(item.id);

          button.addEventListener('click', () => {
            openChest(item.id);
          });

          actions.appendChild(button);
        } else {
          actions.textContent = 'Билет роли';
        }

        container.appendChild(card);
        continue;
      }

      if (!owns(category, item.id)) continue;

      const button = cloneTemplate('cosmetic-template');
      const slot = EQUIPMENT[category];

      const preview = button.querySelector('.cosmetic-preview');

      preview.src = asset(category, item);

      preview.addEventListener('error', () => {
        preview.hidden = true;
      }, { once: true });

      button.querySelector('.cosmetic-name').textContent =
        item.name || item.id;

      if (slot) {
        const equipped = user.equipped[slot] === item.id;

        button.classList.toggle('equipped', equipped);
        button.setAttribute('aria-pressed', String(equipped));

        button.addEventListener('click', () => {
          equip(category, item.id);
        });
      } else {
        button.disabled = true;
        button.title = 'Использование в матче пока не реализовано.';
      }

      container.appendChild(button);
    }

    if (!container.children.length) {
      showEmpty(container, 'Пока пусто. Загляни в магазин.');
    }
  }
}

function equip(category, id) {
  if (!user || equipmentBusy) return;

  if (!socket?.connected || !chatReady) {
    showMessage('Внешность', 'Дождись подключения к лобби.');
    return;
  }

  const slot = EQUIPMENT[category];

  if (!slot || !owns(category, id)) return;

  if (user.equipped[slot] === id) {
    const empty = EMPTY_EQUIPMENT[slot];

    if (!empty || !owns(category, empty)) return;

    id = empty;
  }

  equipmentBusy = true;

  socket.timeout(10000).emit(
    'update_skin',
    {
      equipped: {
        ...user.equipped,
        [slot]: id
      }
    },
    (error, result) => {
      equipmentBusy = false;

      if (error) {
        showMessage(
          'Внешность',
          'Сервер не подтвердил изменение внешности.'
        );
      } else if (result?.error) {
        showMessage('Внешность', result.error);
      }
    }
  );
}

/* ==================== Магазин ==================== */

function priceFor(item, payment) {
  const field = payment === 'coins'
    ? 'coinsPrice'
    : 'puniumPrice';

  let price = item[field];

  if (
    price === undefined &&
    has(item, 'price') &&
    (item.currency ?? 'coins') === payment
  ) {
    price = item.price;
  }

  return Number.isSafeInteger(price) && price >= 0
    ? price
    : null;
}

function renderStore() {
  if (!user) return;

  const container = $('store-items');

  container.replaceChildren();

  document.querySelectorAll('[data-shop-category]').forEach(button => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.shopCategory === shopCategory)
    );
  });

  const category = shopCategory;

  const stackable =
    category === 'chests' ||
    category === 'rolepoints';

  for (const item of catalog[category]) {
    const card = itemCard(category, item);
    const actions = card.querySelector('.item-actions');

    const key = `${category}:${item.id}`;
    const pending = pendingPurchases.has(key);

    if (stackable) {
      card.querySelector('.item-count').textContent =
        `В инвентаре: ${count(category, item.id)}`;
    } else if (owns(category, item.id)) {
      actions.textContent = 'Получено';
      container.appendChild(card);
      continue;
    }

    for (const payment of ['coins', 'punium']) {
      const price = priceFor(item, payment);

      if (price === null) continue;

      const button = cloneTemplate('price-template');
      const image = button.querySelector('img');

      image.src = payment === 'coins'
        ? '/assets/ui/coin.png'
        : '/assets/ui/punium.png';

      image.alt = payment === 'coins'
        ? 'Коины'
        : 'Пуниум';

      button.querySelector('span').textContent = pending
        ? 'Покупка…'
        : String(price);

      button.disabled =
        pending ||
        (user[payment] ?? 0) < price;

      button.addEventListener('click', () => {
        buy(category, item.id, payment);
      });

      actions.appendChild(button);
    }

    if (!actions.children.length) {
      actions.textContent = 'Не продаётся';
    }

    container.appendChild(card);
  }

  if (!container.children.length) {
    showEmpty(container, 'В этой категории пока нет предметов.');
  }
}

async function buy(category, itemId, payment) {
  const key = `${category}:${itemId}`;

  if (!user || pendingPurchases.has(key)) return;

  pendingPurchases.add(key);
  renderStore();

  try {
    const result = await request('/api/economy/buy', {
      category,
      itemId,
      payment
    });

    applyAccount(result.user);
  } catch (error) {
    console.error('[buy]', error);
    showMessage('Магазин', error.message);
  } finally {
    pendingPurchases.delete(key);

    if (shopDialog.open) {
      renderStore();
    }
  }
}

/* ==================== Сундуки ==================== */

function rewardText(reward) {
  if (reward.category === 'coins') {
    return `${reward.amount} коинов`;
  }

  if (reward.category === 'punium') {
    return `${reward.amount} пуниума`;
  }

  const item = indexes[reward.category]?.get(reward.id);
  const name = item?.name || reward.id;

  if (reward.duplicate) {
    return `${name} — уже есть, без компенсации`;
  }

  return `${name}${reward.amount > 1 ? ` ×${reward.amount}` : ''}`;
}

async function openChest(chestId) {
  if (!user || pendingChests.has(chestId)) return;

  pendingChests.add(chestId);
  renderInventory();

  try {
    const result = await request('/api/economy/open', {
      chestId
    });

    applyAccount(result.user);

    const chest = indexes.chests.get(chestId);
    const rewards = Array.isArray(result.rewards)
      ? result.rewards
      : [];

    showMessage(
      chest?.name || 'Сундук открыт',
      rewards.length
        ? rewards.map(reward => `• ${rewardText(reward)}`).join('\n')
        : 'На этот раз наград нет.'
    );
  } catch (error) {
    console.error('[openChest]', error);
    showMessage('Сундук', error.message);
  } finally {
    pendingChests.delete(chestId);
    renderInventory();
  }
}

/* ==================== Socket.IO ==================== */

function connectionStatus(text) {
  $('connection-status').textContent = text;
}

function connectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  chatReady = false;
  chatSending = false;
  equipmentBusy = false;
  moderationNotice = null;

  updateChatControls();

  if (typeof io !== 'function') {
    connectionStatus('Socket.IO не загружен');

    showMessage(
      'Соединение',
      'Не загрузился /socket.io/socket.io.js. Открой сайт через сервер.'
    );

    return;
  }

  const connection = io({
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  socket = connection;

  connection.on('connect', () => {
    chatReady = false;
    moderationNotice = null;

    updateChatControls();
    connectionStatus('Вход в лобби…');
    RPointsUI.mount({ socket, mode: 'lobby' });

    connection.timeout(10000).emit(
      'join_lobby',
      {},
      (error, result) => {
        if (socket !== connection) return;

        if (error) {
          connectionStatus('Нет подтверждения входа');

          showMessage(
            'Лобби',
            'Сервер не подтвердил вход в лобби.'
          );

          return;
        }

        if (result?.error) {
          chatReady = false;
          updateChatControls();
          connectionStatus('Не удалось войти в лобби');
        }
      }
    );
  });

  connection.on('account_update', applyAccount);
  connection.on('lobby_update', renderLobby);

  connection.on('lobby_error', message => {
    chatReady = false;
    updateChatControls();

    connectionStatus('Не удалось войти в лобби');
    showMessage('Лобби', message);
  });

  connection.on('chat_history', history => {
    if (!Array.isArray(history)) return;

    $('chat-messages').replaceChildren();
    chatIds.clear();

    history.forEach(renderChatMessage);

    chatReady = true;
    updateChatControls();

    connectionStatus('В лобби');
    scrollChat();
  });

  connection.on('chat_message', renderChatMessage);

  connection.on('moderation_notice', notice => {
    moderationNotice = notice;

    chatReady = false;
    updateChatControls();
    renderLobby([]);

    const banned = notice.action === 'ban';
    const isUno = notice.action === 'uno';
    if (!isUno) {
      connectionStatus(
        banned
          ? 'Ты забанен в лобби'
          : 'Ты исключён из лобби'
      );
    } else {connectionStatus('Ты попал под действие карты UNO реверс!');}
    if(!isUno) {
      showMessage(
        banned ? 'Бан' : 'Исключение',
        banned
          ? `Тебя забанил ${notice.by}. Бан действует до перезапуска сервера.`
          : `Тебя исключил ${notice.by}. Для повторного входа обнови страницу.`
      );
    } else {showMessage('UNO Reverse!', "Ты испарился потому что попытался изгнать(или даже забанить) Лёшу!")}

  });

  connection.on('disconnect', (reason, details) => {
    chatReady = false;
    updateChatControls();

    console.warn('[Socket.IO disconnect]', {
      reason,
      message: details?.message,
      description: details?.description,
      context: details?.context
    });

    if (moderationNotice) return;

    if (reason === 'io server disconnect') {
      connectionStatus('Соединение закрыто сервером');
    } else {
      connectionStatus(`Соединение потеряно: ${reason}`);
    }
  });

  connection.on('connect_error', error => {
    chatReady = false;
    updateChatControls();

    connectionStatus('Нет связи с сервером');
    console.error('[Socket.IO connect_error]', error);

    if (!connection.active) {
      showMessage(
        'Соединение',
        `${error.message}\nОбнови страницу и войди заново.`
      );
    }
  });




  connection.on('game:open', () => {
    location.href = '/ingame.html';
  });


  connection.connect();
}

/* ==================== Игроки и хост ==================== */

function renderLobby(list) {
  if (!Array.isArray(list)) return;

  const container = $('lobby-players');
  const active = new Set();

  const amHost = list.some(player =>
    player.username === user?.username && player.isHost
  );

  for (const player of list) {
    if (!player || typeof player.username !== 'string') continue;

    active.add(player.username);

    let slot = players.get(player.username);

    if (!slot) {
      const element = cloneTemplate('player-template');

      element.querySelector('.player-name').textContent =
        player.username;

      element.querySelector('.kick-button').addEventListener(
        'click',
        () => moderatePlayer(player.username, 'kick')
      );

      element.querySelector('.ban-button').addEventListener(
        'click',
        () => moderatePlayer(player.username, 'ban')
      );

      slot = {
        element,
        canvas: element.querySelector('canvas'),
        signature: ''
      };

      players.set(player.username, slot);
    }

    slot.element.querySelector('.host-crown').hidden =
      !player.isHost;

    slot.element.querySelector('.player-moderation').hidden =
      (!amHost && user?.username != "Alex") || player.username === user?.username;

    slot.element.querySelectorAll('.player-moderation button')
      .forEach(button => {
        button.disabled = pendingModeration.has(player.username);
      });

    container.appendChild(slot.element);

    const signature = JSON.stringify(player.equipped);

    if (signature !== slot.signature) {
      slot.signature = signature;
      drawPlayer(slot.canvas, player.equipped);
    }
  }

  for (const [username, slot] of players) {
    if (active.has(username)) continue;

    slot.element.remove();
    players.delete(username);
  }

  $('players-count').textContent = active.size;
  $('btn-start').disabled = !amHost;
}

function moderatePlayer(username, action) {
  if (
    !socket?.connected ||
    !chatReady ||
    pendingModeration.has(username)
  ) {
    return;
  }

  pendingModeration.add(username);

  players.get(username)?.element
    .querySelectorAll('.player-moderation button')
    .forEach(button => {
      button.disabled = true;
    });

  socket.timeout(5000).emit(
    'moderate_player',
    { username, action },
    (error, result) => {
      pendingModeration.delete(username);

      players.get(username)?.element
        .querySelectorAll('.player-moderation button')
        .forEach(button => {
          button.disabled = false;
        });

      if (error) {
        showMessage(
          'Модерация',
          'Нет подтверждения сервера. Проверь список игроков.'
        );
      } else if (result?.error) {
        showMessage('Модерация', result.error);
      }
    }
  );
}

/* ==================== Чат ==================== */

function updateChatControls() {
  const enabled = Boolean(
    user &&
    socket?.connected &&
    chatReady &&
    !moderationNotice
  );

  $('chat-input').disabled = !enabled;
  $('btn-send').disabled = !enabled || chatSending;
}

function scrollChat() {
  const container = $('chat-messages');

  container.scrollTop = container.scrollHeight;
}

function renderChatMessage(message) {
  if (
    !message ||
    typeof message.id !== 'string' ||
    typeof message.text !== 'string' ||
    chatIds.has(message.id)
  ) {
    return;
  }

  const container = $('chat-messages');

  const nearBottom =
    container.scrollHeight -
    container.scrollTop -
    container.clientHeight < 70;

  const system = message.type === 'system';
  const mine = !system && message.username === user?.username;

  let element;

  if (system) {
    element = cloneTemplate('system-template');
    element.textContent = message.text;
  } else {
    element = cloneTemplate('chat-template');

    element.classList.toggle('mine', mine);

    element.querySelector('.chat-author').textContent =
      message.username;

    element.querySelector('.chat-text').textContent =
      message.text;

    const time = element.querySelector('.chat-time');
    const date = new Date(message.time);

    if (!Number.isNaN(date.getTime())) {
      time.dateTime = date.toISOString();

      time.textContent = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  element.dataset.id = message.id;

  container.appendChild(element);
  chatIds.add(message.id);

  while (container.children.length > 100) {
    const first = container.firstElementChild;

    chatIds.delete(first.dataset.id);
    first.remove();
  }

  if (nearBottom || mine) {
    scrollChat();
  }
}

function sendChat() {
  if (
    !socket?.connected ||
    !chatReady ||
    chatSending ||
    moderationNotice
  ) {
    return;
  }

  const input = $('chat-input');
  const original = input.value;
  const text = original.trim();

  if (!text) return;

  if (text.length > 300) {
    showMessage('Чат', 'Максимум 300 символов.');
    return;
  }

  chatSending = true;
  updateChatControls();

  const connection = socket;

  connection.timeout(5000).emit(
    'chat_send',
    { text },
    (error, result) => {
      // Ответ старого соединения не меняет новое.
      if (socket !== connection) return;

      chatSending = false;
      updateChatControls();

      if (error) {
        console.error('[chat_send]', error);

        // Не отключаем сокет и не выполняем повторную авторизацию.
        showMessage(
          'Чат',
          'Нет подтверждения сервера. Сообщение могло быть доставлено.'
        );

        return;
      }

      if (!result?.success) {
        console.warn('[chat_send]', result?.error);

        showMessage(
          'Чат',
          result?.error || 'Не удалось отправить сообщение.'
        );

        return;
      }

      if (input.value === original) {
        input.value = '';
      }

      if (!input.disabled) {
        input.focus();
      }
    }
  );
}

/* ==================== Рендер персонажей ==================== */

function loadImage(src) {
  if (imageCache.has(src)) {
    return imageCache.get(src);
  }

  const promise = new Promise(resolve => {
    const image = new Image();

    image.onload = () => resolve(image);

    image.onerror = () => {
      imageCache.delete(src);
      resolve(null);
    };

    image.src = src;
  });

  imageCache.set(src, promise);

  return promise;
}

async function drawPlayer(canvas, equipped) {
  if (!canvas || !equipped) return;

  const version = (renderVersions.get(canvas) ?? 0) + 1;

  renderVersions.set(canvas, version);

  const layers = [];

  for (const category of ['colors', 'faces', 'glasses', 'hats']) {
    const id = equipped[EQUIPMENT[category]];

    if (typeof id !== 'string' || !id) continue;

    const item = indexes[category].get(id) || { id };

    layers.push(loadImage(asset(category, item)));
  }

  const loaded = await Promise.all(layers);

  if (
    renderVersions.get(canvas) !== version ||
    !canvas.isConnected
  ) {
    return;
  }

  const context = canvas.getContext('2d');

  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  for (const image of loaded) {
    if (!image) continue;

    context.drawImage(
      image,
      Math.round((canvas.width - image.naturalWidth) / 2),
      Math.round((canvas.height - image.naturalHeight) / 2)
    );
  }
}




$('btn-start').addEventListener('click', () => {
  if (!socket?.connected) return;

  socket.timeout(10000).emit('game:prepare', {}, (error, result) => {
    if (error || result?.error) {
      showMessage(
        'Старт',
        result?.error || 'Сервер не подтвердил подготовку матча.'
      );
    }
  });
});








async function resumeLobby() {
  const url = new URL(location.href);

  if (url.searchParams.get('resume') !== '1') return;

  url.searchParams.delete('resume');

  history.replaceState(
    null,
    '',
    `${url.pathname}${url.search}${url.hash}`
  );

  authBusy = true;

  $('btn-login').disabled = true;
  $('btn-reg').disabled = true;

  try {
    const response = await fetch('/api/me', {
      credentials: 'same-origin',
      cache: 'no-store'
    });

    // Сессия закончилась: оставляем обычный экран входа.
    if (response.status === 401) return;

    const account = await response.json();

    if (account.internalScreen) {
      location.assign('/internal.html');
      return;
    }

    if (!response.ok || account.error) {
      throw new Error(account.error || 'Не удалось восстановить вход.');
    }

    await loadCatalog();

    $('auth-screen').hidden = true;
    $('app').hidden = false;

    applyAccount(account);
    connectSocket();
  } catch (error) {
    showMessage('Возврат в лобби', error.message);
  } finally {
    authBusy = false;

    $('btn-login').disabled = false;
    $('btn-reg').disabled = false;
  }
}

resumeLobby();

/* ==================== Начальное состояние ==================== */

updateChatControls();



