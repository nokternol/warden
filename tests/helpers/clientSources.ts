import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(__dirname, '../../src');

/** The source of every non-test, non-story client file. */
export function clientSources(dir = SRC_ROOT): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : clientSources(full);
    if (!/\.tsx?$/.test(name) || /\.(stories|test)\.tsx?$/.test(name)) return [];
    return [readFileSync(full, 'utf8')];
  });
}
