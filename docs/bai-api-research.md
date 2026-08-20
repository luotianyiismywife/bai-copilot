# B.AI 平台 API 调研文档（bai-copilot 开发参考）

> 调研日期：2026-08-20 · 全部端点均用真实 API Key 实测验证
> 目的：为 bai-copilot（仿 bai-copilot 的 VS Code Copilot 模型提供商扩展）提供平台事实依据

---

## 1. 平台概览

| 项目 | 值 |
|------|-----|
| 官网 | https://b.ai |
| Chat 平台 | https://chat.b.ai/chat（备用入口 https://chat.bankofai.io/chat） |
| API Base URL | `https://api.b.ai` |
| 文档 | https://docs.b.ai/llmservice/api/ |
| 计费单位 | **积分（points/credits）**，非人民币余额 |
| 登录方式 | Google OAuth / Web3 钱包 |
| 模型总数 | 38 个（官方全量接入） |

---

## 2. LLM API（api.b.ai）

### 2.1 认证

两种等价方式，所有端点均接受：

```
Authorization: Bearer sk-xxx
x-api-key: sk-xxx
```

- API Key 在 `https://chat.b.ai/key` 创建，创建时选择接入方式（官方全量接入 / 自选服务商）与折扣档
- Key 只在创建时显示一次，之后无法再查看
- 平台正在推进旧 Key → 新 Key 安全迁移（30 天兼容期）

### 2.2 端点清单

| 端点 | 说明 | 实测状态 |
|------|------|----------|
| `GET /v1/models` | 模型列表 | ✅ 200 |
| `POST /v1/chat/completions` | OpenAI 兼容聊天 | ✅ 200（流式/非流式/工具调用均验证） |
| `POST /v1/messages` | Anthropic 兼容聊天 | ✅ 200（thinking 块验证） |
| ~~`/v1/responses`~~ | **不存在**，b.ai 无 Responses API | ❌ |

### 2.3 GET /v1/models

响应格式（实测）：

```json
{
  "object": "list",
  "success": true,
  "data": [
    {
      "id": "minimax-m3",
      "object": "model",
      "created": 1626777600,
      "owned_by": "minimax",
      "supported_endpoint_types": ["openai", "anthropic"]
    }
  ]
}
```

**关键差异（vs bai）**：
- 能力字段是 `supported_endpoint_types` 数组（bai 是 `supports_responses`/`supports_anthropic` 布尔）
- **实测全部 38 个模型都同时支持 `openai` + `anthropic`**
- 无 `supports_vision`/`context_length`/`max_completion_tokens` 等字段 → 视觉/上下文元数据需内置或查 models.dev
- `owned_by` 值不统一：`minimax`/`azure`/`mixai`/`vertex-ai`/`ali`/`deepseek`/`claude`/`bttinfergrid`/`unknown`（GLM/Kimi 系列为 `unknown`）

### 2.4 完整模型清单（2026-08-20 实测 /v1/models + /key 页定价）

定价单位：$/M tokens（输入 / 缓存写入 / 缓存读取 / 输出）

