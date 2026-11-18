import { createRoundRewarder } from './game/rewards.js';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { Server } from 'socket.io';
import { attachGame } from './game/network.js';
import { attachRPoints } from './game/rpoints.js';
import { mountWiki } from './wiki-server.js';
import { settingsSchema as wikiSettingsSchema } from './game/settings.js';

const isAlexIsEvil = true;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = path.join(ROOT, 'users_db.json');
const COOKIE = 'punya_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const CHAT_ROOM = 'lobby';
const CHAT_LIMIT = 100;
const MAX_PLAYERS = 50;
const COSMETICS = ['colors', 'faces', 'hats', 'glasses', 'pets', 'badges'];
const STACKABLE = ['rolepoints', 'chests'];
const CURRENCIES = ['coins', 'punium'];
const EQUIPMENT = {
  color: 'colors',
  face: 'faces',
  hat: 'hats',
  glasses: 'glasses',
  badge: 'badges'
};

const DEFAULT_EQUIPPED = {
  color: 'white',
  face: 'smile',
  hat: 'no_hat',
  glasses: 'not_a_glasses',
  badge: 'white'
};
const INTERNAL_ACCOUNTS = { EmergencyButton: 'emergency', MissileStrike: 'missile' };
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
function setOwn(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}
class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function check(condition, message, status = 400) { if (!condition) throw new AppError(message, status); }
function internalScreen(username) { return has(INTERNAL_ACCOUNTS, username) ? INTERNAL_ACCOUNTS[username] : null; }
function publicUser(account) {
  const copy = structuredClone(account);
  delete copy.password;
  delete copy.passwordHash;
  return copy;
}

/* Catalogs */
const catalog = {};
const indexes = {};
for (const category of [...COSMETICS, ...STACKABLE]) {
  const filename = path.join(ROOT, `${category}bundle.json`);
  try {
    catalog[category] = JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && ['pets', 'badges', ...STACKABLE].includes(category)) catalog[category] = [];
    else throw error;
  }
  check(Array.isArray(catalog[category]), `${filename}: ожидался массив.`);
  indexes[category] = new Map();
  for (const item of catalog[category]) {
    check(object(item) && typeof item.id === 'string' && item.id, `${category}: неверный ID.`);
    check(!indexes[category].has(item.id), `${category}: повторяющийся ID ${item.id}.`);
    if (item.buyable !== undefined) {
      check(
        typeof item.buyable === 'boolean',
        `${category}/${item.id}: buyable должен быть true или false.`
      );
    }
    for (const field of ['price', 'coinsPrice', 'puniumPrice']) {
      if (item[field] !== undefined && item[field] !== null) check(count(item[field]), `${item.id}: неверная цена.`);
    }
    if (item.currency !== undefined) check(CURRENCIES.includes(item.currency), `${item.id}: неверная валюта.`);
    indexes[category].set(item.id, item);
  }
}
function findItem(category, id) {
  check(typeof category === 'string' && has(indexes, category), 'Неизвестная категория.');
  const item = indexes[category].get(id);
  check(item, `Предмет не найден: ${category}/${id}`, 404);
  return item;
}
function isFree(item) {
  if (typeof item.free === 'boolean') return item.free;
  if (has(item, 'price')) return item.price === 0;
  return item.coinsPrice === 0 || item.puniumPrice === 0;
}

function isBuyable(item) {
  // Отсутствующее поле сохраняет прежнее поведение старых каталогов.
  // Явное false запрещает покупку.
  return item.buyable !== false;
}

