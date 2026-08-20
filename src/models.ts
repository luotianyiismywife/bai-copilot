import * as vscode from "vscode";
import type { LanguageModelChatInformation } from "vscode";
import type { BaiModelItem } from "./types";
import { l10n } from "./localize";

/**
 * Built-in model definition for Bai.
 */
interface BuiltInModelDef {
    /** Base model ID sent to the API (e.g., "glm-5.1") */
    baseId: string;
    /** User-friendly display name (e.g., "GLM-5.1") */
    displayName: string;
    /** Whether the model supports image input */
    vision: boolean;
    /** Thinking mode: "switchable" = user can toggle, "always" = thinking forced on, "adaptive" = only disabled/adaptive */
    thinkingMode: "switchable" | "always" | "adaptive";
    /** Default reasoning effort when thinking is enabled */
    defaultReasoningEffort?: string;
    /** Supported reasoning effort levels for the model picker UI */
    supportedReasoningEfforts?: string[];
    /** Whether to include reasoning_content in assistant messages */
    includeReasoningInRequest?: boolean;
    /** Whether the model supports setting temperature/top_p. Default true. */
    supportsTemperature?: boolean;
    /** Default context length */
    contextLength?: number;
    /** Default max output tokens */
    maxTokens?: number;
    /** Extra body parameters to include in API requests */
    extra?: Record<string, unknown>;
    /** API mode: "openai" (default) or "anthropic" */
    apiMode?: "openai" | "anthropic";
}

const EXTENSION_LABEL = "BAI";
const DEFAULT_CONTEXT_LENGTH = 128000;
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Default ratio of the real context window to declare as `maxInputTokens`.
 * Overridable via the `bai.maxInputTokensRatio` setting.
 *
 * VS Code triggers agent auto-compaction (chat.summarizeAgentConversationHistory.enabled)
 * at ~90% of the declared maxInputTokens. Declaring the full context length
 * (e.g. 1M tokens) means compaction would only fire at 900K tokens — effectively
 * never for typical conversations. A lower ratio (e.g. 0.8) makes compaction
 * fire at ~72% of the real window, leaving headroom.
 */
const DEFAULT_MAX_INPUT_TOKENS_RATIO = 1.0;
/** Lower bound for maxInputTokensRatio — prevents declaring a tiny context that
 * triggers compaction far too early. */
const MIN_MAX_INPUT_TOKENS_RATIO = 0.1;
/** Upper bound — 1.0 means declaring the full context window. */
const MAX_MAX_INPUT_TOKENS_RATIO = 1.0;

/**
 * Read the configurable maxInputTokens ratio from the `bai.maxInputTokensRatio`
 * setting and clamp it into the valid range [0.1, 1.0]. Falls back to the default
 * (1.0) when the setting is missing or invalid.
 */
export function getMaxInputTokensRatio(): number {
    const configured = vscode.workspace.getConfiguration("bai").get<number>("maxInputTokensRatio", DEFAULT_MAX_INPUT_TOKENS_RATIO);
    if (typeof configured !== "number" || !Number.isFinite(configured)) {
        return DEFAULT_MAX_INPUT_TOKENS_RATIO;
    }
    return Math.min(MAX_MAX_INPUT_TOKENS_RATIO, Math.max(MIN_MAX_INPUT_TOKENS_RATIO, configured));
}

/**
 * Built-in model definitions.
 *
 * Model list sourced from the B.AI platform (https://chat.b.ai/key, official
 * full-access tier — 38 models, verified against GET https://api.b.ai/v1/models
 * on 2026-08-20). All models support both "openai" and "anthropic" endpoint
 * types; per-model apiMode below only sets the DEFAULT protocol used in auto mode.
 *
 * Notes:
 * - GPT-5.x family: reasoning models that reject temperature/top_p sampling
 *   params → supportsTemperature=false, thinkingMode="always" (reasoning cannot
 *   be switched off via the gateway).
 * - Claude family: defaults to the Anthropic Messages endpoint (native protocol);
 *   extended thinking is opt-in (default disabled).
 * - DeepSeek/GLM/Qwen thinking behaviour mirrors the upstream models: thinking
 *   level selectable where the model supports it.
 */
