export class Meetings {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.resolution = null;
    this.lastResult = null;
    this.termination = null;
    this.sequence = 0;
    this.reported = new Set();
    this.emergencyUsed = 0;
    this.nextEmergencyAt = 0;
  }

  get blocked() {
    return Boolean(
      this.current ||
      this.resolution ||
      (this.termination && Date.now() < this.termination.until)
    );
  }

  get terminable() {
    const m = this.current;
    return Boolean(m && m.phase === 'voting') || Boolean(this.resolution);
  }

  activeVoters(meeting = this.current) {
    return meeting
      ? meeting.initialEligible.filter(id => this.game.players.get(id)?.awake)
      : [];
  }

  forceEmergency(playerId, now = Date.now()) {
    check(
      !this.current,
      'Собрание уже идёт.'
    );

    this.start({reason: 'forced', reporterId: playerId, targetId: null});
  }

  start({ reason = 'emergency', reporterId = null, targetId = null } = {}) {
    const game = this.game;
    if (game.phase !== 'playing') throw new Error('Раунд не идёт.');
    if (game.activeCrises().length) throw new Error('EMERGENCY MEETING CANNOT BE CALLED DURING CRISIS');
    if (this.blocked) throw new Error('Собрание или анимация уже идёт.');
    if (!['emergency', 'report', 'forced'].includes(reason)) throw new Error('Неизвестный тип собрания.');

    if (reason === 'emergency') {
      if (this.emergencyUsed >= game.settings.emergencyLimit)
        throw new Error('Лимит EmergencyButton исчерпан.');
      const left = this.nextEmergencyAt - Date.now();
      if (left > 0)
        throw new Error(`EMERGENCY BUTTON COOLDOWN: ${Math.ceil(left / 1000)} sec.`);
    } else if (reason === 'forced') {} else {
      game.player(reporterId).assertCanAct();
      if (game.player(targetId).state !== 'sleeping')
        throw new Error('Этот игрок не спит.');
      if (this.reported.has(targetId))
        throw new Error('Этого игрока уже нашли.');
    }

    const eligible = [...game.players.values()].filter(p => p.awake).map(p => p.id);
    if (!eligible.length) throw new Error('Нет активных игроков.');

    if (reason === 'report') {this.reported.add(targetId);}
    else if (reason === 'forced') {}
    else {this.emergencyUsed++;}

    for (const player of game.players.values()) {
      player.frozenUntil = 0;
      player.snowUntil = 0;
    }
    game.clearActiveBlackmail();
    this.termination = null;
    this.current = {
      id: ++this.sequence,
      reason,
      reporterId,
      targetId,
      phase: 'waiting',
      initialEligible: eligible,
      votes: new Map(),
      protected: new Set(),
      discussionEndsAt: null,
      endsAt: null
    };
    game.pauseForMeeting();
  }

 

  confirmAllGathered(hostId) {
    const m = this.current;

    check(
      m && m.phase === 'waiting',
      'Сейчас нет ожидания собрания.'
    );

    check(
      hostId === this.game.hostId,
      'Только хост может начать собрание.'
    );

    m.phase = 'discussion';

    m.discussionEndsAt =
      Date.now() +
      (this.game.settings.discussionTime ?? 30) * 1000;

    this.game.activateBlackmail(this.activeVoters(m));
    this.game.resumeFromMeeting();
  }

  startVoting(hostId) {
    const m = this.current;
    check(m && m.phase === 'discussion', 'Сейчас не фаза обсуждения.');
    check(hostId === this.game.hostId, 'Только хост может начать голосование.');
    this._openVoting(Date.now());
  }

  _openVoting(now) {
    const m = this.current;
    m.phase = 'voting';
    m.endsAt = now + this.game.settings.meetingSeconds * 1000;
  }

  vote(playerId, targetId) {
    const m = this.current;
    check(m && m.phase === 'voting', 'Голосование сейчас недоступно.');
    if (Date.now() >= m.endsAt) throw new Error('Голосование завершено.');
    const eligible = this.activeVoters(m);
    if (!eligible.includes(playerId)) throw new Error('Ты не можешь голосовать.');
    if (m.votes.has(playerId)) throw new Error('Голос уже засчитан.');
    if (targetId !== null && !eligible.includes(targetId))
      throw new Error('Цель спит или изгнана.');
    m.votes.set(playerId, targetId);
    this.checkCompletion(Date.now());
  }

  protect(target) {
    const m = this.current;
    check(m && m.phase === 'voting', 'Защита доступна только во время голосования.');
    if (m.protected.has(target.id)) throw new Error('Этот игрок уже защищён.');
    m.protected.add(target.id);
  }

  forceExile(target) {
    const m = this.current;
    check(m && m.phase === 'voting', 'Приговор доступен только во время голосования.');
    this.beginResolution(target.id, 'judge', Date.now());
  }

  checkCompletion(now) {
    const m = this.current;
    if (m && m.phase === 'voting' && (now >= m.endsAt || this.activeVoters(m).every(id => m.votes.has(id))))
      this.finish(now);
  }

  finish(now) {
  const m = this.current;
  if (!m) return;


  const candidates = new Set(this.activeVoters(m));
  const counts = new Map();


  for (const [voterId, targetId] of m.votes) {
    if (
      targetId !== null &&
      (
        !candidates.has(targetId) ||
        m.protected.has(targetId)
      )
    ) {
      continue;
    }


    const weight = this.game.voteWeight(voterId);


    counts.set(
      targetId,
      (counts.get(targetId) ?? 0) + weight
    );
  }


  const ordered = [...counts.entries()].sort(
    (a, b) => b[1] - a[1]
  );


  let target = null;


  const isTie =
    ordered.length > 1 &&
    ordered[0][1] === ordered[1][1];


  if (isTie) {
    const tiebreaker = [...this.game.players.values()].find(
      p =>
        p.awake &&
        p.modifiers.some(
          modifier => modifier.constructor.id === 'tiebreaker'
        )
    );


    if (tiebreaker) {
      const tiebreakerVote = m.votes.get(tiebreaker.id) ?? null;


      if (
        tiebreakerVote !== null &&
        candidates.has(tiebreakerVote) &&
        !m.protected.has(tiebreakerVote)
      ) {
        target = tiebreakerVote;
      }
    }
  }


  if (
    !target &&
    ordered.length &&
    (
      ordered.length === 1 ||
      ordered[0][1] > ordered[1][1]
    )
  ) {
    target = ordered[0][0];
  }


  this.beginResolution(target, 'vote', now);
}

  beginResolution(targetId, cause, now) {
    const m = this.current;
    if (!m) throw new Error('Нет собрания.');

    this.current = null;
    this.game.clearActiveBlackmail();

    this.resolution = {
      meetingId: m.id,
      targetId,
      cause,
      commitAt: now + 6000
    };

    this.lastResult = {
      id: m.id,
      exiledId: targetId,
      cause,
      time: now,
      animateUntil: now + 6000
    };

    this.nextEmergencyAt =
      now +
      6000 +
      this.game.settings.meetingCooldown * 1000;

    this.game.resumeFromMeeting(now);
  }

  terminate() {
    if (!this.terminable) {
      throw new Error('Нечего прерывать.');
    }

    const now = Date.now();

    this.current = null;
    this.resolution = null;
    this.lastResult = null;

    this.game.clearActiveBlackmail();

    this.termination = {
      id: ++this.sequence,
      until: now + 2200
    };

    this.nextEmergencyAt =
      this.termination.until +
      this.game.settings.meetingCooldown * 1000;

    this.game.resumeFromMeeting(now);
  }

  tick(now) {
    if (this.game.phase !== 'playing') return;
    const m = this.current;

    if (m && m.phase === 'waiting') return;

    if (m && m.phase === 'discussion') {
      if (now >= m.discussionEndsAt) this._openVoting(now);
      return;
    }

    if (this.termination && now >= this.termination.until) {
      this.termination = null;
      this.game.resolveStateChanges();
    }
    if (this.game.phase !== 'playing') return;
    this.checkCompletion(now);
    const pending = this.resolution;
    if (!pending || now < pending.commitAt) return;
    this.resolution = null;
    let target = null;
    if (pending.targetId !== null) {
      target = this.game.player(pending.targetId);
      if (target.state !== 'exiled') target.exile();
    }
    target?.role.onExiled(pending.cause);
    this.game.resolveContract(target, 'exile');
    if (this.game.phase === 'playing') this.game.resolveStateChanges();
  }

  clear() {
    this.current = null;
    this.resolution = null;
    this.termination = null;

    this.game.clearActiveBlackmail();
  }

  snapshot() {
    const m = this.current;
    const eligible = this.activeVoters(m);
    return {
      meetingLocked: this.blocked,
      emergency: {
        used: this.emergencyUsed,
        limit: this.game.settings.emergencyLimit,
        nextAt: this.nextEmergencyAt
      },
      meeting: m ? {
        id: m.id,
        reason: m.reason,
        reporterId: m.reporterId,
        targetId: m.targetId,
        phase: m.phase,
        discussionEndsAt: m.discussionEndsAt,
        endsAt: m.endsAt,
        eligible,
        voted: eligible.filter(id => m.votes.has(id))
      } : null,
      meetingResolution: this.resolution ? { ...this.resolution } : null,
      meetingTerminated: this.termination ? { ...this.termination } : null,
      meetingResult: this.lastResult ? { ...this.lastResult } : null
    };
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}