function priceFor(item, payment) {
  check(CURRENCIES.includes(payment), 'Неизвестная валюта.');
  let price = item[payment === 'coins' ? 'coinsPrice' : 'puniumPrice'];
  if (price === undefined && has(item, 'price') && (item.currency ?? 'coins') === payment) price = item.price;
  check(price !== null && price !== undefined, 'Покупка за эту валюту недоступна.');
  check(count(price), 'Некорректная цена.');
  return price;
}
function chanceUnits(chance) {
  check(typeof chance === 'number' && Number.isFinite(chance) && chance >= 0 && chance <= 100, 'Некорректный шанс.');
  const units = Math.round(chance * 10000);
  check(Math.abs(chance * 10000 - units) < 0.000001, 'Слишком много знаков в вероятности.');
  return units;
}
function validateTable(rows) {
  check(Array.isArray(rows) && rows.length > 0, 'Пустая таблица наград.');
  check(rows.reduce((sum, row) => sum + chanceUnits(row.chance), 0) === 1000000, 'Сумма шансов должна быть 100%.');
}
function pick(rows) {
  const roll = randomInt(1000000);
  let boundary = 0;
  for (const row of rows) { boundary += chanceUnits(row.chance); if (roll < boundary) return row; }
  throw new Error('Ошибка таблицы наград.');
}
for (const [slot, category] of Object.entries(EQUIPMENT)) {
  check(isFree(findItem(category, DEFAULT_EQUIPPED[slot])), `Базовый предмет ${DEFAULT_EQUIPPED[slot]} должен быть бесплатным.`);
}
for (const ticket of catalog.rolepoints) {
  check(
    typeof ticket.role === 'string' && ticket.role.length > 0,
    `${ticket.id}: отсутствует роль.`
  );

  const bonuses = ticket.givenOnBuy ?? [];

  check(
    Array.isArray(bonuses),
    `${ticket.id}: неверный givenOnBuy.`
  );

  for (const bonus of bonuses) {
    check(
      object(bonus),
      `${ticket.id}: некорректный предмет в givenOnBuy.`
    );

    check(
      COSMETICS.includes(bonus.category),
      `${ticket.id}: в givenOnBuy разрешена только косметика.`
    );

    check(
      typeof bonus.id === 'string' && bonus.id.length > 0,
      `${ticket.id}: у бонуса отсутствует ID.`
    );

    check(
      count(bonus.amount ?? 1) && (bonus.amount ?? 1) > 0,
      `${ticket.id}: неверное количество бонуса.`
    );

    findItem(bonus.category, bonus.id);
  }
}
for (const chest of catalog.chests) {
  validateTable(chest.coins);
  for (const row of chest.coins) check(count(row.amount), 'Неверная монетная награда.');
  check(chest.items?.mode === 'independent' && Array.isArray(chest.items.rolls), 'Неверная таблица косметики.');
  for (const row of chest.items.rolls) {
    check(COSMETICS.includes(row.category) && Array.isArray(row.pool), 'Неверный пул косметики.');
    check((row.amount ?? 1) === 1, 'Косметика выдаётся по одному предмету.');
    chanceUnits(row.chance);
    for (const id of row.pool) findItem(row.category, id);
  }
  check(chest.rolepoints?.mode === 'single', 'Неверный режим билетов.');
  validateTable(chest.rolepoints.rolls);
  for (const row of chest.rolepoints.rolls) {
    if (row.id === null) continue;
    findItem('rolepoints', row.id);
    check(count(row.amount ?? 1) && (row.amount ?? 1) > 0, 'Неверное количество билетов.');
  }
}

