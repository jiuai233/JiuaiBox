import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rules = [
  ['API 密钥', /\bsk-(?:proj-|ant-[a-z]+-)?[A-Za-z0-9_-]{24,}/],
  ['GitHub 令牌', /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{24,}/],
  ['私钥', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Bearer 令牌', /Bearer\s+[A-Za-z0-9_.-]{32,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ['Google API 密钥', /\bAIza[A-Za-z0-9_-]{30,}/],
  ['本机用户路径', /\/(?:Users|home)\/[A-Za-z0-9_-]+\//],
  ['带认证的 URL', /https?:\/\/[^\s/@]+:[^\s/@]+@/],
];

export function checkPublic(root) {
  const findings = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['.work', '.git'].includes(entry.name)) continue;
      const file = join(dir, entry.name);
      const name = relative(root, file);
      if (entry.isSymbolicLink()) { findings.push(`${name}: 软链接`); continue; }
      if (/^(?:auth|mcp-auth|models-store)\.json$|\.sqlite(?:-\w+)?$|\.db(?:-\w+)?$/.test(entry.name)
          || ['sessions', 'backups', 'node_modules', 'request-captures'].includes(entry.name)
          || /^\.env(?:\.|$)/.test(entry.name)) findings.push(`${name}: 私人或运行时文件`);
      if (entry.isDirectory()) { visit(file); continue; }
      if (/\.(?:png|jpg|gif|otf|woff2?)$/.test(entry.name)) continue;
      const content = readFileSync(file, 'utf8');
      for (const [label, pattern] of rules) if (pattern.test(content)) findings.push(`${name}: ${label}`);
      if (entry.name.endsWith('.json')) {
        try {
          const inspect = (value, prefix = '') => {
            if (!value || typeof value !== 'object') return;
            for (const [key, item] of Object.entries(value)) {
              if (/^(?:apiKey|accessToken|refreshToken|password|clientSecret)$/i.test(key)
                  && typeof item === 'string' && item.length) findings.push(`${name}: ${prefix}${key}`);
              inspect(item, `${prefix}${key}.`);
            }
          };
          inspect(JSON.parse(content));
        } catch { findings.push(`${name}: JSON 格式错误`); }
      }
    }
  }
  visit(root);
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = checkPublic(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
  else console.log('公开配置检查通过：未发现密钥、私人状态文件或本机软链接。');
}
