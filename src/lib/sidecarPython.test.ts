import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const testPath = path.join(root, 'sidecar', 'test_agent_sidecar.py');

function runPythonSidecarTests() {
  const candidates =
    process.platform === 'win32'
      ? [
          { command: 'python', args: [testPath] },
          { command: 'py', args: ['-3', testPath] },
          { command: 'python3', args: [testPath] },
        ]
      : [
          { command: 'python3', args: [testPath] },
          { command: 'python', args: [testPath] },
        ];

  const attempts: string[] = [];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 15_000,
    });
    if (!result.error && result.status === 0) return;
    attempts.push([
      `${candidate.command} ${candidate.args.join(' ')}`,
      result.error ? String(result.error) : '',
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }

  throw new Error(`Python sidecar tests failed:\n${attempts.join('\n---\n')}`);
}

describe('Python sidecar containment tests', () => {
  it('runs the Python sidecar unit tests without live providers', () => {
    expect(() => runPythonSidecarTests()).not.toThrow();
  });
});
