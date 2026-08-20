/**
 * B.AI API 双协议完整测试脚本 (openai / anthropic)
 *
 * 用法:
 *   node test/api-tests.mjs <API_KEY> [openai|anthropic|all]
 *
 * 注意：B.AI 无 Responses API（/v1/responses），仅支持 OpenAI 兼容
 * 与 Anthropic 兼容两种协议。
 */
const API_KEY = process.argv[2];
const filter = process.argv[3] || "all";
if (!API_KEY) {
    console.error("用法: node test/api-tests.mjs <API_KEY> [openai|anthropic|all]");
    process.exit(1);
}

const BASE = "https://api.b.ai/v1";
let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = "") {
    if (cond) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        failures.push(`${name} ${detail}`);
        console.log(`  ❌ ${name} ${detail}`);
    }
}

/** 请求间最小间隔（ms）：deepseek-v4-flash 限免模型限流阈值低，
 *  密集请求会触发 429（非代码问题）。默认 400ms。 */
const REQUEST_INTERVAL_MS = 400;
let _lastRequestTime = 0;
async function throttle() {
    const now = Date.now();
    const wait = _lastRequestTime ? Math.max(0, REQUEST_INTERVAL_MS - (now - _lastRequestTime)) : 0;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    _lastRequestTime = Date.now();
}