/* Database. Passwords remain plaintext. */
async function loadDatabase() {
  try {
    const data = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
    check(object(data), 'users_db.json должен содержать объект.');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}
async function writeDatabase(data) {
  await fs.writeFile(`${DB_FILE}.tmp`, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(`${DB_FILE}.tmp`, DB_FILE);
}


const LEGACY_ROLEPOINT_IDS = {
  'mint-punik-ticket': 'glitch-ticket',
  'cook-ticket': 'mint-cook-ticket',
  'alarm-ticket': 'jester-ticket',

  'listener-ticket': 'spy-ticket',
  'grenadier-ticket': 'judge-ticket',
  'advisor-ticket': 'lawyer-ticket',

  'hacker-ticket': 'glitch-ticket'
};

function migrateRolepoints(account) {
  const storage = account.inventory.rolepoints;

  for (const [oldId, newId] of Object.entries(LEGACY_ROLEPOINT_IDS)) {
    if (!has(storage, oldId)) continue;

    // Не переносим билет, пока новый каталог ещё не установлен.
    if (!indexes.rolepoints.has(newId)) continue;

    const oldAmount = storage[oldId];
    const currentAmount = has(storage, newId) ? storage[newId] : 0;

    check(
      count(oldAmount) && count(currentAmount),
      'Некорректное количество ролепоинтов.'
    );

    const nextAmount = currentAmount + oldAmount;

    check(
      count(nextAmount),
      'Превышено количество ролепоинтов при переносе.'
    );

    if (nextAmount > 0) {
      setOwn(storage, newId, nextAmount);
    }

    delete storage[oldId];
  }
}



function normalizeAccount(account) {
  check(
    object(account) && typeof account.password === 'string',
    `Нет plaintext-пароля: ${account?.username}`
  );

  account.coins ??= 0;
  account.punium ??= 0;
  account.inventory ??= {};
  account.equipped ??= {};

  check(
    object(account.inventory) && object(account.equipped),
    'Повреждён аккаунт.'
  );

  for (const currency of CURRENCIES) {
    check(count(account[currency]), 'Некорректный баланс.');
  }

  // Постоянная косметика.
  for (const category of COSMETICS) {
    account.inventory[category] ??= [];

    check(
      Array.isArray(account.inventory[category]),
      `Некорректный инвентарь: ${category}.`
    );

    check(
      account.inventory[category].every(
        id => typeof id === 'string' && id.length > 0
      ),
      `Некорректный ID в инвентаре: ${category}.`
    );

    // Сохраняем всё ранее выданное, включая серверные предметы
    // и предметы, временно отсутствующие в каталоге.
    const owned = new Set(account.inventory[category]);

    for (const item of catalog[category]) {
      // Серверные эксклюзивы не выдаются всем при входе.
      if (isFree(item) && isBuyable(item)) {
        owned.add(item.id);
      }
    }

    account.inventory[category] = [...owned];
  }

  // Расходуемые билеты и сундуки.
  for (const category of STACKABLE) {
    account.inventory[category] ??= {};

    check(
      object(account.inventory[category]),
      `Некорректный счётчик предметов: ${category}.`
    );

    for (const amount of Object.values(account.inventory[category])) {
      check(count(amount), 'Некорректное количество.');
    }
  }

  migrateRolepoints(account);

  // Экипировка, включая badge после добавления слота в EQUIPMENT.
  for (const [slot, category] of Object.entries(EQUIPMENT)) {
    const defaultId = DEFAULT_EQUIPPED[slot];
    const defaultItem = findItem(category, defaultId);

    check(
      isFree(defaultItem) && isBuyable(defaultItem),
      `Базовый предмет ${category}/${defaultId} ` +
      'должен быть бесплатным и доступным для обычного получения.'
    );

    // Базовая экипировка должна реально принадлежать аккаунту.
    if (!account.inventory[category].includes(defaultId)) {
      account.inventory[category].push(defaultId);
    }

    const equippedId = account.equipped[slot];

    if (
      !indexes[category].has(equippedId) ||
      !account.inventory[category].includes(equippedId)
    ) {
      account.equipped[slot] = defaultId;
    }
  }

  delete account.equipped.glass;

  const screen = internalScreen(account.username);

  if (screen) {
    account.internalScreen = screen;
  } else {
    delete account.internalScreen;
  }
}





let users = await loadDatabase();
// This block MUST be after users initialization.
for (const [username, screen] of Object.entries(INTERNAL_ACCOUNTS)) {
  if (!has(users, username)) setOwn(users, username, {
    username, password: 'internal', coins: 0, punium: 0, inventory: {}, equipped: { ...DEFAULT_EQUIPPED }
  });
  users[username].internalScreen = screen;
}
for (const [username, account] of Object.entries(users)) {
  account.username = username;
  normalizeAccount(account);
}
try { await fs.copyFile(DB_FILE, `${DB_FILE}.bak`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeDatabase(users);

/* HTTP, Socket.IO and write serialization */
const app = express();
const server = http.createServer(app);
function originAllowed(origin, host) {
  if (!origin) return true;
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && url.host === host; }
  catch { return false; }
}
const io = new Server(server, {
  maxHttpBufferSize: 5e6,
  allowRequest(req, callback) { callback(null, originAllowed(req.headers.origin, req.headers.host)); }
});
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

mountWiki(app, {
  contentRoot: path.join(ROOT, 'wiki'),
  getSettingsSchema: () => wikiSettingsSchema
});

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !originAllowed(req.headers.origin, req.headers.host)) return res.status(403).json({ error: 'Запрос с другого сайта запрещён.' });
  next();
});
app.use(express.static(path.join(ROOT, 'public')));
let operationQueue = Promise.resolve();
function enqueue(operation) {
  const result = operationQueue.then(operation);
  operationQueue = result.catch(() => {});
  return result;
}
async function commit(change, after = () => {}) {
  const next = structuredClone(users);
  const result = change(next);
  await writeDatabase(next);
  users = next;
  after(result);
  return result;
}
function accountOf(database, username) {
  check(typeof username === 'string' && has(database, username), 'Игрок не найден.', 404);
  return database[username];
}

