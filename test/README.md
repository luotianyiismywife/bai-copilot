# B.AI API 测试

双协议完整测试脚本，用于验证 B.AI 平台 API 的兼容性。

## 运行

```bash
node test/api-tests.mjs <API_KEY> [openai|anthropic|all]
```

- `<API_KEY>`: B.AI API key（在 https://chat.b.ai/key 创建，`sk_...`）
- filter 可选: `openai` | `anthropic` | `all`（默认 `all`）

> 注意：B.AI **没有** Responses API（`/v1/responses`），仅支持 OpenAI 兼容与 Anthropic 兼容两种协议。
> 若 `node` 在本地因系统代理设置报 `ConnectTimeoutError`，可用 `curl.exe` 直接验证端点（请求体写入临时文件再 `--data-binary @file`）。

## 覆盖场景

| 协议 | 编号 | 场景 |
|------|------|------|
| OpenAI | 1 | 非流式对话（含 reasoning_content / usage） |
| OpenAI | 2 | 流式对话（text + reasoning + usage chunk） |
| OpenAI | 3 | 流式工具调用（tool_calls） |
| OpenAI | 4 | 多轮工具回填（tool_calls + tool role） |
| OpenAI | 5 | thinking 参数（enabled/disabled）、GLM reasoning_effort |
| Anthropic | 6 | 非流式对话（thinking + text blocks） |
| Anthropic | 7 | 流式对话（SSE 事件序列） |
| Anthropic | 8 | 流式工具调用（tool_use） |
| Anthropic | 9 | thinking 参数（enabled + budget_tokens / disabled） |
| Anthropic | 9b | temperature/top_p 与 thinking 组合（2026-08-20 实测：平台已放宽，全部组合 200 OK；插件仍保守在 enabled 时跳过 temperature，符合 Anthropic 官方协议） |
| 公共 | 16 | 无效模型 ID 返回 4xx |
| 公共 | 16b | 无效模型走 Anthropic 端点返回错误 |

## 平台差异速查

- 余额不足状态码：**403**（非 402）
- Anthropic thinking：仅 `enabled`（需 `budget_tokens` ≥ 1024 且 < max_tokens）/ `disabled`，**不支持 adaptive**
- **2026-08-20 实测**：thinking enabled + temperature/top_p 组合已不报 400（平台放宽）；插件仍保守跳过 temperature（Claude 系列严格端点必需）
- 全部 38 个模型均支持 openai + anthropic 双端点
- DeepSeek thinking 模式：OpenAI 端点多轮工具回填时 assistant 消息必须回传 `reasoning_content`（缺失 400）
