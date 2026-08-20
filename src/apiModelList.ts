/**
 * API model list fetcher.
 *
 * Fetches the list of available model IDs from the B.AI API
 * (https://api.b.ai/v1/models) and caches it with a 5-minute TTL.
 * Falls back to stale cache or an empty list on failure (silent degradation).
 *
 * B.AI /v1/models entries look like:
 *   { id, object: "model", created, owned_by, supported_endpoint_types: ["openai", "anthropic"] }
 * Note: B.AI's /v1/models does NOT expose supports_vision /
 * context_length / max_completion_tokens flags — vision capability comes from
 * the built-in catalog, context metadata from models.dev for discovered models.
 */

import { getBuiltInVisionModelIds } from "./models";

const API_BASE_URL = "https://api.b.ai/v1/";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extended model metadata returned by /v1/models (subset we consume).
 */
export interface ApiModelMetadata {
    id: string;
    owned_by?: string;
    /** Endpoint protocols the model supports, e.g. ["openai", "anthropic"]. */
    supported_endpoint_types?: string[];
}

// ── Module-level cache ──
let cachedModelIds: string[] | null = null;
let cachedModelMetadata: ApiModelMetadata[] | null = null;
let cacheTimestamp = 0;
let lastFetchSuccess = false;
/** In-flight fetch promise — deduplicates concurrent calls (e.g. startup model
 * sync + model list request racing) so the API is only hit once. */
let inFlightFetch: Promise<void> | null = null;

/**
 * Fetch the model list from the API's /models endpoint.
 * The endpoint follows OpenAI /v1/models format:
 *   { object: "list", success: true, data: [{ id, object, created, owned_by, supported_endpoint_types }] }
 */
async function fetchApiModelList(apiKey: string): Promise<ApiModelMetadata[]> {
    const url = `${API_BASE_URL.replace(/\/+$/, "")}/models`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    if (!response.ok) {
        throw new Error(`API model list error: [${response.status}] ${response.statusText}`);
    }

    const body = (await response.json()) as {
        data?: Array<Partial<ApiModelMetadata> & { id: string }>;
    };
    return (body.data ?? []).map((m) => ({
        id: m.id,
        owned_by: m.owned_by,
        supported_endpoint_types: Array.isArray(m.supported_endpoint_types) ? m.supported_endpoint_types : undefined,
    }));
}

/**
 * Get the list of model IDs available via the B.AI API.
 *
 * @param apiKey - The API key for authentication.
 * @returns A set of model ID strings available on the API server.
 *          Returns an empty set on failure (silent degradation).
 */
export async function getApiModelIds(apiKey: string | undefined): Promise<Set<string>> {
    await ensureApiModelCache(apiKey);
    return new Set(cachedModelIds ?? []);
}

/**
 * Get the set of model IDs whose /v1/models entry includes "anthropic" in
 * supported_endpoint_types. These models can use the Anthropic Messages API
 * protocol (POST /v1/messages).
 *
 * @param apiKey - The API key for authentication.
 * @returns A set of model IDs supporting the Anthropic protocol.
 */
export async function getAnthropicSupportedModelIds(apiKey: string | undefined): Promise<Set<string>> {
    await ensureApiModelCache(apiKey);
    return new Set(
        (cachedModelMetadata ?? [])
            .filter((m) => Array.isArray(m.supported_endpoint_types) && m.supported_endpoint_types.includes("anthropic"))
            .map((m) => m.id)
    );
}

/**
 * Get the set of vision-capable model IDs.
 *
 * B.AI's /v1/models does not expose a vision flag, so this falls back to the
 * built-in catalog (models with vision=true). If the API list is available,
 * the result is intersected with it so removed models are not offered.
 * Used by the "setVisionProxyModel" command picker.
 *
 * @param apiKey - The API key for authentication.
 * @returns A set of model IDs supporting vision input.
 */
export async function getVisionSupportedModelIds(apiKey: string | undefined): Promise<Set<string>> {
    await ensureApiModelCache(apiKey);
    const builtInVision = getBuiltInVisionModelIds();
    if (!lastFetchSuccess || cachedModelIds === null) {
        return builtInVision;
    }
    const available = new Set(cachedModelIds);
    return new Set([...builtInVision].filter((id) => available.has(id)));
}

/**
 * Ensure the module-level model cache is populated (5-minute TTL, silent fallback).
 */
async function ensureApiModelCache(apiKey: string | undefined): Promise<void> {
    const now = Date.now();

    // Use cached result if still fresh
    if (cachedModelMetadata !== null && now - cacheTimestamp < CACHE_TTL_MS) {
        return;
    }

    if (!apiKey) {
        // No API key — keep stale cache or leave empty
        return;
    }

    // Deduplicate concurrent fetches: if a fetch is already in flight (e.g.
    // startup model sync and the model list request running at the same time),
    // reuse its promise instead of issuing a second request.
    if (inFlightFetch) {
        return inFlightFetch;
    }

    inFlightFetch = (async () => {
        try {
            const models = await fetchApiModelList(apiKey);
            cachedModelIds = models.map((m) => m.id);
            cachedModelMetadata = models;
            cacheTimestamp = Date.now();
            lastFetchSuccess = true;
        } catch {
            // API call failed — keep stale cache if available
            lastFetchSuccess = false;
        }
    })().finally(() => {
        inFlightFetch = null;
    });

    return inFlightFetch;
}

/**
 * Returns true if the most recent API model list fetch was successful.
 * Used by the model provider to decide whether to apply API-based filtering.
 */
export function isApiFetchSuccessful(): boolean {
    return lastFetchSuccess;
}

/**
 * Clear the cached API model list (for testing / manual refresh).
 */
export function clearApiModelCache(): void {
    cachedModelIds = null;
    cachedModelMetadata = null;
    cacheTimestamp = 0;
    lastFetchSuccess = false;
}
