import { randomInt } from 'node:crypto';

export function createExtraRoles({ InnocentRole, Player }) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const palette = ['#bfe5fa','#f4cfdf','#cce9bd','#e4d4fa','#f8dfb4','#bfe8df','#f4d1bb','#d9e4b6'];
  function shuffledColors() {
    const result = [...palette];
    for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  class Alarm extends InnocentRole {
    static id = 'alarm';
    static displayName = 'Будильщик';
    static description = 'Разбуди их.';
    get abilities() {
      return [{ id: 'wake', name: 'Разбудить', targets: true, targetPolicy: 'sleeping-other' }];
    }
    get hackableIds() { return ['wake']; }
    payWake(id, target, now) {
      check(id === 'wake', 'Неизвестная способность Будильщика.');
      this.player.requireReady('wake', now);
      check(target instanceof Player && this.game.hasPlayer(target) && target !== this.player && target.state === 'sleeping', 'Можно разбудить только спящего, не изгнанного игрока.');
      this.player.cooldown('wake', this.game.settings.alarmCooldown ?? 30, now);
    }
    blockedUse(id, target, now) { this.payWake(id, target, now); }
    use(id, target, now) { this.payWake(id, target, now); target.getUp(); }
  }
  class Hacker extends InnocentRole {
    static id = 'hacker';
    static displayName = 'Хакер';
    static description = 'Получите информацию используя ваш терминал.';
    #data = [];
    #report = null;
    #sequence = 0;
    #lastCommand = null;
    get abilities() {
      return [
        { id: 'copy', name: `copy \${target} > datalist · ${this.#data.length}/3`, targets: true, disabled: this.#data.length >= 3 },
        { id: 'grep', name: 'grep ${change}', disabled: this.#data.length < 2 }
      ];
    }
    get hackableIds() { return ['copy', 'grep']; }
    validateCopy(target, now) {
      this.player.requireReady('copy', now);
      this.game.assertTarget(this.player, target);
      check(this.#data.length < 3, 'datalist заполнен: сначала выполни grep.');
      check(!this.#data.some(item => item.id === target.id), 'Этот игрок уже есть в datalist.');
      check(typeof target.team === 'string' && target.team.length > 0, 'Фракция цели недоступна.');
    }
    validateGrep() { check(this.#data.length >= 2, 'Для сравнения нужны минимум два разных игрока.'); }
    blockedUse(id, target, now) {
      if (id === 'copy') {
        this.validateCopy(target, now);
        this.player.cooldown('copy', this.game.settings.hackerCopyCooldown ?? 30, now);
      } else if (id === 'grep') { this.validateGrep(); this.#data = []; }
      else throw new Error('Неизвестная команда терминала.');
      this.#lastCommand = { name: id, blocked: true, at: now };
    }
    use(id, target, now) {
      if (id === 'copy') {
        this.validateCopy(target, now);
        this.player.cooldown('copy', this.game.settings.hackerCopyCooldown ?? 30, now);
        // The faction is downloaded now, never exposed in the raw client list.
        this.#data.push({ id: target.id, username: target.username, team: target.team });
      } else if (id === 'grep') {
        this.validateGrep();
        const colors = shuffledColors(), groups = new Map();
        for (const entry of this.#data) {
          if (!groups.has(entry.team)) groups.set(entry.team, { key: `group-${groups.size + 1}`, color: colors[groups.size], players: [] });
          groups.get(entry.team).players.push({ id: entry.id, username: entry.username });
        }
        this.#report = { sequence: ++this.#sequence, at: now, groups: [...groups.values()] };
        this.#data = [];
      } else throw new Error('Неизвестная команда терминала.');
      this.#lastCommand = { name: id, blocked: false, at: now };
    }
    terminalSnapshot() {
      return {
        capacity: 3,
        data: this.#data.map(item => ({ id: item.id, username: item.username })),
        report: this.#report ? {
          sequence: this.#report.sequence, at: this.#report.at,
          groups: this.#report.groups.map(group => ({ key: group.key, color: group.color, players: group.players.map(player => ({ ...player })) }))
        } : null,
        lastCommand: this.#lastCommand ? { ...this.#lastCommand } : null
      };
    }
  }
  return { Alarm, Hacker };
}