/* Sessions */
const sessions = new Map();
function readCookie(header) {
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== COOKIE) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}
function sessionOf(header) {
  const token = readCookie(header);
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) { sessions.delete(token); return null; }
  if (!has(users, session.username)) return null;
  return { ...session, token };
}
function issueSession(res, username) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: SESSION_TTL });
}
function requireAuth(req, res, next) {
  const session = sessionOf(req.headers.cookie);
  if (!session) return res.status(401).json({ error: 'Сначала войди в аккаунт.' });
  req.auth = session;
  next();
}
function ensureSocketSession(socket) {
  const session = sessions.get(socket.data.sessionToken);
  check(session && session.expiresAt > Date.now() && session.username === socket.data.username, 'Сессия закончилась. Войди заново.', 401);
  return session.username;
}
io.use((socket, next) => {
  const session = sessionOf(socket.request.headers.cookie);
  if (!session) return next(new Error('Сначала войди в аккаунт.'));
  socket.data.username = session.username;
  socket.data.sessionToken = session.token;
  next();
});
const cleanup = setInterval(() => {
  for (const [token, session] of sessions) if (session.expiresAt <= Date.now()) sessions.delete(token);
}, 60000);
cleanup.unref();

/* Lobby, host and chat */
const lobby = new Map();
const lobbyBans = new Map();
const chatHistory = [];
const chatLastSent = new Map();
const getHost = () => lobby.keys().next().value ?? null;
function lobbyPlayers() {
  return [...lobby.keys()].map(username => ({ username, isHost: username === getHost(), equipped: { ...users[username].equipped } }));
}
function broadcastLobby() { io.to(CHAT_ROOM).emit('lobby_update', lobbyPlayers()); }
function syncAccount(username) {
  if (has(users, username)) io.to(`account:${username}`).emit('account_update', publicUser(users[username]));
}
function publishChat(message) {
  chatHistory.push(message);
  if (chatHistory.length > CHAT_LIMIT) chatHistory.shift();
  io.to(CHAT_ROOM).emit('chat_message', message);
}
function systemMessage(text) {
  publishChat({ id: randomBytes(12).toString('hex'), type: 'system', text, time: Date.now() });
}
function removeLobbyPlayer(socket, reason = 'left', actor = null) {
  const username = socket.data.username;
  if (lobby.get(username) !== socket.id) return false;
  lobby.delete(username);
  chatLastSent.delete(username);
  socket.leave(CHAT_ROOM);
  socket.leave(`account:${username}`);
  const text = {
    left: `${username} left`, error: `${username} left due to error`,
    kick: `${username} kicked by ${actor}`, ban: `${username} banned by ${actor}`,
    annihilate: `${username} has completely vapourized by nuclear bomb because ${actor} pressed wrong button`,
    reverse: `${username} tried to annihilate ${actor} but something gone wrong`
  };
  systemMessage(text[reason] || text.left);
  broadcastLobby();
  return true;
}
function ensureLobbyMember(socket) {
  const username = ensureSocketSession(socket);
  check(lobby.get(username) === socket.id && socket.rooms.has(CHAT_ROOM), 'Сначала войди в лобби.');
  return username;
}
function resolveColor(account, username) {
  const occupied = new Set([...lobby.keys()].filter(name => name !== username).map(name => users[name].equipped.color));
  return [account.equipped.color, ...account.inventory.colors].find(id => indexes.colors.has(id) && account.inventory.colors.includes(id) && !occupied.has(id));
}

