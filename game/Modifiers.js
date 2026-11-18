import { fire } from './Gun.js';
import { Player } from './Game.js';

export class Modifier {
  static id = 'modifier';
  static displayName = 'Modifier';
  static description = '';

  constructor(player) {
    this.player = player;
  }

  get game() {
    return this.player.game;
    }

  onInteraction(interaction) {}
  onStateChanged(game) {}
  onAssigned() {}
  snapshot() {
    return {
      id: this.constructor.id,
      name: this.constructor.displayName,
      description: this.constructor.description
    };
  }
}
export class SixthSense extends Modifier{
 static id='sixth-sense';static displayName='Шестое чувство';static description='При взаимодействии любого игрока с тобой экран на секунду становится зелёным.';
 onInteraction({now}){this.player.feedback.sixthSenseUntil=Math.max(this.player.feedback.sixthSenseUntil,now+1000);}
}




export class Traitor extends Modifier {
  static id = 'traitor';
  static displayName = 'Предатель';
  static description = 'Если все Мятные выбыли, вы становитесь Мятным.';

  constructor(player) {
    super(player);

    this.activated = false;
    this.originalRoleId = player.role?.constructor.id ?? null;
  }

  onStateChanged(game) {
    if (this.activated) return;

    if (game.phase !== 'playing') return;

    const mintAlive = [...game.players.values()].some(
      p => p.awake && p.team === 'mint'
    );

    if (mintAlive) return;

    const traitor = this.player;

    if (!traitor.awake) return;

    if (traitor.team !== 'innocent') return;

    const mode = game.settings.traitorMode ?? 'random';

    let roleId;

    if (mode === 'random') {
      const mintRoles = ['mint-puny', 'mint-cook', 'glitch'];

      roleId = mintRoles[
        Math.floor(Math.random() * mintRoles.length)
      ];
    } else {
      roleId = this.getDependentRole(this.originalRoleId);
    }

    traitor.setRole(roleId);

    this.activated = true;

    traitor.notify('Вы стали Предателем.');
  }

  getDependentRole(originalRoleId) {
    switch (originalRoleId) {
      case 'puny':
        return 'mint-puny';

      case 'technician':
        return 'mint-cook';

      case 'spy':
        return 'glitch';

      case 'judge':
        return 'mint-puny';

      case 'lawyer':
        return 'mint-cook';

      case 'chemist':
        return 'glitch';

      default:
        return 'mint-puny';
    }
  }

  snapshot() {
    return {
      ...super.snapshot(),
      activated: this.activated,
      originalRoleId: this.originalRoleId
    };
  }
}



export class Egoist extends Modifier {
  static id = 'egoist';
  static displayName = 'Эгоист';
  static description = 'Победите, только если останетесь единственным Мирным.';

  constructor(player) {
    super(player);
  }
}

export class Decoy extends Modifier {
  static id = 'decoy';
  static displayName = 'Приманка';
  static description = 'Если вас усыпляют, происходит мгновенный репорт. Не работает во время ракетного удара или поломки Wi‑Fi.';

  constructor(player) {
    super(player);
  }

  onInteraction(interaction) {
    if (interaction.kind !== 'lull') return;

    const target = interaction.target;

    if (!target || target.id !== this.player.id) return;

    const game = this.player.game;

    if (game.phase !== 'playing') return;

    // Во время ракетного удара или поломки Wi‑Fi Приманка не срабатывает.
    if (game.rocket || game.wifi) return;

    const meeting = game.meetings.current;

    if (!meeting) return;

    if (meeting.phase !== 'discussion') return;

    if (meeting.reported.has(this.player.id)) return;

    meeting.reported.add(this.player.id);

    this.player.notify('Вас усыпили — произошёл репорт.');
  }
}

export class Tiebreaker extends Modifier {
  static id = 'tiebreaker';
  static displayName = 'Ничьялом';
  static description = 'В случае ничьи ваш голос решающий.';

  constructor(player) {
    super(player);
  }
}

export class Radio extends Modifier {
  static id = 'radio';
  static displayName = 'Рация';
  static description = 'В игре ничего не делает. В реальной жизни возьмите рацию.';