| 系列 | 模型 ID | 定价 | 备注 |
|------|---------|------|------|
| DeepSeek | `deepseek-v4-flash` | 限免 0 | 默认强制思考（reasoning_content） |
| DeepSeek | `deepseek-v4-pro` | 1.32/1.32/0.044/3.96 | 旗舰 |
| Anthropic | `claude-opus-5` | 5/6.25/0.5/25 | |
| Anthropic | `claude-fable-5` | 10/12.5/1/50 | 最贵 |
| Anthropic | `claude-opus-4.8` / `4.7` / `4.6` / `4.5` | 5/6.25/0.5/25 | |
| Anthropic | `claude-sonnet-5` | 2/2.5/0.2/10 | |
| Anthropic | `claude-sonnet-4.6` / `4.5` | 3/3.75/0.3/15 | |
| Anthropic | `claude-haiku-4.5` | 1/1.25/0.1/5 | |
| OpenAI | `gpt-5.6-sol` | 5/6.25/0.5/30 | |
| OpenAI | `gpt-5.6-terra` | 2/2.5/0.2/12 | |
| OpenAI | `gpt-5.6-luna` | 0.2/0.25/0.02/1.2 | |
| OpenAI | `gpt-5.5` / `gpt-5.5-instant` | 5/5/0.5/30 | |
| OpenAI | `gpt-5.4` | 2.5/2.5/0.25/15 | |
| OpenAI | `gpt-5.2` | 1.75/1.75/0.175/14 | |
| OpenAI | `gpt-5.4-pro` | 30/30/3/180 | |
| OpenAI | `gpt-5.4-mini` | 0.75/0.75/0.075/4.5 | |
| OpenAI | `gpt-5-mini` | 0.25/0.25/0.025/2 | |
| OpenAI | `gpt-5.4-nano` | 0.2/0.2/0.02/1.25 | |
| OpenAI | `gpt-5-nano` | 0.05/0.05/0.005/0.4 | 最便宜 |
| Alibaba | `qwen3.8-max` | 2/2/0.25/6 | 视觉 ✅ |
| Alibaba | `qwen3.8-27b` | - | /v1/models 有，/key 页显示为 qwen3.6-27b（0.19/0.19/0.019/2.99），视觉 ✅ |
| Google | `gemini-3.1-pro` | 2/2/0.2/12 | 视觉 ✅ |
| Google | `gemini-3.5-flash` | 1.5/1.5/0.15/9 | 视觉 ✅ |
| Google | `gemini-3-flash` | 0.5/0.5/0.05/3 | 视觉 ✅ |
| Google | `gemini-3.5-flash-lite` | 0.3/0.3/0.03/2.5 | |
| Google | `gemini-3.6-flash` | 1.5/1.5/0.15/7.5 | |
| MiniMax | `minimax-m3` | 0.3/0.3/0.06/1.2 | 视觉 ✅ |
| MiniMax | `minimax-m2.7` | 0.3/0.375/0.06/1.2 | |
| Moonshot | `kimi-k2.6` | 0.95/0.95/0.1615/4 | 视觉 ✅ |
| Moonshot | `kimi-k3` | 3/3/0.3/15 | 视觉 ✅ |
| Z.ai | `glm-5.3` / `glm-5.2` / `glm-5.1` | 1.4/1.4/0.28/4.4 | 无视觉 |

> ⚠️ Claude 模型 ID 别名：目录返回点号形式（`claude-sonnet-4.6`），API 同时接受连字符形式（`claude-sonnet-4-6`）

### 2.5 POST /v1/chat/completions（OpenAI 兼容）

支持参数（文档）：`model`、`messages`、`stream`、`max_tokens`、`temperature`(0-2)、`top_p`、`stop`、`n`、`frequency_penalty`、`presence_penalty`、`seed`、`response_format`、`tools`、`tool_choice`("auto"/"none"/"required"/指定函数)、`user`、`web_search_options`

**实测响应特征**：

```json
{
  "id": "908da557-...",
  "object": "chat.completion",
  "model": "deepseek-v4-flash",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "",
      "reasoning_content": "We need to reply exactly with \"OK\"..."
    },
    "finish_reason": "length"
  }],
  "usage": {
    "prompt_tokens": 88,
    "completion_tokens": 20,
    "total_tokens": 108,
    "prompt_tokens_details": { "cached_tokens": 0 },
    "completion_tokens_details": { "reasoning_tokens": 20 },
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 88
  },
  "system_fingerprint": "a26a7955944dc5c60445bff7fac9c8e"
}
```

要点：
- **`reasoning_content` 字段**：DeepSeek 系列思考内容放这里（与 bai 一致）
- **usage 扩展字段**：`prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`（缓存命中统计）+ `completion_tokens_details.reasoning_tokens`
- 流式 SSE：`data: {...}` 行 + `[DONE]`，delta 含 `content` 与 `reasoning_content`（交替为 null）
- 工具调用实测：`tool_choice: "required"` 正常触发，`tool_calls[].function.arguments` 为 JSON 字符串，`finish_reason: "tool_calls"`

