import { gunSettingsSchema } from './Gun.js';

export const settingsSchema = [
  // ======================
  // ОБЩИЕ НАСТРОЙКИ
  // ======================
  {
    id: 'tasksPerPlayer',
    label: 'Заданий на игрока',
    type: 'number',
    min: 0,
    max: 50,
    step: 1,
    default: 3
  },
  {
    id: 'sixthSenseCount',
    label: 'Количество игроков с Шестым чувством',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 1
  },

  // ======================
  // МИРНЫЕ
  // ======================
  {
    id: 'policemen',
    label: 'Количество Policeman',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 1
  },
  {
    id: 'technics',
    label: 'Количество Technic Puny',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'judges',
    label: 'Количество Судей',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'spies',
    label: 'Количество Spy',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'lawyers',
    label: 'Количество Адвокатов',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'alarms',
    label: 'Количество Будильщиков',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'hackers',
    label: 'Количество Хакеров',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'chemists',
    label: 'Количество Химиков',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },

  // ======================
  // МЯТНЫЕ
  // ======================
  {
    id: 'mintPunies',
    label: 'Количество Мятных пуней',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 1
  },
  {
    id: 'mintCooks',
    label: 'Количество Mint Cook',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'glitches',
    label: 'Количество Glitch',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'sappers',
    label: 'Количество Сапёров',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },

  // ======================
  // НЕЙТРАЛЫ
  // ======================

  {
    id: 'jesters',
    label: 'Количество Jester',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'mintPuniks',
    label: 'Количество Мятных Пуников (Нейтралы)',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },

  // ======================
  // POLICEMAN
  // ======================
  {
    id: 'policeAmmo',
    label: 'Патроны полицейского',
    type: 'number',
    min: 0,
    max: 36,
    step: 1,
    default: 6
  },
  {
    id: 'policeCooldown',
    label: 'КД выстрела, сек.',
    type: 'number',
    min: 0,
    max: 600,
    step: 1,
    default: 20
  },
  {
    id: 'policePenalty',
    label: 'Попадание по мирному: наказание полицейскому',
    type: 'select',
    default: 'sleep',
    options: [
      { value: 'nothing', label: 'Ничего' },
      { value: 'disarm', label: 'Лишается оружия' },
      { value: 'sleep', label: 'Тоже засыпает' }
    ]
  },
  {
    id: 'innocentFate',
    label: 'Попадание по мирному: судьба мирного',
    type: 'select',
    default: 'sleep',
    options: [
      { value: 'nothing', label: 'Ничего' },
      { value: 'sleep', label: 'Засыпает' }
    ]
  },

  // ======================
  // TECHNIC PUNY
  // ======================
  {
    id: 'technicFixes',
    label: 'Technic Puny: починок',
    type: 'number',
    min: 0,
    max: 999,
    step: 1,
    default: 1
  },
  {
    id: 'technicCooldown',
    label: 'Technic Puny: КД починки, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 30
  },

  // ======================
  // SPY
  // ======================
  {
    id: 'spyReveals',
    label: 'Spy: вскрытий',
    type: 'number',
    min: 0,
    max: 32,
    step: 1,
    default: 1
  },
  {
    id: 'spyCooldown',
    label: 'Spy: КД вскрытия, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 30
  },

  // ======================
  // СУДЬЯ И АДВОКАТ
  // ======================
  {
    id: 'judgeUses',
    label: 'Судья: изгнаний',
    type: 'number',
    min: 0,
    max: 8,
    step: 1,
    default: 1
  },
  {
    id: 'lawyerUses',
    label: 'Адвокат: защит',
    type: 'number',
    min: 0,
    max: 8,
    step: 1,
    default: 1
  },

  // ======================
  // МЯТНЫЕ СПОСОБНОСТИ
  // ======================
  {
    id: 'lullCooldown',
    label: 'КД усыпления, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 30
  },
  {
    id: 'sabotageCooldown',
    label: 'КД поломок, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 120
  },
  {
    id: 'wifiSeconds',
    label: 'Отключение планшетов, сек.',
    type: 'number',
    min: 1,
    max: 60,
    step: 1,
    default: 15
  },
  {
    id: 'teaCooldown',
    label: 'КД чая, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 35
  },
  {
    id: 'teaDelay',
    label: 'Задержка чая, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 10
  },
  {
    id: 'hackCooldown',
    label: 'Glitch: КД HACK, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 60
  },

  // ======================
  // НЕЙТРАЛЬНЫЕ СПОСОБНОСТИ
  // ======================
  {
    id: 'pokeCooldown',
    label: 'Jester: КД POKE, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 5
  },
  {
    id: 'alarmCooldown',
    label: 'Будильщик: КД пробуждения, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 90
  },
  {
    id: 'hackerCopyCooldown',
    label: 'Хакер: КД copy, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 90
  },
  {
    id: 'chemistAntimintCount',
    label: 'Химик: Противомят (0 — бесконечно)',
    type: 'number',
    min: 0,
    max: 32,
    step: 1,
    default: 2
  },
  {
    id: 'chemistCooldown',
    label: 'Химик: КД Противомяты, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 80
  },
  {
    id: 'antimintSeconds',
    label: 'Противомята: длительность иммунитета, сек.',
    type: 'number',
    min: 1,
    max: 3600,
    step: 1,
    default: 40
  },
  {
    id: 'sapperMineCooldown',
    label: 'Сапёр: КД минирования, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 25
  },
  {
    id: 'sapperDetonateSeconds',
    label: 'Сапёр: время до взрыва, сек.',
    type: 'number',
    min: 1,
    max: 3600,
    step: 1,
    default: 80
  },
  {
    id: 'mintPunikLullCooldown',
    label: 'Мятный Пуник: КД усыпления, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 30
  },
  {
    id: 'mintPunikShields',
    label: 'Мятный Пуник: количество щитов',
    type: 'number',
    min: 0,
    max: 100,
    step: 1,
    default: 3
  },
  {
    id: 'mintPunikShieldCooldown',
    label: 'Мятный Пуник: КД щита, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 30
  },
  {
    id: 'mintPunikShieldSeconds',
    label: 'Мятный Пуник: длительность щита, сек.',
    type: 'number',
    min: 1,
    max: 3600,
    step: 1,
    default: 15
  },

  // ======================
  // САБОТАЖ И РАКЕТА
  // ======================
  {
    id: 'rocketSeconds',
    label: 'Ракета: время на починку, сек.',
    type: 'number',
    min: 1,
    max: 3600,
    step: 1,
    default: 70
  },

  // ======================
  // СОБРАНИЯ
  // ======================
  {
    id: 'discussionTime',
    label: 'Время на обсуждение, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 30
  },
  {
    id: 'meetingSeconds',
    label: 'Время голосования, сек.',
    type: 'number',
    min: 10,
    max: 3600,
    step: 1,
    default: 30
  },
  {
    id: 'emergencyLimit',
    label: 'Лимит EmergencyButton за раунд',
    type: 'number',
    min: 0,
    max: 999,
    step: 1,
    default: 3
  },
  {
    id: 'meetingCooldown',
    label: 'КД EmergencyButton, сек.',
    type: 'number',
    min: 0,
    max: 3600,
    step: 1,
    default: 25
  },

  // ======================
  // ИНТРО И НАГРАДЫ
  // ======================
  {
    id: 'introFactionSeconds',
    label: 'Интро фракции, сек.',
    type: 'number',
    min: 1,
    max: 60,
    step: 1,
    default: 5
  },
  {
    id: 'introRoleSeconds',
    label: 'Интро роли, сек.',
    type: 'number',
    min: 1,
    max: 60,
    step: 1,
    default: 10
  },
  {
    id: 'winCoins',
    label: 'Коины за победу',
    type: 'number',
    min: 0,
    max: 1000,
    step: 1,
    default: 100
  },
  {
    id: 'loseCoins',
    label: 'Коины за поражение',
    type: 'number',
    min: 0,
    max: 1000,
    step: 1,
    default: 30
  },
  { id: 'headhunters', label: 'Количество Хедхантеров', type: 'number', min: 0, max: 5, step: 1, default: 0 },
  { id: 'headhunterAmmo', label: 'Хедхантер: патроны', type: 'number', min: 0, max: 100, step: 1, default: 2 },
  { id: 'headhunterShotCooldown', label: 'Хедхантер: КД выстрела, сек.', type: 'number', min: 0, max: 300, step: 1, default: 25 },
  { id: 'headhunterTransform', label: 'Хедхантер: преобразование при потере контракта', type: 'select', options: [ { value: 'jester', label: 'Шут' }, { value: 'punik', label: 'Мятный Пуник' }, { value: 'civilian', label: 'Мирный' } ], default: 'jester' },
  { id: 'headhunterLullByOther', label: 'Хедхантер: цель усыпил другой', type: 'select', options: [ { value: 'count', label: 'Контракт засчитывается' }, { value: 'transform', label: 'Хедхантер становится Мятным Пуником' }, { value: 'new-target', label: 'Усыпитель становится новой целью' } ], default: 'count' },
  { id: 'executioners', label: 'Количество Палачей', type: 'number', min: 0, max: 5, step: 1, default: 0 },
  { id: 'executionerAmmo', label: 'Палач: патроны', type: 'number', min: 0, max: 100, step: 1, default: 2 },
  { id: 'executionerShotCooldown', label: 'Палач: КД выстрела, сек.', type: 'number', min: 0, max: 300, step: 1, default: 25 },
  { id: 'executionerTransform', label: 'Палач: преобразование при потере контракта', type: 'select', options: [ { value: 'jester', label: 'Шут' }, { value: 'punik', label: 'Мятный Пуник' }, { value: 'civilian', label: 'Мирный' } ], default: 'jester' },
  { id: 'executionerLullByOther', label: 'Палач: цель усыпил другой', type: 'select', options: [ { value: 'count', label: 'Контракт засчитывается' }, { value: 'transform', label: 'Палач становится Шутом' }, { value: 'new-target', label: 'Усыпитель становится новой целью' } ], default: 'count' },
  { id: 'veteranAlertSeconds', label: 'Ветеран: длительность стрёма (сек)', type: 'number', min: 1, max: 60, step: 1, default: 8 },
  { id: 'veteranAlertCooldown', label: 'Ветеран: кд стрёма (сек)', type: 'number', min: 0, max: 300, step: 1, default: 60 },
  { id: 'veteranAlertUses', label: 'Ветеран: использований (0 = бесконечно)', type: 'number', min: 0, max: 10, step: 1, default: 2 },
  { id: 'mentholFreezeSeconds', label: 'Ментол: длительность заморозки (сек)', type: 'number', min: 1, max: 60, step: 1, default: 6 },
  { id: 'mentholFreezeCooldown', label: 'Ментол: кд заморозки (сек)', type: 'number', min: 0, max: 300, step: 1, default: 45 },
  { id: 'veterans', label: 'Количество Ветеранов', type: 'number', min: 0, max: 15, step: 1, default: 0 },
  { id: 'menthols', label: 'Количество Ментолов', type: 'number', min: 0, max: 15, step: 1, default: 0 },
  { id: 'blackjacks', label: 'Количество Блекджеков', type: 'number', min: 0, max: 15, step: 1, default: 0 },
  { id: 'trackers', label: 'Количество Следопытов', type: 'number', min: 0, max: 15, step: 1, default: 0 },
  { id: 'trackerInterrogations', label: 'Следопыт: допросов за раунд (0 = бесконечно)', type: 'number', min: 0, max: 20, step: 1, default: 3 },
  { id: 'trackerInterrogationCooldown', label: 'Следопыт: кд допроса (сек)', type: 'number', min: 0, max: 300, step: 1, default: 30 },
  { id: 'trackerInterrogationTimeout', label: 'Следопыт: время на ответ (сек)', type: 'number', min: 5, max: 300, step: 1, default: 60 },
  { id: 'blackjackAmmo', label: 'БлекДжек: патроны', type: 'number', min: 0, max: 10, step: 1, default: 3 },
  { id: 'blackjackCooldown', label: 'БлекДжек: кд выстрела (сек)', type: 'number', min: 0, max: 300, step: 1, default: 45 },
  { id: 'blackjackGuessCooldown', label: 'БлекДжек: кд угадывания (сек)', type: 'number', min: 0, max: 300, step: 1, default: 30 },
  { id: 'journalistPhotos', label: 'Журналист: максимум фото (0 = бесконечно)', type: 'number', min: 0, max: 20, step: 1, default: 5 },
  { id: 'journalistPhotoCooldown', label: 'Журналист: кд фото (сек)', type: 'number', min: 0, max: 300, step: 1, default: 20 },
  { id: 'journalistSends', label: 'Журналист: максимум отправок (0 = бесконечно)', type: 'number', min: 0, max: 20, step: 1, default: 2 },
  { id: 'journalistSendCooldown', label: 'Журналист: кд отправки (сек)', type: 'number', min: 0, max: 300, step: 1, default: 60 },
  { id: 'developerUses', label: 'Разработчик: использований консоли (0 = бесконечно)', type: 'number', min: 0, max: 10, step: 1, default: 2 },
  { id: 'developerCooldown', label: 'Разработчик: кд консоли (сек)', type: 'number', min: 0, max: 300, step: 1, default: 90 },
  { id: 'developers', label: 'Количество Разработчиков', type: 'number', min: 0, max: 15, step: 1, default: 0 },
  { id: 'journalists', label: 'Количество Журналистов', type: 'number', min: 0, max: 15, step: 1, default: 0 },
  {
    id: 'guards',
    label: 'Охранников',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'advisers',
    label: 'Советников',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'guardMeetings',
    label: 'Охранник: собраний за раунд (0 = бесконечно)',
    type: 'number',
    min: 0, max: 30, step: 1, default: 2
  },
  {
    id: 'guardMeetingCooldown',
    label: 'Охранник: перезарядка собрания (сек)',
    type: 'number',
    min: 0, max: 600, step: 1, default: 90
  },
  {
    id: 'guardShields',
    label: 'Охранник: щитов за раунд (0 = бесконечно)',
    type: 'number',
    min: 0, max: 30, step: 1, default: 3
  },
  {
    id: 'guardShieldCooldown',
    label: 'Охранник: перезарядка щита (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 35
  },
  {
    id: 'guardShieldSeconds',
    label: 'Охранник: длительность щита (сек)',
    type: 'number',
    min: 1, max: 120, step: 1, default: 12
  },
  {
    id: 'adviserInfos',
    label: 'Советник: проверок за раунд (0 = бесконечно)',
    type: 'number',
    min: 0, max: 50, step: 1, default: 0
  },
  {
    id: 'adviserInfoCooldown',
    label: 'Советник: перезарядка ИНФО (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 40
  },
  {
    id: 'commanders',
    label: 'Командиров',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'blackmailers',
    label: 'Шантажистов',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'santas',
    label: 'Сант',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'commanderAmmo',
    label: 'Командир: патроны',
    type: 'number',
    min: 0, max: 30, step: 1, default: 3
  },
  {
    id: 'commanderShotCooldown',
    label: 'Командир: перезарядка выстрела (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 35
  },
  {
    id: 'blackmailCooldown',
    label: 'Шантажист: перезарядка SHUT UP! (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 40
  },
  {
    id: 'santaGoodPlayers',
    label: 'Санта: хороших игроков',
    type: 'number',
    min: 0, max: 14, step: 1, default: 2
  },
  {
    id: 'santaBadPlayers',
    label: 'Санта: плохих игроков',
    type: 'number',
    min: 0, max: 14, step: 1, default: 2
  },
  {
    id: 'santaGiftCooldown',
    label: 'Санта: перезарядка подарка (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 35
  },
  {
    id: 'santaSurpriseCooldown',
    label: 'Санта: перезарядка сюрприза (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 45
  },
  {
    id: 'santaSnowCooldown',
    label: 'Санта: перезарядка снега (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 35
  },
  {
    id: 'santaSnowSeconds',
    label: 'Санта: длительность снега (сек)',
    type: 'number',
    min: 1, max: 120, step: 1, default: 8
  },
  {
    id: 'scouts',
    label: 'Разведчиков',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'teachers',
    label: 'Учителей',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'teacherFives',
    label: 'Учитель: Пятёрок',
    type: 'number',
    min: 0, max: 30, step: 1, default: 2
  },
  {
    id: 'teacherTwos',
    label: 'Учитель: Двоек',
    type: 'number',
    min: 0, max: 30, step: 1, default: 2
  },
  {
    id: 'teacherExpulsions',
    label: 'Учитель: изгнаний',
    type: 'number',
    min: 0, max: 30, step: 1, default: 1
  },
  {
    id: 'teacherExams',
    label: 'Учитель: контрольных',
    type: 'number',
    min: 0, max: 30, step: 1, default: 1
  },
  {
    id: 'teacherFiveCooldown',
    label: 'Учитель: перезарядка Пятёрки (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 35
  },
  {
    id: 'teacherTwoCooldown',
    label: 'Учитель: перезарядка Двойки (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 35
  },
  {
    id: 'teacherExpelCooldown',
    label: 'Учитель: перезарядка изгнания (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 60
  },
  {
    id: 'teacherExamCooldown',
    label: 'Учитель: перезарядка контрольной (сек)',
    type: 'number',
    min: 0, max: 300, step: 1, default: 60
  },
  {
    id: 'teacherTwoSeconds',
    label: 'Учитель: длительность Двойки (сек)',
    type: 'number',
    min: 1, max: 120, step: 1, default: 8
  },
  {
    id: 'teacherExamSeconds',
    label: 'Учитель: время контрольной (сек)',
    type: 'number',
    min: 10, max: 600, step: 1, default: 120
  },
  {
    id: 'traitors',
    label: 'Предателей',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'traitorMode',
    label: 'Предатель: режим роли',
    type: 'select',
    options: [
      { value: 'random', label: 'Случайная мятная роль' },
      { value: 'dependent', label: 'Зависит от бывшей мирной роли' }
    ],
    default: 'random'
  },
  {
    id: 'egoists',
    label: 'Эгоистов',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'decoys',
    label: 'Приманок',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'tiebreakers',
    label: 'Ничьяломов',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'radios',
    label: 'Раций',
    type: 'number',
    min: 0, max: 15, step: 1, default: 0
  },
  {
    id: 'doubleShots',
    label: 'Двойных выстрелов',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'doubleShotMode',
    label: 'Двойной выстрел: кому выдаётся',
    type: 'select',
    options: [
      { value: 'all', label: 'Всем' },
      { value: 'attackers', label: 'Только атакующим' },
      { value: 'non-attackers', label: 'Только не атакующим' }
    ],
    default: 'all'
  },
  {
    id: 'doubleShotAmmo',
    label: 'Двойной выстрел: патроны',
    type: 'number',
    min: 1,
    max: 10,
    step: 1,
    default: 1
  },
  {
    id: 'doubleShotCooldown',
    label: 'Двойной выстрел: перезарядка (сек)',
    type: 'number',
    min: 0,
    max: 300,
    step: 1,
    default: 0
  },
  {
    id: 'informed',
    label: 'Информированных',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'satellites',
    label: 'Связей со Спутником',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'satelliteUses',
    label: 'Спутник: запросы',
    type: 'number',
    min: 1,
    max: 10,
    step: 1,
    default: 2
  },
  {
    id: 'satelliteCooldown',
    label: 'Спутник: перезарядка (сек)',
    type: 'number',
    min: 0,
    max: 300,
    step: 1,
    default: 60
  },
  {
    id: 'tags',
    label: 'Бирок',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'walkingButtons',
    label: 'Ходячих Кнопок',
    type: 'number',
    min: 0,
    max: 15,
    step: 1,
    default: 0
  },
  {
    id: 'walkingButtonUses',
    label: 'Ходячая Кнопка: нажатия',
    type: 'number',
    min: 1,
    max: 10,
    step: 1,
    default: 1
  },
  {
    id: 'walkingButtonCooldown',
    label: 'Ходячая Кнопка: перезарядка (сек)',
    type: 'number',
    min: 0,
    max: 300,
    step: 1,
    default: 90
  },
  // ======================
  // ОРУЖИЕ
  // ======================
  ...gunSettingsSchema
];

export function defaultSettings() {
  return Object.fromEntries(
    settingsSchema.map(item => [item.id, item.default])
  );
}

export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Некорректные настройки.');
  }

  const result = {};

  for (const item of settingsSchema) {
    const value = input[item.id];

    if (item.type === 'number') {
      if (
        !Number.isSafeInteger(value) ||
        value < item.min ||
        value > item.max
      ) {
        throw new Error(`Некорректное значение: ${item.label}`);
      }
    } else if (!item.options.some(option => option.value === value)) {
      throw new Error(`Некорректное значение: ${item.label}`);
    }

    result[item.id] = value;
  }

  const specialMints = result.mintCooks + result.glitches;

  if (specialMints > result.mintPunies) {
    throw new Error(
      `Поваров и Глитчей суммарно ${specialMints}, ` +
      `но мест во фракции Мятных только ${result.mintPunies}. ` +
      'Увеличь количество Мятных или уменьши количество специальных ролей.'
    );
  }

  return result;
}