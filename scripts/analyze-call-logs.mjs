/**
 * 分析导出的调用日志 CSV（B.AI usage.records 格式），输出统计摘要。
 * 用法: node scripts/analyze-call-logs.mjs [csv路径]
 */
import fs from "node:fs";

const csvPath = process.argv[2] ?? "call-logs-export.csv";
const raw = fs.readFileSync(csvPath, "utf8").trim().split("\n");
const header = raw[0].split(",");
const logs = raw.slice(1).map((line) => {
    // 简单解析（本 CSV 无复杂转义字段）
    const parts = line.split(",");
    const o = {};
    header.forEach((h, i) => (o[h] = parts[i]));
    return o;
});

const num = (v) => Number(v) || 0;

// 汇总
const totalCost = logs.reduce((s, l) => s + num(l.cost_points), 0);
const totalInput = logs.reduce((s, l) => s + num(l.input_tokens), 0);
const totalOutput = logs.reduce((s, l) => s + num(l.output_tokens), 0);
const totalCache = logs.reduce((s, l) => s + num(l.cache_read_tokens), 0);

console.log("=".repeat(70));
console.log(`调用总数: ${logs.length} 条`);
console.log(`总消耗: ${totalCost.toLocaleString()} 积分`);
console.log(`总输入Token: ${totalInput.toLocaleString()}`);
console.log(`总输出Token: ${totalOutput.toLocaleString()}`);
console.log(`总缓存读Token: ${totalCache.toLocaleString()}`);
console.log("=".repeat(70));

// 按模型
const byModel = {};
for (const l of logs) {
    byModel[l.model] ??= { count: 0, cost: 0, input: 0, output: 0 };
    byModel[l.model].count++;
    byModel[l.model].cost += num(l.cost_points);
    byModel[l.model].input += num(l.input_tokens);
    byModel[l.model].output += num(l.output_tokens);
}
console.log("\n── 按模型 ──");
for (const [m, v] of Object.entries(byModel).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${m.padEnd(26)} ${String(v.count).padStart(5)} 次  ${String(v.cost).padStart(10)} 积分  输入${v.input.toLocaleString()} 输出${v.output.toLocaleString()}`);
}

// 按来源
const bySource = {};
for (const l of logs) {
    bySource[l.source_type] ??= 0;
    bySource[l.source_type]++;
}
console.log("\n── 按来源 ──");
for (const [s, c] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`${s.padEnd(12)} ${c} 次`);
}

// 按小时分布（取 created_at 的小时）
const byHour = {};
for (const l of logs) {
    const h = (l.created_at || "").slice(11, 13);
    byHour[h] ??= { count: 0, cost: 0 };
    byHour[h].count++;
    byHour[h].cost += num(l.cost_points);
}
console.log("\n── 按小时分布（UTC）──");
for (const [h, v] of Object.entries(byHour).sort()) {
    console.log(`${h}:00  ${String(v.count).padStart(4)} 次  ${v.cost.toLocaleString()} 积分`);
}

// 单次最高消耗
const top = [...logs].sort((a, b) => num(b.cost_points) - num(a.cost_points)).slice(0, 5);
console.log("\n── 单次消耗 TOP5 ──");
for (const l of top) {
    console.log(`${l.created_at}  ${l.model.padEnd(24)} ${num(l.cost_points).toLocaleString()} 积分  输入${num(l.input_tokens).toLocaleString()} 输出${num(l.output_tokens).toLocaleString()}`);
}