/* Economy */
function grant(account, reward) {
  check(object(reward), 'Некорректная награда.');
  const { category, id, amount = 1 } = reward;
  check(count(amount) && amount > 0, 'Неверное количество.');
  if (CURRENCIES.includes(category)) {
    check(count(account[category] + amount), 'Превышен баланс.');
    account[category] += amount;
    return { category, amount };
  }
  findItem(category, id);
  if (STACKABLE.includes(category)) {
    const storage = account.inventory[category];
    const next = (has(storage, id) ? storage[id] : 0) + amount;
    check(count(next), 'Превышено количество.');
    setOwn(storage, id, next);
    return { category, id, amount };
  }
  check(COSMETICS.includes(category), 'Неизвестная награда.');
  const duplicate = account.inventory[category].includes(id);
  if (!duplicate) account.inventory[category].push(id);
  return { category, id, amount: duplicate ? 0 : 1, duplicate };
}
export function give(item) {
  return enqueue(() => commit(database => {
    check(object(item), 'Ожидался объект награды.');
    const account = accountOf(database, item.username);
    const reward = grant(account, item);
    return { success: true, user: publicUser(account), rewards: [reward] };
  }, () => syncAccount(item.username)));
}


function purchase(account, category, itemId, payment) {
  const item = findItem(category, itemId);

  // Проверяется сервером, а не только скрытием кнопки магазина.
  check(
    isBuyable(item),
    'Этот предмет нельзя купить. Он доступен только через серверную выдачу или награды.',
    403
  );

  if (COSMETICS.includes(category)) {
    check(
      !account.inventory[category].includes(itemId),
      'Уже куплено.',
      409
    );
  }

  const price = priceFor(item, payment);

  check(
    account[payment] >= price,
    payment === 'punium'
      ? 'Недостаточно пуниума.'
      : 'Недостаточно коинов.'
  );

  const rewards = [
    grant(account, {
      category,
      id: itemId
    })
  ];

  // Покупка билета выдаёт ВСЮ указанную косметику.
  // Никакого случайного выбора одного бонуса здесь нет.
  if (category === 'rolepoints') {
    for (const bonus of item.givenOnBuy ?? []) {
      rewards.push(grant(account, bonus));
    }
  }

  account[payment] -= price;

  return rewards;
}

function openChest(account, chestId) {
  const chest = findItem('chests', chestId);
  const storage = account.inventory.chests;
  check(has(storage, chestId) && storage[chestId] > 0, 'У тебя нет этого сундука.');
  const rewards = [];
  const coins = pick(chest.coins);
  if (coins.amount > 0) rewards.push(grant(account, { category: 'coins', amount: coins.amount }));
  for (const row of chest.items.rolls) {
    if (!row.pool.length || randomInt(1000000) >= chanceUnits(row.chance)) continue;
    rewards.push(grant(account, { category: row.category, id: row.pool[randomInt(row.pool.length)] }));
  }
  const ticket = pick(chest.rolepoints.rolls);
  if (ticket.id !== null) rewards.push(grant(account, { category: 'rolepoints', id: ticket.id, amount: ticket.amount ?? 1 }));
  storage[chestId]--;
  if (storage[chestId] === 0) delete storage[chestId];
  return rewards;
}