const BUILT_IN_MODELS: BuiltInModelDef[] = [
    // ── DeepSeek series ── 1M context / 384K max output, supports thinking (high/max)
    { baseId: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro", vision: false, thinkingMode: "switchable", defaultReasoningEffort: "max", supportedReasoningEfforts: ["high", "max"], contextLength: 1000000, maxTokens: 393216 },
    { baseId: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", vision: false, thinkingMode: "switchable", defaultReasoningEffort: "max", supportedReasoningEfforts: ["high", "max"], contextLength: 1000000, maxTokens: 393216 },

    // ── GLM series (Z.ai) ── GLM-5.3/5.2: 1M context / 128K output, thinking (high/max)
    // GLM-5.1 does not support thinking, so thinkingMode="always" hides the toggle
    { baseId: "glm-5.3", displayName: "GLM-5.3", vision: false, thinkingMode: "switchable", defaultReasoningEffort: "high", supportedReasoningEfforts: ["high", "max"], contextLength: 1000000, maxTokens: 131072 },
    { baseId: "glm-5.2", displayName: "GLM-5.2", vision: false, thinkingMode: "switchable", defaultReasoningEffort: "high", supportedReasoningEfforts: ["high", "max"], contextLength: 1000000, maxTokens: 131072 },
    { baseId: "glm-5.1", displayName: "GLM-5.1", vision: false, thinkingMode: "always", contextLength: 200000, maxTokens: 131072 },

    // ── Kimi series (Moonshot) ── 256K context, text + image input
    { baseId: "kimi-k3", displayName: "Kimi K3", vision: true, thinkingMode: "always", contextLength: 262144, maxTokens: 32768 },
    { baseId: "kimi-k2.6", displayName: "Kimi K2.6", vision: true, thinkingMode: "always", contextLength: 262144, maxTokens: 131072 },

    // ── MiniMax series ── 200K context
    { baseId: "minimax-m3", displayName: "MiniMax M3", vision: true, thinkingMode: "always", contextLength: 204800, maxTokens: 131072 },
    { baseId: "minimax-m2.7", displayName: "MiniMax M2.7", vision: false, thinkingMode: "always", contextLength: 204800, maxTokens: 196608 },

    // ── Qwen series (Alibaba) ── qwen3.8-max: 1M context / 131.1K output, vision
    { baseId: "qwen3.8-max", displayName: "Qwen3.8 Max", vision: true, thinkingMode: "switchable", contextLength: 1000000, maxTokens: 134218 },
    { baseId: "qwen3.8-27b", displayName: "Qwen3.8 27B", vision: true, thinkingMode: "switchable", contextLength: 131072, maxTokens: 32768 },

    // ── GPT-5.x series (OpenAI) ── 400K context / 128K output, reasoning always on,
    // temperature/top_p not accepted by reasoning models
    { baseId: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5.6-terra", displayName: "GPT-5.6 Terra", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5.6-luna", displayName: "GPT-5.6 Luna", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5.5", displayName: "GPT-5.5", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5.5-instant", displayName: "GPT-5.5 Instant", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5.4-pro", displayName: "GPT-5.4 Pro", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 272000 },
    { baseId: "gpt-5.4", displayName: "GPT-5.4", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5.4-mini", displayName: "GPT-5.4 mini", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5.4-nano", displayName: "GPT-5.4 nano", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5.2", displayName: "GPT-5.2", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5-mini", displayName: "GPT-5 mini", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },
    { baseId: "gpt-5-nano", displayName: "GPT-5 nano", vision: true, thinkingMode: "always", supportsTemperature: false, contextLength: 400000, maxTokens: 128000 },

    // ── Claude series (Anthropic) ── 200K context, extended thinking opt-in.
    // Default to the native Anthropic Messages endpoint in auto mode.
    { baseId: "claude-opus-5", displayName: "Claude Opus 5", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 64000, apiMode: "anthropic" },
    { baseId: "claude-fable-5", displayName: "Claude Fable 5", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 64000, apiMode: "anthropic" },
    { baseId: "claude-sonnet-5", displayName: "Claude Sonnet 5", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 64000, apiMode: "anthropic" },
    { baseId: "claude-opus-4.8", displayName: "Claude Opus 4.8", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 32000, apiMode: "anthropic" },
    { baseId: "claude-opus-4.7", displayName: "Claude Opus 4.7", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 32000, apiMode: "anthropic" },
    { baseId: "claude-opus-4.6", displayName: "Claude Opus 4.6", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 32000, apiMode: "anthropic" },
    { baseId: "claude-opus-4.5", displayName: "Claude Opus 4.5", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 32000, apiMode: "anthropic" },
    { baseId: "claude-sonnet-4.6", displayName: "Claude Sonnet 4.6", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 64000, apiMode: "anthropic" },
    { baseId: "claude-sonnet-4.5", displayName: "Claude Sonnet 4.5", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 64000, apiMode: "anthropic" },
    { baseId: "claude-haiku-4.5", displayName: "Claude Haiku 4.5", vision: true, thinkingMode: "switchable", defaultReasoningEffort: "disabled", supportedReasoningEfforts: ["enabled"], contextLength: 200000, maxTokens: 64000, apiMode: "anthropic" },

    // ── Gemini series (Google) ── 1M context / 64K output, vision, thinking always on
    { baseId: "gemini-3.1-pro", displayName: "Gemini 3.1 Pro", vision: true, thinkingMode: "always", contextLength: 1048576, maxTokens: 65536 },
    { baseId: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash", vision: true, thinkingMode: "always", contextLength: 1048576, maxTokens: 65536 },
    { baseId: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash", vision: true, thinkingMode: "always", contextLength: 1048576, maxTokens: 65536 },
    { baseId: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash Lite", vision: false, thinkingMode: "always", contextLength: 1048576, maxTokens: 65536 },
    { baseId: "gemini-3-flash", displayName: "Gemini 3 Flash", vision: true, thinkingMode: "always", contextLength: 1048576, maxTokens: 65536 },
];

/**
 * Get the set of built-in model base IDs.
 * Used by the startup model sync (src/modelSync.ts) to detect new models
 * returned by the API that are not yet in the built-in list.
 */
export function getBuiltInModelIds(): Set<string> {
    return new Set(BUILT_IN_MODELS.map((m) => m.baseId));
}

/**
 * Get the set of built-in vision-capable model base IDs.
 * B.AI's /v1/models does not expose a vision flag, so this built-in list is
 * the source of truth for vision capability (used by apiModelList.getVisionSupportedModelIds).
 */
export function getBuiltInVisionModelIds(): Set<string> {
    return new Set(BUILT_IN_MODELS.filter((m) => m.vision).map((m) => m.baseId));
}

/**
 * Get the built-in model list as LanguageModelChatInformation[].
 * Each model registers one entry with a configurationSchema for reasoning effort selection.
 * - switchable models: include "禁用思考" option so user can turn off thinking
 * - always models: no "禁用思考" option, thinking always on
 * All labels and descriptions use l10n() for i18n.
 */
export function getBuiltInModelInfos(): LanguageModelChatInformation[] {
    const infos: LanguageModelChatInformation[] = [];

    for (const def of BUILT_IN_MODELS) {
        // Declare maxInputTokens as a configurable ratio (default 80%) of the real
        // context window so VS Code's agent auto-compaction (~90% of maxInputTokens)
        // fires before the context actually fills up.
        const maxInput = Math.floor((def.contextLength ?? DEFAULT_CONTEXT_LENGTH) * getMaxInputTokensRatio());

        const info: LanguageModelChatInformation = {
            id: def.baseId,
            name: def.displayName,
            detail: `BAI`,
            tooltip: `BAI`,
            family: EXTENSION_LABEL,
            version: "1.0.0",
            maxInputTokens: maxInput,
            maxOutputTokens: def.maxTokens ?? DEFAULT_MAX_TOKENS,
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                // Always declare imageInput=true so VS Code passes image data through.
                // Non-vision models handle images via the ask_image tool proxy internally.
                imageInput: true,
            },
        };

        // Build enum values based on thinking mode
        // - "switchable" + hasEfforts: disabled / [effort levels]             (e.g. disabled/high/max)
        // - "switchable" + no efforts: disabled / enabled
        // - "adaptive"               : disabled / adaptive                    (only two: off or auto-decide)
        // - "always"    + hasEfforts: [effort levels]
        // - "always"    + no efforts: enabled
        const hasEfforts = def.supportedReasoningEfforts && def.supportedReasoningEfforts.length > 0;
        let enumValues: string[];
        if (hasEfforts) {
            if (def.thinkingMode === "switchable") {
                enumValues = ["disabled", ...def.supportedReasoningEfforts!];
            } else {
                enumValues = [...def.supportedReasoningEfforts!];
            }
        } else {
            if (def.thinkingMode === "switchable") {
                enumValues = ["disabled", "enabled"];
            } else if (def.thinkingMode === "adaptive") {
                enumValues = ["disabled", "adaptive"];
            } else {
                enumValues = ["enabled"];
            }
        }

        // Map effort values to localized labels and descriptions
        // Keys are English strings that serve as fallback for non-Chinese locales
        const getLabel = (e: string): string => {
            switch (e) {
                case 'disabled': return l10n("Disabled");
                case 'adaptive': return l10n("Adaptive");
                case 'enabled': return l10n("Thinking");
                case 'low': return l10n("Low");
                case 'medium': return l10n("Medium");
                case 'high': return l10n("High");
                case 'max': return l10n("Maximum");
                default: return e.charAt(0).toUpperCase() + e.slice(1);
            }
        };
        const getDesc = (e: string): string => {
            switch (e) {
                case 'disabled': return l10n("Do not enable thinking");
                case 'adaptive': return l10n("Automatically decide when to think");
                case 'enabled': return l10n("Enable thinking");
                case 'low': return l10n("Reduce thinking, faster response");
                case 'medium': return l10n("Balance thinking and speed");
                case 'high': return l10n("Deeper thinking, slower response");
                case 'max': return l10n("Maximum thinking depth, slowest response");
                default: return e;
            }
        };

        const enumItemLabels = enumValues.map(getLabel);
        const enumDescriptions = enumValues.map(getDesc);

        // Determine default: for switchable with efforts, use defaultReasoningEffort or last item;
        // for others, use the last enum value (enabled/highest effort)
        const defaultEffort = (hasEfforts && def.defaultReasoningEffort)
            ? def.defaultReasoningEffort
            : enumValues[enumValues.length - 1];

        infos.push({
            ...info,
            configurationSchema: {
                properties: {
                    reasoningEffort: {
                        type: 'string',
                        title: l10n("Reasoning Effort"),
                        enum: enumValues,
                        enumItemLabels: enumItemLabels,
                        enumDescriptions: enumDescriptions,
                        default: defaultEffort,
                        group: 'navigation',
                    },
                },
            },
        } satisfies LanguageModelChatInformation);
    }

    return infos;
}

/**
 * Get the total count of built-in model entries (after expanding switchable models).
 */
export function getBuiltInModelCount(): number {
    return BUILT_IN_MODELS.length;
}

/**
 * Find a built-in model definition by model ID.
 * Returns the model properties including thinking mode, API mode, and extra parameters.
 * Thinking state (enable_thinking) is initially set to true and will be adjusted
 * by provider.ts based on the user's reasoning effort selection.
 */
export function getBuiltInModelConfig(modelId: string): BaiModelItem | undefined {
    const def = BUILT_IN_MODELS.find((m) => m.baseId === modelId);
    if (!def) {
        return undefined;
    }

    const model: BaiModelItem = {
        id: def.baseId,
        owned_by: "bai",
        displayName: def.displayName,
        vision: def.vision,
        supportsTemperature: def.supportsTemperature ?? true,
        context_length: def.contextLength ?? DEFAULT_CONTEXT_LENGTH,
        max_completion_tokens: def.maxTokens ?? DEFAULT_MAX_TOKENS,
        apiMode: def.apiMode ?? "openai",
        enable_thinking: true,
        include_reasoning_in_request: true,
        thinkingMode: def.thinkingMode,
    };

    // Set default reasoning effort if configured
    if (def.defaultReasoningEffort) {
        model.reasoning_effort = def.defaultReasoningEffort;
    }

    // Pass through extra body parameters
    if (def.extra) {
        model.extra = { ...def.extra };
    }

    return model;
}
