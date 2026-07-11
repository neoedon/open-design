import { detectAcpModels } from '../../agent-protocol/index.js';
import { parsePiModels } from '../../agent-protocol/index.js';
import { execAgentFile } from '../invocation.js';
import { DEFAULT_MODEL_OPTION } from '../models.js';
import type { RuntimeModelOption } from '../types.js';

export { detectAcpModels, parsePiModels, execAgentFile, DEFAULT_MODEL_OPTION };

export function clampCodexReasoning(
  modelId: string | null | undefined,
  effort: string | null | undefined,
) {
  if (!effort) return effort;
  const raw = String(modelId ?? '').trim();
  const id = raw.includes('/') ? raw.split('/').pop() : raw;
  let compatibleEffort = effort;
  const isGpt52To55Family =
    typeof id === 'string' && /^gpt-5\.(?:2|3|4|5)(?:$|[-:@])/.test(id);
  const isGpt5LateFamily =
    !id ||
    id === 'default' ||
    isGpt52To55Family;
  // Codex Desktop's "ultra" preset is serialized as API-level "max".
  // GPT-5.6 supports it, but older GPT-5 families cap at xhigh (or lower).
  if (
    isGpt52To55Family &&
    (compatibleEffort === 'max' || compatibleEffort === 'ultra')
  ) {
    compatibleEffort = 'xhigh';
  }
  if (
    (id === 'gpt-5.1' || id === 'gpt-5.1-codex-mini') &&
    (compatibleEffort === 'max' || compatibleEffort === 'ultra')
  ) {
    compatibleEffort = 'xhigh';
  }
  if (isGpt5LateFamily && compatibleEffort === 'minimal') return 'low';
  if (id === 'gpt-5.1' && compatibleEffort === 'xhigh') return 'high';
  if (id === 'gpt-5.1-codex-mini') {
    return compatibleEffort === 'high' || compatibleEffort === 'xhigh'
      ? 'high'
      : 'medium';
  }
  return compatibleEffort;
}

// Parse one-id-per-line stdout from `<cli> models` and prepend the synthetic
// default option. Used by opencode / cursor-agent.
export function parseLineSeparatedModels(stdout: string): RuntimeModelOption[] {
  const ids = String(stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  // De-dupe while preserving order — some CLIs print near-duplicates.
  const seen = new Set();
  const out = [DEFAULT_MODEL_OPTION];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: id });
  }
  return out;
}