  constructor(player) {
    super(player);
  }
}

export class Invulnerable extends Modifier {
  static id = 'invulnerable';
  static displayName = 'Неуязвимый';
  static description = 'Вас нельзя усыпить.';

  constructor(player) {
    super(player);
  }
}

export class Celebrity extends Modifier {
  static id = 'celebrity';
  static displayName = 'Знаменитость';
  static description = 'Все видят, когда вас усыпляют или когда вы кого-то усыпляете.';

  constructor(player) {
    super(player);
  }

  static announceLull(game, celebrity, other, celebrityIsAttacker) {
    const text = celebrityIsAttacker
      ? `Знаменитость ${celebrity.username} усыпила ${other.username}!`
      : `Знаменитость ${celebrity.username} была усыплена!`;

    for (const player of game.players.values()) {
      player.notify(text);
    }
  }
}




export class DoubleShot extends Modifier {
  static id = 'double-shot';
  static displayName = 'Двойной выстрел';
  static description = 'Выберите две цели и угадайте их роли. Если обе роли угаданы — усыпляются обе цели. Иначе усыпляетесь вы.';

  constructor(player) {
    super(player);

    this.ammo = this.game.settings.doubleShotAmmo ?? 1;
  }

  static allowedFor(player, mode) {
    if (mode === 'all') return true;

    if (mode === 'attackers') {
      return player.team === 'mint';
    }

    if (mode === 'non-attackers') {
      return player.team !== 'mint';
    }

    return false;
  }

  get abilities() {
    return [
      {
        id: 'double-shot',
        name: `ДВОЙНОЙ ВЫСТРЕЛ · ${this.ammo}`,
        targets: true,
        meetingOnly: true,
        disabled: this.ammo === 0
      }
    ];
  }

  get hackableIds() {
    return ['double-shot'];
  }

  canUseDuringMeeting(id) {
    return id === 'double-shot';
  }

  requireReady(now) {
    const until = this.player.cooldowns.get('double-shot') ?? 0;

    if (until > now) {
      throw new Error(
        `Перезарядка: ${Math.ceil((until - now) / 1000)} сек.`
      );
    }
  }

  validateShot(targetA, targetB, params, now) {
    if (this.ammo <= 0) {
      throw new Error('Патроны закончились.');
    }

    if (!targetA || !targetB) {
      throw new Error('Нужно выбрать две цели.');
    }

    if (targetA === targetB) {
      throw new Error('Нужно выбрать двух разных игроков.');
    }

    if (targetA === this.player || targetB === this.player) {
      throw new Error('Нельзя выбрать себя.');
    }

    if (!this.game.hasPlayer(targetA) || !this.game.hasPlayer(targetB)) {
      throw new Error('Цель не найдена.');
    }

    if (!targetA.awake || !targetB.awake) {
      throw new Error('Обе цели должны быть в сознании.');
    }

    if (
      typeof params?.roleAGuess !== 'string' ||
      typeof params?.roleBGuess !== 'string'
    ) {
      throw new Error('Нужно угадать обе роли.');
    }

    // Используем встроенный метод класса Player
    this.player.requireReady('double-shot', now);
  }

  use(id, targetA, now, params) {
    if (id !== 'double-shot') {
      return super.use(id, targetA, now, params);
    }

    const targetB = this.game.player(params?.targetBId);

    this.validateShot(targetA, targetB, params, now);

    this.ammo--;

    this.player.cooldown(
      'double-shot',
      this.game.settings.doubleShotCooldown ?? 0,
      now
    );

    const roleAGuess = params.roleAGuess;
    const roleBGuess = params.roleBGuess;

    const roleAActual = targetA.role?.constructor.id ?? null;
    const roleBActual = targetB.role?.constructor.id ?? null;

    const bothCorrect =
      roleAGuess === roleAActual &&
      roleBGuess === roleBActual;

    let shots;

    if (bothCorrect) {
      shots = [
        fire(targetA, this.player, now),
        fire(targetB, this.player, now)
      ];
    } else {
      shots = [
        fire(this.player, this.player, now)
      ];
    }

    return {
      correct: bothCorrect,
      shots
    };
  }

