import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveCodexReasoningForLaunch } from '../../src/runtimes/codex-reasoning.js';

describe('resolveCodexReasoningForLaunch', () => {
  let codexHome: string;

  beforeEach(() => {
    codexHome = mkdtempSync(join(tmpdir(), 'od-codex-reasoning-'));
    writeFileSync(
      join(codexHome, 'config.toml'),
      'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "ultra"\n',
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(codexHome, { recursive: true, force: true });
  });

  it('caps inherited GPT-5.6 ultra for an explicit GPT-5.5 launch', async () => {
    await expect(
      resolveCodexReasoningForLaunch({
        model: 'gpt-5.5',
        reasoning: null,
        env: { CODEX_HOME: codexHome },
      }),
    ).resolves.toBe('xhigh');

    expect(readFileSync(join(codexHome, 'config.toml'), 'utf8')).toContain(
      'model_reasoning_effort = "ultra"',
    );
  });

  it('leaves the CLI default model and GPT-5.6 inheritance untouched', async () => {
    await expect(
      resolveCodexReasoningForLaunch({
        model: 'default',
        reasoning: null,
        env: { CODEX_HOME: codexHome },
      }),
    ).resolves.toBeNull();
    await expect(
      resolveCodexReasoningForLaunch({
        model: 'gpt-5.6-sol',
        reasoning: null,
        env: { CODEX_HOME: codexHome },
      }),
    ).resolves.toBeNull();
  });

  it('keeps an explicit per-run reasoning choice', async () => {
    await expect(
      resolveCodexReasoningForLaunch({
        model: 'gpt-5.5',
        reasoning: 'high',
        env: { CODEX_HOME: codexHome },
      }),
    ).resolves.toBe('high');
  });
});