/* HTTP API */
const route = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
app.post('/api/register', route(async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = req.body?.password;
  check(/^[\p{L}\p{N}_-]{3,24}$/u.test(username), 'Никнейм: 3–24 символа, буквы, цифры, _ и -.');
  check(typeof password === 'string' && password.length >= 3 && password.length <= 128, 'Пароль: 3–128 символов.');
  const result = await enqueue(() => commit(database => {
    check(!has(database, username), 'Никнейм занят.', 409);
    const account = { username, password, coins: 0, punium: 0, inventory: {}, equipped: { ...DEFAULT_EQUIPPED } };
    normalizeAccount(account);
    setOwn(database, username, account);
    return publicUser(account);
  }));
  issueSession(res, username);
  res.status(201).json(result);
}));
app.post('/api/login', route(async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = req.body?.password;
  check(username && typeof password === 'string' && password, 'Заполни все поля.');
  const result = await enqueue(() => {
    const account = has(users, username) ? users[username] : null;
    check(account && account.password === password, 'Неверный логин или пароль.', 401);
    check(!lobby.has(username), 'Аккаунт уже находится в лобби.', 409);
    return publicUser(account);
  });
  issueSession(res, username);
  res.json(result);
}));
app.get('/api/me', requireAuth, (req, res) => res.json(publicUser(users[req.auth.username])));
app.post('/api/logout', requireAuth, route(async (req, res) => {
  const token = req.auth.token;
  sessions.delete(token);
  await enqueue(() => {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.sessionToken !== token) continue;
      removeLobbyPlayer(socket);
      socket.disconnect(true);
    }
  });
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ success: true });
}));
app.get(['/api/shop', '/api/economy/shop'], (req, res) => res.json(catalog));
app.post(['/api/buy', '/api/economy/buy'], requireAuth, route(async (req, res) => {
  const username = req.auth.username;
  check(!internalScreen(username), 'Внутренний аккаунт не покупает предметы.', 403);
  const { category, itemId, payment = 'coins' } = req.body ?? {};
  const result = await enqueue(() => commit(database => {
    const account = accountOf(database, username);
    const rewards = purchase(account, category, itemId, payment);
    return { success: true, user: publicUser(account), rewards, coins: account.coins, punium: account.punium, inventory: structuredClone(account.inventory) };
  }, () => syncAccount(username)));
  res.json(result);
}));
app.post('/api/economy/open', requireAuth, route(async (req, res) => {
  const username = req.auth.username;
  check(!internalScreen(username), 'Недоступно внутреннему аккаунту.', 403);
  const chestId = req.body?.chestId;
  const result = await enqueue(() => commit(database => {
    const account = accountOf(database, username);
    const rewards = openChest(account, chestId);
    return { success: true, chestId, rewards, user: publicUser(account) };
  }, () => syncAccount(username)));
  res.json(result);
}));

