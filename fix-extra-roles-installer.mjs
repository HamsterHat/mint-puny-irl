import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.dirname(fileURLToPath(import.meta.url));
const filename = path.join(root, 'apply-extra-roles.mjs');
const original = await fs.readFile(filename, 'utf8');
if (original.includes('// FIXED MEETINGS PATCH V2')) {
  console.log('Исправление уже установлено. Запусти node apply-extra-roles.mjs');
  process.exit(0);
}
const first = /await\s+edit\(\s*['"]game\/Meetings\.js['"]/;
const last = /await\s+edit\(\s*['"]public\/ingame\.js['"]/;
const start = original.search(first);
const tail = start < 0 ? -1 : original.slice(start).search(last);
if (start < 0 || tail <= 0) throw new Error('Не найден блок Meetings в установщике. Исходный файл не изменён.');
const end = start + tail;
const replacement = "await edit('game/Meetings.js', source => {\n  if (/this\\.emergencyUsed\\s*=\\s*0/.test(source)) return source;\n\n  source = once(\n    source,\n    /this\\.reported\\s*=\\s*new Set\\(\\)\\s*;/,\n    match => match + '\\n    this.emergencyUsed = 0;\\n    this.nextEmergencyAt = 0;',\n    'Счётчик собраний'\n  );\n\n  const startAt = source.search(/\\bstart\\s*\\(/);\n  const voteAt = source.search(/\\bvote\\s*\\(/);\n\n  if (startAt < 0 || voteAt <= startAt) {\n    throw new Error('Не найдены границы методов Meetings.start() и Meetings.vote().');\n  }\n\n  let startMethod = source.slice(startAt, voteAt);\n  const reportCheck = /if\\s*\\(\\s*reason\\s*===\\s*(['\"])report\\1\\s*\\)\\s*\\{/;\n\n  if (!reportCheck.test(startMethod)) {\n    throw new Error('В Meetings.start() не найдена проверка report.');\n  }\n\n  // Insert before the FIRST report check inside start(), not every occurrence.\n  startMethod = startMethod.replace(reportCheck, match => `\n    if (reason === 'emergency') {\n      if (this.emergencyUsed >= game.settings.emergencyLimit) {\n        throw new Error('Лимит вызовов EmergencyButton исчерпан.');\n      }\n      const left = this.nextEmergencyAt - Date.now();\n      if (left > 0) {\n        throw new Error('EMERGENCY BUTTON COOLDOWN: ' + Math.ceil(left / 1000) + ' sec.');\n      }\n    }\n    ` + match);\n\n  startMethod = once(\n    startMethod,\n    /this\\.current\\s*=\\s*\\{/,\n    match => \"if (reason === 'emergency') this.emergencyUsed++;\\n    \" + match,\n    'Расход лимита'\n  );\n\n  source = source.slice(0, startAt) + startMethod + source.slice(voteAt);\n\n  source = once(\n    source,\n    /this\\.resolutionUntil\\s*=\\s*this\\.lastResult\\.animateUntil\\s*;/,\n    match => match + '\\n    this.nextEmergencyAt = this.resolutionUntil + this.game.settings.meetingCooldown * 1000;',\n    'КД после собрания'\n  );\n\n  source = once(\n    source,\n    /return\\s*\\{\\s*meetingLocked\\s*:/,\n    'return {emergency: {used: this.emergencyUsed, limit: this.game.settings.emergencyLimit, nextAt: this.nextEmergencyAt}, meetingLocked:',\n    'Снимок ограничений'\n  );\n\n  return source;\n});\n\n";

const updated = original.slice(0, start) + '// FIXED MEETINGS PATCH V2\n' + replacement + original.slice(end);
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'punya-installer-fix-'));
try {
  const testFile = path.join(temporaryDirectory, 'check.mjs');
  await fs.writeFile(testFile, updated, 'utf8');
  execFileSync(process.execPath, ['--check', testFile], { stdio: 'pipe' });
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
await fs.writeFile(filename + '.before-fix-' + Date.now() + '.bak', original, 'utf8');
await fs.writeFile(filename + '.tmp', updated, 'utf8');
await fs.rename(filename + '.tmp', filename);
console.log('Установщик исправлен. Теперь выполни: node apply-extra-roles.mjs');