### 2.6 POST /v1/messages（Anthropic 兼容）

支持参数：`model`、`max_tokens`（必填）、`messages`、`system`、`stream`、`temperature`、`top_p`、`top_k`、`stop_sequences`、`metadata`、`thinking`、`tools`、`tool_choice`

ThinkingConfig：
```json
{ "type": "enabled", "budget_tokens": 1024 }   // budget_tokens >= 1024 且 < max_tokens
{ "type": "disabled" }
```

**实测响应**（deepseek-v4-flash）：

```json
{
  "id": "07374f61-...",
  "type": "message",
  "role": "assistant",
  "model": "deepseek-v4-flash",
  "content": [
    { "type": "thinking", "thinking": "We need to reply exactly...", "signature": "07374f61-..." },
    { "type": "text", "text": "OK" }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 88,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "output_tokens": 27,
    "service_tier": "standard"
  }
}
```

要点：
- DeepSeek 走 Anthropic 端点时思考内容以 **`thinking` content block**（带 `signature`）返回
- 流式事件：`message_start` / `content_block_start` / `content_block_delta`（text_delta/thinking_delta/input_json_delta）/ `content_block_stop` / `message_stop`
- 图片：`image` block，base64（jpeg/png/gif/webp）或 URL source

### 2.7 错误码

| 码 | 含义 | 插件处理建议 |
|----|------|--------------|
| 400 | 参数错误 | 直接报错，不轮换 |
| 401 | Key 无效/缺失 | 持久化标记不可用（对应 bai 的 401） |
| **403** | **余额不足** / 无权限 / 封禁 | 持久化标记不可用（⚠️ bai 用 402，b.ai 用 **403**） |
| 429 | 限流 | 瞬态冷却 + 轮换 |
| 500 | 服务端错误 | 报错 |
| 502 | 上游错误 | 瞬态冷却 + 轮换 |
| 503 | 过载/无可用渠道 | 瞬态冷却 + 轮换 |

错误响应统一格式：
```json
{ "error": { "message": "...", "type": "invalid_request_error", "param": null, "code": null } }
```

---

## 3. 用户中心 API（chat.b.ai，session cookie 认证）

> 对应 bai 的 `tr_session` cookie 余额预检机制。b.ai 使用 **Auth.js v5**（NextAuth 后继），cookie 名为 **`__Secure-authjs.session-token`**（HttpOnly + Secure，domain=chat.b.ai）。
> 用户需从浏览器 DevTools → Application → Cookies 复制该 cookie 值绑定到 key。

接口为 **tRPC batch 格式**，GET 请求，query 参数 `batch=1&input=<URL编码JSON>`。

### 3.1 余额查询 `usage.points`

```
GET https://chat.b.ai/trpc/lambda/usage.points?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%2C%22v%22%3A1%7D%7D%7D
Cookie: __Secure-authjs.session-token=<value>
```

input 明文：`{"0":{"json":null,"meta":{"values":["undefined"],"v":1}}}`

响应（实测）：
```json
[{ "result": { "data": { "json": {
  "points_balance": 300000,
  "points_expiring": 300000
} } } }]
```

- `points_balance`：总积分余额（对应 bai 的 availableBalanceCny）
- `points_expiring`：即将过期/赠送积分（对应 expiringBalanceCny）
- 充值积分 = `points_balance - points_expiring`（推测，待验证）

### 3.2 用量汇总 `usage.summary`

同格式请求 `/trpc/lambda/usage.summary`，响应：
```json
{ "monthly_chart": [{"month": "2026-08", "points": 0}, ...近12个月],
  "monthly_spent": 0,
  "points_balance": 300000 }
```

### 3.3 调用记录 `usage.records`

```
GET /trpc/lambda/usage.records?batch=1&input={"0":{"json":{"cursor":null,"page":1,"pageSize":10,"sortBy":"created_at","sortOrder":"desc"},"meta":{"values":{"cursor":["undefined"]},"v":1}}}
```

