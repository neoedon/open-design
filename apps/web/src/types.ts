import type {
  AgentInfo,
  AppVersionInfo,
  AppVersionResponse,
  AudioKind,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  Conversation,
  DeployConfigResponse,
  DeployProjectFileResponse,
  DesignSystemDetail,
  DesignSystemSummary,
  MediaAspect,
  ProjectDeploymentsResponse,
  PersistedAgentEvent,
  Project,
  PreviewComment,
  PreviewCommentStatus,
  PreviewCommentTarget,
  PreviewCommentUpsertRequest,
  ProjectDisplayStatus,
  ProjectFile,
  ProjectFileKind,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  CodexPetSummary,
  CodexPetsResponse,
  SkillDetail,
  SkillSummary,
  UpdateDeployConfigRequest,
} from '@open-design/contracts';

export type ExecMode = 'daemon' | 'api';

export interface MediaProviderCredentials {
  apiKey: string;
  baseUrl: string;
}

// Per-CLI model + reasoning the user picked in the model menu. Each agent
// keeps its own slot so flipping between Codex and Gemini doesn't reset the
// other one's choice. Missing entries fall back to the agent's first
// declared model (`'default'` — let the CLI pick).
export interface AgentModelChoice {
  model?: string;
  reasoning?: string;
}

export type AppTheme = 'system' | 'light' | 'dark';

// User-tunable companion that floats over the workspace. The full catalog
// lives in `components/pet/pets.ts`; this shape is what gets persisted to
// localStorage so we can roundtrip a customized pet across reloads.
export interface PetCustom {
  // Display name shown in the overlay tooltip and settings card.
  name: string;
  // Single emoji or 1–2 char glyph rendered as the sprite. We render text,
  // not an image, so any user keyboard input works without uploads.
  glyph: string;
  // Hex color used as the overlay halo accent.
  accent: string;
  // Short greeting line shown in the speech bubble on hover / first wake.
  greeting: string;
  // Optional uploaded sprite. Stored as a base64 data URL so it survives
  // localStorage roundtrips without depending on daemon storage. When
  // present, the overlay / rail / settings render the image instead of
  // the text glyph. Cleared when the user picks "Remove image".
  imageUrl?: string;
  // Spritesheet config — when `frames > 1` we treat `imageUrl` as a
  // horizontal strip of `frames` equally-sized cells and step through
  // them at `fps` frames per second using a CSS `steps()` animation,
  // matching the codex-pets-react sheet shape (e.g. tater/spritesheet).
  // `frames === 1` (default) renders the image as a single static cell
  // with the same gentle float animation as the emoji glyph.
  frames?: number;
  fps?: number;
}

export interface PetConfig {
  // True once the user has explicitly picked a pet (built-in or custom).
  // Until then, the entry view shows an "adopt" callout to drive discovery.
  adopted: boolean;
  // Floating overlay visibility — the wake/tuck toggle lives in Settings
  // and on the overlay itself. Defaults to true after adoption.
  enabled: boolean;
  // 'custom' or a built-in id from `BUILT_IN_PETS`. We tolerate unknown ids
  // (e.g. older builds) and fall back to the first built-in.
  petId: string;
  // Free-form custom pet definition. Always present so the customize panel
  // has stable state to bind against, even when a built-in is active.
  custom: PetCustom;
}

export interface AppConfig {
  mode: ExecMode;
  apiKey: string;
  baseUrl: string;
  model: string;
  agentId: string | null;
  skillId: string | null;
  designSystemId: string | null;
  theme?: AppTheme;
  // True once the user has been through the welcome onboarding modal at
  // least once (saved or skipped). Bootstrap skips the auto-popup when
  // this is set so refreshing the page doesn't re-prompt.
  onboardingCompleted?: boolean;
  mediaProviders?: Record<string, MediaProviderCredentials>;
  // Per-CLI model picker state, keyed by agent id (e.g. `gemini`, `codex`).
  // Pre-existing configs without this field fall through to the agent's
  // declared default.
  agentModels?: Record<string, AgentModelChoice>;
  // Caps the upstream completion length in API mode. Defaults to 8192 when
  // unset; raise it for providers (e.g. MiMo) that allow longer responses.
  maxTokens?: number;
  // Optional Codex-style animated companion. Older configs that pre-date
  // the feature land at `undefined`, which the loader normalizes to a
  // safe default (un-adopted, hidden until the user opts in).
  pet?: PetConfig;
}

export type AgentEvent = PersistedAgentEvent;

export type { ChatAttachment, ChatCommentAttachment, ChatMessage };

export interface Artifact {
  identifier: string;
  artifactType?: string;
  title: string;
  html: string;
  savedUrl?: string;
}

export interface ExamplePreview {
  source: 'skill' | 'design-system';
  id: string;
  title: string;
  html: string;
}

export interface AgentModelOption {
  id: string;
  label: string;
}

export type Surface = 'web' | 'image' | 'video' | 'audio';

export interface PromptTemplateSource {
  repo: string;
  license: string;
  author?: string;
  url?: string;
}

export interface PromptTemplateSummary {
  id: string;
  surface: 'image' | 'video';
  title: string;
  summary: string;
  category: string;
  tags?: string[];
  model?: string;
  aspect?: MediaAspect;
  previewImageUrl?: string;
  previewVideoUrl?: string;
  source: PromptTemplateSource;
}

export interface PromptTemplateDetail extends PromptTemplateSummary {
  prompt: string;
}

export type {
  AgentInfo,
  AppVersionInfo,
  AppVersionResponse,
  AudioKind,
  Conversation,
  DeployConfigResponse,
  DeployProjectFileResponse,
  DesignSystemDetail,
  DesignSystemSummary,
  MediaAspect,
  ProjectDeploymentsResponse,
  Project,
  PreviewComment,
  PreviewCommentStatus,
  PreviewCommentTarget,
  PreviewCommentUpsertRequest,
  ProjectDisplayStatus,
  ProjectFile,
  ProjectFileKind,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  CodexPetSummary,
  CodexPetsResponse,
  SkillDetail,
  SkillSummary,
  UpdateDeployConfigRequest,
};

export interface OpenTabsState {
  tabs: string[];
  active: string | null;
}
