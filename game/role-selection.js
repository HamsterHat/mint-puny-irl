import { randomInt } from 'node:crypto';

export const ROLE_TEAMS = Object.freeze({
  puny: 'innocent',
  policeman: 'innocent',
  technician: 'innocent',
  spy: 'innocent',
  judge: 'innocent',
  lawyer: 'innocent',
  alarm: 'innocent',
  hacker: 'innocent',
  chemist: 'innocent',
  veteran: 'innocent',
  menthol: 'innocent',
  blackjack: 'innocent',
  tracker: 'innocent',
  developer: 'innocent',
  journalist: 'innocent',
  guard: 'innocent',
  commander: 'innocent',

  'mint-punya': 'mint',
  'mint-cook': 'mint',
  glitch: 'mint',
  sapper: 'mint',
  adviser: 'mint',
  blackmailer: 'mint',

  jester: 'neutral',
  'mint-punik': 'neutral',
  headhunter: 'neutral',
  executioner: 'neutral',
  santa: 'neutral',
  scout: 'innocent',
  teacher: 'neutral'
});

export const PLAYABLE_ROLES = Object.freeze(
  Object.keys(ROLE_TEAMS)
);

const owns = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

function check(ok, message) {
  if (!ok) throw new Error(message);
}

function shuffle(values) {
  const result = [...values];

  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function readCount(settings, key, fallback = 0) {
  const value = settings[key] ?? fallback;

  check(
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 15,
    `Некорректное количество: ${key}.`
  );

  return value;
}

function poolFrom(counts, chosen, team) {
  const result = [];

  for (const [role, wanted] of counts) {
    if (ROLE_TEAMS[role] !== team) continue;

    const missing = Math.max(
      0,
      wanted - (chosen.get(role) ?? 0)
    );

    for (let i = 0; i < missing; i++) {
      result.push(role);
    }
  }

  return shuffle(result);
}

/**
 * Билеты гарантируют роль, а не занимают только
 * заранее настроенные слоты конкретной роли.
 *
 * Функция не расходует билеты и не изменяет игроков.
 */
export function assignSelectedRoles(
  settings,
  playerIds,
  selections = []
) {
  check(
    Array.isArray(playerIds) &&
    new Set(playerIds).size === playerIds.length,
    'Повторяющийся участник.'
  );

  check(
    playerIds.every(id => typeof id === 'string' && id),
    'Некорректный ID участника.'
  );

  check(
    Array.isArray(selections),
    'Некорректный список выбранных билетов.'
  );

  const total = playerIds.length;
  const mintTotal = readCount(settings, 'mintPunies', 1);

  check(total >= 2, 'Для матча нужны хотя бы два игрока.');
  check(mintTotal >= 1, 'Для матча нужен хотя бы один Мятный.');

  check(
    mintTotal < total,
    'После выделения Мятных должно остаться место хотя бы одному Мирному.'
  );

  const desired = new Map([
    ['policeman', readCount(settings, 'policemen')],
    ['technician', readCount(settings, 'technics')],
    ['spy', readCount(settings, 'spies')],
    ['judge', readCount(settings, 'judges')],
    ['lawyer', readCount(settings, 'lawyers')],
    ['alarm', readCount(settings, 'alarms')],
    ['hacker', readCount(settings, 'hackers')],
    ['chemist', readCount(settings, 'chemists')],
    ['mint-cook', readCount(settings, 'mintCooks')],
    ['glitch', readCount(settings, 'glitches')],
    ['sapper', readCount(settings, 'sappers')],
    ['jester', readCount(settings, 'jesters')],
    ['mint-punik', readCount(settings, 'mintPuniks')],
    ['headhunter', readCount(settings, 'headhunters')],
    ['executioner', readCount(settings, 'executioners')],
    ['veteran', readCount(settings, 'veterans')],
    ['menthol', readCount(settings, 'menthols')],
    ['blackjack', readCount(settings, 'blackjacks')],
    ['tracker', readCount(settings, 'trackers')],
    ['developer', readCount(settings, 'developers')],
    ['journalist', readCount(settings, 'journalists')],
    ['adviser', readCount(settings, 'advisers')],
    ['guard', readCount(settings, 'guards')],
    ['commander', readCount(settings, 'commanders')],
    ['blackmailer', readCount(settings, 'blackmailers')],
    ['santa', readCount(settings, 'santas')],
    ['scout', readCount(settings, 'scouts')],
    ['teacher', readCount(settings, 'teachers')]
  ]);

  const countTeam = team =>
    [...desired].reduce(
      (sum, [role, count]) =>
        sum + (ROLE_TEAMS[role] === team ? count : 0),
      0
    );

  const specialMint = countTeam('mint');

  desired.set(
    'mint-punya',
    Math.max(0, mintTotal - specialMint)
  );

  const innocentSpecial = countTeam('innocent');
  const neutralDesired = countTeam('neutral');

  desired.set(
    'puny',
    Math.max(
      0,
      total - mintTotal - innocentSpecial - neutralDesired
    )
  );

  const players = new Set(playerIds);
  const assigned = new Map();
  const chosenCounts = new Map();

  let chosenMint = 0;
  let chosenInnocent = 0;
  let chosenNeutral = 0;

  for (const selection of selections) {
    check(
      selection && players.has(selection.playerId),
      'Выбранный билет принадлежит отсутствующему участнику.'
    );

    check(
      !assigned.has(selection.playerId),
      'Для одного участника выбрано несколько билетов.'
    );

    check(
      typeof selection.role === 'string' &&
      owns(ROLE_TEAMS, selection.role),
      'Билет содержит неподдерживаемую роль.'
    );

    assigned.set(selection.playerId, selection.role);

    chosenCounts.set(
      selection.role,
      (chosenCounts.get(selection.role) ?? 0) + 1
    );

    const team = ROLE_TEAMS[selection.role];

    if (team === 'mint') chosenMint++;
    else if (team === 'innocent') chosenInnocent++;
    else chosenNeutral++;
  }

  check(
    chosenMint <= mintTotal,
    `Выбрано ${chosenMint} билетов Мятных, но мест во фракции только ${mintTotal}. Снимите лишний выбор или увеличьте количество Мятных.`
  );

  const nonMintSlots = total - mintTotal;

  check(
    chosenInnocent + chosenNeutral <= nonMintSlots,
    `Билеты Мирных и Нейтралов занимают ${chosenInnocent + chosenNeutral} мест, а вне Мятной фракции доступно ${nonMintSlots}. Снимите лишний выбор или измените состав.`
  );

  check(
    nonMintSlots - chosenNeutral >= 1,
    'Выбранные Нейтралы не оставляют места хотя бы одному Мирному. Снимите выбор Нейтрала или измените состав матча.'
  );

  if (!selections.length) {
    check(
      specialMint <= mintTotal,
      'Специальных Мятных в настройках больше, чем мест Мятной фракции.'
    );

    check(
      mintTotal + innocentSpecial + neutralDesired <= total,
      'Слишком много специальных ролей в настройках.'
    );

    check(
      total - mintTotal - neutralDesired >= 1,
      'Настройки не оставляют ни одного Мирного.'
    );
  }

  const freePlayers = shuffle(
    playerIds.filter(id => !assigned.has(id))
  );

  const mintPool = poolFrom(
    desired,
    chosenCounts,
    'mint'
  );

  for (let i = 0; i < mintTotal - chosenMint; i++) {
    const id = freePlayers.pop();

    check(
      id !== undefined,
      'Недостаточно участников для Мятной фракции.'
    );

    assigned.set(id, mintPool.pop() ?? 'mint-punya');
  }

  const innocentPool = poolFrom(
    desired,
    chosenCounts,
    'innocent'
  );

  const neutralPool = poolFrom(
    desired,
    chosenCounts,
    'neutral'
  );

  if (chosenInnocent === 0) {
    const id = freePlayers.pop();

    check(
      id !== undefined,
      'Для матча нужен хотя бы один Мирный.'
    );

    assigned.set(id, innocentPool.pop() ?? 'puny');
  }

  const rest = shuffle([
    ...innocentPool,
    ...neutralPool
  ]);

  for (const id of freePlayers) {
    assigned.set(id, rest.pop() ?? 'puny');
  }

  const finalCounts = {
    mint: 0,
    innocent: 0,
    neutral: 0
  };

  for (const role of assigned.values()) {
    finalCounts[ROLE_TEAMS[role]]++;
  }

  check(
    assigned.size === total,
    'Ошибка раздачи: не всем назначена роль.'
  );

  check(
    finalCounts.mint === mintTotal &&
    finalCounts.innocent >= 1,
    'Ошибка состава фракций.'
  );

  for (const selection of selections) {
    check(
      assigned.get(selection.playerId) === selection.role,
      'Ошибка гарантированного выбора роли.'
    );
  }

  return assigned;
}