import exams from './data/exams.json' with {
  type: 'json'
};

const EXAM_TOPICS = [
  'russian',
  'math',
  'trigonometry',
  'calculus',
  'history',
  'geography',
  'chemistry'
];

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function validateExamBank() {
  for (const topic of EXAM_TOPICS) {
    const questions = exams[topic];

    check(
      Array.isArray(questions) && questions.length >= 10,
      `В теме ${topic} должно быть минимум 10 вопросов.`
    );

    for (const question of questions) {
      check(
        question &&
        typeof question.question === 'string' &&
        question.question.trim(),
        `Некорректный вопрос в теме ${topic}.`
      );

      if (question.type === 'single') {
        check(
          Array.isArray(question.choices) &&
          question.choices.length >= 2 &&
          Number.isInteger(question.answer) &&
          question.answer >= 0 &&
          question.answer < question.choices.length,
          `Некорректный single-вопрос в теме ${topic}.`
        );

        continue;
      }

      if (question.type === 'multiple') {
        check(
          Array.isArray(question.choices) &&
          question.choices.length >= 2 &&
          Array.isArray(question.answers) &&
          question.answers.length > 0 &&
          question.answers.every(index =>
            Number.isInteger(index) &&
            index >= 0 &&
            index < question.choices.length
          ),
          `Некорректный multiple-вопрос в теме ${topic}.`
        );

        continue;
      }

      if (question.type === 'text') {
        check(
          Array.isArray(question.accepted) &&
          question.accepted.length > 0,
          `Некорректный text-вопрос в теме ${topic}.`
        );

        continue;
      }

      throw new Error(
        `Неизвестный тип вопроса в теме ${topic}.`
      );
    }
  }
}

validateExamBank();

export function createSchoolRoles({
  InnocentRole,
  Role,
  Player
}) {
  class Scout extends InnocentRole {
    static id = 'scout';
    static displayName = 'Разведчик';
    static description = 'Найдите их.';

    get fakeTasks() {
      return false;
    }

    get abilities() {
      return [];
    }

    snapshot() {
      return {
        ...super.snapshot(),
        disguisedAsMint: true
      };
    }
  }

  class Teacher extends Role {
    static id = 'teacher';
    static displayName = 'Учитель';
    static description = 'Используйте ваши способности.';

    constructor(player) {
      super(player);

      this.fives = this.game.settings.teacherFives ?? 2;
      this.twos = this.game.settings.teacherTwos ?? 2;
      this.expulsions =
        this.game.settings.teacherExpulsions ?? 1;
      this.exams = this.game.settings.teacherExams ?? 1;
    }

    get team() {
      return 'neutral';
    }

    get fakeTasks() {
      return false;
    }

    get abilities() {
      return [
        {
          id: 'teacher-five',
          name: `Пятёрка · ${this.fives}`,
          targets: true,
          targetPolicy: 'awake-with-self',
          disabled: this.fives <= 0
        },
        {
          id: 'teacher-two',
          name: `Двойка · ${this.twos}`,
          targets: true,
          disabled: this.twos <= 0
        },
        {
          id: 'teacher-expel',
          name: `ВЫШЕЛ ИЗ КЛАССА! · ${this.expulsions}`,
          targets: true,
          disabled: this.expulsions <= 0
        },
        {
          id: 'teacher-exam',
          name: `Контрольная · ${this.exams}`,
          targets: true,
          disabled: this.exams <= 0
        }
      ];
    }

    get hackableIds() {
      return [
        'teacher-five',
        'teacher-two',
        'teacher-expel',
        'teacher-exam'
      ];
    }

    validate(id, target, now) {
      check(
        this.hackableIds.includes(id),
        'Неизвестная способность Учителя.'
      );

      check(
        target instanceof Player &&
        this.game.hasPlayer(target),
        'Цель не найдена.'
      );

      if (id === 'teacher-five') {
        check(
          this.fives > 0,
          'Пятёрки закончились.'
        );

        check(
          target.awake,
          'Цель должна быть бодрствующей.'
        );
      }

      if (
        id === 'teacher-two' ||
        id === 'teacher-expel' ||
        id === 'teacher-exam'
      ) {
        check(
          target !== this.player,
          'Нельзя выбрать себя.'
        );

        check(
          target.awake,
          'Цель должна быть бодрствующей.'
        );

        check(
          (target.snowUntil ?? 0) <= now,
          'Цель уже заморожена.'
        );
      }

      if (id === 'teacher-exam') {
        check(
          this.exams > 0,
          'Контрольные закончились.'
        );

        check(
          (target.santaGiftUntil ?? 0) <= now,
          'Цель защищена от контрольной.'
        );

        check(
          (target.attackImmunityUntil ?? 0) <= now,
          'Цель защищена от контрольной.'
        );

        check(
          !this.game.activeExams.has(target.id),
          'У этого игрока уже открыта контрольная.'
        );
      }

      this.player.requireReady(id, now);
    }

    spend(id, now) {
      const field = {
        'teacher-five': 'fives',
        'teacher-two': 'twos',
        'teacher-expel': 'expulsions',
        'teacher-exam': 'exams'
      }[id];

      this[field]--;

      const cooldowns = {
        'teacher-five':
          this.game.settings.teacherFiveCooldown ?? 35,
        'teacher-two':
          this.game.settings.teacherTwoCooldown ?? 35,
        'teacher-expel':
          this.game.settings.teacherExpelCooldown ?? 60,
        'teacher-exam':
          this.game.settings.teacherExamCooldown ?? 60
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

      if (id === 'teacher-five') {
        target.attackImmunityUntil = Math.max(
          target.attackImmunityUntil ?? 0,
          now + 30000
        );

        target.notify(
          'Вам Пятёрка!'
        );

        return;
      }

      if (id === 'teacher-two') {
        target.snowUntil = Math.max(
          target.snowUntil ?? 0,
          now +
          (this.game.settings.teacherTwoSeconds ?? 8) * 1000
        );

        target.notify('Ваша оценка —\n# ДВА!');

        return;
      }

      if (id === 'teacher-expel') {
        target.exile();
        this.game.resolveContract(target, 'exile');
        this.game.resolveStateChanges();

        return;
      }

      const topic =
        EXAM_TOPICS[
          Math.floor(Math.random() * EXAM_TOPICS.length)
        ];

      const questions = shuffle(
        exams[topic].map((item, index) => ({
          index,
          type: item.type,
          question: item.question,
          choices: item.choices ?? null
        }))
      ).slice(0, 10);



      this.game.activeExams.set(target.id, {
        targetId: target.id,
        teacherId: this.player.id,
        topic,
        questions,
        startedAt: now,
        deadline:
            now +
            (this.game.settings.teacherExamSeconds ?? 120) * 1000
        });

      target.notify('Учитель назначил вам контрольную.');
    }

    snapshot() {
      return {
        ...super.snapshot(),
        fives: this.fives,
        twos: this.twos,
        expulsions: this.expulsions,
        exams: this.exams
      };
    }
  }

  return { Scout, Teacher };
}