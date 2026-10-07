import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkPublic } from '../scripts/check-public.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'jiuaibox-pi-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}
function restore(home) {
  const result = spawnSync('bash', [join(root, 'install.sh'), '--config-only'], {
    env: { ...process.env, HOME: home }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return join(home, '.pi/agent');
}
function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

test('新电脑恢复配置、主题、固定插件与普通技能目录', t => {
  const agent = restore(fixture(t));
  const config = JSON.parse(readFileSync(join(agent, 'settings.json')));
  assert.equal(config.theme, 'prism');
  const overrides = JSON.parse(readFileSync(join(agent, 'models.json'))).providers['openai-codex'].modelOverrides;
  for (const id of ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra']) assert.equal(overrides[id].contextWindow, 500000);
  assert.equal(config.packages.length, 14);
  assert(config.packages.every(p => /@(?:\d+\.\d+\.\d+|[a-f0-9]{40})$/.test(p)));
  assert.equal(readFileSync(join(agent, 'system.md'), 'utf8'), readFileSync(join(root, 'agent/system.md'), 'utf8'));
  assert.equal(readdirSync(join(agent, 'skills')).length, 11);
  for (const name of readdirSync(join(agent, 'skills'))) assert(!lstatSync(join(agent, 'skills', name)).isSymbolicLink());
  assert(existsSync(join(agent, 'themes/prism.json')));
  assert(!existsSync(join(agent, 'auth.json')));
});

test('已有同名文件备份，认证、会话、私人记忆和非管理文件不变', t => {
  const home = fixture(t), agent = join(home, '.pi/agent');
  write(join(agent, 'settings.json'), '{"theme":"light"}');
  const privateFiles = ['auth.json', 'sessions/example.jsonl', 'pi-hermes-memory/MEMORY.md', 'extensions/other.ts'];
  for (const file of privateFiles) write(join(agent, file), `private:${file}`);
  restore(home);
  const backup = readdirSync(join(agent, 'backups'))[0];
  assert.equal(readFileSync(join(agent, 'backups', backup, 'settings.json'), 'utf8'), '{"theme":"light"}');
  for (const file of privateFiles) assert.equal(readFileSync(join(agent, file), 'utf8'), `private:${file}`);
  restore(home);
  assert.equal(readdirSync(join(agent, 'backups')).length, 2);
  assert.equal(JSON.parse(readFileSync(join(agent, 'settings.json'))).theme, 'prism');
});

test('已有技能软链接与失效软链接被备份，不修改原链接目标', t => {
  const home = fixture(t), agent = join(home, '.pi/agent'), original = join(home, 'external-skill');
  write(join(original, 'SKILL.md'), 'original skill');
  mkdirSync(join(agent, 'skills'), { recursive: true });
  symlinkSync(original, join(agent, 'skills/engineering-change-guidelines'), 'dir');
  symlinkSync(join(home, 'missing'), join(agent, 'skills/better-ui'), 'dir');
  restore(home);
  assert.equal(readFileSync(join(original, 'SKILL.md'), 'utf8'), 'original skill');
  assert(!lstatSync(join(agent, 'skills/engineering-change-guidelines')).isSymbolicLink());
  assert(!lstatSync(join(agent, 'skills/better-ui')).isSymbolicLink());
  const backup = join(agent, 'backups', readdirSync(join(agent, 'backups'))[0]);
  assert(lstatSync(join(backup, 'skills/better-ui')).isSymbolicLink());
});

test('公开检查拒绝密钥、私人状态和软链接', t => {
  const dir = fixture(t);
  write(join(dir, 'config.json'), JSON.stringify({ apiKey: 'sk-' + 'x'.repeat(40) }));
  write(join(dir, 'auth.json'), '{}');
  symlinkSync(join(dir, 'config.json'), join(dir, 'link'));
  const findings = checkPublic(dir);
  assert(findings.some(x => x.includes('API 密钥')));
  assert(findings.some(x => x.includes('私人或运行时文件')));
  assert(findings.some(x => x.includes('软链接')));
});

test('发布目录的 JSON、技能引用和公开检查通过', () => {
  assert.deepEqual(checkPublic(root), []);
  const skills = join(root, 'agent/skills');
  for (const name of readdirSync(skills)) {
    const content = readFileSync(join(skills, name, 'SKILL.md'), 'utf8');
    const refs = [...content.matchAll(/`((?:references|scripts)\/[\w./-]+)`/g)].map(x => x[1]);
    for (const ref of refs) assert(existsSync(join(skills, name, ref)), `${name}/${ref}`);
  }
});

test('压缩补丁可应用、可检测已应用状态并与本机回调语义一致', t => {
  const dir = fixture(t), patch = join(root, 'patches/pi-midrun-compact-runtime.patch');
  const text = readFileSync(patch, 'utf8');
  assert(text.includes('+      onComplete: async (_result, signal?: AbortSignal) => {'));
  assert(text.includes('+        await new Promise<void>((resolve) => setImmediate(resolve));'));
  assert(text.includes('+          if (signal?.aborted) {'));
  // 用 Git 还原补丁的旧侧行，验证安装脚本使用的正反向检测。
  const context = text.split('\n').filter(line => /^[ -]/.test(line) && !line.startsWith('---')).map(line => line.slice(1)).join('\n') + '\n';
  write(join(dir, 'src/runtime.ts'), context);
  const apply = (...args) => spawnSync('git', ['-C', dir, 'apply', ...args, patch], { encoding: 'utf8' });
  assert.equal(apply('--check').status, 0);
  assert.equal(apply().status, 0);
  assert.equal(apply('--reverse', '--check').status, 0);
  assert.notEqual(apply('--check').status, 0);
});
