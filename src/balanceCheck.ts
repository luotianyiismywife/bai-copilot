/**
 * B.AI 积分余额查询模块（主动预检）。
 *
 * 通过 `__Secure-authjs.session-token` cookie（Auth.js v5 会话令牌，从浏览器
 * DevTools 复制）调用 chat.b.ai 的 tRPC 端点
 * `GET /trpc/lambda/usage.points?batch=1&input=...` 查询积分余额，
 * 独立实现（不依赖 scripts/userApi，该目录为独立 tsconfig）。
 *
 * 实测确认（2026-08-20）：
 * - usage.points 返回 `{ points_balance, points_expiring }`（总积分 / 赠送将过期积分）
 * - 余额不足时 `POST /v1/chat/completions` 返回 HTTP 403（注意：不是 402）
 * - `GET /v1/models` 不校验余额，不能作为可用性判据
 */
import * as vscode from "vscode";
import { logger } from "./logger";
import type { ApiKeyEntry } from "./keyManager";

/** chat.b.ai 用户中心 tRPC 余额端点（batch=1，input 为 URL 编码 JSON） */
const USAGE_POINTS_URL =
    "https://chat.b.ai/trpc/lambda/usage.points?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%2C%22v%22%3A1%7D%7D%7D";
/** 会话 cookie 名（Auth.js v5，HttpOnly + Secure） */
export const SESSION_COOKIE_NAME = "__Secure-authjs.session-token";
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_BASE_URL = "https://api.b.ai/v1/";
/** 手动检测用的最小聊天请求模型（限免，不耗积分） */
const TEST_MODEL_ID = "deepseek-v4-flash";

/**
 * 积分余额详情（usage.points 的 json 子集）。
 *
 * - `pointsBalance` 积分余额总额（充值 + 赠送）
 * - `pointsExpiring` 赠送/限时积分（到期未用失效；无赠送时为 0）
 *
 * 充值积分 = pointsBalance - pointsExpiring。
 */
export interface BalanceDetail {
    pointsBalance: number;
    pointsExpiring: number;
}

/** 余额查询 TTL 缓存（按 cookie 粒度，缓存完整详情） */
interface BalanceCacheEntry {
    detail: BalanceDetail;
    checkedAt: number;
}
const balanceCache = new Map<string, BalanceCacheEntry>();

// ---------------------------------------------------------------------------
// 配置读取
// ---------------------------------------------------------------------------

function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("bai");
}

/** 是否启用主动余额预检（默认 true） */
export function getBalanceCheckEnabled(): boolean {
    return getConfig().get<boolean>("balanceCheckEnabled", true);
}

/** 余额阈值：pointsBalance ≤ 该值视为耗尽（默认 0，夹取 ≥ 0） */
export function getMinBalancePoints(): number {
    const v = getConfig().get<number>("minBalancePoints", 0);
    return Number.isFinite(v) && v >= 0 ? v : 0;
}

/** 余额查询缓存 TTL（秒，默认 60；0 = 每次查询） */
export function getBalanceCheckIntervalSec(): number {
    const v = getConfig().get<number>("balanceCheckIntervalSec", 60);
    return Number.isFinite(v) && v >= 0 ? v : 60;
}

// ---------------------------------------------------------------------------
// 余额查询
// ---------------------------------------------------------------------------

/**
 * 查询账号积分余额详情（GET /trpc/lambda/usage.points）。
 * @throws 网络错误 / 非 2xx / 401（cookie 失效）/ 响应结构异常
 */
export async function queryBalanceDetail(cookie: string): Promise<BalanceDetail> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(USAGE_POINTS_URL, {
            headers: {
                Cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
                Accept: "application/json",
            },
            signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error(`${response.status} 未认证：${SESSION_COOKIE_NAME} Cookie 失效或格式错误`);
        }
        if (!response.ok) {
            throw new Error(`余额查询失败：[${response.status}] ${response.statusText}`);
        }
        // tRPC batch 响应格式：[{ "result": { "data": { "json": { points_balance, points_expiring } } } }]
        const body = (await response.json()) as Array<{
            result?: {
                data?: {
                    json?: {
                        points_balance?: number | string;
                        points_expiring?: number | string;
                    };
                };
            };
            error?: unknown;
        }>;
        const first = Array.isArray(body) ? body[0] : undefined;
        if (!first || first.error || !first.result?.data?.json) {
            throw new Error("余额查询返回错误：tRPC 响应结构异常或会话无效");
        }
        const json = first.result.data.json;
        // 防御：字段可能以字符串返回，统一强制转为 number。
        return {
            pointsBalance: toNumber(json.points_balance),
            pointsExpiring: toNumber(json.points_expiring),
        };
    } finally {
        clearTimeout(timer);
    }
}

/** 防御：金额字段可能以字符串返回，统一转 number，非法值兜底 0 */
function toNumber(v: number | string | undefined): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * 查询账号积分余额总额。
 * @throws 网络错误 / 非 2xx / 401（cookie 失效）
 * @returns pointsBalance
 */
export async function queryAccountBalance(cookie: string): Promise<number> {
    return (await queryBalanceDetail(cookie)).pointsBalance;
}