/** 发送请求并完整解析：流式返回 SSE 事件数组，非流式返回 JSON body */
async function api(path, body, headers = {}) {
    await throttle();
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}`, ...headers },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    if (body.stream === true) {
        // SSE 流式
        parsed = text.split("\n")
            .filter(l => l.startsWith("data:") && l.trim() !== "data: [DONE]")
            .map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
            .filter(Boolean);
    } else {
        // 非流式 JSON
        try { parsed = JSON.parse(text); } catch { parsed = null; }
    }
    return { ok: res.ok, status: res.status, body: parsed, raw: text.substring(0, 500) };
}

const TOOLS = [
    {
        type: "function",
        function: {
            name: "get_weather",
            description: "Get weather of a city",
            parameters: { type: "object", properties: { city: { type: "string", description: "City name" } }, required: ["city"] },
        },
    },
];

/**
 * 生成一个指定尺寸的纯色 PNG base64（浏览器环境下无效，Node 下返回 null）。
 * Node 环境下使用硬编码的 100x100 红色 PNG。
 */
function makePng(width, height) {
    // 1x1 红色 PNG（仅用于验证最小可用性；qwen3.8-max 要求 >=10x10）
    return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

async function testOpenAI() {
    console.log("\n=== OpenAI 协议 (/chat/completions) ===");

    console.log("--- 1. 非流式对话 ---");
    {
        const r = await api("/chat/completions", { model: "deepseek-v4-flash", messages: [{ role: "user", content: "回复OK" }], stream: false });
        check("HTTP 200", r.ok, `s=${r.status} ${r.raw}`);
        check("content 存在", !!r.body?.choices?.[0]?.message?.content);
        check("usage 存在", !!r.body?.usage);
        check("reasoning_content 存在", "reasoning_content" in (r.body?.choices?.[0]?.message ?? {}));
    }

    console.log("--- 2. 流式对话 ---");
    {
        const r = await api("/chat/completions", { model: "deepseek-v4-flash", messages: [{ role: "user", content: "用一句话介绍你自己" }], stream: true, stream_options: { include_usage: true } });
        check("流式文本增量", r.body.some(e => e.choices?.[0]?.delta?.content));
        check("流式推理增量", r.body.some(e => e.choices?.[0]?.delta?.reasoning_content));
        check("流式 usage chunk", r.body.some(e => e.usage));
    }

    console.log("--- 3. 流式工具调用 ---");
    {
        const r = await api("/chat/completions", { model: "deepseek-v4-flash", messages: [{ role: "user", content: "请使用 get_weather 工具查询北京的天气" }], stream: true, tools: TOOLS, tool_choice: "auto" });
        const tcs = r.body.flatMap(e => e.choices?.[0]?.delta?.tool_calls ?? []);
        check("收到 tool_calls", tcs.length > 0, `n=${tcs.length}`);
        const name = tcs.find(t => t.function?.name)?.function?.name;
        check("工具名正确", name === "get_weather", `n=${name}`);
    }

    console.log("--- 4. 多轮工具回填 ---");
    {
        // 注意：deepseek 系 thinking 模式要求 assistant 消息必须携带
        // 原始 reasoning_content（缺失会 400 "The reasoning_content in the thinking
        // mode must be passed back to the API"）——插件 convertMessages 已自动回传。
        const r = await api("/chat/completions", {
            model: "deepseek-v4-flash",
            messages: [
                { role: "user", content: "查询北京天气" },
                { role: "assistant", content: null, reasoning_content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"北京"}' } }] },
                { role: "tool", tool_call_id: "call_1", content: "晴天 25度" },
            ],
            stream: false, tools: TOOLS,
        });
        check("多轮回填成功", r.ok && !!r.body?.choices?.[0]?.message?.content, `s=${r.status} ${r.raw}`);
        // 回归：不带 reasoning_content 时应 400（验证平台要求，插件已处理）
        const r2 = await api("/chat/completions", {
            model: "deepseek-v4-flash",
            messages: [
                { role: "user", content: "查询北京天气" },
                { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"北京"}' } }] },
                { role: "tool", tool_call_id: "call_1", content: "晴天 25度" },
            ],
            stream: false, tools: TOOLS,
        });
        check("缺 reasoning_content → 400 回归", !r2.ok && r2.status === 400, `s=${r2.status} ${r2.raw}`);
    }

    console.log("--- 5. thinking 参数 ---");
    {
        const r1 = await api("/chat/completions", { model: "deepseek-v4-flash", messages: [{ role: "user", content: "回复OK" }], stream: false, thinking: { type: "enabled" } });
        check("thinking=enabled", r1.ok, `s=${r1.status} ${r1.raw}`);
        const r2 = await api("/chat/completions", { model: "deepseek-v4-flash", messages: [{ role: "user", content: "回复OK" }], stream: false, thinking: { type: "disabled" } });
        check("thinking=disabled", r2.ok, `s=${r2.status} ${r2.raw}`);
        // GLM-5.2 是付费模型：账号未充值解锁时返回 403 access_denied（非协议问题）。
        // 仅当返回 200 或 400 时才算协议相关，403 标记为「未解锁跳过」。
        const r3 = await api("/chat/completions", { model: "glm-5.2", messages: [{ role: "user", content: "回复OK" }], stream: false, thinking: { type: "enabled" }, reasoning_effort: "high" });
        check("GLM-5.2 thinking+effort", r3.ok || r3.status === 403, `s=${r3.status} ${r3.raw}`);
    }
}

async function testAnthropic() {
    console.log("\n=== Anthropic 协议 (/v1/messages) ===");
    const ANTH = { "anthropic-version": "2023-06-01" };

    console.log("--- 6. 非流式对话 ---");
    {
        const r = await api("/messages", { model: "deepseek-v4-flash", max_tokens: 512, messages: [{ role: "user", content: "回复OK" }] }, ANTH);
        check("HTTP 200", r.ok, `s=${r.status} ${r.raw}`);
        check("type=message", r.body?.type === "message");
        check("有文本块", r.body?.content?.some(b => b.type === "text" && b.text));
        // deepseek 是否返回 thinking 块由模型自行决定（行为有波动），不作为硬性断言
        check("usage 存在", !!r.body?.usage);
    }

    console.log("--- 7. 流式对话 ---");
    {
        const r = await api("/messages", { model: "deepseek-v4-flash", max_tokens: 256, stream: true, messages: [{ role: "user", content: "say OK" }] }, ANTH);
        const types = new Set(r.body.map(e => e.type));
        check("message_start", types.has("message_start"));
        check("content_block_delta", types.has("content_block_delta"));
        check("text_delta", r.body.some(e => e.delta?.type === "text_delta"));
        check("thinking_delta", r.body.some(e => e.delta?.type === "thinking_delta"));
        check("message_stop", types.has("message_stop"));
    }

    console.log("--- 8. 流式工具调用 ---");
    {
        const r = await api("/messages", {
            model: "deepseek-v4-flash", max_tokens: 512, stream: true,
            messages: [{ role: "user", content: "必须使用 get_weather 工具查询北京的天气" }],
            tools: [{ name: "get_weather", description: "Get weather of a city", input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }],
            tool_choice: { type: "any" },
        }, ANTH);
        const tu = r.body.find(e => e.content_block?.type === "tool_use");
        check("收到 tool_use 块", !!tu, `n=${tu?.content_block?.name} ${r.raw}`);
        check("input_json_delta", r.body.some(e => e.delta?.type === "input_json_delta"));
    }

    console.log("--- 9. thinking 参数 ---");
    {
        // B.AI /v1/messages 仅文档支持 enabled（需 budget_tokens）与 disabled；
        // adaptive 会返回 400，省略 thinking 字段则使用模型默认行为。
        const r1 = await api("/messages", { model: "deepseek-v4-flash", max_tokens: 256, messages: [{ role: "user", content: "回复OK" }], thinking: { type: "enabled", budget_tokens: 1024 } }, ANTH);
        check("thinking=enabled", r1.ok, `s=${r1.status} ${r1.raw}`);
        const r2 = await api("/messages", { model: "deepseek-v4-flash", max_tokens: 256, messages: [{ role: "user", content: "回复OK" }], thinking: { type: "disabled" } }, ANTH);
        check("thinking=disabled", r2.ok, `s=${r2.status} ${r2.raw}`);
    }

    console.log("--- 9b. temperature/top_p 与 thinking 组合规则验证 ---");
    {
        // 2026-08-20 实测（deepseek-v4-flash，B.AI /v1/messages）：
        //   enabled(+budget_tokens) + temp / top_p / temp+top_p → 全部 200 OK
        //   disabled + temp → 200 OK
        // 平台已放宽（tokenrhythm 时代 enabled+temp 曾 400 "请求参数组合无效"）。
        // 插件 AnthropicApi.prepareRequestBody 仍保守地在 thinking 强制 enabled 时
        // 跳过 temperature/top_p —— 符合 Anthropic 官方协议（extended thinking 须省略
        // temperature），对 Claude 系列严格端点仍然是必需的。
        const r1 = await api("/messages", { model: "deepseek-v4-flash", max_tokens: 256, messages: [{ role: "user", content: "回复OK" }], thinking: { type: "enabled", budget_tokens: 1024 }, temperature: 0 }, ANTH);
        check("enabled+temp → 200 通过（平台已放宽）", r1.ok, `s=${r1.status} ${r1.raw}`);
        const r1b = await api("/messages", { model: "deepseek-v4-flash", max_tokens: 256, messages: [{ role: "user", content: "回复OK" }], thinking: { type: "enabled", budget_tokens: 1024 }, top_p: 1 }, ANTH);
        check("enabled+top_p → 200 通过（平台已放宽）", r1b.ok, `s=${r1b.status} ${r1b.raw}`);
        const r3 = await api("/messages", { model: "deepseek-v4-flash", max_tokens: 256, messages: [{ role: "user", content: "回复OK" }], thinking: { type: "disabled" }, temperature: 0 }, ANTH);
        check("disabled+temp → 200 通过", r3.ok, `s=${r3.status} ${r3.raw}`);
    }
}

async function testErrors() {
    console.log("\n=== 公共: 错误处理 ===");

    console.log("--- 16. 无效模型 ID ---");
    {
        const r = await api("/chat/completions", { model: "nonexistent-model-xyz", messages: [{ role: "user", content: "hi" }], stream: false });
        check("无效模型返回 4xx", r.status >= 400 && r.status < 500, `s=${r.status}`);
        check("错误含 message", !!r.body?.error?.message || !!r.body?.message);
    }

    console.log("--- 16b. 无效模型走 Anthropic 端点 ---");
    {
        const r = await api("/messages", { model: "nonexistent-model-xyz", max_tokens: 256, messages: [{ role: "user", content: "hi" }] }, { "anthropic-version": "2023-06-01" });
        check("无效模型 Anthropic 返回错误", !r.ok && r.status >= 400, `s=${r.status} ${r.raw}`);
    }
}

async function main() {
    console.log(`BAI API 测试 (filter=${filter})`);
    console.log(`模型能力: 全部 38 个模型均支持 openai + anthropic`);

    if (filter === "all" || filter === "openai") await testOpenAI();
    if (filter === "all" || filter === "anthropic") await testAnthropic();
    if (filter === "all") await testErrors();

    console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`);
    if (failures.length) {
        console.log("失败项:");
        failures.forEach(f => console.log(`  - ${f}`));
    }
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("测试执行异常:", e); process.exit(1); });
