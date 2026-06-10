import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bootstrap credential protections', () => {
  const root = join(import.meta.dirname, '../../..');

  it('gitignores packages/database/.local', () => {
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/packages\/database\/\.local/);
  });

  it('dockerignore excludes bootstrap credential directories', () => {
    const dockerignore = readFileSync(join(root, '.dockerignore'), 'utf8');
    expect(dockerignore).toMatch(/packages\/database\/\.local/);
    expect(dockerignore).toMatch(/infrastructure\/asterisk\/generated/);
    expect(dockerignore).toMatch(/infrastructure\/asterisk\/secrets/);
  });
});
