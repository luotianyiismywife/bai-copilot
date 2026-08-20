/**
 * B.AI 用户中心查询 CLI（临时调试用）。
 *
 * 用法（编译后）：
 *   node out/cookieApi/cli.js <__Secure-authjs.session-token值> [maxPages]
 *
 * 示例：
 *   node out/cookieApi/cli.js eyJhbGci...
 *   node out/cookieApi/cli.js eyJhbGci... 5
 */

import {
    queryAllUsageRecords,
    queryPointsBalance,
    queryUsageSummary,
    summarizeUsageRecords,
} from "./cookieApi";

function formatNumber(n: number): string {
    return n.toLocaleString("en-US");
}

function padRight(s: string, width: number): string {
    return s.length >= width ? s : s + " ".repeat(width - s.length);
}

async function main(): Promise<void> {
    const [, , cookie, maxPagesArg] = process.argv;
    if (!cookie) {
        console.error("用法: node out/cookieApi/cli.js <__Secure-authjs.session-token值> [maxPages]");
        process.exit(1);
    }
    const maxPages = maxPagesArg ? Math.max(1, Number(maxPagesArg) || 1) : 2;

    // 1. 积分余额
    const points = await queryPointsBalance(cookie);
    console.log("=".repeat(90));
    console.log(
        `积分余额: ${formatNumber(points.points_balance)} | 赠送(将过期): ${formatNumber(points.points_expiring)} | ` +
        `充值: ${formatNumber(points.points_balance - points.points_expiring)}`,
    );

    // 2. 用量汇总
    const summary = await queryUsageSummary(cookie);
    console.log(`本月消费: ${formatNumber(summary.monthly_spent)} 积分`);
    console.log("=".repeat(90));

    // 3. 调用日志
    const logs = await queryAllUsageRecords(cookie, { pageSize: 50, maxPages });
    console.log(`共拉取 ${logs.length} 条调用日志`);
    console.log();

    // 明细表格（最多显示 50 条）
    const hdr =
        padRight("#", 4) +
        padRight("时间(UTC)", 22) +
        padRight("模型", 24) +
        padRight("来源", 8) +
        padRight("耗时s", 8) +
        padRight("输入", 10) +
        padRight("输出", 8) +
        padRight("缓存读", 10) +
        "积分";
    console.log(hdr);
    console.log("-".repeat(hdr.length));
    for (const [i, log] of logs.slice(0, 50).entries()) {
        console.log(
            padRight(String(i + 1), 4) +
            padRight(log.created_at, 22) +
            padRight(log.model, 24) +
            padRight(log.source_type, 8) +
            padRight((log.duration_sec ?? 0).toFixed(2), 8) +
            padRight(formatNumber(log.input_tokens), 10) +
            padRight(formatNumber(log.output_tokens), 8) +
            padRight(formatNumber(log.cache_tokens?.cache_read_input_tokens ?? 0), 10) +
            formatNumber(log.cost_points),
        );
    }
    console.log("-".repeat(hdr.length));
    console.log();

    // 4. 统计汇总
    const stats = summarizeUsageRecords(logs);
    console.log("--- 按模型 ---");
    for (const item of stats.byModel) {
        console.log(
            `${padRight(item.model, 26)} ${String(item.count).padStart(4)} 次  ` +
            `${formatNumber(item.tokens)} tokens  ${formatNumber(item.costPoints)} 积分`,
        );
    }
    console.log();
    console.log(`合计: ${stats.total} 次调用 | ${formatNumber(stats.totalTokens)} tokens | ${formatNumber(stats.totalCostPoints)} 积分`);
}

main().catch((err: unknown) => {
    console.error("查询失败:", err instanceof Error ? err.message : err);
    process.exit(1);
});
