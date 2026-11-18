import { randomInt, randomUUID } from 'node:crypto';

const games = new WeakMap();

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function context(game) {
  let data = games.get(game);

  if (!data) {
    data = {
      roles: [],
      meetingId: null,
      meetingNumber: 0,
      shots: []
    };

    games.set(game, data);
  }

  const meeting = game.meetings.current;

  if (meeting && meeting.id !== data.meetingId) {
    data.meetingId = meeting.id;
    data.meetingNumber++;
    data.shots = [];
  }

  return data;
}

function options(game) {
  const settings = game.settings;

  return {
    count: settings.gunCount ?? 0,
    maxGuesses: settings.gunMaxGuesses ?? 3,
    multiple: settings.gunMultiplePerMeeting === 'yes',
    failure: settings.gunFailure ?? 'self',
    banMeetings: settings.gunBanMeetings ?? 1,
    eligibility: settings.gunEligibility ?? 'attack'
  };
}

export const gunSettingsSchema = [
  {
    id: 'gunCount',
    label: 'Модификатор Пушка: количество',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'gunMaxGuesses',
    label: 'Пушка: попыток за раунд (0 — бесконечно)',
    type: 'number',
    min: 0,
    max: 30,
    step: 1,
    default: 3
  },
  {
    id: 'gunMultiplePerMeeting',
    label: 'Пушка: несколько попыток за собрание',
    type: 'select',
    default: 'no',
    options: [
      { value: 'no', label: 'Нет' },
      { value: 'yes', label: 'Да' }
    ]
  },
  {
    id: 'gunFailure',
    label: 'Пушка: последствие ошибки',
    type: 'select',
    default: 'self',
    options: [
      { value: 'self', label: 'Выстрел в себя' },
      { value: 'lose', label: 'Потеря модификатора' },
      { value: 'ban', label: 'Запрет стрельбы на следующие собрания' },
      { value: 'nothing', label: 'Ничего' }
    ]
  },
  {
    id: 'gunBanMeetings',
    label: 'Пушка: следующих собраний без стрельбы',
    type: 'number',
    min: 1,
    max: 30,
    step: 1,
    default: 1
  },
  {
    id: 'gunEligibility',
    label: 'Пушка: кому может выпасть',
    type: 'select',
    default: 'attack',
    options: [
      { value: 'all', label: 'Всем' },
      {
        value: 'attack',
        label: 'Только с усыплением или выстрелом'
      },
      {
        value: 'noattack',
        label: 'Только без усыпления и выстрела'
      }
    ]
  }
];

/**
 * Передаются реальные классы зарегистрированных игровых ролей.
 * Каталог билетов здесь не используется.
 */
export function configureGunRoles(game, roleClasses) {
  check(Array.isArray(roleClasses), 'Не задан список ролей Пушки.');

  const ids = new Set();

  context(game).roles = roleClasses.map(Role => {
    check(
      Role &&
      typeof Role.id === 'string' &&
      Role.id.length > 0 &&
      !ids.has(Role.id),
      'Неверная или повторяющаяся роль в списке Пушки.'
    );

    ids.add(Role.id);

    return {
      id: Role.id,
      name: Role.displayName ?? Role.id
    };
  });
}

export class Gun {
  static id = 'gun-guesser';
  static displayName = 'Пушка';
  static description = 'Поаккуратнее с этим!';

  constructor(player) {
    this.player = player;
    this.used = 0;
    this.lastAttemptMeeting = null;
    this.blockedThroughMeeting = 0;
    this.removed = false;
  }

  unavailableReason() {
    const player = this.player;
    const game = player.game;
    const data = context(game);
    const settings = options(game);
    const meeting = game.meetings.current;

    if (this.removed) return 'Модификатор потерян.';

    if (game.phase !== 'playing' || !meeting) {
    return 'Пушка доступна только во время собрания.';
  }

    if (!player.awake) {
      return 'Ты спишь или изгнан.';
    }

    if (!data.roles.length) {
      return 'Список ролей Пушки не настроен.';
    }

    if (
      settings.maxGuesses > 0 &&
      this.used >= settings.maxGuesses
    ) {
      return 'Угадывания закончились.';
    }

    if (
      this.blockedThroughMeeting > 0 &&
      data.meetingNumber <= this.blockedThroughMeeting
    ) {
      return 'Стрельба временно запрещена.';
    }

    if (
      !settings.multiple &&
      this.lastAttemptMeeting === meeting.id
    ) {
      return 'В этом собрании попытка уже использована.';
    }

    return '';
  }

  snapshot() {
    const game = this.player.game;
    const data = context(game);
    const settings = options(game);
    const reason = this.unavailableReason();

    return {
      id: Gun.id,
      name: Gun.displayName,
      description: Gun.description,

      canGuess: reason === '',
      reason,

      used: this.used,

      // null означает бесконечное количество.
      remaining: settings.maxGuesses === 0
        ? null
        : Math.max(0, settings.maxGuesses - this.used),

      bannedFutureMeetings: Math.max(
        0,
        this.blockedThroughMeeting - data.meetingNumber
      ),

      roles: data.roles.map(role => ({ ...role }))
    };
  }
}

/**
 * Вызывается после раздачи ролей.
 * Совместим с текущим player.modifiers.
 */
