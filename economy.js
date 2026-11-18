import fs from 'node:fs/promises';
import { randomInt } from 'node:crypto';

const COSMETICS = [
  'colors',
  'faces',
  'hats',
  'glasses',
  'pets',
  'badges'
];

const STACKABLE = ['rolepoints', 'chests'];
const CURRENCIES = ['coins', 'punium'];

const BUNDLES = {
  colors: './colorsbundle.json',
  faces: './facesbundle.json',
  hats: './hatsbundle.json',
  glasses: './glassesbundle.json',
  pets: './petsbundle.json',
  badges: './badgesbundle.json',
  rolepoints: './rolepointsbundle.json',
  chests: './chestsbundle.json'
};

const OPTIONAL_BUNDLES = new Set(['pets', 'badges']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function chanceUnits(chance) {
  assert(
    typeof chance === 'number' &&
    Number.isFinite(chance) &&
    chance >= 0 &&
    chance <= 100,
    `Некорректный шанс: ${chance}`
  );

  // До четырёх знаков после запятой в процентах.
  const units = Math.round(chance * 10000);

  assert(
    Math.abs(chance * 10000 - units) < 0.000001,
    `Слишком много знаков в вероятности: ${chance}`
  );

  return units;
}

function validateSingleTable(rows, label) {
  assert(Array.isArray(rows) && rows.length > 0, `${label}: пустая таблица`);

  const total = rows.reduce(
    (sum, row) => sum + chanceUnits(row.chance),
    0
  );

  assert(total === 1000000, `${label}: сумма шансов должна быть 100%`);
}

function pickSingle(rows) {
  const roll = randomInt(1000000);
  let boundary = 0;

  for (const row of rows) {
    boundary += chanceUnits(row.chance);

    if (roll < boundary) return row;
  }

  throw new Error('Некорректная таблица наград');
}

function passed(chance) {
  return randomInt(1000000) < chanceUnits(chance);
}

async function loadBundle(category, filename) {
  let raw;

  try {
    raw = await fs.readFile(filename, 'utf8');
  } catch (error) {
    if (
      error.code === 'ENOENT' &&
      OPTIONAL_BUNDLES.has(category)
    ) {
      return [];
    }

    throw error;
  }

  const items = JSON.parse(raw);

  assert(Array.isArray(items), `${filename}: ожидался массив`);

  return items;
}

export async function setupEconomy({
  app,
  io,
  users,
  saveUsers,
  toPublicUser
}) {
  const catalog = Object.fromEntries(
    await Promise.all(
      Object.entries(BUNDLES).map(async ([category, filename]) => [
        category,
        await loadBundle(category, filename)
      ])
    )
  );

  const index = {};

  for (const [category, items] of Object.entries(catalog)) {
    index[category] = new Map();

    for (const item of items) {
      assert(
        item && typeof item.id === 'string' && item.id.length > 0,
        `${category}: предмет без ID`
      );

      assert(
        !index[category].has(item.id),
        `${category}: повторяющийся ID ${item.id}`
      );

      index[category].set(item.id, item);
    }
  }

  function findItem(category, id) {
    const item = Object.hasOwn(index, category)
      ? index[category].get(id)
      : null;

    assert(item, `Предмет не найден: ${category}/${id}`);

    return item;
  }

  function isFreeCosmetic(item) {
    if (typeof item.free === 'boolean') return item.free;

    // Поддержка старых бандлов с price.
    if (Object.hasOwn(item, 'price')) return item.price === 0;

    return item.coinsPrice === 0 || item.puniumPrice === 0;
  }

  function getPrice(item, payment) {
    assert(CURRENCIES.includes(payment), 'Неизвестная валюта');

    const field = payment === 'coins'
      ? 'coinsPrice'
      : 'puniumPrice';

    let price = item[field];

    // Старый формат: price + необязательная currency.
    // Явный null не заменяем: он запрещает покупку.
    if (
      price === undefined &&
      Object.hasOwn(item, 'price') &&
      (item.currency ?? 'coins') === payment
    ) {
      price = item.price;
    }

    assert(
      price !== null && price !== undefined,
      'Покупка за эту валюту недоступна'
    );

    assert(nonnegativeInteger(price), 'Некорректная цена');

    return price;
  }

  function normalizeAccount(account) {
    account.coins ??= 0;
    account.punium ??= 0;
    account.inventory ??= {};

    for (const currency of CURRENCIES) {
      assert(
        nonnegativeInteger(account[currency]),
        `Некорректный баланс: ${account.username}/${currency}`
      );
    }

    for (const category of COSMETICS) {
      account.inventory[category] ??= [];

      assert(
        Array.isArray(account.inventory[category]),
        `Некорректный инвентарь: ${category}`
      );

      const owned = new Set(account.inventory[category]);

      for (const item of catalog[category]) {
        if (isFreeCosmetic(item)) owned.add(item.id);
      }

      account.inventory[category] = [...owned];
    }

    for (const category of STACKABLE) {
      account.inventory[category] ??= {};

      assert(
        typeof account.inventory[category] === 'object' &&
        account.inventory[category] !== null &&
        !Array.isArray(account.inventory[category]),
        `Некорректный инвентарь: ${category}`
      );

      for (const amount of Object.values(account.inventory[category])) {
        assert(nonnegativeInteger(amount), `Некорректное количество: ${category}`);
      }
    }
  }

  function addReward(account, reward) {
    const { category, id, amount = 1 } = reward;

    assert(positiveInteger(amount), 'Некорректное количество награды');

    if (CURRENCIES.includes(category)) {
      const balance = account[category] + amount;

      assert(nonnegativeInteger(balance), 'Превышен допустимый баланс');

      account[category] = balance;

      return { category, amount };
    }

    findItem(category, id);

    if (STACKABLE.includes(category)) {
      const storage = account.inventory[category];

      const current = Object.hasOwn(storage, id)
        ? storage[id]
        : 0;

      const next = current + amount;

      assert(nonnegativeInteger(next), 'Превышено количество предметов');

      // В отличие от присваивания, безопасно и для необычных ID.
      Object.defineProperty(storage, id, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true
      });

      return { category, id, amount };
    }

    assert(COSMETICS.includes(category), 'Неизвестная категория');

    const owned = account.inventory[category].includes(id);

    if (!owned) account.inventory[category].push(id);

    return {
      category,
      id,
      amount: owned ? 0 : 1,
      duplicate: owned
    };
  }

  // Проверяем конфигурацию до запуска API.
  for (const rolepoint of catalog.rolepoints) {
    assert(
      typeof rolepoint.role === 'string',
      `${rolepoint.id}: не указана роль`
    );

    const bonuses = rolepoint.givenOnBuy ?? [];

    assert(Array.isArray(bonuses), `${rolepoint.id}: givenOnBuy должен быть массивом`);

    for (const bonus of bonuses) {
      assert(
        COSMETICS.includes(bonus.category),
        `${rolepoint.id}: givenOnBuy поддерживает только косметику`
      );

      findItem(bonus.category, bonus.id);
    }
  }

  for (const chest of catalog.chests) {
    validateSingleTable(chest.coins, `${chest.id}: монеты`);

    for (const row of chest.coins) {
      assert(nonnegativeInteger(row.amount), `${chest.id}: неверная сумма монет`);
    }

    assert(
      chest.items?.mode === 'independent' &&
      Array.isArray(chest.items.rolls),
      `${chest.id}: неверный формат косметического дропа`
    );

    for (const row of chest.items.rolls) {
      assert(COSMETICS.includes(row.category), `${chest.id}: неизвестная категория`);
      assert(Array.isArray(row.pool), `${chest.id}: pool должен быть массивом`);

      chanceUnits(row.chance);

      assert(
        (row.amount ?? 1) === 1,
        `${chest.id}: косметика выдаётся по одному предмету за проверку`
      );

      for (const id of row.pool) findItem(row.category, id);
    }

    assert(
      chest.rolepoints?.mode === 'single',
      `${chest.id}: неверный режим ролепоинтов`
    );

    validateSingleTable(chest.rolepoints.rolls, `${chest.id}: ролепоинты`);

    for (const row of chest.rolepoints.rolls) {
      if (row.id === null) continue;

      findItem('rolepoints', row.id);

      assert(
        positiveInteger(row.amount ?? 1),
        `${chest.id}: неверное количество билетов`
      );
    }
  }

  function syncAccount(account) {
    // Не зависит от того, добавлены ли комнаты account:username.
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.username === account.username) {
        socket.emit('account_update', toPublicUser(account));
      }
    }
  }

  // Покупки, выдачи и открытия выполняются последовательно.
  let operationQueue = Promise.resolve();

  function transact(username, change) {
    const operation = operationQueue.then(async () => {
      assert(
        typeof username === 'string' && Object.hasOwn(users, username),
        'Игрок не найден'
      );

      const previous = users[username];
      const draft = structuredClone(previous);

      normalizeAccount(draft);

      // Все проверки и розыгрыш — до изменения исходного аккаунта.
      const result = change(draft);

      users[username] = draft;

      try {
        await saveUsers();
      } catch (error) {
        // Восстанавливаем состояние, если этот аккаунт не был заменён извне.
        if (users[username] === draft) {
          users[username] = previous;
        }

        throw error;
      }

      syncAccount(draft);

      return {
        success: true,
        user: toPublicUser(draft),
        ...result
      };
    });

    operationQueue = operation.catch(() => {});

    return operation;
  }

  async function give(item) {
    assert(item && typeof item === 'object', 'Ожидался объект награды');

    return transact(item.username, account => ({
      rewards: [addReward(account, item)]
    }));
  }

  function purchase(account, category, itemId, payment) {
    const item = findItem(category, itemId);

    if (COSMETICS.includes(category)) {
      assert(
        !account.inventory[category].includes(itemId),
        'Уже куплено'
      );
    }

    const price = getPrice(item, payment);

    assert(
      account[payment] >= price,
      payment === 'punium'
        ? 'Недостаточно пуниума'
        : 'Недостаточно коинов'
    );

    const rewards = [
      addReward(account, { category, id: itemId })
    ];

    if (category === 'rolepoints') {
      for (const bonus of item.givenOnBuy ?? []) {
        rewards.push(addReward(account, bonus));
      }
    }

    account[payment] -= price;

    return { rewards };
  }

  function openChest(account, chestId) {
    const chest = findItem('chests', chestId);
    const storage = account.inventory.chests;

    const count = Object.hasOwn(storage, chestId)
      ? storage[chestId]
      : 0;

    assert(count > 0, 'У тебя нет этого сундука');

    const rewards = [];

    const coins = pickSingle(chest.coins);

    if (coins.amount > 0) {
      rewards.push(addReward(account, {
        category: 'coins',
        amount: coins.amount
      }));
    }

    for (const row of chest.items.rolls) {
      // Пустой пул отключает конкретную награду.
      if (!row.pool.length || !passed(row.chance)) continue;

      const id = row.pool[randomInt(row.pool.length)];

      rewards.push(addReward(account, {
        category: row.category,
        id
      }));
    }

    const ticket = pickSingle(chest.rolepoints.rolls);

    if (ticket.id !== null) {
      rewards.push(addReward(account, {
        category: 'rolepoints',
        id: ticket.id,
        amount: ticket.amount ?? 1
      }));
    }

    storage[chestId] -= 1;

    if (storage[chestId] === 0) {
      delete storage[chestId];
    }

    return { chestId, rewards };
  }

  function endpoint(handler) {
    return async (req, res) => {
      try {
        res.json(await handler(req.body ?? {}));
      } catch (error) {
        console.error('[economy]', error);

        res.status(400).json({
          error: error.message || 'Ошибка экономики'
        });
      }
    };
  }

  // Новые адреса: не конфликтуют со старым /api/buy.
  app.get('/api/economy/shop', (req, res) => {
    res.json(catalog);
  });

  app.post('/api/economy/buy', endpoint(body =>
    transact(body.username, account =>
      purchase(account, body.category, body.itemId, body.payment)
    )
  ));

  app.post('/api/economy/open', endpoint(body =>
    transact(body.username, account =>
      openChest(account, body.chestId)
    )
  ));

  // Миграция существующих аккаунтов.
  for (const account of Object.values(users)) {
    normalizeAccount(account);
  }

  await saveUsers();

  return {
    give,
    normalizeAccount
  };
}