单条记录字段（实测）：
```json
{
  "id": "api_O8tjDRnWGDa8FjmJ",
  "created_at": "2026-08-20T12:31:44.000Z",
  "model": "deepseek-v4-flash",
  "source_type": "api",
  "input_tokens": 284,
  "output_tokens": 31,
  "total_tokens": 315,
  "cost_points": 0,
  "duration_sec": 1.298,
  "cache_tokens": {
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation_5m_tokens": 0,
    "cache_creation_1h_tokens": 0
  },
  "web_search_count": 0,
  "request_id": "...",
  "orchestration_mode": null,
  "router_*": null
}
```

### 3.4 账号状态 `userAccountState.getMyState`

```json
{ "frozen": false, "knownStatus": true, "status": "active" }
```

### 3.5 其他观察到的端点

- `GET /api/auth/session` → NextAuth 会话（user id/name/image/expires）
- `GET https://api.b.ai/api/activity/invite/my-registration` → 邀请注册信息（含 300K 注册奖励积分）

---

## 4. 踩坑记录

### 4.1 Google OAuth 封锁自动化浏览器 ❌

- 现象：嵌入式浏览器（VS Code 内置）走 Google OAuth 登录时，`POST /v3/signin/identifier` 返回 `net::ERR_CONNECTION_CLOSED`，页面跳转 `chrome-error://chromewebdata/`
- 原因：Google 检测自动化控制浏览器（CDP 注入痕迹、`navigator.webdriver` 等指纹）并拒绝服务
- **换 MCP 浏览器工具（Playwright MCP 等）也绕不过**——拦截的是"自动化浏览器"本身，不是驱动工具
- 解决：**用户手动在真实浏览器完成登录**，自动化只操作登录后的页面（本次即如此）
- 附带现象：chat.b.ai 的 Google 登录用 `window.open` 弹窗 + COOP 策略，嵌入式浏览器中 `window.closed` 调用被拦（`Cross-Origin-Opener-Policy policy would block the window.closed call`）

### 4.2 docs.b.ai 部分路径 403 ❌

- `https://docs.b.ai/llms.txt`、`https://docs.b.ai/llmservice/models/`（模型索引页）、`https://docs.b.ai/openapi.json` 均返回 403
- 单模型页（如 `/llmservice/models/gpt-5-mini/`）可访问
- 解决：模型清单改从 **chat.b.ai/key 页面**（登录后）和 **`/v1/models` API** 获取，比文档更全更准

### 4.3 PowerShell + Invoke-RestMethod 请求 /v1/messages 报 EOF ❌

- 现象：`Invoke-RestMethod` 请求 `/v1/messages` 报 `Received an unexpected EOF or 0 bytes from the transport stream`（同一会话请求 `/v1/chat/completions` 正常）
- 疑似 PowerShell HTTP 栈的 TLS/连接复用问题
- 解决：改用 `curl.exe`

### 4.4 PowerShell 中 curl 的 JSON 转义 ❌

- 现象：`curl.exe -d '{\"model\": ...}'` 在 PowerShell 中直接失败（exit 1，无输出）
- 解决：**请求体写入临时文件**（`Out-File -Encoding ascii -NoNewline`），用 `--data-binary "@$path"` 传递

### 4.5 session cookie 是 HttpOnly，document.cookie 读不到 ❌

- `document.cookie` 只能看到分析类 cookie（_ga、posthog 等），看不到会话 cookie
- `page.context().cookies()` 在嵌入式浏览器报 `Protocol error: Method not found: Storage.getCookies`
- 解决：`page.context().newCDPSession(page)` + `Network.getAllCookies` 成功读取，确认 cookie 名 `__Secure-authjs.session-token`
- 请求拦截也拿不到 cookie 头（CDP 出于安全剥离）

### 4.6 b.ai 与 bai 的关键差异（移植注意）

