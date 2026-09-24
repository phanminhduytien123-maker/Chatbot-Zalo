import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const child = spawn(process.argv[0], [path.join(rootDir, 'pcAgent.js')], {
  cwd: rootDir,
  detached: true,
  stdio: 'ignore'
});

child.unref();
process.exit(0);