  snapshot() {
    return {
      ...super.snapshot(),
      ammo: this.ammo
    };
  }
}



export class Informed extends Modifier {
  static id = 'informed';
  static displayName = 'Информирован';
  static description = 'Смотрите лог действий ваших тимейтов.';

  constructor(player) {
    super(player);
  }

  get abilities() {
    return [
      {
        id: 'informed-log',
        name: 'ЛОГ ДЕЙСТВИЙ',
        targets: false,
        meetingOnly: false,
        disabled: false
      }
    ];
  }

  get hackableIds() {
    return ['informed-log'];
  }

  canUseDuringMeeting() {
    return false;
  }

  canUseWithoutTablet() {
    return true;
  }

  use(id) {
    if (id !== 'informed-log') {
      return super.use(id);
    }

    const log = this.game.actionLog
      .filter(
        entry =>
          entry.team === 'mint' &&
          entry.actorId !== this.player.id
      )
      .slice(-30)
      .reverse();

    return {
      log
    };
  }
}

export class SatelliteLink extends Modifier {
  static id = 'satellite-link';
  static displayName = 'Связь со Спутником';
  static description = 'Запросите статус всех игроков.';

  constructor(player) {
    super(player);

    this.uses = this.game.settings.satelliteUses ?? 2;
  }

  get abilities() {
    return [
      {
        id: 'satellite-request',
        name: `ЗАПРОС · ${this.uses}`,
        targets: false,
        meetingOnly: false,
        disabled: this.uses <= 0
      }
    ];
  }

  get hackableIds() {
    return ['satellite-request'];
  }

  canUseDuringMeeting() {
    return false;
  }

  canUseWithoutTablet() {
    return true;
  }

  use(id, target, now) {
    if (id !== 'satellite-request') {
      return super.use(id, target, now);
    }

    if (this.uses <= 0) {
      throw new Error('Запросы закончились.');
    }

    this.uses--;

    this.player.cooldown(
      'satellite-request',
      this.game.settings.satelliteCooldown ?? 60,
      now
    );

    const players = [...this.game.players.values()].map(player => ({
      id: player.id,
      username: player.username,
      state: player.state
    }));

    return {
      players
    };
  }

  snapshot() {
    return {
      ...super.snapshot(),
      uses: this.uses
    };
  }
}

export class Tag extends Modifier {
  static id = 'tag';
  static displayName = 'Бирка';
  static description = 'После репорта вы узнаёте роль тела.';

  constructor(player) {
    super(player);
  }

  onInteraction(interaction) {
    if (interaction.kind !== 'report') return;

    const target = interaction.target;

    if (!target || target.id === this.player.id) return;

    const roleName =
      target.role?.displayName ?? 'Неизвестная роль';

    this.player.notify(
      `Бирка: ${target.username} был ${roleName}.`
    );
  }
}

export class WalkingButton extends Modifier {
  static id = 'walking-button';
  static displayName = 'Ходячая Кнопка';
  static description = 'Вызывайте собрание откуда угодно.';

  constructor(player) {
    super(player);

    this.uses = this.game.settings.walkingButtonUses ?? 1;
  }

  get abilities() {
    return [
      {
        id: 'walking-button',
        name: `КНОПКА · ${this.uses}`,
        targets: false,
        meetingOnly: false,
        disabled: this.uses <= 0
      }
    ];
  }

  get hackableIds() {
    return ['walking-button'];
  }

  canUseDuringMeeting() {
    return false;
  }

  canUseWithoutTablet() {
    return true;
  }

  use(id, target, now) {
    if (id !== 'walking-button') {
      return super.use(id, target, now);
    }

    if (this.uses <= 0) {
      throw new Error('Кнопки закончились.');
    }

    if (this.game.meetings.current) {
      throw new Error('Собрание уже идёт.');
    }

    this.uses--;

    this.player.cooldown(
      'walking-button',
      this.game.settings.walkingButtonCooldown ?? 90,
      now
    );

    this.game.meetings.forceEmergency(
      this.player.id,
      now
    );

    return {};
  }

  snapshot() {
    return {
      ...super.snapshot(),
      uses: this.uses
    };
  }
}