export function assignGuns(game) {
  const settings = options(game);
  const data = context(game);

  check(
    Number.isSafeInteger(settings.count) &&
    settings.count >= 0 &&
    settings.count <= 15,
    'Некорректное количество модификаторов Пушка.'
  );

  if (settings.count === 0) return [];

  check(data.roles.length > 0, 'Сначала настрой список ролей Пушки.');

  const candidates = [...game.players.values()].filter(player => {
    if (player.modifiers.some(modifier => modifier instanceof Gun)) {
      return false;
    }

    const hasAttack = player.role.abilities.some(
      ability => ability.id === 'lull' || ability.id === 'gun'
    );

    if (settings.eligibility === 'all') return true;
    if (settings.eligibility === 'attack') return hasAttack;
    if (settings.eligibility === 'noattack') return !hasAttack;

    throw new Error('Неизвестный режим выдачи Пушки.');
  });

  check(
    settings.count <= candidates.length,
    'Пушек больше, чем подходящих игроков.'
  );

  for (let index = candidates.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);

    [candidates[index], candidates[other]] =
      [candidates[other], candidates[index]];
  }

  const recipients = candidates.slice(0, settings.count);

  for (const player of recipients) {
    player.modifiers.push(new Gun(player));
  }

  return recipients.map(player => player.id);
}

/**
 * Применяет реальное попадание ДО создания события анимации.
 */
export function fire(target, shooter, now) {
  const game = shooter.game;
  const meeting = game.meetings.current;
  const data = context(game);

  check(
    typeof target.constructor.lull === 'function',
    'Не найдена статическая функция Player.lull.'
  );

  // В текущем Player.lull уже находится проверка щита Пуника.
  target.constructor.lull(shooter, target);
  game.gunGuesses.set(target.id, shooter.id);

  const shot = {
    id: randomUUID(),
    gameId: game.id,
    meetingId: meeting.id,

    shooterId: shooter.id,
    targetId: target.id,

    time: now,
    duration: 1800,

    killed: target.state === 'sleeping',
    shielded: target.awake
  };

  data.shots.push(shot);

  if (data.shots.length > 100) {
    data.shots.shift();
  }

  return shot;
}

/**
 * role — строковый ID: 'puny', 'glitch', 'mint-punik' и т. п.
 */
export function guess(target, shooter, role) {
  check(
    shooter?.game && target?.game === shooter.game,
    'Некорректные участники.'
  );

  const game = shooter.game;
  const meeting = game.meetings.current;

  check(
    game.hasPlayer(shooter) && game.hasPlayer(target),
    'Игрок не является участником.'
  );

  check(
    game.phase === 'playing' && meeting,
    'Сейчас нет активного голосования.'
  );

  check(
    game.phase === 'playing' &&
    meeting &&
    ['discussion', 'voting'].includes(meeting.phase),
    'Пушка доступна только во время обсуждения или голосования.'
  );

  const endsAt = game.meetings.snapshot().meeting?.endsAt;
  if (endsAt !== null && endsAt !== undefined) {
    check(Number.isFinite(endsAt) && Date.now() < endsAt, 'Время голосования истекло.');
  }

  shooter.assertCanAct(true);



  check(target.awake, 'Цель уже спит или изгнана.');

  const data = context(game);
  const settings = options(game);

  check(
    typeof role === 'string' &&
    data.roles.some(item => item.id === role),
    'Неизвестная роль.'
  );

  const gun = shooter.modifiers.find(
    modifier => modifier instanceof Gun && !modifier.removed
  );

  check(gun, 'У тебя нет модификатора Пушка.');

  const reason = gun.unavailableReason();
  check(reason === '', reason);

  const correct = target.role.constructor.id === role;

  // Одна попытка, даже если наказание — выстрел в себя.
  gun.used++;
  gun.lastAttemptMeeting = meeting.id;

  const shots = [];
  const now = Date.now();

  if (correct) {
    shots.push(fire(target, shooter, now));
  } else {
    switch (settings.failure) {
      case 'self': {
        shots.push(fire(shooter, shooter, now));
        break;
      }

      case 'lose': {
        gun.removed = true;

        const index = shooter.modifiers.indexOf(gun);

        if (index >= 0) {
          shooter.modifiers.splice(index, 1);
        }

        shooter.notify(
          'Роль не угадана. Модификатор Пушка потерян.'
        );
        break;
      }

      case 'ban': {
        gun.blockedThroughMeeting =
          data.meetingNumber + settings.banMeetings;

        shooter.notify(
          `Роль не угадана. Пушка заблокирована до конца ` +
          `текущего и на ${settings.banMeetings} следующих собраний.`
        );
        break;
      }

      case 'nothing': {
        shooter.notify('Роль не угадана.');
        break;
      }

      default:
        throw new Error('Неизвестное последствие ошибки.');
    }
  }

  return {
    correct,
    penalty: correct ? null : settings.failure,
    shots
  };
}

/**
 * Публичные данные анимаций.
 * Выбранные и настоящие роли сюда не передаются.
 */
export function gunMeetingState(game) {
  const data = context(game);

  return {
    meetingId: data.meetingId,
    shots: data.shots.map(shot => ({ ...shot }))
  };
}