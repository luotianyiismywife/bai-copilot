/**
 * B.AI 用户中心（chat.b.ai）tRPC API 客户端。
 *
 * 用于通过登录 session cookie（__Secure-authjs.session-token）查询账号积分
 * 余额与调用日志，供独立调试脚本使用。认证走 cookie，与 api.b.ai 的 Bearer
 * Key 无关。
 *
 * 接口为 tRPC batch 格式：GET /trpc/lambda/<procedure>?batch=1&input=<URL编码JSON>
 * input 明文：{"0":{"json":<参数>,"meta":{"values":[...],"v":1}}}
 *
 * 依赖：Node 18+ / 浏览器原生 fetch。
 */

import type {
    CallLogStats,
    PointsBalance,
    UsageRecord,
    UsageRecordsQuery,
    UsageSummary,
} from "./types";

/** 用户中心基础地址 */
export const COOKIE_API_BASE_URL = "https://chat.b.ai";

/** 会话 Cookie 名称常量（Auth.js v5，HttpOnly + Secure） */
export const SESSION_COOKIE = "__Secure-authjs.session-token";

/** 单次请求超时（毫秒） */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * 构建 tRPC batch 请求 URL。
 * @param procedure tRPC 过程名（如 usage.points）
 * @param json input 的 json 字段（null 表示无参数）
 */
function buildTrpcUrl(procedure: string, json: unknown): string {
    const input = JSON.stringify({ "0": { json, meta: { values: ["undefined"], v: 1 } } });
    return `${COOKIE_API_BASE_URL}/trpc/lambda/${procedure}?batch=1&input=${encodeURIComponent(input)}`;
}

/**
 * 发送 tRPC GET 请求并解包 batch 响应。
 * @param sessionCookie __Secure-authjs.session-token Cookie 值（不含名称前缀）
 * @param procedure tRPC 过程名
 * @param json input 参数
 * @throws 网络错误 / 非 2xx / 401（cookie 失效）/ tRPC error
 */
async function trpcGet<T>(sessionCookie: string, procedure: string, json: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(buildTrpcUrl(procedure, json), {
            headers: {
                Cookie: `${SESSION_COOKIE}=${sessionCookie}`,
                Accept: "application/json",
            },
            signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error(`${response.status} 未认证：Cookie 失效或格式错误（${SESSION_COOKIE}）`);
        }
        if (!response.ok) {
            throw new Error(`API 请求失败：[${response.status}] ${response.statusText} (${procedure})`);
        }

        const body = (await response.json()) as Array<{
            result?: { data?: { json?: T } };
            error?: unknown;
        }>;
        const first = Array.isArray(body) ? body[0] : undefined;
        if (!first || first.error || !first.result?.data) {
            throw new Error(`tRPC 响应异常或会话无效 (${procedure})`);
        }
        return first.result.data.json as T;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 查询账号积分余额（usage.points）。
 */
export function queryPointsBalance(sessionCookie: string): Promise<PointsBalance> {
    return trpcGet<PointsBalance>(sessionCookie, "usage.points", null);
}

/**
 * 查询账号用量汇总（usage.summary，含近 12 个月消费与本月消费）。
 */
export function queryUsageSummary(sessionCookie: string): Promise<UsageSummary> {
    return trpcGet<UsageSummary>(sessionCookie, "usage.summary", null);
}

/**
 * 查询调用日志单页（usage.records）。
 */
export function queryUsageRecords(
    sessionCookie: string,
    query?: UsageRecordsQuery,
): Promise<{ data: UsageRecord[] } & Record<string, unknown>> {
    const json = {
        cursor: query?.cursor ?? null,
        page: query?.page ?? 1,
        pageSize: query?.pageSize ?? 20,
        sortBy: query?.sortBy ?? "created_at",
        sortOrder: query?.sortOrder ?? "desc",
    };
    return trpcGet<{ data: UsageRecord[] } & Record<string, unknown>>(sessionCookie, "usage.records", json);
}

/**
 * 拉取多页调用日志（最多 maxPages 页）。
 */
export async function queryAllUsageRecords(
    sessionCookie: string,
    options?: { pageSize?: number; maxPages?: number },
): Promise<UsageRecord[]> {
    const pageSize = options?.pageSize ?? 50;
    const maxPages = options?.maxPages ?? 10;
    const all: UsageRecord[] = [];
    for (let page = 1; page <= maxPages; page++) {
        const res = await queryUsageRecords(sessionCookie, { page, pageSize });
        const list = res.data ?? [];
        all.push(...list);
        if (list.length < pageSize) {
            break;
        }
    }
    return all;
}

/**
 * 对调用日志做统计汇总（按模型分组）。
 */
export function summarizeUsageRecords(logs: UsageRecord[]): CallLogStats {
    const modelMap = new Map<string, { count: number; costPoints: number; tokens: number }>();
    let totalCostPoints = 0;
    let totalTokens = 0;

    for (const log of logs) {
        const m = modelMap.get(log.model) ?? { count: 0, costPoints: 0, tokens: 0 };
        m.count += 1;
        m.costPoints += log.cost_points ?? 0;
        m.tokens += log.total_tokens ?? 0;
        modelMap.set(log.model, m);
        totalCostPoints += log.cost_points ?? 0;
        totalTokens += log.total_tokens ?? 0;
    }

    return {
        total: logs.length,
        byModel: [...modelMap.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .map(([model, v]) => ({ model, count: v.count, costPoints: v.costPoints, tokens: v.tokens })),
        totalCostPoints,
        totalTokens,
    };
}
