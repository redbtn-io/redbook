import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webappRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(webappRoot, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const indexCss = readFileSync(resolve(webappRoot, 'src/index.css'), 'utf8');
const appCss = readFileSync(resolve(webappRoot, 'src/App.css'), 'utf8');

describe('redstyle adoption', () => {
  it('uses the published tokens and base stylesheet', () => {
    expect(packageJson.dependencies['@redbtn/redstyle']).toBe('^0.6.1');
    expect(indexCss).toContain('@import "@redbtn/redstyle/tokens.css";');
    expect(indexCss).toContain('@import "@redbtn/redstyle/base.css";');
  });

  it('keeps the form surface connected to semantic redstyle tokens', () => {
    expect(appCss).toContain('var(--bg-secondary)');
    expect(appCss).toContain('var(--text-primary)');
    expect(appCss).toContain('var(--accent)');
    expect(appCss).toContain('var(--accent-hover)');
    expect(appCss).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
