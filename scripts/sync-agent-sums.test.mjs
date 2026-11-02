import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./sync-agent-sums.mjs', import.meta.url));

test('校验和清单与 frontend/public/download 下的二进制一致', () => {
  const output = execFileSync(process.execPath, [scriptPath, '--check'], { encoding: 'utf8' });
  assert.match(output, /\[agent-sums\] OK/);
});
