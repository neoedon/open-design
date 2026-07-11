import { readCodexModelReasoningEffort } from '../codex-config-normalize.js';
import { clampCodexReasoning } from './defs/shared.js';

export interface CodexReasoningLaunchInput {
  model: string | null | undefined;
  reasoning: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve a run-scoped reasoning override when a concrete model would inherit
 * an incompatible effort from the user's root Codex config.
 *
 * Returning the original null/default value means the CLI should keep its
 * normal config behavior. The config file itself is never changed here.
 */
export async function resolveCodexReasoningForLaunch({
  model,
  reasoning,
  env = process.env,
}: CodexReasoningLaunchInput): Promise<string | null | undefined> {
  if (reasoning && reasoning !== 'default') return reasoning;

  const concreteModel = typeof model === 'string' ? model.trim() : '';
  if (!concreteModel || concreteModel === 'default') return reasoning;

  const inheritedEffort = await readCodexModelReasoningEffort(env);
  if (!inheritedEffort) return reasoning;

  const compatibleEffort = clampCodexReasoning(
    concreteModel,
    inheritedEffort,
  );
  return compatibleEffort && compatibleEffort !== inheritedEffort
    ? compatibleEffort
    : reasoning;
}
