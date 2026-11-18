export function createNewRoles({ InnocentRole, AttackerRole, MintPuny, Player }) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };

  class Chemist extends InnocentRole {
    static id = 'chemist';
    static displayName = 'Химик';
    static description = 'Спасайте их.';

    #uses;

    constructor(player) {
      super(player);
      this.#uses = this.game.settings.chemistAntimintCount ?? 2;
    }

    get abilities() {
      const infinite = this.#uses === 0;
      return [{
        id: 'antimint',
        name: `ПРОТИВОМЯТА · ${infinite ? '∞' : this.#uses}`,
        targets: true,
        disabled: !infinite && this.#uses <= 0
      }];
    }

    get hackableIds() { return ['antimint']; }

    payAntimint(id, target, now) {
      check(id === 'antimint', 'Неизвестная способность.');
      check(this.#uses === 0 || this.#uses > 0, 'Противомята закончилась.');
      this.game.assertTarget(this.player, target);
      this.player.requireReady('antimint', now);
      if (this.#uses !== 0) this.#uses--;
      this.player.cooldown('antimint', this.game.settings.chemistCooldown ?? 30, now);
    }

    blockedUse(id, target, now) { this.payAntimint(id, target, now); }

    use(id, target, now) {
      this.payAntimint(id, target, now);
      target.antiMintUntil = now + (this.game.settings.antimintSeconds ?? 40) * 1000;
      this.player.notify(`Противомята выдана: ${target.username}.`);
      // Цель узнаёт только через Шестое чувство — оно сработает через game.interact.
    }

    snapshot() {
      return { ...super.snapshot(), antimintRemaining: this.#uses };
    }
  }

  class Sapper extends MintPuny {
    static id = 'sapper';
    static displayName = 'Сапёр';
    static description = 'Взорвите их.';

    get abilities() {
      const game = this.game;
      return [
        ...super.abilities, // lull + sabotage от обычного Мятного
        { id: 'mine', name: 'Заминировать', targets: true },
        {
          id: 'detonate',
          name: 'АКТИВИРОВАТЬ',
          disabled: !game.sapperReadyToDetonate() || Boolean(game.sapperBlast)
        }
      ];
    }

    get hackableIds() {
      return [...super.hackableIds, 'mine', 'detonate'];
    }

    hackKey(id) {
      // rocket/wifi уже мапятся в 'sabotage' в MintPuny
      return super.hackKey(id);
    }

    payMine(id, target, now) {
      check(id === 'mine', 'Неизвестная способность.');
      this.game.assertTarget(this.player, target);
      check(!this.game.mines.has(target.id), 'Этот игрок уже заминирован.');
      this.player.requireReady('mine', now);
      this.player.cooldown('mine', this.game.settings.sapperMineCooldown ?? 25, now);
    }

    payDetonate(id, now) {
      check(id === 'detonate', 'Неизвестная способность.');
      check(this.game.sapperReadyToDetonate(), 'Заминированы не все цели.');
      check(!this.game.sapperBlast, 'Взрыв уже активирован.');
      this.player.requireReady('detonate', now);
    }

    blockedUse(id, target, now) {
      if (id === 'mine') return this.payMine(id, target, now);
      if (id === 'detonate') return this.payDetonate(id, now);
      return super.blockedUse(id, target, now);
    }

    use(id, target, now) {
      if (id === 'mine') {
        this.payMine(id, target, now);
        this.game.mines.add(target.id);
        return;
      }
      if (id === 'detonate') {
        this.payDetonate(id, now);
        this.game.startSapperBlast(this.player, now);
        return;
      }
      return super.use(id, target, now); // lull и sabotage работают как у обычного Мятного
    }
  }

  return { Chemist, Sapper };
}