/* Lobby sockets */
io.on('connection', socket => {
  socket.on('join_lobby', (data, callback) => {
    const ack = typeof data === 'function' ? data : typeof callback === 'function' ? callback : () => {};
    enqueue(async () => {
      const username = ensureSocketSession(socket);
      check(!internalScreen(username), 'Внутренний аккаунт не входит в лобби.');
      check(socket.connected, 'Соединение закрыто.');
      check(!lobbyBans.has(username), `Ты забанен. Бан выдал: ${lobbyBans.get(username)}.`, 403);
      if (lobby.get(username) === socket.id) {
        socket.emit('chat_history', chatHistory);
        socket.emit('lobby_update', lobbyPlayers());
        ack({ success: true });
        return;
      }
      check(!lobby.has(username), 'Аккаунт уже находится в лобби.', 409);
      check(lobby.size < MAX_PLAYERS, 'Лобби заполнено.');
      const color = resolveColor(users[username], username);
      check(color, 'Нет свободного цвета из твоего инвентаря.');
      await commit(database => { database[username].equipped.color = color; });
      if (!socket.connected) return;
      await socket.join(CHAT_ROOM);
      await socket.join(`account:${username}`);
      lobby.set(username, socket.id);
      socket.emit('chat_history', chatHistory);
      syncAccount(username);
      systemMessage(`${username} joined`);
      broadcastLobby();
      ack({ success: true });
    }).catch(error => { socket.emit('lobby_error', error.message); ack({ error: error.message }); });
  });
  socket.on('update_skin', (data, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    enqueue(async () => {
      const username = ensureLobbyMember(socket);
      check(object(data?.equipped), 'Некорректная внешность.');
      await commit(database => {
        const account = database[username];
        const next = { ...account.equipped };
        for (const [slot, category] of Object.entries(EQUIPMENT)) {
          if (!has(data.equipped, slot)) continue;
          const id = data.equipped[slot];
          findItem(category, id);
          check(account.inventory[category].includes(id), 'Предмет не получен.');
          next[slot] = id;
        }
        const occupied = new Set([...lobby.keys()].filter(name => name !== username).map(name => users[name].equipped.color));
        if (occupied.has(next.color)) next.color = account.equipped.color;
        account.equipped = next;
      }, () => { syncAccount(username); broadcastLobby(); });
      ack({ success: true });
    }).catch(error => { syncAccount(socket.data.username); ack({ error: error.message }); });
  });
  socket.on('chat_send', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const username = ensureLobbyMember(socket);
      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      check(text && text.length <= 300, 'Сообщение: 1–300 символов.');
      const now = Date.now();
      check(now - (chatLastSent.get(username) ?? 0) >= 700, 'Не так быстро :)');
      chatLastSent.set(username, now);
      publishChat({ id: randomBytes(12).toString('hex'), type: 'player', username, text, time: now });
      ack({ success: true });
    } catch (error) { ack({ error: error.message }); }
  });
  socket.on('moderate_player', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    enqueue(() => {
      var isUNOReverse = false;
      const actor = ensureLobbyMember(socket);
      check(actor === getHost() || actor == "Alex", 'Только хост.', 403);
      const { username: target, action } = payload ?? {};
      check(['kick', 'ban'].includes(action), 'Неизвестное действие.');
      check(typeof target === 'string' && target !== actor && lobby.has(target), 'Некорректная цель.');
      const targetSocket = io.sockets.sockets.get(lobby.get(target));
      check(targetSocket, 'Игрок уже отключился.');
      if (!isAlexIsEvil) {
        check(target != "Alex", "Нельзя кикнуть или забанить создателя игры!");
      } else if(target == "Alex") {
        const reversedTargetSocket = io.sockets.sockets.get(lobby.get(actor));
        const reversedTarget = actor;
        if (action === 'ban') lobbyBans.set(reversedTarget, "Alex");
        removeLobbyPlayer(reversedTargetSocket, 'reverse', "Alex");
        reversedTargetSocket.emit('moderation_notice', { action: "uno", by: "Alex" });
        reversedTargetSocket.disconnect(true);
        isUNOReverse = true;
        ack({ success: true });
      }
      if (!isUNOReverse) {
        if (action === 'ban') lobbyBans.set(target, actor);
        if (actor == "Alex") {removeLobbyPlayer(targetSocket, 'annihilate', actor);} else {removeLobbyPlayer(targetSocket, action, actor);}
        targetSocket.emit('moderation_notice', { action, by: actor });
        targetSocket.disconnect(true);
        ack({ success: true });
      }
    }).catch(error => ack({ error: error.message }));
  });
  socket.on('disconnect', reason => {
    console.log('[disconnect]', socket.data.username, reason);
    enqueue(() => removeLobbyPlayer(socket, ['ping timeout', 'transport error', 'transport close', 'parse error'].includes(reason) ? 'error' : 'left')).catch(console.error);
  });
});





let gameController = null;

const rolepointService = attachRPoints({
  io,
  enqueue,
  commit,
  accountOf,
  getAccount: username => accountOf(users, username),
  getTickets: () => catalog.rolepoints,
  findItem,
  ensureLobbyMember,
  getLobbySocketId: username => lobby.get(username),
  isSelectionOpen: () => {
    const current = gameController?.getGame();
    return !current || current.phase === 'finished';
  },
  syncAccount
});

gameController = attachGame({
  awardRound: createRoundRewarder({ enqueue, commit, syncAccount }),
  io,
  getLobbyMembers: () => [...lobby.keys()]
    .filter(username => !internalScreen(username))
    .map(username => ({
      id: username,
      username,
      equipped: { ...users[username].equipped }
    })),
  getLobbyHost: getHost,
  getInternalScreen: internalScreen,
  authenticateSocket: ensureSocketSession,
  rolepoints: rolepointService
});






app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут не найден.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком большой запрос.' });
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ error: 'Некорректный JSON.' });
  if (!(error instanceof AppError)) console.error(error);
  res.status(error instanceof AppError ? error.status : 500).json({ error: error instanceof AppError ? error.message : 'Внутренняя ошибка сервера.' });
});
server.listen(PORT, HOST, () => {
  console.log(`Пуня: http://localhost:${PORT}`);
  console.log(`Слушаем ${HOST}:${PORT}. Для LAN используй IP этого компьютера.`);
});
