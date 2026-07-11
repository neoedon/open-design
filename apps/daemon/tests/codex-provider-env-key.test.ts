// Regression coverage for #4456 (Case 1): the Codex auth probe must recognize
// a working custom provider whose API key lives in a provider-specific
// `env_key` (e.g. AZURE_OPENAI_API_KEY) declared in ~/.codex/config.toml, not
// just CODEX_API_KEY / OPENAI_API_KEY. `extractCodexProviderEnvKey` resolves
// the selected provider's `env_key` from the config text.

import { describe, expect, it } from 'vitest';

import {
  extractCodexModelReasoningEffort,
  extractCodexProviderEnvKey,
} from '../src/codex-config-normalize.js';

describe('extractCodexModelReasoningEffort', () => {
  it('reads the root model_reasoning_effort written by Codex Desktop', () => {
    const toml = [
      'model = "gpt-5.6-sol"',
      'model_reasoning_effort = "ultra"',
      '[features]',
      'multi_agent = true',
    ].join('\n');

    expect(extractCodexModelReasoningEffort(toml)).toBe('ultra');
  });

  it('honors single quotes and inline comments', () => {
    expect(
      extractCodexModelReasoningEffort(
        "model_reasoning_effort = 'max' # selected by the desktop app\n",
      ),
    ).toBe('max');
  });

  it('ignores profile-scoped values because they are not active without --profile', () => {
    const toml = [
      '[profiles.deep]',
      'model_reasoning_effort = "ultra"',
    ].join('\n');

    expect(extractCodexModelReasoningEffort(toml)).toBeNull();
  });
});

describe('extractCodexProviderEnvKey', () => {
  it('resolves the selected custom provider env_key', () => {
    const toml = [
      'model_provider = "azure"',
      '',
      '[model_providers.azure]',
      'base_url = "https://example.openai.azure.com/openai/v1"',
      'env_key = "AZURE_OPENAI_API_KEY"',
    ].join('\n');
    expect(extractCodexProviderEnvKey(toml)).toBe('AZURE_OPENAI_API_KEY');
  });

  it('picks the env_key of the SELECTED provider among several', () => {
    const toml = [
      'model_provider = "azure"',
      '[model_providers.openai]',
      'env_key = "OPENAI_API_KEY"',
      '[model_providers.azure]',
      'env_key = "AZURE_OPENAI_API_KEY"',
    ].join('\n');
    expect(extractCodexProviderEnvKey(toml)).toBe('AZURE_OPENAI_API_KEY');
  });

  it('honors single quotes and trailing comments', () => {
    const toml = [
      "model_provider = 'azure'  # selected",
      '[model_providers.azure]',
      "env_key = 'AZURE_OPENAI_API_KEY' # the key var",
    ].join('\n');
    expect(extractCodexProviderEnvKey(toml)).toBe('AZURE_OPENAI_API_KEY');
  });

  it('handles a quoted provider table header', () => {
    const toml = [
      'model_provider = "azure"',
      '[model_providers."azure"]',
      'env_key = "AZURE_OPENAI_API_KEY"',
    ].join('\n');
    expect(extractCodexProviderEnvKey(toml)).toBe('AZURE_OPENAI_API_KEY');
  });

  it('returns null when no provider is selected', () => {
    const toml = [
      '[model_providers.azure]',
      'env_key = "AZURE_OPENAI_API_KEY"',
    ].join('\n');
    expect(extractCodexProviderEnvKey(toml)).toBeNull();
  });

  it('returns null when the selected provider declares no env_key', () => {
    const toml = [
      'model_provider = "azure"',
      '[model_providers.azure]',
      'base_url = "https://example.openai.azure.com/openai/v1"',
    ].join('\n');
    expect(extractCodexProviderEnvKey(toml)).toBeNull();
  });

  it('does not leak an env_key from a non-selected provider table', () => {
    const toml = [
      'model_provider = "azure"',
      '[model_providers.openai]',
      'env_key = "OPENAI_API_KEY"',
      '[model_providers.azure]',
      'base_url = "https://example.openai.azure.com/openai/v1"',
    ].join('\n');
    expect(extractCodexProviderEnvKey(toml)).toBeNull();
  });

  it('returns null for empty or non-provider config', () => {
    expect(extractCodexProviderEnvKey('')).toBeNull();
    expect(extractCodexProviderEnvKey('model = "gpt-5"\n')).toBeNull();
  });
});