/**
 * 带 TTL 缓存的余额详情查询（按 cookie 粒度）。
 * @returns 余额详情；查询失败返回 undefined（不抛错，调用方回退被动检测）
 */
export async function getBalanceDetailCached(cookie: string, ttlSec: number): Promise<BalanceDetail | undefined> {
    if (ttlSec > 0) {
        const cached = balanceCache.get(cookie);
        if (cached && Date.now() - cached.checkedAt < ttlSec * 1000) {
            return cached.detail;
        }
    }
    try {
        const detail = await queryBalanceDetail(cookie);
        balanceCache.set(cookie, { detail, checkedAt: Date.now() });
        return detail;
    } catch (err) {
        logger.warn("key.balanceCheck", {
            cookie: maskCookieForLog(cookie),
            error: err instanceof Error ? err.message : String(err),
        });
        return undefined;
    }
}

/**
 * 带 TTL 缓存的余额查询（按 cookie 粒度，返回积分余额总额）。
 * @returns 积分余额数值；查询失败返回 undefined（不抛错，调用方回退被动检测）
 */
export async function getBalanceCached(cookie: string, ttlSec: number): Promise<number | undefined> {
    const detail = await getBalanceDetailCached(cookie, ttlSec);
    return detail?.pointsBalance;
}

/**
 * 检查 key 余额是否充足，并返回查询到的余额值（供日志 / 管理界面展示）。
 *
 * 判定：余额 > minBalancePoints → sufficient=true；查询失败（cookie 失效/网络）→ sufficient=true
 * （不阻塞请求，回退被动检测——余额不足时 API 会返回 403 触发轮换）。
 * @returns `{ sufficient, balance? }` —— balance 仅在查询成功时存在
 */
export async function checkKeyBalance(cookie: string): Promise<{ sufficient: boolean; balance?: number }> {
    const minBalance = getMinBalancePoints();
    const ttlSec = getBalanceCheckIntervalSec();
    const balance = await getBalanceCached(cookie, ttlSec);
    if (balance === undefined) {
        return { sufficient: true }; // 查询失败不阻塞
    }
    return { sufficient: balance > minBalance, balance };
}

/**
 * 判断 key 余额是否充足。
 * 余额 > minBalancePoints → true；查询失败（cookie 失效/网络）→ 返回 true（不阻塞请求，回退被动检测）。
 * 注意：默认 minBalancePoints=0 时，余额 ≤ 0（含 0 与负数）即视为不足 → 轮询时跳过该 key。
 */
export async function isKeyBalanceSufficient(cookie: string): Promise<boolean> {
    return (await checkKeyBalance(cookie)).sufficient;
}

// ---------------------------------------------------------------------------
// 手动检测
// ---------------------------------------------------------------------------

/**
 * 手动检测 key 可用性：查 cookie 余额 + 最小真实聊天请求。
 *
 * 判定：
 * - 余额 ≤ minBalancePoints → { ok: false, reason: "balance" }
 * - 聊天请求 200 → { ok: true }
 * - 聊天请求 403 / insufficient balance|quota → { ok: false, reason: "balance" }
 * - 聊天请求 401 → { ok: false, reason: "invalid" }
 * - 网络错误 / 超时 / 其他 → { ok: null }（无法确定，保留原状态）
 *
 * @returns reason: "balance" | "invalid" | "network" | undefined
 */
export async function testKeyAvailability(
    entry: ApiKeyEntry,
    baseUrl?: string
): Promise<{ ok: boolean | null; reason?: "balance" | "invalid" | "network" }> {
    // 1. 余额检查（有 cookie 时）
    if (entry.cookie) {
        try {
            const balance = await queryAccountBalance(entry.cookie);
            if (balance <= getMinBalancePoints()) {
                return { ok: false, reason: "balance" };
            }
        } catch {
            // cookie 失效/网络失败：不阻断，继续请求校验
        }
    }

    // 2. 最小真实聊天请求
    try {
        const normalized = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        const url = normalized.endsWith("/v1")
            ? `${normalized}/chat/completions`
            : `${normalized}/v1/chat/completions`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${entry.value}`,
                },
                body: JSON.stringify({
                    model: TEST_MODEL_ID,
                    messages: [{ role: "user", content: "say ok" }],
                    stream: false,
                    max_tokens: 8,
                }),
                signal: controller.signal,
            });

            if (response.ok) {
                return { ok: true };
            }
            const text = await response.text();
            const lower = text.toLowerCase();
            if (
                response.status === 403 ||
                lower.includes("insufficient balance") ||
                lower.includes("insufficient quota") ||
                text.includes("余额不足")
            ) {
                return { ok: false, reason: "balance" };
            }
            if (response.status === 401) {
                return { ok: false, reason: "invalid" };
            }
            return { ok: null, reason: "network" };
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return { ok: null, reason: "network" };
    }
}

/** 日志脱敏：cookie 仅保留末 6 位 */
function maskCookieForLog(cookie: string): string {
    if (cookie.length <= 6) {
        return "****";
    }
    return `****${cookie.slice(-6)}`;
}
