import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = ['dist', 'server.js'];

for (const target of targets) {
  rmSync(resolve(root, target), { recursive: true, force: true });
}
