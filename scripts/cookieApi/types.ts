/**
 * B.AI 用户中心（chat.b.ai）tRPC API 类型定义。
 *
 * 认证方式：Auth.js v5 会话 cookie `__Secure-authjs.session-token`
 * （从浏览器 DevTools → Application → Cookies 复制）。
 */

/** usage.points 返回的积分余额 */
export interface PointsBalance {
    /** 积分余额总额（充值 + 赠送） */
    points_balance: number;
    /** 赠送/限时积分（到期未用失效） */
    points_expiring: number;
}

/** usage.summary 返回的用量汇总 */
export interface UsageSummary {
    /** 近 12 个月每月消费积分 */
    monthly_chart: Array<{ month: string; points: number }>;
    /** 本月消费积分 */
    monthly_spent: number;
    /** 积分余额总额 */
    points_balance: number;
}

/** 单条调用的缓存 token 明细 */
export interface CacheTokens {
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_5m_tokens: number;
    cache_creation_1h_tokens: number;
}

/** usage.records 返回的单条调用日志 */
export interface UsageRecord {
    id: string;
    created_at: string;
    model: string;
    /** api / chat 等 */
    source_type: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    /** 消耗积分 */
    cost_points: number;
    /** 耗时（秒） */
    duration_sec: number;
    cache_tokens: CacheTokens;
    web_search_count: number;
    request_id: string | null;
    orchestration_mode: string | null;
}

/** usage.records 查询参数 */
export interface UsageRecordsQuery {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    cursor?: string | null;
}

/** 调用日志统计汇总 */
export interface CallLogStats {
    total: number;
    byModel: Array<{ model: string; count: number; costPoints: number; tokens: number }>;
    totalCostPoints: number;
    totalTokens: number;
}
