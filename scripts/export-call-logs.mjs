/**
 * 导出全部调用日志为 CSV（B.AI chat.b.ai tRPC usage.records）。
 * 用法：
 *   $env:BAI_SESSION="<__Secure-authjs.session-token值>"; node scripts/export-call-logs.mjs [maxPages] [outFile]
 * 示例：
 *   $env:BAI_SESSION="eyJhbGci..."; node scripts/export-call-logs.mjs 10
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "https://chat.b.ai";
const COOKIE_NAME = "__Secure-authjs.session-token";
const cookie = process.env.BAI_SESSION;
if (!cookie) {
    console.error("错误：请先设置环境变量 BAI_SESSION（__Secure-authjs.session-token cookie 值）");
    process.exit(1);
}

const maxPages = Math.max(1, Number(process.argv[2] ?? 10) || 10);
const outFile = process.argv[3] ?? path.resolve("call-logs-export.csv");
const pageSize = 50;

async function fetchPage(page) {
    const input = JSON.stringify({
        "0": {
            json: { cursor: null, page, pageSize, sortBy: "created_at", sortOrder: "desc" },
            meta: { values: ["undefined"], v: 1 },
        },
    });
    const url = `${BASE}/trpc/lambda/usage.records?batch=1&input=${encodeURIComponent(input)}`;
    const resp = await fetch(url, {
        headers: { Cookie: `${COOKIE_NAME}=${cookie}`, Accept: "application/json" },
    });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }
    const body = await resp.json();
    const first = Array.isArray(body) ? body[0] : undefined;
    if (!first || first.error || !first.result?.data?.json) {
        throw new Error("tRPC 响应异常或会话无效");
    }
    return first.result.data.json;
}

const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const all = [];
for (let p = 1; p <= maxPages; p++) {
    const json = await fetchPage(p);
    const list = json.data ?? [];
    all.push(...list);
    process.stdout.write(`\r拉取中: 第 ${p} 页，共 ${all.length} 条`);
    if (list.length < pageSize) {
        break;
    }
}
console.log();

const header = ["#", "created_at", "model", "source_type", "duration_sec", "input_tokens", "output_tokens", "total_tokens", "cache_read_tokens", "cache_creation_tokens", "cost_points", "web_search_count", "request_id", "id"];
const lines = [header.join(",")];
all.forEach((log, i) => {
    lines.push([
        i + 1, esc(log.created_at), esc(log.model), esc(log.source_type), log.duration_sec,
        log.input_tokens, log.output_tokens, log.total_tokens,
        log.cache_tokens?.cache_read_input_tokens ?? 0,
        (log.cache_tokens?.cache_creation_input_tokens ?? 0) + (log.cache_tokens?.cache_creation_5m_tokens ?? 0) + (log.cache_tokens?.cache_creation_1h_tokens ?? 0),
        log.cost_points, log.web_search_count ?? 0, esc(log.request_id), esc(log.id),
    ].join(","));
});

fs.writeFileSync(outFile, lines.join("\n"), "utf8");
console.log(`已导出 ${all.length} 条 → ${outFile} (${fs.statSync(outFile).size} bytes)`);
