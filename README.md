<div align="center">

# BAI Provider for Copilot

[English](#english) | [中文](#中文)

</div>

## English

> [!IMPORTANT]
> **This is not affiliated with, officially maintained by, or endorsed by B.AI (b.ai).**

Integrate [B.AI](https://b.ai) models into GitHub Copilot Chat as a VS Code extension.

B.AI is an AI API gateway providing access to 38 models (OpenAI GPT-5.x, Anthropic Claude, Google Gemini, DeepSeek, Qwen, Kimi, GLM, MiniMax, etc.) through OpenAI-compatible (`/v1/chat/completions`) and Anthropic-compatible (`/v1/messages`) endpoints. This extension registers a `LanguageModelChatProvider` so you can use all of them directly in Copilot Chat.

### Usage

1. **Create an API Key**: sign in at [chat.b.ai](https://chat.b.ai/chat), go to the **API** page (`/key`), and create a key (official full-access tier covers all 38 models)
2. **Set API Key**: `Ctrl+Shift+P` → `BAI: Set BAI API Key`
3. **Show Models**: Click the settings icon in the model picker → **Language Models** panel → set your desired models to Visible
4. **Select Model**: In the Copilot Chat bottom model picker, choose a "BAI" model
5. **Start chatting**

### Features

- **Multi-API-Key management** — sticky / rotation / single modes, automatic key rotation on 401/403 (insufficient balance) / 429 / 502 / 503, per-key availability persistence and transient cooldown, whole-round auto-retry on transient failures with exponential backoff
- **Cookie-based balance pre-check** — bind the `__Secure-authjs.session-token` cookie (from browser DevTools) to a key to skip exhausted keys proactively via the `usage.points` tRPC endpoint; falls back to passive detection (403) when the cookie is missing
- **Dual-protocol** — OpenAI-compatible and Anthropic Messages; `bai.apiMode` = `auto` / `openai` / `anthropic`. Note: B.AI has **no Responses API**
- **Automatic model discovery** — fetches `/v1/models` at startup, hides unavailable models, auto-adds new models with metadata from models.dev
- **Thinking / reasoning** — DeepSeek `reasoning_content`, Anthropic `thinking` blocks (enabled/disabled), per-model reasoning-effort selector
- **Tool calling** — full support for VS Code `LanguageModelToolCallPart`
- **Vision proxy** — non-vision models can call a vision model (`ask_image`) to answer questions about attached images, with cross-turn vision history persistence
- **Advanced Token indicator** — status bar with per-request and cumulative input/output token counts, cache hit counts, progress bar
- **Git commit message generation** — one-click Conventional Commit messages from the SCM title bar, language auto-detection from commit history
- **Model temperature presets** — Precise / Balanced / Creative / Extra Creative
- **i18n** — Simplified Chinese + English

### Advanced Token Usage Indicator

The status bar shows the current context usage and cumulative input/output token counts for BAI models. Models that return cache metrics via the OpenAI-compatible format also display the **cumulative cache hit count** and **cache hit rate** in the tooltip.

The status bar only appears while you are actually using a BAI model: it stays hidden on startup and when other chat model providers are in use, and auto-hides after 60 seconds of inactivity. Control it via `bai.enableThirdPartyTokenIndicator` (default: `true`).

### Git Commit Messages

Click the **magic wand** button in the Source Control (SCM) panel to auto-generate a commit message. Configure the model, language, number of recent commits to reference, and whether to attach context files.

### Extended Vision Understanding

This extension adds **extended vision understanding** capability to **text-only models** that do not natively support vision. When you send a message with an image to these models, they can call a vision-capable model to describe the image, and then answer based on that description.

Configure the default vision model via `bai.visionProxyModel` (default `kimi-k2.6`), or pick from a dynamic list of vision-capable models via the **`BAI: Select Vision Proxy Model`** command.

> **Scope note**: the `ask_image` proxy applies to images **you paste/attach manually into the chat**. It does **not** apply to screenshots taken by VS Code's **built-in screenshot tool** — screenshot analysis is handled internally by the Copilot Chat framework, which is outside a third-party provider's control.

### Model List

Built-in definitions for the B.AI chat models (verified against `GET /v1/models` and the [/key pricing page](https://chat.b.ai/key) on 2026-08-20; all 38 models support both OpenAI and Anthropic endpoints):

| Series | Model ID | Vision | Thinking | Default protocol |
|--------|----------|--------|----------|------------------|
| DeepSeek | `deepseek-v4-flash`¹ / `deepseek-v4-pro` | ❌ | selectable (high/max) | OpenAI |
| Z.ai | `glm-5.3` / `glm-5.2` / `glm-5.1` | ❌ | selectable / always | OpenAI |
| Moonshot | `kimi-k3` / `kimi-k2.6` | ✅ | always | OpenAI |
| MiniMax | `minimax-m3` / `minimax-m2.7` | ✅/❌ | always | OpenAI |
| Alibaba | `qwen3.8-max` / `qwen3.8-27b` | ✅ | selectable | OpenAI |
| OpenAI | `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna` / `gpt-5.5` / `gpt-5.5-instant` / `gpt-5.4-pro` / `gpt-5.4` / `gpt-5.4-mini` / `gpt-5.4-nano` / `gpt-5.2` / `gpt-5-mini` / `gpt-5-nano` | ✅ | always | OpenAI |
| Anthropic | `claude-opus-5` / `claude-fable-5` / `claude-sonnet-5` / `claude-opus-4.8` / `4.7` / `4.6` / `4.5` / `claude-sonnet-4.6` / `4.5` / `claude-haiku-4.5` | ✅ | opt-in (enabled/disabled) | Anthropic |
| Google | `gemini-3.1-pro` / `gemini-3.6-flash` / `gemini-3.5-flash` / `gemini-3.5-flash-lite` / `gemini-3-flash` | ✅ | always | OpenAI |

> ¹ `deepseek-v4-flash` is currently free (limited-time promo, 0 credits) — great for free usage, but the model quality is noticeably lower (it often skips tool calls, produces shallow answers, and sometimes ignores instructions). Use it for casual chats / quick tests; switch to paid models for serious work.

> [!WARNING]
> **B.AI has no Responses API** (`/v1/responses` does not exist). The `bai.apiMode` setting supports only `auto` / `openai` / `anthropic`.
> The Anthropic protocol has compatibility issues with some models (e.g. DeepSeek: forced thinking + temperature/top_p returns 400 "请求参数组合无效"). **The OpenAI-compatible format is recommended**; use Anthropic only when you specifically need the native Messages format.

> [!TIP]
> Automatic model discovery is enabled by default: the extension fetches the live model list from `GET /v1/models` and hides models that are not available on your account.

### Configuration

Available in `settings.json`:

```json
{
  "bai.apiMode": "auto",
  "bai.commitLanguage": "auto",
  "bai.commitModel": "deepseek-v4-flash",
  "bai.commitMessagePrompt": "",
  "bai.requestTimeout": 600000,
  "bai.recentCommitsCount": 10,
  "bai.commitIncludeCommitDiff": false,
  "bai.commitAttachContextFiles": true,
  "bai.enableAutoModelDiscovery": true,
  "bai.syncModelsOnStartup": true,
  "bai.maxInputTokensRatio": 1.0,
  "bai.enableThirdPartyTokenIndicator": true,
  "bai.apiKeyMode": "sticky",
  "bai.apiKeyRotationStatusCodes": [401, 403, 429, 502, 503],
  "bai.transientRetryStatusCodes": [429, 502, 503],
  "bai.balanceCheckEnabled": true,
  "bai.minBalancePoints": 0,
  "bai.visionProxyModel": "kimi-k2.6"
}
```

### Development

```bash
npm install
npm run compile    # tsc + build-info (writes out/build-info.json + .copilot/build-log.md)
npm run lint
npm run build      # package VSIX → bai-copilot-<version>.vsix
```

API test script (requires an API key):

```bash
node test/api-tests.mjs <API_KEY> [openai|anthropic|all]
```

### Credits

This extension is adapted from [tokenrhythm-copilot](https://github.com/luotianyiismywife/tokenrhythm-copilot), which is in turn based on [opencode-go-copilot](https://github.com/OnesoftQwQ/opencode-go-copilot) and [oai-compatible-copilot](https://github.com/JohnnyZ93/oai-compatible-copilot). See `NOTICE.md` and `LICENSE`.

</div>

## 中文

> [!IMPORTANT]
> **本项目与 B.AI（b.ai）官方无任何关联，也未经其认可。**

以 VS Code 扩展的形式将 [B.AI](https://b.ai) 的模型集成到 GitHub Copilot Chat 中。

B.AI 是一个 AI API 网关，通过 OpenAI 兼容（`/v1/chat/completions`）与 Anthropic 兼容（`/v1/messages`）端点提供 38 个模型（OpenAI GPT-5.x、Anthropic Claude、Google Gemini、DeepSeek、Qwen、Kimi、GLM、MiniMax 等）。本扩展注册 `LanguageModelChatProvider`，让你直接在 Copilot Chat 中使用所有这些模型。

### 使用方法

1. **创建 API Key**：登录 [chat.b.ai](https://chat.b.ai/chat)，进入 **API** 页面（`/key`）创建密钥（官方全量接入覆盖全部 38 个模型）
2. **设置 API Key**：`Ctrl+Shift+P` → `BAI: 设置 BAI API 密钥`
3. **显示模型**：点击模型选择器中的设置图标 → **语言模型** 面板 → 将模型设为可见
4. **选择模型**：在 Copilot Chat 底部模型选择器中选择 "BAI" 模型
5. **开始对话**

### 功能特性

- **多 API Key 管理** —— sticky / rotation / single 三种模式；401 / 403（余额不足）/ 429 / 502 / 503 自动轮换；可用性持久化 + 瞬态冷却；瞬态失败整轮自动重试（指数退避）
- **Cookie 余额预检** —— 将 `__Secure-authjs.session-token` cookie（从浏览器 DevTools 复制）绑定到 key，通过 `usage.points` tRPC 端点主动跳过余额不足的 key；cookie 缺失时回退被动检测（403）
- **双协议** —— OpenAI 兼容 + Anthropic Messages；`bai.apiMode` 支持 `auto` / `openai` / `anthropic`。注意：**B.AI 没有 Responses API**
- **自动模型发现** —— 启动时拉取 `/v1/models`，隐藏不可用模型，自动添加 models.dev 元数据的新模型
- **思考/推理** —— DeepSeek `reasoning_content`、Anthropic `thinking` 块（enabled/disabled）、按模型的推理强度选择器
- **工具调用** —— 完整支持 VS Code `LanguageModelToolCallPart`
- **视觉代理** —— 非视觉模型可调用视觉模型（`ask_image`）回答图片相关问题，支持跨轮视觉历史持久化
- **高级 Token 指示器** —— 状态栏显示每次请求与累计的输入/输出 Token、缓存命中数、进度条
- **Git 提交消息生成** —— SCM 标题栏一键生成 Conventional Commit 消息，自动检测提交语言
- **模型温度预设** —— 精确 / 均衡 / 创意 / 超创意
- **国际化** —— 简体中文 + English

### 模型清单

内置 B.AI 聊天模型定义（2026-08-20 依据 `GET /v1/models` 与 [/key 定价页](https://chat.b.ai/key) 实测；全部 38 个模型均支持 OpenAI 与 Anthropic 双端点）：

| 系列 | 模型 ID | 视觉 | 思考 | 默认协议 |
|------|---------|------|------|----------|
| DeepSeek | `deepseek-v4-flash`¹ / `deepseek-v4-pro` | ❌ | 可切换 (high/max) | OpenAI |
| Z.ai | `glm-5.3` / `glm-5.2` / `glm-5.1` | ❌ | 可切换 / 常开 | OpenAI |
| Moonshot | `kimi-k3` / `kimi-k2.6` | ✅ | 常开 | OpenAI |
| MiniMax | `minimax-m3` / `minimax-m2.7` | ✅/❌ | 常开 | OpenAI |
| Alibaba | `qwen3.8-max` / `qwen3.8-27b` | ✅ | 可切换 | OpenAI |
| OpenAI | `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna` / `gpt-5.5` / `gpt-5.5-instant` / `gpt-5.4-pro` / `gpt-5.4` / `gpt-5.4-mini` / `gpt-5.4-nano` / `gpt-5.2` / `gpt-5-mini` / `gpt-5-nano` | ✅ | 常开 | OpenAI |
| Anthropic | `claude-opus-5` / `claude-fable-5` / `claude-sonnet-5` / `claude-opus-4.8` / `4.7` / `4.6` / `4.5` / `claude-sonnet-4.6` / `4.5` / `claude-haiku-4.5` | ✅ | 可选 (enabled/disabled) | Anthropic |
| Google | `gemini-3.1-pro` / `gemini-3.6-flash` / `gemini-3.5-flash` / `gemini-3.5-flash-lite` / `gemini-3-flash` | ✅ | 常开 | OpenAI |

> ¹ `deepseek-v4-flash` 当前限免（0 积分），**可以白嫖**——但实测效果较差：回答浅薄、经常忽略工具调用/不按指令执行，仅适合闲聊或快速测试，正经使用建议选付费模型。

> [!WARNING]
> **B.AI 没有 Responses API**（`/v1/responses` 不存在）。`bai.apiMode` 仅支持 `auto` / `openai` / `anthropic`。
> Anthropic 协议对部分模型存在兼容性问题（如 DeepSeek 强制思考 + temperature/top_p 返回 400 "请求参数组合无效"）。**建议使用 OpenAI 兼容格式**；仅在确实需要原生 Messages 格式时使用 Anthropic。

### 开发

```bash
npm install
npm run compile    # tsc + build-info（写入 out/build-info.json + .copilot/build-log.md）
npm run lint
npm run build      # 打包 VSIX → bai-copilot-<version>.vsix
```

API 测试脚本（需要 API Key）：

```bash
node test/api-tests.mjs <API_KEY> [openai|anthropic|all]
```

### 致谢

本扩展改编自 [tokenrhythm-copilot](https://github.com/luotianyiismywife/tokenrhythm-copilot)，后者基于 [opencode-go-copilot](https://github.com/OnesoftQwQ/opencode-go-copilot) 与 [oai-compatible-copilot](https://github.com/JohnnyZ93/oai-compatible-copilot)。详见 `NOTICE.md` 与 `LICENSE`。