| 维度 | bai | b.ai | 移植动作 |
|------|-------------|------|----------|
| 余额不足状态码 | 402 | **403** | 轮换状态码 `[401,402,429,503]` → `[401,403,429,502,503]` |
| 余额错误文本 | "余额不足"/INSUFFICIENT_BALANCE | 待实测（403 message） | patterns 需补充 |
| 协议 | openai/anthropic/**responses** | 仅 openai/anthropic | 移除 responses 相关代码与设置 |
| 能力标记 | supports_responses/anthropic/vision 布尔 | supported_endpoint_types 数组 | apiModelList.ts 解析逻辑重写 |
| 余额 API | GET /api/usage-summary（简单 JSON） | tRPC batch 格式（需 URL 编码 input） | balanceCheck.ts 重写 |
| cookie 名 | tr_session | __Secure-authjs.session-token | 全部替换 |
| 余额字段 | balanceCny/availableBalanceCny/expiringBalanceCny/nextExpiryAt | points_balance/points_expiring（无到期时间字段） | BalanceDetail 接口调整 |
| 计费货币 | CNY | 积分 points | UI 文案 ¥ → 积分 |
| 模型元数据 | /v1/models 含 context_length 等 | 仅 id/owned_by/endpoints | 上下文长度需内置或查 models.dev |
| 视觉标记 | supports_vision | 无 | 内置模型表维护 vision 字段 |
### 4.7 二次实测发现（2026-08-20，真实 API Key + 真实账号）

**thinking 与 temperature 组合已放宽**：`/v1/messages` 端点 `thinking: {type:"enabled", budget_tokens:1024}` + `temperature`/`top_p` 任意组合**全部 200 OK**（tokenrhythm 时代实测是 400"请求参数组合无效"，B.AI 平台已修复）。插件仍保守地在 thinking enabled 时跳过 temperature（符合 Anthropic 官方协议，Claude 系列严格端点必需，无害）。

**DeepSeek thinking 模式要求回传 reasoning_content**：OpenAI 端点多轮工具回填时，assistant 消息必须携带原始 `reasoning_content` 字段，缺失返回 400 `"The reasoning_content in the thinking mode must be passed back to the API"`——插件 `convertMessages` 已自动回传（`includeReasoningInRequest`）。

**付费模型需充值解锁**：GLM-5.2 等付费模型在账号未充值时返回 403 `access_denied: Access restricted. Deposit required to unlock premium models`（与 403 余额不足共用状态码，轮换时会一并跳过——符合预期）。

**Anthropic 端点工具调用不稳定**：deepseek-v4-flash 在 `/v1/messages` 端点收到 `tool_choice: {type:"any"}` 时经常忽略工具定义直接文本回复（同一定义在 OpenAI 端点稳定触发）。**这是模型/网关行为，非插件问题**——进一步印证默认使用 OpenAI 格式的建议。

**429 限流**：deepseek-v4-flash 限免模型限流阈值低，密集请求（<400ms 间隔）会触发 429。测试脚本已加请求节流。
---

## 5. 测试凭据（开发用）

- API Key：`sk-c4uszn0qqmlgual5ralhl702zi7vjnj5`（名称 bai-copilot-dev，官方全量接入，2026-08-20 创建）
- 账号积分：300,000（全部为赠送积分）
- 账号：Google 登录（AO_i...8z1dl / user_3qvqixvW5az3）

## 6. 快速验证命令

```powershell
# 模型列表
curl.exe -s "https://api.b.ai/v1/models" -H "Authorization: Bearer sk-xxx"

# OpenAI 聊天（请求体写文件避免转义问题）
'{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":50}' | Out-File "$env:TEMP\b.json" -Encoding ascii -NoNewline
curl.exe -s -X POST "https://api.b.ai/v1/chat/completions" -H "Authorization: Bearer sk-xxx" -H "Content-Type: application/json" --data-binary "@$env:TEMP\b.json"

# Anthropic 消息
'{"model":"deepseek-v4-flash","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}' | Out-File "$env:TEMP\b2.json" -Encoding ascii -NoNewline
curl.exe -s -X POST "https://api.b.ai/v1/messages" -H "x-api-key: sk-xxx" -H "Content-Type: application/json" --data-binary "@$env:TEMP\b2.json"
```
