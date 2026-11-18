import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.dirname(fileURLToPath(import.meta.url));
const filename = path.join(root, 'apply-extra-roles.mjs');
const original = await fs.readFile(filename, 'utf8');
if (original.includes('// FIXED SETTINGS PATCH V3')) {
  console.log('Исправление настроек уже установлено. Запусти node apply-extra-roles.mjs');
  process.exit(0);
}
const begin = original.search(/await\s+edit\(\s*['"]game\/settings\.js['"]/);
const relativeEnd = begin < 0 ? -1 : original.slice(begin).search(/await\s+edit\(\s*['"]game\/Game\.js['"]/);
if (begin < 0 || relativeEnd <= 0) throw new Error('Не найден блок настроек в установщике. Ничего не изменено.');
const replacement = "await edit('game/settings.js', async source => {\n  const filename = path.join(root, 'game/settings.js');\n  const loaded = await import(settingsFileUrl(filename).href + '?extraRolesSettings=' + Date.now());\n  const schema = loaded.settingsSchema;\n\n  if (!Array.isArray(schema)) {\n    throw new Error('game/settings.js должен экспортировать массив settingsSchema.');\n  }\n\n  const additions = [\n    { id: 'sixthSenseCount', label: 'Количество игроков с Шестым чувством', type: 'number', min: 0, max: 15, step: 1, default: 1 },\n    { id: 'technics', label: 'Количество Technic Puny', type: 'number', min: 0, max: 15, step: 1, default: 0 },\n    { id: 'spies', label: 'Количество Spy', type: 'number', min: 0, max: 15, step: 1, default: 0 },\n    { id: 'technicFixes', label: 'Technic Puny: починок за игру', type: 'number', min: 0, max: 100, step: 1, default: 2 },\n    { id: 'spyReveals', label: 'Spy: вскрытий за игру', type: 'number', min: 0, max: 100, step: 1, default: 2 },\n    { id: 'emergencyLimit', label: 'Лимит вызовов EmergencyButton за раунд', type: 'number', min: 0, max: 100, step: 1, default: 2 },\n    { id: 'meetingCooldown', label: 'КД кнопки собрания, сек.', type: 'number', min: 0, max: 600, step: 1, default: 30 }\n  ];\n\n  const result = [];\n  const seen = new Set();\n\n  for (const setting of schema) {\n    if (!setting || typeof setting.id !== 'string') {\n      throw new Error('В settingsSchema найдена запись без строкового id.');\n    }\n    if (setting.id === 'sixthSenseChance') continue;\n    if (seen.has(setting.id)) {\n      throw new Error('В settingsSchema повторяется id: ' + setting.id);\n    }\n    seen.add(setting.id);\n    result.push({ ...setting });\n  }\n\n  for (const expected of additions) {\n    const index = result.findIndex(setting => setting.id === expected.id);\n    if (index === -1) {\n      result.push(expected);\n    } else {\n      // Keep existing default values and other per-setting choices.\n      result[index] = { ...expected, ...result[index] };\n    }\n  }\n\n  const start = /export\\s+(?:const|let)\\s+settingsSchema\\s*=\\s*\\[/g;\n  const matches = [...source.matchAll(start)];\n  if (matches.length !== 1) {\n    throw new Error('Ожидалось одно объявление export const settingsSchema = [...].');\n  }\n\n  const open = matches[0].index + matches[0][0].lastIndexOf('[');\n  let depth = 0;\n  let quote = null;\n  let lineComment = false;\n  let blockComment = false;\n  let close = -1;\n\n  for (let i = open; i < source.length; i++) {\n    const character = source[i];\n    const next = source[i + 1];\n    if (lineComment) {\n      if (character === '\\n' || character === '\\r') lineComment = false;\n      continue;\n    }\n    if (blockComment) {\n      if (character === '*' && next === '/') { blockComment = false; i++; }\n      continue;\n    }\n    if (quote) {\n      if (character === '\\\\') { i++; continue; }\n      if (character === quote) quote = null;\n      continue;\n    }\n    if (character === '/' && next === '/') { lineComment = true; i++; continue; }\n    if (character === '/' && next === '*') { blockComment = true; i++; continue; }\n    if (character === '\"' || character === \"'\" || character === '`') { quote = character; continue; }\n    if (character === '[') depth++;\n    if (character === ']') {\n      depth--;\n      if (depth === 0) { close = i; break; }\n    }\n  }\n\n  if (close < 0) throw new Error('Не найден конец массива settingsSchema.');\n\n  const serialized = JSON.stringify(result, (key, value) => {\n    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {\n      throw new Error('settingsSchema должен содержать только описания настроек, без функций.');\n    }\n    return value;\n  }, 2);\n\n  // Replace the schema array only. Keep defaultSettings(), validateSettings(), etc.\n  return source.slice(0, open) + serialized + source.slice(close + 1);\n});\n\n";

let updated = original.slice(0, begin) + '// FIXED SETTINGS PATCH V3\n' + replacement + original.slice(begin + relativeEnd);
if (!updated.includes('pathToFileURL as settingsFileUrl')) {
  updated = "import { pathToFileURL as settingsFileUrl } from 'node:url';\n" + updated;
}
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'punya-settings-fix-'));
try {
  const checkFile = path.join(temp, 'check.mjs');
  await fs.writeFile(checkFile, updated, 'utf8');
  execFileSync(process.execPath, ['--check', checkFile], { stdio: 'pipe' });
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
await fs.writeFile(filename + '.before-settings-fix-' + Date.now() + '.bak', original, 'utf8');
await fs.writeFile(filename + '.tmp', updated, 'utf8');
await fs.rename(filename + '.tmp', filename);
console.log('Блок настроек исправлен. Теперь выполни: node apply-extra-roles.mjs');
