import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../agent');
const target = join(homedir(), '.pi/agent');
const backup = join(target, 'backups', `jiuaibox-${Date.now()}`);
const files = [
  'settings.json', 'system.md', 'models.json',
  'web-search.json', 'themes/prism.json',
  'extensions/pi-permission-system/config.json',
  'extensions/subagent/config.json', 'extensions/pi-model-fast.json',
  'extensions/powerline-footer/theme.json',
  ...readdirSync(join(source, 'skills')).map(name => `skills/${name}`),
];

mkdirSync(target, { recursive: true, mode: 0o700 });
for (const file of files) {
  const destination = join(target, file);
  if (lstatSync(destination, { throwIfNoEntry: false })) {
    const saved = join(backup, file);
    mkdirSync(dirname(saved), { recursive: true, mode: 0o700 });
    renameSync(destination, saved);
  }
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  cpSync(join(source, file), destination, { recursive: true });
}
console.log(`配置已恢复：${target}`);
if (existsSync(backup)) console.log(`原配置备份：${backup}`);
