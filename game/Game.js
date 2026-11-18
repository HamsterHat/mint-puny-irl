import{randomInt,randomUUID}from'node:crypto';
import{tasksPool}from'./tasks.js';
import{defaultSettings,validateSettings}from'./settings.js';
import{Meetings}from'./Meetings.js';
import{SixthSense, Traitor, Egoist, Tiebreaker, Decoy, Radio, DoubleShot, Informed, SatelliteLink, Tag, WalkingButton }from'./Modifiers.js';
import { assignSelectedRoles } from './role-selection.js';
import { createExtraRoles } from './roles-extra.js';
import {
  configureGunRoles,
  assignGuns,
  gunMeetingState,
  fire
} from './Gun.js';
import { createNewRoles } from './roles-new.js';
import { createSchoolRoles } from './roles-school.js';
import exams from './data/exams.json' with {
  type: 'json'
};

function check(condition,message){if(!condition)throw new Error(message);}
function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
function shuffled(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export class Role{
 static id='role';static displayName='Role';static description='';
 constructor(player){this.player=player;}
 get game(){return this.player.game;}get team(){return'neutral';}get fakeTasks(){return false;}get abilities(){return[];}
 onAssigned(){}onRemoved(){}onExiled(cause){}
 canUseDuringMeeting(id){return false;}canUseWithoutTablet(id){return false;}
 hackKey(id){return id;}
 get hackableIds(){return[];}
 use(id,target,now,params={}){throw new Error('Способность недоступна.');}
 blockedUse(id,target,now,params={}){throw new Error('Взлом этой способности не поддерживается.');}
 snapshot(){return{id:this.constructor.id,name:this.constructor.displayName,description:this.constructor.description,team:this.team};}
}
export class InnocentRole extends Role{get team(){return'innocent';}}
export class AttackerRole extends Role{get team(){return'mint';}get fakeTasks(){return true;}}
export class Puny extends InnocentRole{static id='puny';static displayName='Пуня';static description='Выполняйте ваши задания.';}
export class Policeman extends InnocentRole{
 static id='policeman';static displayName='Полицейский';static description='Используйте ваше оружие ради Справедливости.';
 constructor(player){super(player);this.ammo=this.game.settings.policeAmmo;this.armed=true;}
 get abilities(){return[{id:'gun',name:`Выстрел · ${this.ammo}`,targets:true,disabled:!this.armed||this.ammo<=0}];}
 get hackableIds(){return['gun'];}
 takeShot(id,target,now){check(id==='gun','Неизвестная способность.');check(this.armed&&this.ammo>0,'Оружие недоступно.');this.game.assertTarget(this.player,target);this.player.requireReady('gun',now);this.ammo--;this.player.cooldown('gun',this.game.settings.policeCooldown,now);}
 blockedUse(id,target,now){this.takeShot(id,target,now);}
 use(id,target,now){
  this.takeShot(id,target,now);const s=this.game.settings;const p=this.player;
  if(target.team==='innocent'){if(s.innocentFate==='sleep')Player.lull(p,target);if(s.policePenalty==='disarm')this.armed=false;if(s.policePenalty==='sleep')Player.lull(null,p);}else Player.lull(p,target);
 }
}
export class MintPuny extends AttackerRole{
 static id='mint-punya';static displayName='Мятный Пуня';static description='Усыпляйте и ломайте системы.';
 get abilities(){return[{id:'lull',name:'Усыпить',targets:true},{id:'sabotage',name:'Поломки',menu:'sabotage'}];}
 get hackableIds(){return['lull','sabotage'];}
 hackKey(id){return id==='rocket'||id==='wifi'?'sabotage':super.hackKey(id);}
 payMint(id,target,now){
  if(id==='lull'){this.game.assertTarget(this.player,target);this.player.requireReady('lull',now);this.player.cooldown('lull',this.game.settings.lullCooldown,now);return;}
  if(id==='rocket'||id==='wifi'){check(!this.game.meetings.blocked,'Сейчас собрание.');check(id==='rocket'?!this.game.rocket:!this.game.wifi,'Эта поломка уже активна.');this.player.requireReady('sabotage',now);this.player.cooldown('sabotage',this.game.settings.sabotageCooldown,now);return;}
  throw new Error('Неизвестная способность.');
 }
 blockedUse(id,target,now){this.payMint(id,target,now);}
 use(id,target,now){this.payMint(id,target,now);if(id==='lull')Player.lull(this.player,target);else this.game.startSabotage(this.player,id,now);}
}
export class MintCook extends MintPuny{
 static id='mint-cook';static displayName='Мятный Повар';static description="Дайте им ваш *сонный* чай.";
 get abilities(){return[...super.abilities,{id:'tea',name:'Чай',targets:true}];}
 get hackableIds(){return[...super.hackableIds,'tea'];}
 payTea(target,now){this.game.assertTarget(this.player,target);check(!this.game.pendingTea.has(target.id),'Этому игроку уже дали чай.');this.player.requireReady('tea',now);this.player.cooldown('tea',this.game.settings.teaCooldown,now);}
 blockedUse(id,target,now){if(id!=='tea')return super.blockedUse(id,target,now);this.payTea(target,now);}
 use(id,target,now){
    if(id!=='tea')return super.use(id,target,now);
    this.payTea(target,now);
    this.game.pendingTea.set(target.id, {
      dueAt: now + this.game.settings.teaDelay * 1000,
      sourceId: this.player.id
    });
  }
}
export class TechnicPuny extends InnocentRole{
 static id='technician';static displayName='Техник';static description='Чините поломки.';
 #uses;#challenge=null;#lastCode=null;
 constructor(player){super(player);this.#uses=this.game.settings.technicFixes;}
 get abilities(){return[{id:'fix',name:`FIX · ${this.#uses}`,offline:true,disabled:this.#uses<=0}];}
 get hackableIds(){return['fix'];}
 hackKey(id){return id==='fix-confirm'?'fix':super.hackKey(id);}
 canUseWithoutTablet(id){return id==='fix'||id==='fix-confirm';}
 validateFix(id,now,params){
  check(this.#uses>0,'Попытки починки закончились.');this.player.requireReady('fix',now);
  if(id==='fix'){check(this.game.activeCrises().length,'Сейчас нет поломок.');return;}
  check(id==='fix-confirm','Неизвестная способность.');const c=this.#challenge;
  check(c&&now<c.expiresAt,'Код устарел. Открой FIX заново.');
  check(params&&typeof params==='object'&&typeof params.code==='string'&&/^\d{6}$/.test(params.code)&&params.code===c.code,'Неверный код.');
  check(c.crises.includes(params.crisis)&&this.game.activeCrises().includes(params.crisis),'Эта поломка уже устранена или не выбрана.');
 }
 spendFix(now){this.#uses--;this.#challenge=null;this.player.cooldown('fix',this.game.settings.technicCooldown,now);}
 blockedUse(id,target,now,params){this.validateFix(id,now,params);this.spendFix(now);}
 use(id,target,now,params={}){
  this.validateFix(id,now,params);
  if(id==='fix'){
   let code;do{code=String(randomInt(1000000)).padStart(6,'0');}while(code===this.#lastCode);this.#lastCode=code;
   this.#challenge={id:randomUUID(),code,expiresAt:now+60000,crises:this.game.activeCrises()};return;
  }
  this.game.repairCrisis(params.crisis);this.spendFix(now);
 }
 onRemoved(){this.#challenge=null;}
 snapshot(){return{...super.snapshot(),fixesRemaining:this.#uses,fixChallenge:this.#challenge?{...this.#challenge,crises:[...this.#challenge.crises]}:null};}
}
export class Spy extends InnocentRole{
 static id='spy';static displayName='Шпион';static description='Получите информацию о них.';
 #uses;#intel=new Map();
 constructor(player){super(player);this.#uses=this.game.settings.spyReveals;}
 get abilities(){return[{id:'spy-reveal',name:`Вскрыть · ${this.#uses}`,targets:true,disabled:this.#uses<=0}];}
 get hackableIds(){return['spy-reveal'];}
 payReveal(id,target,now){check(id==='spy-reveal','Неизвестная способность.');check(this.#uses>0,'Попытки вскрытия закончились.');this.game.assertTarget(this.player,target);check(!this.#intel.has(target.id),'Ты уже вскрывал этого игрока.');this.player.requireReady('spy-reveal',now);this.#uses--;this.player.cooldown('spy-reveal',this.game.settings.spyCooldown,now);}
 blockedUse(id,target,now){this.payReveal(id,target,now);}
 use(id,target,now){this.payReveal(id,target,now);const r=target.role.snapshot();this.#intel.set(target.id,{targetId:target.id,username:target.username,roleId:r.id,roleName:r.name,time:now});this.player.notify(`${target.username}: ${r.name}`);target.notify(`${this.player.username} вскрыл твою роль.`);}
 snapshot(){return{...super.snapshot(),revealsRemaining:this.#uses,intel:[...this.#intel.values()].map(item=>({...item}))};}
}
export class Judge extends InnocentRole{
 static id='judge';static displayName='Судья';static description='Возьмите вверх на собрании.';
 #uses;
 constructor(player){super(player);this.#uses=this.game.settings.judgeUses;}
 get abilities(){return[{id:'judge',name:`Приговор · ${this.#uses}`,targets:true,meetingOnly:true,targetPolicy:'any-not-exiled',disabled:this.#uses<=0||!this.game.meetings.current}];}
 get hackableIds(){return['judge'];}
 canUseDuringMeeting(id){return id==='judge';}
 payJudge(id,target){check(id==='judge'&&this.game.meetings.current,'Приговор доступен во время голосования.');check(this.#uses>0,'Приговоры закончились.');check(target instanceof Player&&this.game.hasPlayer(target)&&target.state!=='exiled','Цель уже изгнана или не найдена.');this.#uses--;}
 blockedUse(id,target,now){this.payJudge(id,target);}
 use(id,target,now){this.payJudge(id,target);this.game.meetings.forceExile(target);}
}
export class Lawyer extends InnocentRole{
 static id='lawyer';static displayName='Адвокат';static description='Защитите их.';
 #uses;
 constructor(player){super(player);this.#uses=this.game.settings.lawyerUses;}
 get abilities(){return[{id:'protect',name:`Защитить · ${this.#uses}`,targets:true,meetingOnly:true,targetPolicy:'awake-with-self',disabled:this.#uses<=0||!this.game.meetings.current}];}
 get hackableIds(){return['protect'];}
 canUseDuringMeeting(id){return id==='protect';}
 payProtection(id,target){const m=this.game.meetings.current;check(id==='protect'&&m,'Защита доступна во время голосования.');check(this.#uses>0,'Защиты закончились.');check(target instanceof Player&&this.game.hasPlayer(target)&&target.awake,'Цель недоступна.');check(!m.protected.has(target.id),'Цель уже защищена.');this.#uses--;}
 blockedUse(id,target,now){this.payProtection(id,target);}
 use(id,target,now){this.payProtection(id,target);this.game.meetings.protect(target);}
}
export class Glitch extends MintPuny{
 static id='glitch';static displayName='Глитч';static description='Используйте баги для получения абсолютной силы.';
 #terminated=false;
 get abilities(){return[...super.abilities,{id:'hack',name:'HACK',menu:'hack'},{id:'terminate',name:'TERMINATE',meetingOnly:true,disabled:this.#terminated||!this.game.meetings.terminable}];}
 get hackableIds(){return[...super.hackableIds,'hack','terminate'];}
 canUseDuringMeeting(id){return id==='terminate';}
 validateHack(target,params,now){this.game.assertTarget(this.player,target);this.player.requireReady('hack',now);check(params&&typeof params.abilityId==='string'&&target.role.hackableIds.includes(params.abilityId),'Нельзя взломать эту способность.');check(!this.game.hacks.get(target.id)?.has(params.abilityId),'Эта способность уже взломана.');}
 payTerminate(id){check(id==='terminate'&&this.game.meetings.terminable,'Сейчас нет собрания для прерывания.');check(!this.#terminated,'TERMINATE уже использован.');this.#terminated=true;}
 blockedUse(id,target,now,params={}){
  if(id==='terminate'){this.payTerminate(id);return;}
  if(id==='hack'){this.validateHack(target,params,now);this.player.cooldown('hack',this.game.settings.hackCooldown,now);return;}
  super.blockedUse(id,target,now,params);
 }
 use(id,target,now,params={}){
  if(id==='terminate'){this.payTerminate(id);this.game.meetings.terminate();return;}
  if(id==='hack'){
   this.validateHack(target,params,now);let traps=this.game.hacks.get(target.id);if(!traps){traps=new Map();this.game.hacks.set(target.id,traps);}
   traps.set(params.abilityId,{sourceId:this.player.id});this.player.cooldown('hack',this.game.settings.hackCooldown,now);return;
  }
  super.use(id,target,now,params);
 }
}
export class Jester extends Role{
 static id='jester';static displayName='Шут';static description='Превратите игру в хаос!';
 get fakeTasks(){return true;}get abilities(){return[{id:'poke',name:'POKE',targets:true}];}get hackableIds(){return['poke'];}
 payPoke(id,target,now){check(id==='poke','Неизвестная способность.');this.game.assertTarget(this.player,target);this.player.requireReady('poke',now);this.player.cooldown('poke',this.game.settings.pokeCooldown,now);}
 blockedUse(id,target,now){this.payPoke(id,target,now);}use(id,target,now){this.payPoke(id,target,now);}
 onExiled(cause){if(['vote','judge'].includes(cause)&&this.game.phase==='playing')this.game.finish('neutral','Шут изгнан',{winnerIds:[this.player.id]});}
}
export class RolesPool {
  #classes = new Map();
  register(C) {
    check(typeof C === 'function' && C.prototype instanceof Role && typeof C.id === 'string' && C.id !== Role.id && !this.#classes.has(C.id), 'Некорректный класс роли.');
    this.#classes.set(C.id, C);
    return this;
  }
  create(id, player) {
    const C = this.#classes.get(id);
    check(C, `Неизвестная роль: ${id}`);
    return new C(player);
  }
  all() {
    return [...this.#classes.values()].map(C => ({ id: C.id, name: C.displayName }));
  }
}




export class Player {
  #state = 'awake';
  #role = null;
  #cooldowns = new Map();
  constructor(game, id, username) {
    this.game = game; this.id = id; this.username = username;
    this.equipped = {}; this.tasks = []; this.modifiers = [];
    this.feedback = { sixthSenseUntil: 0 }; this.notices = [];
    this.frozenUntil = 0;
    this.santaGiftUntil = 0;
    this.snowUntil = 0;
  }
  get state() { return this.#state; }
  get awake() { return this.#state === 'awake'; }
  get role() { return this.#role; }
  get team() { return this.#role?.team ?? 'neutral'; }
  setRole(id) {
    check(this.game.phase !== 'finished', 'Матч завершён.');
    const next = this.game.roles.create(id, this);
    this.#role?.onRemoved(); this.#role = next; this.#role.onAssigned();
    this.game.hacks.delete(this.id); return this;
  }
  cooldown(id, seconds, now = Date.now()) {
    check(Number.isFinite(seconds) && seconds >= 0, 'Некорректная перезарядка.');
    this.#cooldowns.set(id, now + seconds * 1000);
  }
  requireReady(id, now) {
    const remaining = (this.#cooldowns.get(id) ?? 0) - now;
    check(remaining <= 0, `Подожди ${Math.ceil(remaining / 1000)} сек.`);
  }
  assertCanAct(allowMeeting = false) {
    check(this.game.hasPlayer(this) && this.game.phase === 'playing', 'Раунд не идёт.');
    check(this.awake, 'Ты спишь или изгнан.'); check(this.#role, 'Нет роли.');
    check(this.frozenUntil <= Date.now(), 'Ты заморожен.');
    check(
      (this.snowUntil ?? 0) <= Date.now(),
      'Тебя засыпало снегом.'
    );
    if (this.game.meetings.blocked) check(this.game.meetings.terminable && allowMeeting, 'Сейчас собрание или анимация.');
  }
  lull(target) { return this.game.use(this.id, this.#role instanceof Policeman ? 'gun' : 'lull', target?.id); }
  static lull(attacker, target) {
    check(target instanceof Player, 'Некорректная цель.');
    check(attacker === null || attacker instanceof Player, 'Атакующий должен быть Player или null.');
    const game = target.game;
    check(game.phase === 'playing' && game.hasPlayer(target) && target.awake, 'Цель не находится в активном состоянии.');
    if (attacker !== null) check(attacker.game === game && game.hasPlayer(attacker), 'Неверный атакующий.');
    if (
      target.modifiers.some(
        modifier => modifier.constructor.id === 'invulnerable'
      )
    ) {
      return target;
    }
    const now = Date.now();

    const immunityUntil = Math.max(
      target.santaGiftUntil ?? 0,
      target.attackImmunityUntil ?? 0
    );

    if (immunityUntil > now) {
      game._shieldedTargets?.add(target.id);


      if (attacker && attacker !== target) {
        attacker.notify('Нет пробития.');
      }

      return target;
    }


    if (target.antiMintUntil && target.antiMintUntil > now) {
      if (attacker !== null) game.interact(attacker, target, 'lull');
      game.effects.push({ attackerId: attacker?.id ?? null, targetId: target.id, time: now });
      return target;
    }

    if (game.consumeGuardShield(target, attacker, now)) {
      return target;
    }

    if (target.#role?.absorbAttack?.({ attacker, now: Date.now() })) {
      game._shieldedTargets?.add(target.id);
      return target;
    }
    if (attacker !== null) game.interact(attacker, target, 'lull');
    game.logEvent(`${target.username} fell asleep`);
    const targetCelebrity = target.modifiers.find(
      modifier => modifier.constructor.id === 'celebrity'
    );

    const attackerCelebrity = attacker?.modifiers.find(
      modifier => modifier.constructor.id === 'celebrity'
    );

    if (targetCelebrity) {
      Celebrity.announceLull(
        game,
        target,
        attacker,
        false
      );
    }

    if (attackerCelebrity) {
      Celebrity.announceLull(
        game,
        attacker,
        target,
        true
      );
    }
    target.#state = 'sleeping';
    game.guardShields.delete(target.id);
    game.recordLullVisual(attacker, target, 'sleep');
    game.effects.push({
      attackerId: attacker?.id ?? null,
      targetId: target.id,
      time: now,
      success: true
    });
    target.game?.resolveContract?.(target, 'lull', attacker);
    return target;
  }
  getUp() {
    check(this.game.phase === 'playing' && this.#state === 'sleeping', 'Разбудить можно только спящего в активном раунде.');
    this.#state = 'awake'; this.game.meetings.reported.delete(this.id); return this;
  }
  exile() {
    check(this.game.phase === 'playing' && this.#state !== 'exiled', 'Изгнание недоступно.');
    this.game.logEvent(`${this.username} was exiled`);
    this.#state = 'exiled'; this.game.guardShields.delete(this.id); this.game.pendingTea.delete(this.id); return this;
  }
  notify(text) {
    this.notices.push({ id: randomUUID(), text: String(text), time: Date.now() });
    if (this.notices.length > 30) this.notices.shift();
  }

  shiftCooldowns(shift) {
    for (const [k, until] of this.#cooldowns) this.#cooldowns.set(k, until + shift);
  }

  ownerState() {
    return {
      id: this.id, username: this.username, state: this.state, role: this.#role?.snapshot() ?? null,
      abilities: [
        ...(this.role?.abilities ?? []).map(ability => ({
          ...ability,
          duringMeeting: this.role.canUseDuringMeeting(ability.id),
          offline: this.role.canUseWithoutTablet(ability.id)
        })),
        ...this.modifiers.flatMap(modifier =>
          (modifier.abilities ?? [])
            .filter(ability => ability.id !== 'double-shot')
            .map(ability => ({
              ...ability,
              duringMeeting: modifier.canUseDuringMeeting?.(ability.id) ?? false,
              offline: modifier.canUseWithoutTablet?.(ability.id) ?? false
            }))
        )
      ],
      cooldowns: Object.fromEntries(this.#cooldowns), fakeTasks: this.#role?.fakeTasks ?? false,
      tasks: this.tasks.map(t => ({ ...t })), modifiers: this.modifiers.map(m => m.snapshot()),
      feedback: { ...this.feedback }, notices: this.notices.map(n => ({ ...n })),
      frozenUntil: this.frozenUntil,
      snowUntil: this.snowUntil ?? 0,
      santaGiftUntil: this.santaGiftUntil ?? 0,
      blackmailed: this.game.activeBlackmail.has(this.id),
      exam: this.game.examFor(this.id),
      guardShield: this.game.guardShieldActive(this)
      ? { ...this.game.guardShields.get(this.id) }
      : null,
      pendingInterrogation: (() => {
        const it = this.game.pendingInterrogations?.get(this.id);
        return it && it.expiresAt > Date.now()
          ? { question: it.question, expiresAt: it.expiresAt }
          : null;
      })(),
      survivalShield: this.#role?.shieldSnapshot?.() ?? null
    };
  }
}



export class MintPunik extends Role {
  static id = 'mint-punik';
  static displayName = 'Мятный Пуник';
  static description = 'Выживите.';
  #shieldUses;
  #shieldUntil = 0;

  constructor(player) {
    super(player);
    this.#shieldUses = this.game.settings.mintPunikShields ?? 2;
  }

  get team() { return 'neutral'; }
  get fakeTasks() { return false; }

  shieldActive(now = Date.now()) {
    return this.game.phase === 'playing' && this.player.awake && this.#shieldUntil > now;
  }

  get abilities() {
    return [
      { id: 'lull', name: 'Усыпить', targets: true },
      { id: 'shield', name: `Щит · ${this.#shieldUses}`, disabled: this.#shieldUses <= 0 || this.shieldActive() }
    ];
  }

  get hackableIds() { return ['lull', 'shield']; }

  pay(id, target, now) {
    if (id === 'lull') {
      this.game.assertTarget(this.player, target);
      this.player.requireReady('lull', now);
      this.player.cooldown('lull', this.game.settings.mintPunikLullCooldown ?? 30, now);
      return;
    }
    check(id === 'shield', 'Неизвестная способность Мятного Пуника.');
    check(target === null, 'Щит применяется к себе без выбора цели.');
    this.player.requireReady('shield', now);
    check(this.#shieldUses > 0, 'Щиты закончились.');
    check(!this.shieldActive(now), 'Щит уже активен.');
    this.#shieldUses--;
    this.player.cooldown('shield', this.game.settings.mintPunikShieldCooldown ?? 30, now);
  }

  blockedUse(id, target, now) { this.pay(id, target, now); }

  use(id, target, now) {
    this.pay(id, target, now);
    if (id === 'lull') { Player.lull(this.player, target); return; }
    this.#shieldUntil = now + (this.game.settings.mintPunikShieldSeconds ?? 10) * 1000;
    this.player.notify('Щит активирован. Он поглотит одну атаку или исчезнет по окончании времени.');
  }

  absorbAttack({ attacker = null, now = Date.now() } = {}) {
    if (!this.shieldActive(now)) return false;
    this.#shieldUntil = 0;
    this.player.notify('Щит заблокировал атаку и разрушился.');
    if (attacker && attacker !== this.player) attacker.notify('Атака заблокирована щитом.');
    return true;
  }

  shieldSnapshot(now = Date.now()) {
    const active = this.shieldActive(now);
    return { uses: this.#shieldUses, active, until: active ? this.#shieldUntil : 0 };
  }
}


export class Headhunter extends Role {
  static id = 'headhunter';
  static displayName = 'Хедхантер';
  static description = 'Завершите ваши контракты.';

  get team() { return 'neutral'; }
  get fakeTasks() { return true; }

  constructor(player) {
    super(player);
    this.contracts = [];
    this.completed = 0;
    this.ammo = this.game.settings.headhunterAmmo;
  }

  get abilities() {
    return [
      ...super.abilities,
      { id: 'headhunter-shot', name: `Выстрел · ${this.ammo}`, targets: true, disabled: this.ammo <= 0 }
    ];
  }

  use(id, target, now) {
    if (id !== 'headhunter-shot') return super.use(id, target, now);
    const attacker = this.player;
    check(this.ammo > 0, 'Патроны закончились.');
    this.game.assertTarget(attacker, target);
    attacker.requireReady('headhunter-shot', now);
    this.ammo--;
    Player.lull(attacker, target);
    attacker.cooldown('headhunter-shot', this.game.settings.headhunterShotCooldown, now);
  }

  completeContract(target) {
    if (!this.contracts.includes(target.id)) return;
    this.completed++;
    this.contracts = this.contracts.filter(id => id !== target.id);
  }

  loseContract(target) {
    if (!this.contracts.includes(target.id)) return;
    this.contracts = this.contracts.filter(id => id !== target.id);

    const t = this.game.settings.headhunterTransform;
    if (t === 'jester') this.player.setRole('jester');
    else if (t === 'punik') this.player.setRole('mint-punik');
    else if (t === 'civilian') this.player.setRole('puny');
  }

  snapshot() {
    return { ...super.snapshot(), contracts: this.contracts, completed: this.completed, ammo: this.ammo };
  }
}

export class Executioner extends Role {
  static id = 'executioner';
  static displayName = 'Палач';
  static description = 'Приведите в исполнение.';

  get team() { return 'neutral'; }
  get fakeTasks() { return true; }

  constructor(player) {
    super(player);
    this.contract = null;
    this.completed = false;
    this.ammo = this.game.settings.executionerAmmo;
  }

  get abilities() {
    return [
      ...super.abilities,
      { id: 'executioner-shot', name: `Выстрел · ${this.ammo}`, targets: true, disabled: this.ammo <= 0 }
    ];
  }

  use(id, target, now) {
    if (id !== 'executioner-shot') return super.use(id, target, now);
    const attacker = this.player;
    check(this.ammo > 0, 'Патроны закончились.');
    this.game.assertTarget(attacker, target);
    attacker.requireReady('executioner-shot', now);
    this.ammo--;
    Player.lull(attacker, target);
    attacker.cooldown('executioner-shot', this.game.settings.executionerShotCooldown, now);
  }

  completeContract(target) {
    if (this.contract !== target.id) return;
    this.completed = true;
    this.contract = null;
  }

  loseContract(target) {
    if (this.contract !== target.id) return;
    this.contract = null;

    const t = this.game.settings.executionerTransform;
    if (t === 'jester') this.player.setRole('jester');
    else if (t === 'punik') this.player.setRole('mint-punik');
    else if (t === 'civilian') this.player.setRole('puny');
  }

  snapshot() {
    return { ...super.snapshot(), contract: this.contract, completed: this.completed, ammo: this.ammo };
  }
}










export class Veteran extends InnocentRole {
  static id = 'veteran';
  static displayName = 'Ветеран';
  static description = 'Используйте ваше знание о военных преступлениях.';

  constructor(player) {
    super(player);
    this.uses = this.game.settings.veteranAlertUses ?? 2;
    this.alertUntil = 0;
  }

  get abilities() {
    return [...super.abilities, {
      id: 'alert',
      name: 'НА СТРЁМЕ',
      targets: false,
      disabled: this.uses === 0
    }];
  }

  get hackableIds() {
    return [...super.hackableIds, 'alert'];
  }

  canUseWithoutTablet(id) {
    return id === 'alert';
  }

  validateAlert(now) {
    check(this.uses !== 0, 'Использования закончились.');
    this.player.requireReady('alert', now);
  }

  blockedUse(id, target, now, params) {
    if (id !== 'alert') return super.blockedUse(id, target, now, params);
    this.validateAlert(now);
  }

  use(id, target, now, params) {
    if (id !== 'alert') return super.use(id, target, now, params);
    this.validateAlert(now);
    if (this.uses > 0) this.uses--;
    this.alertUntil = now + (this.game.settings.veteranAlertSeconds ?? 8) * 1000;
    this.player.cooldown('alert', this.game.settings.veteranAlertCooldown ?? 60, now);
    this.player.notify('Ты на стрёме.');
  }

  snapshot() {
    return {
      ...super.snapshot(),
      alertUses: this.uses,
      alertUntil: this.alertUntil
    };
  }
}

export class Menthol extends InnocentRole {
  static id = 'menthol';
  static displayName = 'Ментол';
  static description = 'Морозьте их.';

  get abilities() {
    return [...super.abilities, {
      id: 'freeze',
      name: 'ЗАМОРОЗИТЬ',
      targets: true
    }];
  }

  get hackableIds() {
    return [...super.hackableIds, 'freeze'];
  }

  payFreeze(id, target, now) {
    check(id === 'freeze', 'Неизвестная способность.');
    check(target instanceof Player, 'Нужна цель.');
    check(this.game.hasPlayer(target), 'Игрок не является участником.');
    check(target.awake, 'Цель уже спит или изгнана.');
    this.player.requireReady('freeze', now);
  }

  blockedUse(id, target, now, params) {
    if (id !== 'freeze') return super.blockedUse(id, target, now, params);
    this.payFreeze(id, target, now);
  }

  use(id, target, now, params) {
    if (id !== 'freeze') return super.use(id, target, now, params);
    this.payFreeze(id, target, now);
    target.frozenUntil = now + (this.game.settings.mentholFreezeSeconds ?? 6) * 1000;
    this.player.cooldown('freeze', this.game.settings.mentholFreezeCooldown ?? 45, now);
    target.notify('Тебя заморозили.');
  }
}




export class Tracker extends InnocentRole {
  static id = 'tracker';
  static displayName = 'Следопыт';
  static description = 'Расследуйте это.';

  constructor(player) {
    super(player);
    const configured = this.game.settings.trackerInterrogations ?? 3;
    this.uses = configured === 0 ? Infinity : configured;
    this.notes = [];
  }

  get abilities() {
    return [...super.abilities, {
      id: 'interrogate',
      name: 'ДОПРОС',
      targets: true,
      meetingOnly: false,
      disabled: this.uses <= 0
    }];
  }

  get hackableIds() {
    return [...super.hackableIds, 'interrogate'];
  }

  canUseDuringMeeting(id) {
    return id === 'interrogate';
  }

  canUseWithoutTablet(id) {
    return id === 'interrogate';
  }

  payInterrogate(id, target, now, params) {
    check(id === 'interrogate', 'Неизвестная способность.');
    check(this.uses > 0, 'Допросы закончились.');
    check(typeof params?.question === 'string' && params.question.trim(), 'Нужен текст вопроса.');
    this.game.assertTarget(this.player, target);
    this.player.requireReady('interrogate', now);
  }

  blockedUse(id, target, now, params) {
    if (id !== 'interrogate') return super.blockedUse(id, target, now, params);
    this.payInterrogate(id, target, now, params);
  }

  use(id, target, now, params) {
    if (id !== 'interrogate') return super.use(id, target, now, params);
    this.payInterrogate(id, target, now, params);
    this.uses--;
    this.player.cooldown('interrogate', this.game.settings.trackerInterrogationCooldown ?? 30, now);
    const question = params.question.trim().slice(0, 200);
    this.game.pendingInterrogations.set(target.id, {
      question,
      askedBy: this.player.id,
      expiresAt: now + (this.game.settings.trackerInterrogationTimeout ?? 60) * 1000
    });
    target.notify(`Следопыт спрашивает: «${question}»`);
    this.player.notify(`Вопрос отправлен ${target.username}.`);
  }

  addNote(text) {
    check(typeof text === 'string' && text.trim(), 'Пустая заметка.');
    this.notes.push(text.trim().slice(0, 300));
    if (this.notes.length > 50) this.notes.shift();
  }

  snapshot() {
    return {
      ...super.snapshot(),
      interrogationsRemaining: this.uses,
      notes: [...this.notes]
    };
  }
}

export class Blackjack extends InnocentRole {
  static id = 'blackjack';
  static displayName = 'БлекДжек';
  static description = 'Поосторожнее здесь!';

  constructor(player) {
    super(player);
    this.ammo = this.game.settings.blackjackAmmo ?? 3;
  }

  get abilities() {
    return [...super.abilities, {
      id: 'blackjack-shot',
      name: 'ВЫСТРЕЛ',
      targets: true,
      disabled: this.ammo === 0
    }, {
      id: 'blackjack-guess',
      name: 'УГАДАТЬ И ВЫСТРЕЛИТЬ',
      targets: true,
      meetingOnly: true
    }];
  }

  get hackableIds() {
    return [...super.hackableIds, 'blackjack-shot', 'blackjack-guess'];
  }

  canUseDuringMeeting(id) {
    return id === 'blackjack-guess';
  }

  payShot(id, target, now) {
    check(id === 'blackjack-shot', 'Неизвестная способность.');
    check(this.ammo > 0, 'Патроны закончились.');
    this.game.assertTarget(this.player, target);
    this.player.requireReady(id, now);
  }

  payGuess(id, target, now, params) {
    check(id === 'blackjack-guess', 'Неизвестная способность.');
    check(typeof params?.roleId === 'string', 'Нужна роль для угадывания.');
    check(this.game.roles.all().some(r => r.id === params.roleId), 'Неизвестная роль.');
    this.game.assertTarget(this.player, target);
    this.player.requireReady(id, now);
  }

  



  blockedUse(id, target, now, params) {
    if (id === 'blackjack-shot') this.payShot(id, target, now);
    else if (id === 'blackjack-guess') this.payGuess(id, target, now, params);
    else return super.blockedUse(id, target, now, params);
  }

  use(id, target, now, params) {
    if (id === 'blackjack-shot') {
      this.payShot(id, target, now);
      this.ammo--;
      Player.lull(this.player, target);
      this.player.cooldown(id, this.game.settings.blackjackCooldown ?? 45, now);
      return;
    }
    if (id === 'blackjack-guess') {
      this.payGuess(id, target, now, params);
      const correct = target.role.constructor.id === params.roleId;
      const shots = [fire(correct ? target : this.player, this.player, now)];
      this.player.cooldown(id, this.game.settings.blackjackGuessCooldown ?? 30, now);
      return { correct, shots };
    }
    return super.use(id, target, now, params);
  }


  snapshot() {
    return { ...super.snapshot(), ammo: this.ammo };
  }
}




export class Journalist extends InnocentRole {
  static id = 'journalist';
  static displayName = 'Журналист';
  static description = 'У вас есть абсолютная сила. Но не только для вас.';

  constructor(player) {
    super(player);
    const photos = this.game.settings.journalistPhotos ?? 5;
    const sends = this.game.settings.journalistSends ?? 2;
    this.photosLeft = photos === 0 ? Infinity : photos;
    this.sendsLeft = sends === 0 ? Infinity : sends;
    this.photo = null;
  }

  get abilities() {
    return [...super.abilities,
      { id: 'photo', name: 'ФОТО', targets: false, disabled: this.photosLeft <= 0 },
      { id: 'show', name: 'ПОКАЗАТЬ', targets: false, disabled: !this.photo },
      { id: 'send', name: 'ОТПРАВИТЬ', targets: false, disabled: !this.photo || this.sendsLeft <= 0 }
    ];
  }

  get hackableIds() {
    return [...super.hackableIds, 'photo', 'send'];
  }

  canUseWithoutTablet(id) {
    return id === 'photo' || id === 'show' || id === 'send';
  }

  takePhoto(now) {
    check(this.photosLeft > 0, 'Лимит фото исчерпан.');
    this.player.requireReady('photo', now);
    this.photosLeft = this.photosLeft === Infinity ? Infinity : this.photosLeft - 1;
    this.player.cooldown('photo', this.game.settings.journalistPhotoCooldown ?? 20, now);
  }

  sendPhoto(now) {
    check(this.photo, 'Сначала сделай фото.');
    check(this.sendsLeft > 0, 'Лимит отправок исчерпан.');
    this.player.requireReady('send', now);
    this.sendsLeft = this.sendsLeft === Infinity ? Infinity : this.sendsLeft - 1;
    this.player.cooldown('send', this.game.settings.journalistSendCooldown ?? 60, now);
  }

  snapshot() {
    return {
      ...super.snapshot(),
      photosLeft: this.photosLeft === Infinity ? 0 : this.photosLeft,
      sendsLeft: this.sendsLeft === Infinity ? 0 : this.sendsLeft,
      hasPhoto: Boolean(this.photo)
    };
  }
}

export class Developer extends InnocentRole {
  static id = 'developer';
  static displayName = 'Разработчик';
  static description = 'Доступ sudo!';

  constructor(player) {
    super(player);
    const uses = this.game.settings.developerUses ?? 2;
    this.uses = uses === 0 ? Infinity : uses;
  }

  get abilities() {
    return [...super.abilities, {
      id: 'sudo-grep',
      name: 'sudo grep ${{info}} | ${{player}} *.log',
      targets: false,
      disabled: this.uses <= 0
    }];
  }

  get hackableIds() {
    return [...super.hackableIds, 'sudo-grep'];
  }

  canUseWithoutTablet(id) {
    return id === 'sudo-grep';
  }

  openConsole(now) {
    check(this.uses > 0, 'Использования закончились.');
    this.player.requireReady('sudo-grep', now);
    this.player.cooldown('sudo-grep', this.game.settings.developerCooldown ?? 90, now);
  }

  spendUse() {
    if (this.uses !== Infinity) this.uses--;
  }

  snapshot() {
    return {
      ...super.snapshot(),
      usesLeft: this.uses === Infinity ? 0 : this.uses
    };
  }
}



function remaining(used, limit) {
  return limit === 0 ? '∞' : Math.max(0, limit - used);
}


  class Guard extends InnocentRole {
    static id = 'guard';
    static displayName = 'Охранник';
    static description = 'Охраняйте их.';

    constructor(player) {
      super(player);
      this.meetingsUsed = 0;
      this.shieldsUsed = 0;
    }

    get abilities() {
      const s = this.game.settings;
      const meetingLimit = s.guardMeetings ?? 2;
      const shieldLimit = s.guardShields ?? 3;

      return [
        ...super.abilities,
        {
          id: 'guard-meeting',
          name: `СОБРАНИЕ · ${remaining(this.meetingsUsed, meetingLimit)}`,
          disabled:
            (meetingLimit > 0 && this.meetingsUsed >= meetingLimit) ||
            Boolean(this.game.meetings.blocked) ||
            this.game.activeCrises().length > 0
        },
        {
          id: 'guard-shield',
          name: `ЩИТ · ${remaining(this.shieldsUsed, shieldLimit)}`,
          targets: true,
          targetPolicy: 'awake-with-self',
          disabled: shieldLimit > 0 && this.shieldsUsed >= shieldLimit
        }
      ];
    }

    get hackableIds() {
      return ['guard-meeting', 'guard-shield'];
    }

    validate(id, target, now) {
      const s = this.game.settings;

      if (id === 'guard-meeting') {
        const limit = s.guardMeetings ?? 2;

        check(!this.game.meetings.blocked, 'Собрание уже идёт.');
        check(this.game.activeCrises().length === 0,
          'Во время поломки экстренное собрание недоступно.');
        check(limit === 0 || this.meetingsUsed < limit,
          'Вызовы собрания закончились.');
        check(now >= (this.game.meetings.nextEmergencyAt ?? 0),
          'Общая перезарядка собрания ещё не закончилась.');
        this.player.requireReady(id, now);
        return;
      }

      check(id === 'guard-shield', 'Неизвестная способность.');

      const limit = s.guardShields ?? 3;

      check(
        target && this.game.hasPlayer(target) && target.awake,
        'Выбери бодрствующего игрока.'
      );
      check(limit === 0 || this.shieldsUsed < limit, 'Щиты закончились.');
      check(!this.game.guardShieldActive(target, now),
        'На этом игроке уже установлен щит Охранника.');

      this.player.requireReady(id, now);
    }

    spend(id, now) {
      if (id === 'guard-meeting') {
        this.meetingsUsed++;
        this.player.cooldown(
          id,
          this.game.settings.guardMeetingCooldown ?? 90,
          now
        );
      } else {
        this.shieldsUsed++;
        this.player.cooldown(
          id,
          this.game.settings.guardShieldCooldown ?? 35,
          now
        );
      }
    }

    blockedUse(id, target, now) {
      this.validate(id, target, now);
      this.spend(id, now);
    }

    use(id, target, now) {
      this.validate(id, target, now);

      if (id === 'guard-meeting') {
        // Сначала успешное создание собрания, затем расход.
        this.game.meetings.start({
          reason: 'emergency',
          reporterId: this.player.id
        });
        this.spend(id, now);
        return;
      }

      this.spend(id, now);

      this.game.guardShields.set(target.id, {
        sourceId: this.player.id,
        until: now + (this.game.settings.guardShieldSeconds ?? 12) * 1000
      });

    }

    snapshot() {
      return {
        ...super.snapshot(),
        meetingsUsed: this.meetingsUsed,
        shieldsUsed: this.shieldsUsed
      };
    }
  }

  class Adviser extends MintPuny {
    static id = 'adviser';
    static displayName = 'Советник';
    static description = 'Советуйте. Наблюдайте. Дождитесь своего часа.';

    constructor(player) {
      super(player);
      this.infoUsed = 0;
      this.reports = [];
    }

    isLastMint() {
      return ![...this.game.players.values()].some(player =>
        player !== this.player &&
        player.awake &&
        player.team === 'mint'
      );
    }

    get abilities() {
      const limit = this.game.settings.adviserInfos ?? 0;
      const last = this.isLastMint();

      return [
        ...super.abilities.map(ability => ({
          ...ability,
          disabled: Boolean(ability.disabled) || !last
        })),
        {
          id: 'adviser-info',
          name: `ИНФО · ${remaining(this.infoUsed, limit)}`,
          targets: true,
          disabled: limit > 0 && this.infoUsed >= limit
        }
      ];
    }

    get hackableIds() {
      return [...super.hackableIds, 'adviser-info'];
    }

    validateInfo(target, now) {
      this.game.assertTarget(this.player, target);

      const limit = this.game.settings.adviserInfos ?? 0;
      check(limit === 0 || this.infoUsed < limit,
        'Проверки закончились.');

      this.player.requireReady('adviser-info', now);
    }

    spendInfo(now) {
      this.infoUsed++;
      this.player.cooldown(
        'adviser-info',
        this.game.settings.adviserInfoCooldown ?? 40,
        now
      );
    }

    blockedUse(id, target, now, params) {
      if (id === 'adviser-info') {
        this.validateInfo(target, now);
        this.spendInfo(now);
        return;
      }

      check(this.isLastMint(),
        'Усыпление и поломки доступны только последнему бодрствующему Мятному.');

      return super.blockedUse(id, target, now, params);
    }

    use(id, target, now, params) {
      if (id !== 'adviser-info') {
        check(this.isLastMint(),
          'Усыпление и поломки доступны только последнему бодрствующему Мятному.');

        return super.use(id, target, now, params);
      }

      this.validateInfo(target, now);
      this.spendInfo(now);

      const report = {
        id: `${this.player.id}:${now}:${this.infoUsed}`,
        targetId: target.id,
        name: target.username,
        armed: this.game.playerIsArmed(target),
        faction: {
          innocent: 'мирный',
          mint: 'мятный',
          neutral: 'нейтрал'
        }[target.team] ?? 'неизвестно',
        time: now
      };

      this.reports.push(report);
      if (this.reports.length > 30) this.reports.shift();
    }

    snapshot() {
      return {
        ...super.snapshot(),
        infoUsed: this.infoUsed,
        lastMint: this.isLastMint(),
        reports: this.reports.map(report => ({ ...report }))
      };
    }
  }




  export class Commander extends InnocentRole {
  static id = 'commander';
  static displayName = 'Командир';
  static description = 'Ваш голос весит больше. Стреляйте осторожно.';

  constructor(player) {
    super(player);
    this.ammo = this.game.settings.commanderAmmo ?? 3;
    this.disarmed = false;
  }

  get abilities() {
    return [
      ...super.abilities,
      {
        id: 'commander-shot',
        name: `ВЫСТРЕЛ · ${this.ammo}`,
        targets: true,
        disabled: this.disarmed || this.ammo <= 0
      }
    ];
  }

  get hackableIds() {
    return [...super.hackableIds, 'commander-shot'];
  }

  payShot(id, target, now) {
    check(id === 'commander-shot', 'Неизвестная способность.');
    check(!this.disarmed, 'Ты потерял возможность стрелять.');
    check(this.ammo > 0, 'Патроны закончились.');

    this.game.assertTarget(this.player, target);
    this.player.requireReady(id, now);

    this.ammo--;

    this.player.cooldown(
      id,
      this.game.settings.commanderShotCooldown ?? 35,
      now
    );

    if (target.team === 'innocent') {
      this.disarmed = true;

      this.player.notify(
        'Выстрел по Мирному: способность выстрела потеряна до конца раунда.'
      );
    }
  }

  blockedUse(id, target, now, params) {
    if (id !== 'commander-shot') {
      return super.blockedUse(id, target, now, params);
    }

    this.payShot(id, target, now);
  }

  use(id, target, now, params) {
    if (id !== 'commander-shot') {
      return super.use(id, target, now, params);
    }

    this.payShot(id, target, now);
    Player.lull(this.player, target);
  }

  snapshot() {
    return {
      ...super.snapshot(),
      ammo: this.ammo,
      disarmed: this.disarmed,
      voteWeight: 2
    };
  }
}

export class Blackmailer extends MintPuny {
  static id = 'blackmailer';
  static displayName = 'Шантажист';
  static description = 'Заставьте их молчать.';

  get abilities() {
    return [
      ...super.abilities,
      {
        id: 'blackmail',
        name: 'SHUT UP!',
        targets: true
      }
    ];
  }

  get hackableIds() {
    return [...super.hackableIds, 'blackmail'];
  }

  payBlackmail(target, now) {
    this.game.assertTarget(this.player, target);

    check(
      !this.game.pendingBlackmail.has(target.id),
      'Этот игрок уже отмечен для следующего собрания.'
    );

    this.player.requireReady('blackmail', now);

    this.player.cooldown(
      'blackmail',
      this.game.settings.blackmailCooldown ?? 40,
      now
    );
  }

  blockedUse(id, target, now, params) {
    if (id !== 'blackmail') {
      return super.blockedUse(id, target, now, params);
    }

    this.payBlackmail(target, now);
  }

  use(id, target, now, params) {
    if (id !== 'blackmail') {
      return super.use(id, target, now, params);
    }

    this.payBlackmail(target, now);
    this.game.pendingBlackmail.add(target.id);
  }
}

export class Santa extends Role {
  static id = 'santa';
  static displayName = 'Санта';
  static description = 'Доставьте им подарочки!';

  constructor(player) {
    super(player);

    this.good = [];
    this.bad = [];
    this.listsAssigned = false;
  }

  get team() {
    return 'neutral';
  }

  get fakeTasks() {
    return true;
  }

  get abilities() {
    return [
      {
        id: 'santa-gift',
        name: 'ПОДАРОК',
        targets: true,
        targetPolicy: 'awake-with-self'
      },
      {
        id: 'santa-surprise',
        name: 'СЮРПРИЗ',
        targets: true,
        targetPolicy: 'awake-with-self'
      },
      {
        id: 'santa-snow',
        name: 'СНЕГ',
        targets: true
      }
    ];
  }

  get hackableIds() {
    return [
      'santa-gift',
      'santa-surprise',
      'santa-snow'
    ];
  }

  assignLists() {
    const others = shuffled(
      [...this.game.players.values()].filter(
        player => player !== this.player
      )
    );

    const goodCount = this.game.settings.santaGoodPlayers ?? 2;
    const badCount = this.game.settings.santaBadPlayers ?? 2;

    check(
      Number.isSafeInteger(goodCount) && goodCount >= 0 &&
      Number.isSafeInteger(badCount) && badCount >= 0,
      'Некорректные размеры списков Санты.'
    );

    check(
      goodCount + badCount > 0,
      'У Санты должен быть хотя бы один адресат.'
    );

    check(
      goodCount + badCount <= others.length,
      'Недостаточно игроков для списков Санты: уменьшите количество хороших или плохих игроков.'
    );

    this.good = others
      .slice(0, goodCount)
      .map(player => ({
        targetId: player.id,
        done: false
      }));

    this.bad = others
      .slice(goodCount, goodCount + badCount)
      .map(player => ({
        targetId: player.id,
        done: false
      }));

    this.listsAssigned = true;
  }

  validate(id, target, now) {
    check(
      this.hackableIds.includes(id),
      'Неизвестная способность Санты.'
    );

    check(
      target instanceof Player &&
      this.game.hasPlayer(target) &&
      target.awake,
      'Цель должна быть бодрствующим игроком.'
    );

    if (id === 'santa-snow') {
      check(target !== this.player, 'Нельзя засыпать снегом себя.');
    }

    this.player.requireReady(id, now);
  }

  spend(id, now) {
    const cooldowns = {
      'santa-gift':
        this.game.settings.santaGiftCooldown ?? 35,
      'santa-surprise':
        this.game.settings.santaSurpriseCooldown ?? 45,
      'santa-snow':
        this.game.settings.santaSnowCooldown ?? 35
    };

    this.player.cooldown(id, cooldowns[id], now);
  }

  blockedUse(id, target, now) {
    this.validate(id, target, now);
    this.spend(id, now);
  }

  use(id, target, now) {
    this.validate(id, target, now);
    this.spend(id, now);

    if (id === 'santa-gift') {
      target.santaGiftUntil = Math.max(
        target.santaGiftUntil ?? 0,
        now + 30000
      );

      for (const entry of this.good) {
        if (!entry.done && entry.targetId === target.id) {
          entry.done = true;
        }
      }

      target.notify(
        'Подарок Санты: защита от любых атак на 30 секунд.'
      );

      return;
    }

    if (id === 'santa-surprise') {
      const previous = this.game._santaSurpriseActorId;
      this.game._santaSurpriseActorId = this.player.id;

      try {
        Player.lull(this.player, target);
      } finally {
        this.game._santaSurpriseActorId = previous;
      }

      return;
    }

    const until =
      now +
      (this.game.settings.santaSnowSeconds ?? 8) * 1000;

    target.snowUntil = Math.max(
      target.snowUntil ?? 0,
      until
    );

    target.notify('Тебя засыпало снегом.');
  }

  onPlayerSlept(target, actor) {
    if (!this.listsAssigned) return;

    for (const entry of this.good) {
      if (entry.done || entry.targetId !== target.id) continue;

      if (actor && actor !== target) {
        entry.targetId = actor.id;
      }
    }

    const ownSurprise =
      actor === this.player &&
      this.game._santaSurpriseActorId === this.player.id;

    for (const entry of this.bad) {
      if (entry.done || entry.targetId !== target.id) continue;

      if (ownSurprise) {
        entry.done = true;
      } else if (actor && actor !== target) {
        entry.targetId = actor.id;
      }
    }
  }

  onPlayerExiled(target) {
    if (!this.listsAssigned) return;

    for (const entry of this.good) {
      if (!entry.done && entry.targetId === target.id) {
        entry.done = true;
      }
    }

    for (const entry of this.bad) {
      if (!entry.done && entry.targetId === target.id) {
        entry.done = true;
      }
    }
  }

  readyToWin() {
    return (
      this.listsAssigned &&
      this.player.awake &&
      this.good.length + this.bad.length > 0 &&
      this.good.every(entry => entry.done) &&
      this.bad.every(entry => entry.done)
    );
  }

  snapshot() {
    return {
      ...super.snapshot(),
      good: this.good.map(entry => ({ ...entry })),
      bad: this.bad.map(entry => ({ ...entry })),
      listsAssigned: this.listsAssigned
    };
  }
}



export const { Scout, Teacher } = createSchoolRoles({
  InnocentRole,
  Role,
  Player
});

export const { Alarm, Hacker } = createExtraRoles({ InnocentRole, Player });
export const { Chemist, Sapper } = createNewRoles({ InnocentRole, AttackerRole, MintPuny, Player });
export class Game{
 constructor(members,hostId,settings=defaultSettings()){
  check(members.length,'Нет участников.');this.id=randomUUID();this.settings=validateSettings(settings);this.hostId=hostId;this.phase='setup';this.result=null;this.players=new Map();this.hacks=new Map();this.pendingTea=new Map();this.pendingBlackmail = new Set();this.activeBlackmail = new Set();this._santaSurpriseActorId = null;this.pendingInterrogations = new Map();this.mines = new Set();this.gunGuesses = new Map();this.activeExams = new Map();this.log = [];this.actionLog = [];this.devConsole = null;this.sapperBlast = null;this.guardShields = new Map();this.visualEvents = [];this._visualAttackKind = null;this._meetingPausedAt = null;this.effects=[];this.rocket=null;this.wifi=null;this.missilePanel=null;this.meetings=new Meetings(this);this.introStartedAt=null;this.playStartsAt=null;this._interactionScope=null;this.rewardStatus='none';this.rewardPayments={};this.rewardPlan=[];this.rewardRetryAt=0;
  this.roles = new RolesPool()
  .register(Puny)
  .register(Policeman)
  .register(TechnicPuny)
  .register(Spy)
  .register(Judge)
  .register(Lawyer)
  .register(Chemist)
  .register(MintPuny)
  .register(MintCook)
  .register(Glitch)
  .register(Sapper)
  .register(Jester)
  .register(Alarm)
  .register(Hacker)
  .register(MintPunik)
  .register(Headhunter)
  .register(Executioner)
  .register(Veteran)
  .register(Menthol)
  .register(Blackjack)
  .register(Tracker)
  .register(Journalist)
  .register(Developer)
  .register(Guard)
  .register(Adviser)
  .register(Commander)
  .register(Blackmailer)
  .register(Santa)
  .register(Scout)
  .register(Teacher);

configureGunRoles(this, [
  Puny, Policeman, TechnicPuny, Spy, Judge, Lawyer, Chemist,
  MintPuny, MintCook, Glitch, Sapper, Jester, Alarm, Hacker, MintPunik,
  Headhunter, Executioner, Veteran, Menthol, Blackjack, Tracker,
  Journalist, Developer, Guard, Adviser, Commander, Blackmailer, Santa,
  Scout, Teacher
]);
  for(const member of members){check(!this.players.has(member.id),'Повторяющийся игрок.');const p=new Player(this,member.id,member.username);p.equipped={...member.equipped};this.players.set(member.id,p);}check(this.players.has(hostId),'Хост не является участником.');
 }
 hasPlayer(p){return this.players.get(p.id)===p;}player(id){const p=this.players.get(id);check(p,'Игрок не является участником.');return p;}
 
 start({ roleSelections = [] } = {}) {
  check(this.phase === 'setup', 'Раунд уже начался.');
  const s = validateSettings(this.settings);
  const roster = shuffled([...this.players.values()]);

  // Tickets are checked before roles, modifiers or tasks change.
  const assignments = assignSelectedRoles(
    s,
    roster.map(player => player.id),
    roleSelections
  );

  const hasSanta = [...assignments.values()].includes('santa');

  if (hasSanta) {
    const good = s.santaGoodPlayers ?? 2;
    const bad = s.santaBadPlayers ?? 2;

    check(
      Number.isSafeInteger(good) && good >= 0 &&
      Number.isSafeInteger(bad) && bad >= 0,
      'Некорректные размеры списков Санты.'
    );

    check(
      good + bad > 0,
      'У Санты должен быть хотя бы один адресат.'
    );

    check(
      good + bad <= roster.length - 1,
      'Недостаточно игроков для списков Санты: уменьшите количество хороших или плохих игроков.'
    );
  }

  check(s.sixthSenseCount <= roster.length, 'Слишком много модификаторов Шестое чувство.');
  check(Array.isArray(tasksPool), 'tasksPool должен быть массивом.');
  const taskIds = new Set();
  for (const task of tasksPool) {
    check(
      task && typeof task.id === 'string' && task.id &&
      typeof task.name === 'string' && !taskIds.has(task.id),
      'Некорректное или повторяющееся задание.'
    );
    taskIds.add(task.id);
  }

  const sixth = new Set(
    shuffled(roster).slice(0, s.sixthSenseCount).map(player => player.id)
  );

  const doubleShotPlayers = shuffled(
    roster.filter(player =>
      DoubleShot.allowedFor(
        player,
        s.doubleShotMode ?? 'all'
      )
    )
  ).slice(0, s.doubleShots);

  const doubleShotIds = new Set(
    doubleShotPlayers.map(player => player.id)
  );

  roster.forEach(player => {
    player.setRole(assignments.get(player.id));

    if (player.role?.constructor.id === 'headhunter') {
      const others = roster.filter(p => p.id !== player.id);
      player.role.contracts = shuffled(others).slice(0, 2).map(p => p.id);
    }
    if (player.role?.constructor.id === 'executioner') {
      const others = roster.filter(p => p.id !== player.id);
      player.role.contract = shuffled(others)[0].id;
    }


    if (sixth.has(player.id)) player.modifiers.push(new SixthSense(player));
    if (doubleShotIds.has(player.id)) {
      player.modifiers.push(new DoubleShot(player));
    }
    player.tasks = shuffled(
      tasksPool.filter(task => !player.role.fakeTasks || task.fakeAllowed !== false)
    )
      .slice(0, s.tasksPerPlayer)
      .map(task => ({
        id: task.id,
        name: task.name,
        description: task.description ?? '',
        completed: false
      }));
  });

  for (const player of roster) {
    if (player.role?.constructor.id === 'santa') {
      player.role.assignLists();
    }
  }


  const traitors = shuffled(
    roster.filter(p => p.team === 'innocent')
  ).slice(0, s.traitors);

  for (const player of traitors) {
    player.modifiers.push(new Traitor(player));
  }

  const egoists = shuffled(
    roster.filter(p => p.team === 'innocent')
  ).slice(0, s.egoists);

  for (const player of egoists) {
    player.modifiers.push(new Egoist(player));
  }

  const decoys = shuffled(roster).slice(0, s.decoys);

  for (const player of decoys) {
    player.modifiers.push(new Decoy(player));
  }

  const tiebreakers = shuffled(roster).slice(0, s.tiebreakers);

  for (const player of tiebreakers) {
    player.modifiers.push(new Tiebreaker(player));
  }

  const radios = shuffled(roster).slice(0, s.radios);

  for (const player of radios) {
    player.modifiers.push(new Radio(player));
  }

  const informed = shuffled(
    roster.filter(p => p.team === 'mint')
  ).slice(0, s.informed);

  for (const player of informed) {
    player.modifiers.push(new Informed(player));
  }

  const satellites = shuffled(roster).slice(0, s.satellites);

  for (const player of satellites) {
    player.modifiers.push(new SatelliteLink(player));
  }

  const tags = shuffled(roster).slice(0, s.tags);

  for (const player of tags) {
    player.modifiers.push(new Tag(player));
  }

  const walkingButtons = shuffled(roster).slice(0, s.walkingButtons);

  for (const player of walkingButtons) {
    player.modifiers.push(new WalkingButton(player));
  }



  
  // Preserve Gun distribution if the modifier has already been connected.
  if (typeof assignGuns === 'function') assignGuns(this);

  this._rolepointAssignmentsApplied = true;
  this.introStartedAt = Date.now();
  this.playStartsAt = this.introStartedAt + 2000 +
    (s.introFactionSeconds + s.introRoleSeconds) * 1000;
  this.phase = 'intro';
  this.meetings.nextEmergencyAt = this.playStartsAt + s.meetingCooldown * 1000;
}

logEvent(text) {
  const d = new Date();
  const time = `${d.toTimeString().slice(0, 8)}:${String(d.getMilliseconds()).padStart(3, '0')}`;
  this.log.push(`[${time}] ${text}`);
  if (this.log.length > 100) this.log.shift();
}
guardShieldActive(player, now = Date.now()) {
  const shield = this.guardShields.get(player.id);

  if (!shield) return false;

  if (!player.awake || shield.until <= now) {
    this.guardShields.delete(player.id);
    return false;
  }

  return true;
}

consumeGuardShield(player, attacker, now = Date.now()) {
  if (!this.guardShieldActive(player, now)) return false;

  this.guardShields.delete(player.id);
  this._shieldedTargets?.add(player.id);



  return true;
}

playerIsArmed(player) {
  const attackIds = new Set([
    'lull',
    'gun',
    'blackjack-shot',
    'blackjack-guess',
    'headhunter-shot',
    'executioner-shot'
  ]);

  const roleWeapon = (player.role?.abilities ?? []).some(
    ability => attackIds.has(ability.id)
  );

  const gunModifier = player.modifiers.some(modifier =>
    !modifier.removed &&
    (
      modifier.constructor.id === 'gun-guesser' ||
      modifier.snapshot?.().id === 'gun-guesser'
    )
  );

  return roleWeapon || gunModifier;
}
recordLullVisual() {}

addVisualEvent() {
  return null;
}

visualEventsFor() {
  return [];
}
voteWeight(playerId) {
  const player = this.player(playerId);

  return player.role?.constructor.id === 'commander'
    ? 2
    : 1;
}

activateBlackmail(eligible) {
  this.activeBlackmail = new Set(
    [...this.pendingBlackmail].filter(
      id => eligible.includes(id)
    )
  );

  this.pendingBlackmail.clear();
}

clearActiveBlackmail() {
  this.activeBlackmail.clear();
}
 assertTarget(source,target){check(target instanceof Player&&this.hasPlayer(target)&&target!==source&&target.awake,'Цель должна быть другим бодрствующим игроком.');}
 interact(attacker,target,kind='interaction'){
  check(attacker instanceof Player&&target instanceof Player&&this.hasPlayer(attacker)&&this.hasPlayer(target),'Некорректное взаимодействие.');const key=JSON.stringify([attacker.id,target.id]);if(this._interactionScope?.has(key))return;this._interactionScope?.add(key);
  this.logEvent(`${attacker.username} interacted with ${target.username}`);
  const interaction={attacker,target,kind,now:Date.now()};for(const m of [...target.modifiers])m.onInteraction?.(interaction);
 }
 activeCrises(){const a=[];if(this.rocket)a.push('rocket');if(this.wifi)a.push('wifi');return a;}
 tabletAvailable(p,now=Date.now()){return !(this.phase==='playing'&&p.team==='innocent'&&this.wifi&&this.wifi.expiresAt>now);}
 hackOptions(sourceId,targetId){this.tick();const p=this.player(sourceId);p.assertCanAct();check(p.role instanceof Glitch,'Недоступно этой роли.');p.requireReady('hack',Date.now());const target=this.player(targetId);this.assertTarget(p,target);return target.role.abilities.filter(a=>target.role.hackableIds.includes(a.id)).map(a=>({id:a.id,name:a.name}));}

 
use(playerId, ability, targetId, params = {}) {
  const now = Date.now(); this.tick(now);
  const p = this.player(playerId);
  const modifierAllowsMeeting = p.modifiers.some(
    m => m.canUseDuringMeeting?.(ability)
  );

  p.assertCanAct(
    p.role?.canUseDuringMeeting(ability) || modifierAllowsMeeting
  );

  const meeting = this.meetings.current;
  if (meeting && meeting.phase === 'waiting') {
    throw new Error('Ожидание собрания.');
  }
  if (
    meeting?.phase === 'discussion' &&
    !['gun-guess', 'blackjack-guess', 'interrogate'].includes(ability)
  ) throw new Error('Во время обсуждения доступна только Пушка.');

  check(this.tabletAvailable(p, now) || p.role.canUseWithoutTablet(ability), 'Планшет временно отключён.');
  const target = targetId === undefined ? null : this.players.get(targetId);
  const key = p.role.hackKey(ability), traps = this.hacks.get(p.id);
  if (traps?.has(key)) {
    p.role.blockedUse(ability, target, now, params);
    traps.delete(key); if (!traps.size) this.hacks.delete(p.id);
    this.tick(now); return { blocked: true };
  }

  const modifier = p.modifiers.find(
    m =>
      m.abilities?.some(
        a => a.id === ability
      )
  );


  if (modifier) {
    const modifierAbility = modifier.abilities.find(
      a => a.id === ability
    );

    check(
      modifierAbility,
      'Неизвестная способность.'
    );

    const inMeeting = Boolean(this.meetings.current);

    if (inMeeting) {
      check(
        modifier.canUseDuringMeeting(ability),
        'Эту способность нельзя использовать сейчас.'
      );
    }
    
    const result = modifier.use(
      ability,
      target,
      now,
      params
    );

    this.actionLog.push({
      actorId: p.id,
      actorName: p.username,
      team: p.team,
      ability,
      targetName: target?.username ?? null,
      time: Date.now()
    });

    if (this.actionLog.length > 100) {
      this.actionLog.shift();
    }

    this.resolveStateChanges();
    this.tick(now);

    return {
      blocked: false,
      ...result
    };
  }

  if (target && target !== p) {
    const veteran = target.role;
    if (veteran?.constructor.id === 'veteran' && veteran.alertUntil > now) {
      Player.lull(target, p);
      veteran.alertUntil = 0;
      return { blocked: true, countered: true };
    }
  }

  const attacks = new Set(['lull', 'gun', 'tea', 'poke', 'hack', 'judge', 'headhunter-shot', 'executioner-shot', 'commander-shot', 'santa-surprise']);
  if (target && target !== p && attacks.has(ability) && target.role?.shieldActive?.(now)) {
    // Validate and pay exactly as a suppressed ability, without applying its effect.
    p.role.blockedUse(ability, target, now, params);
    check(target.role.absorbAttack({ attacker: p, now }), 'Щит недоступен.');
    this.tick(now); return { blocked: true, shielded: true };
  }

  const previous = this._interactionScope, previousShielded = this._shieldedTargets;
  this._interactionScope = new Set(); this._shieldedTargets = new Set();
  let shielded = false;
  try {
    p.role.use(ability, target, now, params);
    this.actionLog.push({
      actorId: p.id,
      actorName: p.username,
      team: p.team,
      ability,
      targetName: target?.username ?? null,
      time: Date.now()
    });

    if (this.actionLog.length > 100) {
      this.actionLog.shift();
    }
    shielded = Boolean(target && this._shieldedTargets.has(target.id));
    this.logEvent(`${p.username} used ability`);
    if (target && !shielded) this.interact(p, target, ability);
  } finally {
    this._interactionScope = previous; this._shieldedTargets = previousShielded;
  }
  this.resolveStateChanges(); this.tick(now);
  return { blocked: shielded, ...(shielded ? { shielded: true } : {}) };
}

sapperReadyToDetonate() {
  return [...this.players.values()].every(p =>
    p.team === 'mint' ||
    p.role?.constructor.id === 'sapper' ||
    this.mines.has(p.id)
  );
}

startSapperBlast(miner, now) {
  check(this.phase === 'playing', 'Раунд не идёт.');
  check(miner.role?.constructor.id === 'sapper', 'Взрыв доступен только Сапёру.');
  this.sapperBlast = {
    deadline: now + (this.settings.sapperDetonateSeconds ?? 30) * 1000,
    minerId: miner.id
  };
}
resolveContract(target, reason, actor = null) {
  if (!target) return;

  if (reason === 'lull') {
    for (const player of this.players.values()) {
      if (player.role?.constructor.id === 'santa') {
        player.role.onPlayerSlept(target, actor);
      }
    }
  }

  if (reason === 'exile') {
    for (const player of this.players.values()) {
      if (player.role?.constructor.id === 'santa') {
        player.role.onPlayerExiled(target);
      }
    }
  }

  for (const player of this.players.values()) {
    const role = player.role;

    if (
      role?.constructor.id === 'headhunter' &&
      role.contracts.includes(target.id)
    ) {
      if (reason === 'lull' && actor === player) {
        role.completeContract(target);
      } else if (reason === 'lull' && actor !== player) {
        const s = this.settings.headhunterLullByOther;

        if (s === 'count') {
          role.completeContract(target);
        } else if (s === 'transform') {
          role.loseContract(target);
        } else if (s === 'new-target' && actor) {
          role.contracts = role.contracts.map(
            id => id === target.id ? actor.id : id
          );
        }
      } else if (reason === 'exile') {
        role.loseContract(target);
      }
    }

    if (
      role?.constructor.id === 'executioner' &&
      role.contract === target.id
    ) {
      if (reason === 'lull' && actor === player) {
        role.completeContract(target);
      } else if (reason === 'lull' && actor !== player) {
        const s = this.settings.executionerLullByOther;

        if (s === 'count') {
          role.completeContract(target);
        } else if (s === 'transform') {
          role.loseContract(target);
        } else if (s === 'new-target' && actor) {
          role.contract = actor.id;
        }
      } else if (reason === 'exile') {
        role.loseContract(target);
      }
    }
  }
}

examFor(playerId) {
  const exam = this.activeExams.get(playerId);

  if (!exam) return null;

  return {
    topic: exam.topic,
    questions: exam.questions,
    startedAt: exam.startedAt,
    deadline: exam.deadline
  };
}
submitExam(playerId, answers) {
  const now = Date.now();
  const exam = this.activeExams.get(playerId);

  check(
    exam,
    'Сейчас нет активной контрольной.'
  );

  check(
    now <= exam.deadline,
    'Время контрольной истекло.'
  );

  check(
    Array.isArray(answers),
    'Некорректные ответы.'
  );

  // Удаляем контрольную сразу после валидной отправки.
  // Даже если дальше возникнет ошибка применения оценки,
  // игрок не сможет отправить её повторно.
  this.activeExams.delete(playerId);

  const source = exams[exam.topic];
  let correct = 0;

  for (let i = 0; i < exam.questions.length; i++) {
    const question = source[exam.questions[i].index];
    const answer = answers[i];

    if (question.type === 'single') {
      if (answer === question.answer) correct++;
      continue;
    }

    if (question.type === 'multiple') {
      const selected = new Set(
        Array.isArray(answer) ? answer : []
      );

      const expected = new Set(question.answers);

      const same =
        selected.size === expected.size &&
        [...selected].every(id => expected.has(id));

      if (same) correct++;

      continue;
    }

    const value = normalizeText(answer);

    if (
      value &&
      question.accepted.some(
        item => normalizeText(item) === value
      )
    ) {
      correct++;
    }
  }

  const percent = Math.round(
    correct / exam.questions.length * 100
  );

  const target = this.player(playerId);

  if (percent >= 75) {
    target.attackImmunityUntil = Math.max(
      target.attackImmunityUntil ?? 0,
      now + 30000
    );

    target.notify(
      `Контрольная сдана на ${percent}%. Автоматическая Пятёрка: защита от атак на 30 секунд.`
    );

    return { percent, result: 'five' };
  }

  if (percent >= 60) {
    target.notify(
      `Контрольная сдана на ${percent}%. Четвёрка: ничего не происходит.`
    );

    return { percent, result: 'four' };
  }

  if (percent >= 30) {
    target.snowUntil = Math.max(
      target.snowUntil ?? 0,
      now +
      (this.settings.teacherTwoSeconds ?? 8) * 1000
    );

    target.notify(
      `Контрольная сдана на ${percent}%. Автоматическая Двойка.`
    );

    return { percent, result: 'two' };
  }

  target.notify(
    `Контрольная сдана на ${percent}%. Ты выгнан из класса.`
  );

  target.exile();
  this.resolveContract(target, 'exile');
  this.resolveStateChanges();

  return { percent, result: 'expelled' };
}

expireExams(now = Date.now()) {
  for (const [playerId, exam] of [...this.activeExams]) {
    if (now < exam.deadline) continue;

    this.activeExams.delete(playerId);

    const target = this.players.get(playerId);

    if (!target?.awake) continue;

    target.notify(
      'Время контрольной истекло. Ты выгнан из класса.'
    );

    target.exile();
    this.resolveContract(target, 'exile');
  }
}


applyTag(reporter, target) {
  for (const modifier of reporter.modifiers) {
    modifier.onInteraction?.({
      attacker: reporter,
      target,
      kind: 'report',
      now: Date.now()
    });
  }
}



 completeTask(playerId,taskId){this.tick();const p=this.player(playerId);p.assertCanAct();check(this.tabletAvailable(p),'Планшет отключён.');const t=p.tasks.find(t=>t.id===taskId);check(t&&!t.completed,'Задание не назначено или уже отмечено.');t.completed=true;}
 startSabotage(source, type, now) {
    check(this.phase === 'playing' && this.hasPlayer(source) && source.team === 'mint' && source.awake && !this.meetings.blocked, 'Поломка недоступна.');
    check(!this.sapperBlast, 'Сейчас идёт таймер Сапёра: поломки недоступны.'); // ← новая строка
    if (type === 'rocket') {
      check(!this.rocket, 'Ракета уже запущена.');
      this.rocket = { deadline: now + this.settings.rocketSeconds * 1000 };
      this.missilePanel = Array.from({ length: 6 }, () => randomInt(2) === 1);
      if (this.missilePanel.every(Boolean)) this.missilePanel[randomInt(6)] = false;
    } else if (type === 'wifi') {
      check(!this.wifi, 'Wi‑Fi уже отключён.');
      this.wifi = { expiresAt: now + this.settings.wifiSeconds * 1000 };
    } else throw new Error('Неизвестная поломка.');
  }
 repairCrisis(id){check(this.phase==='playing'&&!this.meetings.blocked,'Починка недоступна.');if(id==='rocket'){check(this.rocket,'Ракеты уже нет.');this.rocket=null;this.missilePanel=null;}else if(id==='wifi'){check(this.wifi,'Wi-Fi уже работает.');this.wifi=null;}else throw new Error('Поломка не поддерживает удалённую починку.');}
 toggleMissileSwitch(index){this.tick();check(this.phase==='playing'&&!this.meetings.blocked&&this.rocket&&this.missilePanel,'Починка недоступна.');check(Number.isInteger(index)&&index>=0&&index<this.missilePanel.length,'Неверный переключатель.');this.missilePanel[index]=!this.missilePanel[index];if(this.missilePanel.every(Boolean)){this.rocket=null;this.missilePanel=null;}}
 
 
 
syncMeetingAttackCooldowns(now = Date.now()) {
  const blocked = Boolean(
    this.meetings.blocked || this.meetings.current ||
    this.meetings.resolution || this.meetings.termination
  );
  const ended = this._meetingAttackCooldownBlocked === true && !blocked;
  this._meetingAttackCooldownBlocked = blocked;
  if (!ended || this.phase !== 'playing') return;

  for (const player of this.players.values()) {
    if (!player.role) continue;
    const abilities = new Set(player.role.abilities.map(ability => ability.id));
    if (abilities.has('lull')) {
      const seconds = player.role.constructor.id === 'mint-punik'
        ? this.settings.mintPunikLullCooldown ?? 30
        : this.settings.lullCooldown ?? 30;
      player.cooldown('lull', seconds, now);
    }
    if (abilities.has('gun')) player.cooldown('gun', this.settings.policeCooldown ?? 20, now);
    if (abilities.has('tea')) player.cooldown('tea', this.settings.teaCooldown ?? 35, now);
    if (abilities.has('commander-shot')) {
        player.cooldown(
          'commander-shot',
          this.settings.commanderShotCooldown ?? 35,
          now
        );
      }

      if (abilities.has('santa-surprise')) {
        player.cooldown(
          'santa-surprise',
          this.settings.santaSurpriseCooldown ?? 45,
          now
        );
      }
  }
}
 
tick(now = Date.now()) {
  // Catch changes made outside tick: voting, Judge or TERMINATE.
  this.syncMeetingAttackCooldowns(now);
  this.expireExams(now);

  for (const [targetId, interrogation] of this.pendingInterrogations) {
    if (Date.now() > interrogation.expiresAt) {
      this.pendingInterrogations.delete(targetId);
      const tracker = this.players.get(interrogation.askedBy);
      const target = this.players.get(targetId);
      tracker?.notify(`${target?.username ?? 'Цель'}: (...молчание...)`);
    }
  }

  if (this.phase === 'intro') {
    if (now >= this.playStartsAt) this.phase = 'playing';
    else return;
  }
  if (this.phase !== 'playing') return;
  if (this.rocket && now >= this.rocket.deadline) {
      this.addVisualEvent('rocket', {
        audience: null,
        duration: 2400
      });

      this.finish('mint', 'Ракетный удар');
      return;
    }
  if (this.sapperBlast && now >= this.sapperBlast.deadline) {
    const miner = this.players.get(this.sapperBlast.minerId);
    this.sapperBlast = null;

    const sleepingIds = [];

    if (miner?.awake && this.hasPlayer(miner)) {
      const targets = [...this.mines]
        .map(id => this.players.get(id))
        .filter(target => target?.awake);

      const previousKind = this._visualAttackKind;
      this._visualAttackKind = 'sapper';

      try {
        for (const target of targets) {
          Player.lull(miner, target);

          if (target.state === 'sleeping') {
            sleepingIds.push(target.id);
          }
        }
      } finally {
        this._visualAttackKind = previousKind;
      }

      if (sleepingIds.length > 0) {
        this.addVisualEvent('sapper', {
          attacker: miner,
          audience: sleepingIds,
          duration: 2000
        });
      }
    }

    this.mines.clear();
    this.resolveStateChanges();
  }
  if (this.wifi && now >= this.wifi.expiresAt) this.wifi = null;
  let changed = false;
  for (const [id, tea] of this.pendingTea) {
    if (now < tea.dueAt) continue;
    this.pendingTea.delete(id);
    const target = this.players.get(id);
    if (!target?.awake) continue;
    const source = this.players.get(tea.sourceId) ?? null;
    Player.lull(source, target);
    changed = true;
  }
  if (changed) this.resolveStateChanges();
  if (this.phase === 'playing') this.meetings.tick(now);
  // Catch the end of voting/ejection/termination occurring inside tick.
  this.syncMeetingAttackCooldowns(now);
} 


resolveStateChanges() {
  if (this.phase !== 'playing') return;
  for (const player of this.players.values()) {
    if (
      player.role?.constructor.id === 'santa' &&
      player.role.readyToWin()
    ) {
      this.finish(
        'neutral',
        'Санта доставил все подарки и сюрпризы',
        { winnerIds: [player.id] }
      );

      return;
    }
  }

  for (const player of this.players.values()) {
    for (const modifier of [...player.modifiers]) {
      modifier.onStateChanged?.(this);
    }
  }

  if (this.phase !== 'playing') return;

  // Не фиксируем победу, пока решение собрания
  // ещё может быть отменено через TERMINATE.
  if (
    this.meetings.current ||
    this.meetings.resolution ||
    this.meetings.termination
  ) {
    return;
  }

  const active = [...this.players.values()].filter(
    player => player.awake
  );


  const isMintPunik = player =>
    player.role?.constructor.id === 'mint-punik';

  // Соло-победа проверяется раньше обычных побед фракций.
  if (active.length === 1 && isMintPunik(active[0])) {
    this.finish(
      'neutral',
      'Мятный Пуник остался последним бодрствующим игроком',
      { winnerIds: [active[0].id] }
    );
    return;
  }

  const mint = active.some(player => player.team === 'mint');
  const innocent = active.some(
    player => player.team === 'innocent'
  );
  const survivingPunik = active.some(isMintPunik);

  if (!mint && !innocent) {
    // Например, остались Пуник и Шут либо два Пуника.
    // Не завершаем раунд ничьей: соло-победа ещё возможна.
    if (survivingPunik) return;

    this.finish(
      null,
      'Нет активных игроков основных фракций'
    );
  } else if (!mint) {
    this.finish(
      'innocent',
      'Все мятные выведены из игры'
    );
  } else if (!innocent) {
    this.finish(
      'mint',
      'Все мирные выведены из игры'
    );
  }
}

finish(
  winner,
  reason,
  { winnerIds = null, cancelled = false } = {}
) {
  check(this.phase === 'playing', 'Раунд не идёт.');
    const egoist = [...this.players.values()].find(
    player =>
      player.awake &&
      player.team === 'innocent' &&
      player.modifiers.some(
        modifier => modifier.constructor.id === 'egoist'
      )
  );

  if (
    !cancelled &&
    winner === 'innocent' &&
    egoist
  ) {
    const innocentAlive = [...this.players.values()].filter(
      player => player.awake && player.team === 'innocent'
    );

    if (
      innocentAlive.length === 1 &&
      innocentAlive[0].id === egoist.id
    ) {
      this.finish(
        'neutral',
        'Эгоист остался единственным Мирным',
        { winnerIds: [egoist.id] }
      );

      return;
    }
  }

  const players = [...this.players.values()];
  const active = players.filter(player => player.awake);

  const isMintPunik = player =>
    player.role?.constructor.id === 'mint-punik';

  let selected = cancelled
    ? []
    : winnerIds ?? players
        .filter(player =>
          player.team === winner &&
          !isMintPunik(player)
        )
        .map(player => player.id);

  check(
    Array.isArray(selected),
    'Некорректный список победителей.'
  );

  for (const id of selected) {
    check(
      this.players.has(id),
      'Победитель не является участником.'
    );
  }

  selected = [...new Set(selected)];

  const santaSolo =
    !cancelled &&
    winner === 'neutral' &&
    selected.length === 1 &&
    this.player(selected[0]).role?.constructor.id === 'santa' &&
    this.player(selected[0]).role.readyToWin();

  const soloContract =
    !cancelled &&
    !santaSolo &&
    players.find(player =>
      player.awake && (
        (
          player.role?.constructor.id === 'headhunter' &&
          player.role.completed >= 2
        ) ||
        (
          player.role?.constructor.id === 'executioner' &&
          player.role.completed
        )
      )
    );

  if (soloContract) {
    winner = 'neutral';
    reason = 'Контракты завершены';
    selected = [soloContract.id];
  }

  const soloPunik =
    !cancelled &&
    winner === 'neutral' &&
    active.length === 1 &&
    isMintPunik(active[0]) &&
    selected.length === 1 &&
    selected[0] === active[0].id;

  const winners = soloPunik
    ? [active[0].id]
    : selected.filter(id => !isMintPunik(this.player(id)));


  if (
    !cancelled &&
    winner === 'innocent'
  ) {
    for (const player of players) {
      if (
        player.role?.constructor.id === 'teacher' &&
        player.awake &&
        !winners.includes(player.id)
      ) {
        winners.push(player.id);
      }
    }
  }

  if (!cancelled && !santaSolo && winners.length > 0) {
    for (const player of players) {
      if (
        isMintPunik(player) &&
        player.awake &&
        !winners.includes(player.id)
      ) {
        winners.push(player.id);
      }
    }
  }

  this.result = {
    winner,
    reason,
    winnerIds: [...winners],
    cancelled,
    finishedAt: Date.now()
  };

  this.phase = 'finished';

  this.rewardPlan = players.map(player => {
    const won = winners.includes(player.id);

    return {
      username: player.username,
      coins: cancelled
        ? 0
        : won
          ? this.settings.winCoins
          : this.settings.loseCoins,
      outcome: cancelled
        ? 'cancelled'
        : won
          ? 'victory'
          : 'defeat'
    };
  });

  this.rewardStatus = cancelled ? 'paid' : 'waiting';

  if (cancelled) {
    for (const award of this.rewardPlan) {
      this.rewardPayments[award.username] = {
        ...award,
        status: 'paid'
      };
    }
  }

  this.pendingTea.clear();
  this.hacks.clear();
  this.pendingBlackmail.clear();
  this.activeBlackmail.clear();
  this.guardShields.clear();

  this.rocket = null;
  this.wifi = null;
  this.missilePanel = null;

  this.meetings.clear();
  this.mines.clear();
  this.sapperBlast = null;
}

  pauseForMeeting() {
    if (!this._meetingPausedAt) this._meetingPausedAt = Date.now();
  }

  resumeFromMeeting(now = Date.now()) {
    const pausedAt = this._meetingPausedAt;
    if (!pausedAt) return;
    const shift = now - pausedAt;
    this._meetingPausedAt = null;

    if (this.rocket) this.rocket.deadline += shift;
    if (this.wifi) this.wifi.expiresAt += shift;
    for (const tea of this.pendingTea.values()) tea.dueAt += shift;
    if (this.sapperBlast) this.sapperBlast.deadline += shift; // ожидание останавливает взрыв
    for (const p of this.players.values()) p.shiftCooldowns(shift);
  }

 taskProgress(){let completed=0,total=0;for(const p of this.players.values()){if(!p.role||p.role.fakeTasks)continue;for(const t of p.tasks){total++;if(t.completed)completed++;}}return{completed,total};}
 publicPlayers(){return[...this.players.values()].map(p=>({id:p.id,username:p.username,state:p.state,equipped:{...p.equipped}}));}
 introSnapshot(viewer){if(this.phase!=='intro')return null;
  const people = [...this.players.values()].filter(p => {
  if (viewer.team === 'innocent') return true;

  if (viewer.team === 'mint') {
    return (
      p.team === 'mint' ||
      p.role?.constructor.id === 'scout'
    );
  }

  return p === viewer;
});
  return{shushEndsAt:this.introStartedAt+2000,factionEndsAt:this.introStartedAt+2000+this.settings.introFactionSeconds*1000,endsAt:this.playStartsAt,faction:viewer.team==='innocent'?'INNOCENT':viewer.team==='mint'?'MINT':'NEUTRAL',teammates:people.map(p=>({id:p.id,username:p.username,equipped:{...p.equipped}})),self:{id:viewer.id,username:viewer.username,equipped:{...viewer.equipped}}};}
 snapshot(id){const p=this.player(id),plan=this.rewardPlan.find(a=>a.username===p.username);return{gameId:this.id,serverTime:Date.now(),roleChoices: this.roles.all(),
phase:this.phase,hostId:this.hostId,settings:{...this.settings},result:this.result?{...this.result,winnerIds:[...this.result.winnerIds]}:null,won:this.result?this.result.winnerIds.includes(id):null,reward:plan?{coins:plan.coins,status:this.rewardStatus,outcome:plan.outcome}:null,crisisActive:this.activeCrises().length>0,tabletAvailable:this.tabletAvailable(p),rocket:this.rocket?{...this.rocket}:null,wifi:this.wifi?{...this.wifi}:null,taskProgress:this.taskProgress(),intro:this.introSnapshot(p),me:p.ownerState(),gunRoles: this.roles.all(),headhunterTarget: [...this.players.values()].some(pl => {
  const r = pl.role;
  return r?.constructor.id === 'headhunter' && r.contracts?.includes(id);
}),
executionerTarget: [...this.players.values()].some(pl => {
  const r = pl.role;
  return r?.constructor.id === 'executioner' && r.contract === id;
}),
visualEvents: this.visualEventsFor(id),
terminal:typeof p.role?.terminalSnapshot==='function'?p.role.terminalSnapshot():null,gunShots: gunMeetingState(this),players:this.publicPlayers(),sapperBlast: this.sapperBlast ? { ...this.sapperBlast } : null,...this.meetings.snapshot()};
}

devConsoleSnapshot() {
  const factionCode = { innocent: '0b0001', mint: '0b0010', neutral: '0b0100' };
  return {
    players: [...this.players.values()].map(p => ({
      name: p.username,
      id: p.id,
      state: p.state,
      armed: ['gun', 'blackjack-shot', 'headhunter-shot', 'executioner-shot', 'lull']
        .some(id => p.role?.abilities?.some(a => a.id === id)),
      faction: factionCode[p.team] ?? '0b0000'
    })),
    logs: [...this.log]
  };
}

 internalSnapshot(){return{gameId:this.id,serverTime:Date.now(),phase:this.phase,crisisActive:this.activeCrises().length>0,rocket:this.rocket?{...this.rocket}:null,sapperBlast: this.sapperBlast ? { ...this.sapperBlast } : null,missilePanel:this.missilePanel?[...this.missilePanel]:null,players:this.publicPlayers(),...this.meetings.snapshot()};gunShots: gunMeetingState(this)}
}
