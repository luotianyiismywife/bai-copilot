# BAI Copilot Provider — AGENTS.md

## 目录

1. [项目详细介绍](#1-项目详细介绍)
2. [详细逻辑架构](#2-详细逻辑架构)
3. [程序文件索引](#3-程序文件索引)
4. [函数定义大全](#4-函数定义大全)
5. [编译与构建](#5-编译与构建)
6. [开发规范](#6-开发规范)

---

## 1. 项目详细介绍

### 1.1 概述

**BAI Copilot Provider** 是一个 VS Code 扩展，它将 B.AI（[https://b.ai](https://b.ai)）平台的 AI 语言模型集成到 GitHub Copilot Chat 中。用户可以在 VS Code 的 Copilot Chat 界面中选择并使用 B.AI 提供的各种模型（OpenAI GPT-5.x、Claude、Gemini、DeepSeek、Qwen、Kimi、GLM、MiniMax 等），享受聊天对话、工具调用、Git 提交消息生成等功能。

本项目由 [tokenrhythm-copilot](https://github.com/luotianyiismywife/tokenrhythm-copilot) 移植而来，按 B.AI 平台特性做了适配。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **Chat 模型提供商** | 实现 `LanguageModelChatProvider` 接口，向 VS Code 注册为 `bai` 厂商 |
| **多 API Key 轮询** | 支持多个 API Key（SecretStorage 加密存储 `bai.apiKeys`），三种模式：`sticky`（默认，固定使用一个 key，仅失效时切下一个并钉住——前缀缓存命中率最高）/ `rotation`（轮询使用、跳过不可用 key）/ `single`（仅用当前 key；不可用时按 `bai.singleKeyFallback` 报错或自动切换并弹窗提示）。**主动余额预检为核心**：每个 key 可绑定 `__Secure-authjs.session-token` cookie（Auth.js v5 会话令牌，一个 cookie 可绑定多个 key，积分余额按 cookie 粒度查询并缓存），请求前查积分余额 ≤ `minBalancePoints` 自动跳过；**被动检测兜底**：cookie 缺失/失效/网络失败时按请求错误（403 余额不足 / 401 无效 Key / 429 限流 / 502、503 服务端/上游繁忙，状态码与文本 patterns 均可配置）判定 key 失效并切换——**403/401 持久化 `available=false`（确定性），429/502/503 仅内存冷却不持久化（瞬态，冷却到期自动恢复）**。**瞬态自动重试**：全部 key 均因瞬态错误失败时按 `bai.transientRetryTimes`（默认 3）自动重试整轮——指数退避等待（2s/4s/8s）且重试前清空瞬态冷却。**手动检测**：`bai.manageApiKeys` 命令 QuickPick 管理（增删/批量导入/设为当前/绑定 cookie/重置失效/检测可用性/编辑 key/**积分余额显示**）。旧版单 key `bai.apiKey` 自动迁移。`/v1/models` 实测不校验余额，模型列表/启动同步用任意有效 key 即可 |
| **多模型支持** | 内置 33 个模型定义（B.AI 全部 38 个模型的子集，去重后覆盖 DeepSeek/GLM/Kimi/MiniMax/Qwen/GPT-5.x/Claude/Gemini 系列）。支持自动模型发现：开启后从 API 获取模型列表，自动过滤不可用模型并发现新增模型 |
| **自动模型发现** | 通过 `bai.enableAutoModelDiscovery` 配置（默认开启）。启动时从 `/v1/models` 获取当前可用模型 ID 列表及 `supported_endpoint_types` 能力标记（B.AI 无 `supports_vision`/`context_length` 等字段，视觉能力来自内置目录，新增模型从 models.dev 数据库获取上下文长度/工具调用/推理能力元数据并自动添加）。API 不可用时静默回退到全量内置列表。内存缓存（5 分钟 TTL）。**按 API 模式过滤**：模型列表按 `bai.apiMode` 过滤——`auto`/`openai` 显示全部（所有模型均支持 OpenAI 格式），`anthropic` 仅显示 `supported_endpoint_types` 含 `"anthropic"` 的模型；能力集合为空（API 探测失败）时回退显示全部。**动态刷新**：通过 `onDidChangeLanguageModelChatInformation` 事件（VS Code 1.125+），切换 `apiMode` / `enableAutoModelDiscovery` 设置时自动重新拉取模型列表并刷新选择器，无需 reload 窗口 |
| **启动模型同步** | 通过 `bai.syncModelsOnStartup` 配置（默认开启）。每次 VS Code 打开时自动检查 API 是否有新模型，**每日最多同步一次**（`globalState` 记录上次同步日期）。同步结果以一行日志输出到「BAI」输出通道，**不写任何文件**。无 API Key、API 不可用时记录失败事件且不标记为已同步（下次打开重试） |
| **双协议 API 模式** | 同时支持 **OpenAI 兼容格式**（`/v1/chat/completions`）与 **Anthropic 格式**（`/v1/messages`）。可通过设置 `bai.apiMode`（默认 `auto`）手动切换：`auto` 跟随各模型默认格式（Claude 系列默认 anthropic，其余 openai），`openai` 强制 OpenAI 格式，`anthropic` 强制 Anthropic 格式。**B.AI 无 Responses API，相关代码已移除**。auto 模式优先级：模型默认 apiMode（如 Claude → anthropic）→ `enableAnthropicApi`（默认关闭）+ 模型支持 anthropic → 兜底 OpenAI。默认关闭原因：**Anthropic 格式对部分模型存在兼容性 bug**（如 DeepSeek 系列强制思考 + temperature/top_p → 400"请求参数组合无效"，实测已修复仅强制思考时跳过温度）。**建议默认使用更成熟的 OpenAI 兼容格式** |
| **流式推理** | 支持 SSE 流式响应，实时输出文本和工具调用 |
| **Thinking/推理** | 支持模型的推理过程展示（"thinking" 状态），包括 OpenAI 格式的 `reasoning_content` 与 Anthropic 格式的 `thinking` 块（带 signature）。Anthropic 端点仅支持 `enabled`（需 budget_tokens ≥ 1024 且 < max_tokens）与 `disabled`，不支持 `adaptive` |
| **工具调用 (Tool Calling)** | 支持 VS Code 的 LanguageModelToolCallPart 机制 |
| **图片代理 (Tool-based)** | 为不支持视觉的模型注入 `ask_image` 工具，模型可自主选择调用视觉模型回答关于图片的具体问题，支持多轮 API 请求完成"调用工具→提问→获取答案→继续回答"的完整流程。视觉模型 ID、查询提示词和思考模式均可配置。**跨轮视觉历史持久化**：每轮视觉代理完成后输出私有 MIME（`application/vnd.opencodego.vision-tool-history+json`）的 `LanguageModelDataPart`，VS Code 自动带入下一轮对话；下次请求 `convertMessages` 识别并重建标准 tool call + tool result 消息 |
| **上下文窗口声明** | `maxInputTokens` 按真实上下文窗口的**可配置比例**声明（默认 `1.0`，可通过设置 `bai.maxInputTokensRatio` 调整，范围 0.1–1.0，**建议 0.8**），使 VS Code agent 自动压缩能在真实上下文约 72%（比例 0.8 时）处触发；`context_length` / `max_completion_tokens` 保持真实值用于 API 请求体 |
| **Token 计数** | 使用 `o200k_base` tiktoken 分词器精确统计 token 用量 |
| **状态栏** | 实时显示当前会话 token 使用量、累计用量、缓存命中率。**仅在使用本插件模型时显示**：启动时隐藏，发起请求时显示，空闲 60 秒后自动隐藏 |
| **原生 Token 指示器** | 始终启用，向 Copilot Chat 原生 Token 指示器报告 token 用量（`LanguageModelDataPart`，MIME `usage`）。高级计数器由 `bai.enableThirdPartyTokenIndicator`（默认开启）控制 |
| **Git 提交消息生成** | 一键生成 Conventional Commit 格式的 Git 提交消息，支持 `auto` 语言模式自动从历史提交检测语言、多仓库支持、模型预设、可配置重试与超时 |
| **模型预设** | 支持通过命令面板快速切换 temperature/top_p 预设（🎯 Precise/⚖️ Balanced/🔥 Creative/🚀 Extra Creative），也支持手动自定义输入 |
| **国际化** | 内置简体中文 (zh-cn) 中英文双语界面 |
| **安装欢迎页 (Walkthrough)** | 首次安装且未配置 API Key 时自动打开引导向导（3 步：设置 API Key、显示模型、高级设置），通过 `onStartupFinished` 激活事件检测 |

### 1.3 模型清单

> **自动模型发现**（默认开启）会从 API 获取当前可用模型列表，自动隐藏不在列表中的内置模型，并从 models.dev 自动添加 API 返回的新模型。以下为全量内置模型定义（2026-08-20 依据 `/v1/models` 实测）。

#### 内置模型

| 系列 | 模型 ID | 视觉 | 推理强度选择器 | API 格式 |
|------|---------|------|----------------|----------|
| DeepSeek | `deepseek-v4-flash`, `deepseek-v4-pro` | ❌ | `禁用思考` / `高` / `最大` | OpenAI |
| Z.ai | `glm-5.3`, `glm-5.2`, `glm-5.1` | ❌ | `禁用思考` / `高` / `最大` (5.3/5.2) / `思考`（5.1 不支持思考切换） | OpenAI |
| Kimi | `kimi-k3`, `kimi-k2.6` | ✅ | `思考`（不支持思考切换） | OpenAI |
| MiniMax | `minimax-m3`¹, `minimax-m2.7` | ✅/❌ | `思考`（不支持思考切换） | OpenAI |
| Qwen | `qwen3.8-max`, `qwen3.8-27b` | ✅ | `禁用思考` / `思考` | OpenAI |
| GPT | `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.5-instant`, `gpt-5.4-pro`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.2`, `gpt-5-mini`, `gpt-5-nano`² | ✅ | `思考`（推理常开，不支持 temperature/top_p） | OpenAI |
| Claude | `claude-opus-5`, `claude-fable-5`, `claude-sonnet-5`, `claude-opus-4.8`, `claude-opus-4.7`, `claude-opus-4.6`, `claude-opus-4.5`, `claude-sonnet-4.6`, `claude-sonnet-4.5`, `claude-haiku-4.5` | ✅ | `禁用思考` / `思考`（extended thinking opt-in） | Anthropic |
| Gemini | `gemini-3.1-pro`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3-flash` | ✅ | `思考`（推理常开） | OpenAI |

> ¹ `minimax-m3` 支持视觉；`minimax-m2.7` 不支持。
> ² GPT-5.x 系列为推理模型，`thinkingMode="always"`（无法关闭推理），且不支持 temperature/top_p 采样参数。
> Claude 系列默认走 Anthropic Messages 端点（原生协议），extended thinking 为可选项（默认 disabled）。

> **关于图像输入：** 所有模型的 `imageInput` 能力均声明为 `true`，以确保 VS Code 始终传递图片数据。非视觉模型通过内部的 `ask_image` 工具代理机制处理图片，不直接支持视觉输入。

---

## 2. 详细逻辑架构

### 2.1 总体数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VS Code Copilot Chat                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  用户发送消息 → LanguageModelChatProvider                     │  │
│  │                    ↓                                          │  │
│  │  BaiChatModelProvider (provider.ts)                           │  │
│  │   1. 获取模型配置 (getBuiltInModelConfig)                     │  │
│  │   2. 获取 API Key (SecretStorage)                             │  │
│  │   3. 计算 Token 用量 (provideToken → statusBar)               │  │
│  │   3b. 可选: 向 Copilot Chat 原生 Token 指示器报告用量          │  │
│  │   4. 应用请求延迟 (delay)                                     │  │
│  │   5. 构建请求 → API 路由选择                                  │  │
│  │      ├─ apiMode="openai"     → OpenaiApi                      │  │
│  │      └─ apiMode="anthropic"  → AnthropicApi                   │  │
│  │   6. 发送 HTTP 请求 (fetch with undici + 超时控制)            │  │
│  │   7. 流式解析响应 → Progress<LanguageModelResponsePart2>      │  │
│  │      ├─ LanguageModelTextPart     (文本)                      │  │
│  │      ├─ LanguageModelThinkingPart (推理过程)                  │  │
│  │      └─ LanguageModelToolCallPart (工具调用)                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Git 提交消息生成                                              │  │
│  │  SCM 标题栏按钮 → generateCommitMsg()                         │  │
│  │    → 获取 Git Diff (gitUtils.ts)                              │  │
│  │    → 获取最近提交风格参考                                     │  │
│  │    → 构建 prompt → 调用 API (OpenaiApi/AnthropicApi)          │  │
│  │    → 流式输出到 SCM InputBox                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 扩展激活流程

```
activate(context)
  ├── logger.init()                    ← 创建 LogOutputChannel
  ├── TokenizerManager.initialize()    ← 加载 o200k_base.tiktoken
  ├── initStatusBar()                  ← 创建状态栏条目
  ├── new BaiChatModelProvider()       ← 创建 Provider 实例
  ├── vscode.lm.registerLanguageModelChatProvider("bai", provider)
  ├── 注册命令:
  │   ├── bai.setApiKey                ← 设置 API Key
  │   ├── bai.getApiKey                ← 打开 chat.b.ai 获取 Key
  │   ├── bai.openSettings             ← 打开扩展设置页
  │   ├── bai.generateGitCommitMessage ← 生成提交消息
  │   ├── bai.abortGitCommitMessage    ← 中止生成
  │   ├── bai.setModelPreset           ← 设置模型预设
  │   ├── bai.manageApiKeys            ← 管理 API Keys
  │   └── bai.setVisionProxyModel      ← 选择视觉代理模型
  ├── showWelcomeIfNeeded()            ← 首次安装时显示欢迎向导
  ├── syncModelsOnStartup(context)     ← 启动模型同步（每日最多一次）
  └── 注册 dispose 清理
```

### 2.3 聊天请求处理流程

```
provideLanguageModelChatResponse(model, messages, options, progress, token)
  │
  ├── 1. 解析模型 ID → getBuiltInModelConfig(model.id)
  │       内置模型查找失败时回退到 getAutoDiscoveredModelConfig(model.id)
  ├── 2. 应用用户配置的 reasoningEffort
  │       ├── "disabled" → 关闭思考（always 模型除外）
  │       ├── "adaptive" → 开启思考，自动模式
  │       ├── "enabled" → 开启思考，使用默认推理力度
  │       ├── "high"/"max" → 开启思考，指定推理力度
  ├── 2b. 注入 temperature/top_p（模型预设或自定义设置）
  │       └── supportsTemperature=false 的模型（GPT-5.x、kimi 等）跳过
  ├── 2c. 注入 vision 配置（modelConfig.vision）
  ├── 3. 确定 API 模式 (apiMode: "openai" | "anthropic")
  │       ├── 读取设置 bai.apiMode (auto/openai/anthropic)
  │       ├── "openai"/"anthropic" → 强制使用对应协议
  │       └── "auto" → 优先级探测:
  │           ├── 模型默认 apiMode="anthropic"（Claude 系列）→ anthropic
  │           ├── enableAnthropicApi=true 且模型支持 anthropic → anthropic
  │           └── 否则 → openai
  ├── 4. 记录请求开始日志
  ├── 5. 更新状态栏 Token 用量
  ├── 6. 应用请求延迟 (delay)
  ├── 7. 确保至少一个 API Key 存在（ensureApiKey → keyManager.getApiKeyStore）
  ├── 8. 创建请求超时 AbortController，连接 VS Code 取消令牌
  ├── 9. **多 Key 轮换循环**（while(true)，failedKeys 跟踪失败原因）:
  │       ├── pickNextApiKey(secrets, apiKeyMode)
  │       │   ├── sticky → 环形扫描第一个可用 key，游标钉住不前移
  │       │   ├── rotation → 环形扫描第一个可用 key，游标前移
  │       │   └── single → active key；不可用按 fallback 处理
  │       ├── 主动余额预检（balanceCheckEnabled 且有 cookie）:
  │       │   └── checkKeyBalance(cookie) → usage.points tRPC 查询（TTL 缓存）
  │       │       余额 ≤ minBalancePoints → markApiKeyExhausted + continue
  │       ├── 用当前 key 构造 requestHeaders → _executeApiRequest()
  │       ├── 成功 → break；曾不可用 → 自愈置可用
  │       └── 失败: isKeyRotationError(err)
  │           ├── isTransientRetryError(err) → 规范化瞬态（仅内存冷却）
  │           ├── getKeyRotationReason(err) → 403/401 → 持久化不可用 + continue
  │           ├── 429/502/503 → 仅内存冷却 + continue
  │           ├── 取消/超时/其他错误 → 抛给外层 catch，不轮换
  │           └── 全部 key 失败 → 报错列脱敏 key+原因
  │               └── 含瞬态错误 → 指数退避重试整轮（transientRetryTimes）
  ├── 10. 根据 apiMode 路由（_executeApiRequest）:
  │       ├── OpenAI 模式: convertMessages → prepareRequestBody → POST /chat/completions → processStreamingResponse
  │       └── Anthropic 模式: convertMessages → prepareRequestBody → POST /v1/messages → processStreamingResponse
  ├── 11. 图片代理拦截处理 (_handleInterceptedToolCall)
  │       └── 循环最多 visionMaxRounds 次（默认 5）: ask_image 拦截 → callVisionModel → 输出跨轮视觉历史 DataPart → 继续追问
  └── 12. 错误处理 + finally 清理
```

### 2.4 Thinking/推理内容处理

```
推理内容来源 (OpenAI 模式):
  ├── choice.thinking (对象/字符串)
  ├── delta.reasoning_content (字符串)
  ├── delta.reasoning (对象)
  └── reasoning_details[] (OpenAI 格式)

处理机制:
  1. bufferThinkingContent(text) → 积累到 _thinkingBuffer
  2. 每 100ms 定时刷新 → LanguageModelThinkingPart
  3. 文本内容出现时 → reportEndThinking()

Anthropic 模式:
  └── content_block_delta (thinking_delta) → bufferThinkingContent

回传机制 (OpenAI 模式 convertMessages):
  └── includeReasoningInRequest=true 时，assistant 消息始终设置 reasoning_content
      （DeepSeek thinking 模式要求每个 assistant 消息必须携带该字段）
```

### 2.5 工具调用处理

```
工具调用流 (OpenAI 模式):
  delta.tool_calls[] → _toolCallBuffers 分片拼接 → tryEmitBufferedToolCall()
  → adjustReadFileParameters() 自动扩增 read_file 行数

ask_image 拦截: 不在 tryEmit/flush 中发出，改为设置 interceptedToolCall
```

### 2.6 图片代理（ask_image）流程

```
非视觉模型收到含图片的消息:
  ├── 1. convertMessages() 替换图片为文本引用，原图存入 _localImages
  ├── 2. prepareRequestBody() 注入 ask_image 工具定义
  ├── 3. 模型自主决定是否调用 ask_image
  ├── 4. processDelta() 拦截 ask_image → interceptedToolCall
  └── 5. _handleInterceptedToolCall() 循环:
         ├── 发出 thinking 块 "正在根据图片提问：[问题]"
         ├── callVisionModel() 获取回答（流式转发到 thinking 块）
         ├── 输出跨轮视觉历史 DataPart
         ├── 构建本轮消息 (assistant tool_call + tool result)
         └── 若模型再次调用 ask_image → 继续循环
```

### 2.7 Git 提交消息生成流程

```
generateCommitMsg(secrets, scm?)
  ├── 检测 Git 扩展和仓库，多仓库 QuickPick 选择
  ├── 获取 Git Diff（优先 staged，回退 unstaged，-U1 减少上下文）
  ├── 构建 Prompt（系统提示词 + 最近提交风格参考 + 语言检测 + 用户输入 + diff）
  ├── 调用 API（多 key 轮换循环）: ensureApiKeyEntry → pickNextApiKey → 余额预检 → createMessage()
  ├── 流式输出到 SCM InputBox
  └── 清理: 移除 ``` 标记和 <think> 标签
```

---

## 3. 程序文件索引

### 3.1 目录结构

```
src/
├── apiModelList.ts                       # API 模型列表获取（supported_endpoint_types 解析）
├── balanceCheck.ts                       # 积分余额查询（chat.b.ai tRPC usage.points，TTL 缓存）
├── commonApi.ts                          # API 抽象基类
├── extension.ts                          # 扩展入口 (activate/deactivate)，含 manageApiKeys QuickPick
├── keyManager.ts                         # 多 API Key 管理（存储/迁移/轮询选择/失效状态/轮换判定/脱敏）
├── localize.ts                           # 国际化/本地化
├── logger.ts                             # 日志系统
├── models.ts                             # 内置模型定义清单（33 个模型，B.AI 全量）
├── modelsDev.ts                          # models.dev 元数据拉取与查询
├── modelSync.ts                          # 启动模型同步（每日一次）
├── provideModel.ts                       # 模型信息提供函数（含自动发现）
├── provider.ts                           # Chat 模型提供商（核心主文件，含多 key 轮换循环）
├── provideToken.ts                       # Token 计数函数
├── statusBar.ts                          # 状态栏管理
├── types.ts                              # TypeScript 类型定义
├── utils.ts                              # 通用工具函数
├── versionManager.ts                     # 版本信息管理
├── openai/
│   ├── openaiApi.ts                      # OpenAI 兼容 API 实现
│   └── openaiTypes.ts                    # OpenAI 类型定义
├── anthropic/
│   ├── anthropicApi.ts                   # Anthropic API 实现
│   └── anthropicTypes.ts                 # Anthropic 类型定义
├── gitCommit/
│   ├── commitMessageGenerator.ts         # Git 提交消息生成
│   └── gitUtils.ts                       # Git 工具函数
├── tokenizer/
│   ├── tokenizerManager.ts               # Tokenizer 管理 (o200k_base)
│   └── imageUtils.ts                     # 图片尺寸解析
├── vision/
│   ├── types.ts                          # Vision proxy 类型定义
│   ├── historyCodec.ts                   # 跨轮视觉历史编解码
│   ├── historyPart.ts                    # 跨轮视觉历史 DataPart 创建/解析
│   └── imageProxy.ts                     # 图片代理核心 (ask_image)
└── resources/
    └── walkthrough/                      # 安装欢迎页 (Walkthrough) 文档

scripts/
├── build-info.mjs                       # 编译元信息生成（out/build-info.json + .copilot/build-log.md）
├── package-vsix.mjs                     # VSIX 打包（npm run build），输出名 bai-copilot-<version>.vsix
├── check-new-models.mjs                 # 检查 API 新模型
├── copy-tokenizer.js                    # 拷贝 tokenizer 资源
├── export-call-logs.mjs                 # 导出全部调用日志为 CSV（BAI_SESSION cookie）
├── analyze-call-logs.mjs                # 分析调用日志 CSV（按模型/小时/单次成本统计）
├── test-vision-history.mjs              # 跨轮视觉历史编解码测试
├── test-anthropic-tool-result-merge.mjs # Anthropic 连续工具结果合并测试
└── cookieApi/
    ├── types.ts                         # chat.b.ai tRPC 类型定义
    ├── cookieApi.ts                     # tRPC 客户端（cookie 认证：积分余额/调用日志）
    └── cli.ts                           # 用户中心查询 CLI（临时调试用）

test/
└── api-tests.mjs                        # 双协议 API 测试（openai/anthropic）
```

### 3.2 关键文件说明

| 文件 | 行数 | 职责 |
|------|------|------|
| `extension.ts` | ~870 | 扩展激活/停用，注册 Provider 和 8 条命令，`manageApiKeys` QuickPick 管理（增删/批量导入/设为当前（仅 single 模式）/绑定 cookie/重置失效/检测可用性/编辑 key/**积分余额显示**），首次安装欢迎页引导 |
| `provider.ts` | ~1180 | 实现 `LanguageModelChatProvider`，处理聊天请求全流程（双协议路由、多 key 轮换循环、余额预检、被动切换）及图片代理多轮循环处理 |
| `keyManager.ts` | ~500 | 多 API Key 管理：SecretStorage 存取与旧 key 迁移、sticky/rotation/single 选择逻辑、可用性状态（持久化 available + 瞬态冷却）、轮换错误判定（401/403/429/502/503）、脱敏、批量添加、三字段编辑 |
| `balanceCheck.ts` | ~240 | 积分余额查询：chat.b.ai tRPC `usage.points`（cookie 认证）、TTL 缓存、`checkKeyBalance` 预检、`testKeyAvailability` 手动检测 |
| `models.ts` | ~280 | 33 个内置模型定义（B.AI 全量 38 模型子集），模型配置查询，`getBuiltInVisionModelIds` 视觉标记来源 |
| `apiModelList.ts` | ~140 | API 模型列表获取：从 `/v1/models` 拉取模型 ID 及 `supported_endpoint_types`，5 分钟缓存，静默降级 |
| `provideModel.ts` | ~230 | 模型信息提供函数（含自动发现）：过滤内置模型、从 API 和 models.dev 自动发现新增模型 |
| `openai/openaiApi.ts` | ~600 | OpenAI 格式 API 实现（消息转换/请求构建/流式处理/图片代理/跨轮视觉历史重建） |
| `anthropic/anthropicApi.ts` | ~530 | Anthropic 格式 API 实现（消息转换/请求构建/流式处理/图片代理/连续工具结果合并/thinking enabled/disabled） |
| `gitCommit/commitMessageGenerator.ts` | ~290 | Git 提交消息生成逻辑（多 key 轮换循环） |
| `gitCommit/gitUtils.ts` | ~260 | Git 命令封装 |

---

## 4. 函数定义大全

### 4.1 `src/extension.ts`

#### `activate(context: vscode.ExtensionContext): void`
扩展激活入口。初始化日志、分词器、状态栏；注册 `LanguageModelChatProvider`；注册 8 条命令；首次安装时调用 `showWelcomeIfNeeded()` 显示欢迎页引导。

#### `showApiKeyManager(context: vscode.ExtensionContext): Promise<void>`
多 Key 管理 QuickPick 主流程（`bai.manageApiKeys` 命令）。循环渲染 key 列表（脱敏显示 + 可用性/当前使用/cookie 状态/**积分余额**标记），支持动作：添加 Key、批量导入、删除、设为当前使用（仅 single 模式）、重置失效状态、检测可用性、绑定/更新/清除 Cookie、编辑 Key。

#### `showWelcomeIfNeeded(context: vscode.ExtensionContext): Promise<void>`
检查是否已显示过欢迎页（`globalState` 的 `WELCOME_SHOWN_KEY`）。已标记或已有 API Key 直接返回；否则打开 Walkthrough 并标记。

#### `deactivate(): void`
扩展停用。清理资源。

### 4.2 `src/provider.ts`

#### `class BaiChatModelProvider implements LanguageModelChatProvider`
核心 Provider 类。

#### `provideLanguageModelChatInformation(options, _token): Promise<LanguageModelChatInformation[]>`
获取可用语言模型列表。委托给 `prepareLanguageModelChatInformation()`。

#### `provideTokenCount(_model, text, _token): Promise<number>`
计算文本或消息的 Token 数量。委托给 `countMessageTokens()`。

#### `provideLanguageModelChatResponse(model, messages, options, progress, token): Promise<void>`
核心方法：处理聊天请求，流式返回响应。包括模型配置获取、API Key 验证（多 key 轮换循环）、推理力度应用、temperature/top_p 注入、API 模式确定（`bai.apiMode`）、延迟控制、超时管理、流式解析、图片代理拦截处理和错误处理。

#### `private async _executeApiRequest(params): Promise<void>`
执行单个 key 的完整 API 请求：双协议分发（openai/anthropic）、流式处理、`_handleInterceptedToolCall` 图片代理第二轮。在轮换循环内每轮调用一次。

#### `private async _handleInterceptedToolCall(params): Promise<void>`
处理图片代理拦截。循环处理最多 `bai.visionMaxRounds` 轮（默认 5）。每轮检测 API 实例的 `interceptedToolCall`，发出 thinking 块显示"正在根据图片提问：[问题]"，调用视觉模型获取描述，输出跨轮视觉历史 DataPart，构建本轮 API 请求，模型不再调用 ask_image 时退出循环。

#### `export const REASON_TEXT: Record<string, string>`
key 轮换失败原因 → 人类可读标签（l10n key）：`balance`/`invalid`/`rate_limited`/`server_error`/`api_error`/`unavailable`。

#### `export async function buildAllKeysUnavailableDetail(secrets): Promise<string>`
构建"全部 API Key 均不可用"的脱敏原因详情（`sk_****abcd: 服务端繁忙 (503)` 列表）。

#### `export async function tryTransientRetryRound(secrets, retryCount, maxRetries): Promise<boolean>`
瞬态失败整轮自动重试辅助。达到上限返回 false；否则清空瞬态冷却、指数退避等待（2s/4s/8s）后返回 true。

### 4.3 `src/models.ts`

#### `interface BuiltInModelDef`
内置模型定义接口：`baseId`/`displayName`/`vision`/`thinkingMode`（switchable/always/adaptive）/`defaultReasoningEffort`/`supportedReasoningEfforts`/`supportsTemperature`/`contextLength`/`maxTokens`/`extra`/`apiMode`（openai/anthropic）。

#### `const BUILT_IN_MODELS: BuiltInModelDef[]`
33 个内置模型定义常量数组（B.AI 全量 38 模型子集）。

#### `getBuiltInModelInfos(): LanguageModelChatInformation[]`
将内置模型定义转换为 VS Code 的模型信息列表。每个模型注册一个条目，带 `isUserSelectable: true` 与 `configurationSchema` 推理强度选择器。

#### `getBuiltInModelCount(): number` / `getBuiltInModelIds(): Set<string>` / `getBuiltInVisionModelIds(): Set<string>`
模型数量 / 全部 ID 集合 / 视觉模型 ID 集合（B.AI 无 vision 标记时作为来源）。

#### `getMaxInputTokensRatio(): number`
读取 `bai.maxInputTokensRatio`（默认 1.0，建议 0.8），夹取 [0.1, 1.0]。

#### `getBuiltInModelConfig(modelId: string): BaiModelItem | undefined`
按模型 ID 查找内置模型定义，返回模型配置对象。

### 4.4 `src/keyManager.ts`

#### `interface ApiKeyEntry`
`{ value: string; label?: string; cookie?: string; available?: boolean | null; lastCheckedAt?: number }`。`cookie` 为可选的 `__Secure-authjs.session-token` cookie。

#### `interface ApiKeyStore`
`{ keys: ApiKeyEntry[]; activeIndex: number }` — 完整 store（`bai.apiKeys` 的 JSON 结构）。

#### `getApiKeyMode(): ApiKeyMode` / `getSingleKeyFallback(): SingleKeyFallback`
读取 `bai.apiKeyMode`（默认 sticky）/ `bai.singleKeyFallback`（默认 error）。

#### `getRotationStatusCodes(): number[]`
读取触发轮换的状态码列表（默认 `[401, 403, 429, 502, 503]` — B.AI 余额不足为 **403**）。

#### `getTransientRetryStatusCodes(): number[]`
读取触发瞬态整轮自动重试的状态码列表（默认 `[429, 502, 503]`）。

#### `getApiKeyStore(secrets): Promise<ApiKeyStore>` / `saveApiKeyStore(secrets, store): Promise<void>`
读取/写入 store；自动迁移旧版单 key（`bai.apiKey`）。

#### `maskApiKey(key): string` / `maskCookie(cookie): string`
脱敏：`sk_****abcd` / `sess_****abcd`。

#### `isKeyRotationError(err): boolean` / `isTransientRetryError(err): boolean`
判定错误是否触发轮换 / 是否瞬态类。

#### `getKeyRotationReason(err): string`
提取失效原因：403/`INSUFFICIENT_BALANCE`/"余额不足" → `balance`；401 → `invalid`；429 → `rate_limited`；502/503 → `server_error`；其他 → `api_error`。

#### `pickNextApiKey(secrets, mode): Promise<ApiKeyEntry | undefined>`
选择下一个要使用的 key：rotation 环形扫描前移游标；sticky 环形扫描钉住游标；single 返回 active key。

#### `markApiKeyExhausted(secrets, keyValue, reason): Promise<void>` / `markApiKeyAvailable(secrets, keyValue): Promise<void>`
标记不可用（瞬态仅内存冷却，确定性持久化）/ 标记可用。

#### `addApiKey` / `addApiKeys` / `updateApiKey` / `removeApiKey` / `setActiveKey` / `setKeyCookie`
增删改查 API Key 集合。

### 4.5 `src/balanceCheck.ts`

#### `queryBalanceDetail(cookie): Promise<BalanceDetail>`
`GET https://chat.b.ai/trpc/lambda/usage.points?batch=1&input=...`，头 `Cookie: __Secure-authjs.session-token=<value>`，20s 超时。返回 `{ pointsBalance, pointsExpiring }`。401/403 抛"cookie 失效"。**tRPC batch 响应格式：`[{ result: { data: { json: {...} } } }]`**，input 为 URL 编码的 `{"0":{"json":null,"meta":{"values":["undefined"],"v":1}}}`。

#### `getBalanceDetailCached(cookie, ttlSec): Promise<BalanceDetail | undefined>`
带 TTL 缓存的余额详情查询（按 cookie 粒度）；失败返回 undefined。

#### `getBalanceCached(cookie, ttlSec): Promise<number | undefined>`
带 TTL 缓存的余额数值查询（pointsBalance）。

#### `checkKeyBalance(cookie): Promise<{ sufficient: boolean; balance?: number }>`
检查余额：`pointsBalance > minBalancePoints` → sufficient；查询失败 → sufficient=true（回退被动检测）。

#### `testKeyAvailability(entry, baseUrl?): Promise<{ ok: boolean | null; reason?: "balance" | "invalid" | "network" }>`
手动检测：查余额（≤ 阈值 → balance）→ 最小真实聊天请求（`say ok` + `max_tokens=8`）：200 → ok；**403**/insufficient → balance；401 → invalid；其他 → null。

### 4.6 `src/apiModelList.ts`

#### `interface ApiModelMetadata`
`{ id, owned_by?, supported_endpoint_types?: string[] }` — B.AI `/v1/models` 返回的能力标记（**数组**，非布尔字段）。

#### `getApiModelIds(apiKey): Promise<Set<string>>`
从 `/v1/models` 拉取模型 ID 集合（5 分钟 TTL 缓存，静默降级）。

#### `getAnthropicSupportedModelIds(apiKey): Promise<Set<string>>`
筛选 `supported_endpoint_types` 含 `"anthropic"` 的模型 ID 集。

#### `getVisionSupportedModelIds(apiKey): Promise<Set<string>>`
B.AI 无 vision 标记，回退到内置目录 `getBuiltInVisionModelIds()` 并与 API 列表求交。

### 4.7 `src/provideModel.ts`

#### `prepareLanguageModelChatInformation(options, _token, _secrets): Promise<LanguageModelChatInformation[]>`
获取模型信息列表。`bai.enableAutoModelDiscovery` 开启时（默认）：拉取 API 模型列表 → 过滤内置模型 → 从 models.dev 自动发现新模型（默认 `thinkingMode="always"`）。末尾按 `bai.apiMode` 过滤（`anthropic` 仅保留支持 anthropic 的模型）。API 不可用时回退全量内置列表。

#### `getAnthropicModelIds(): Set<string>`
同步返回探测到的支持 anthropic 的模型 ID 集。

#### `getAutoDiscoveredModelConfig(modelId): BaiModelItem | undefined`
返回之前自动发现的模型配置（provider 回退调用）。

### 4.8 其余模块

| 模块 | 关键函数 |
|------|----------|
| `commonApi.ts` | `CommonApi` 抽象基类（工具调用缓冲/思考缓冲/XML think 块解析/图片存储） |
| `openai/openaiApi.ts` | `OpenaiApi`（convertMessages/prepareRequestBody/processStreamingResponse/createMessage） |
| `anthropic/anthropicApi.ts` | `AnthropicApi`（convertMessages/prepareRequestBody/processStreamingResponse/createMessage，**thinking 仅 enabled/disabled**） |
| `provideToken.ts` | `countMessageTokens` / `textTokenLength` / `countToolTokens` / `calculateImageTokenCost` |
| `statusBar.ts` | `initStatusBar` / `updateContextStatusBar` / `recordUsage` / `scheduleStatusBarHide` |
| `utils.ts` | `convertToolsToOpenAI` / `createRetryConfig` / `executeWithRetry` / `isRetryableError` |
| `gitCommit/commitMessageGenerator.ts` | `generateCommitMsg` / `performCommitMsgGeneration`（多 key 轮换）/ `extractCommitMessage` |
| `gitCommit/gitUtils.ts` | `checkGitRepo` / `getGitDiff` / `getRecentCommits` / `limitDiffLines` |
| `vision/imageProxy.ts` | `callVisionModel` / `callVisionModelMulti` |
| `vision/historyCodec.ts` | `serializeVisionToolHistory` / `deserializeVisionToolHistory` / `toOpenAIVisionToolMessages` / `toAnthropicVisionToolMessages` |
| `vision/historyPart.ts` | `createVisionToolHistoryPart` / `parseVisionToolHistoryPart` |
| `tokenizer/tokenizerManager.ts` | `TokenizerManager`（o200k_base，LRU 缓存） |
| `localize.ts` | `l10n` / `l10nFormat` |

---

## 5. 编译与构建

### 5.1 编译命令

```bash
# TypeScript 编译
npm run compile
# 等效于: npx tsc -p ./ && node scripts/build-info.mjs

# scripts 目录独立编译（cookieApi 等独立脚本，输出到 scripts/out）
npx tsc -p scripts/tsconfig.json

# ESLint 检查
npm run lint

# 仅类型检查（无输出）
npx tsc --noEmit

# 持续监视模式
npm run watch

# 打包 VSIX
npm run build
# 等效于: node scripts/package-vsix.mjs
# 输出名固定为 bai-copilot-<version>.vsix，不使用 vsce 默认的 extension.vsix
```

### 5.2 编译配置 (tsconfig.json)

| 选项 | 值 |
|------|-----|
| `module` | `Node16` |
| `target` | `ES2024` |
| `lib` | `["ES2024", "dom"]` |
| `strict` | `true` |
| `outDir` | `out` |
| `rootDir` | `src` |
| `exclude` | `["scripts", "node_modules", "out"]` |

> `scripts/` 目录有独立 `tsconfig.json`（`rootDir: "."`，`outDir: "out"`，仅包含 `cookieApi/**/*.ts`）。

### 5.3 依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@microsoft/tiktokenizer` | ^1.0.10 | o200k_base 分词器 |
| `@types/vscode` | ^1.116.0 | VS Code 类型定义 |
| `typescript` | ^5.9.2 | TypeScript 编译器 |

---

## 6. 开发规范

### 6.1 编译检查铁律

**所有代码更改必须通过以下编译检查，确保无错误：**
```bash
npm run compile
# 或
npx tsc --noEmit
```

### 6.1b 编译产物元信息铁律

每次编译产物必须包含版本号和编译时间（标注时区）。`npm run compile` 会在 tsc 编译后自动运行 `scripts/build-info.mjs`，生成：
- `out/build-info.json` — 随扩展打包的编译元信息（`version` / `buildTime` / `timezone` 等）
- `.copilot/build-log.md` — 开发者侧编译日志

禁止手动编辑这两个文件。若 `out/build-info.json` 不存在，视为编译未完成，不得打包发布。

### 6.2 AGENTS.md 同步更新铁律

每次代码更改后，必须同步更新 `AGENTS.md`，包括：
- 新增/修改/删除函数、类、接口 → 更新第 4 节
- 新增/删除/重命名文件 → 更新第 3 节
- 新增/修改/删除模型定义 → 更新第 1.3 节
- 修改核心逻辑流程 → 更新第 2 节
- 修改编译配置、依赖 → 更新第 5 节

### 6.3 代码风格

- 使用 TypeScript 严格模式 (`strict: true`)
- 遵循 ES2024 标准，ESModule 模块系统
- 所有新的 API 函数需有 JSDoc 注释
- 导出的函数和类必须显式标注类型

### 6.4 命名约定

| 类别 | 约定 | 示例 |
|------|------|------|
| 类 | PascalCase | `BaiChatModelProvider` |
| 接口 | PascalCase | `BuiltInModelDef`, `BaiModelItem` |
| 函数 | camelCase | `getBuiltInModelConfig`, `countMessageTokens` |
| 变量 | camelCase | `apiKey`, `requestTimeoutMs` |
| 常量 | UPPER_SNAKE_CASE | `BASE_TOKENS_PER_MESSAGE` |
| 私有属性 | `_` 前缀 | `_lastRequestTime`, `_toolCallBuffers` |

### 6.5 VS Code API 使用约束

- `LanguageModelChatProvider` — 实现 `provideLanguageModelChatResponse()` 和 `provideLanguageModelChatInformation()`；可选实现 `onDidChangeLanguageModelChatInformation`（VS Code 1.125+）
- `LanguageModelChatInformation.maxOutputTokens` — 必须填入模型真实输出上限，不能为 0
- `SecretStorage` — 用于安全存储 API Key
- 不使用任何 `enabledApiProposals`

### 6.6 B.AI 平台适配要点

- **Base URL**: `https://api.b.ai/v1/`（OpenAI: `/chat/completions`，Anthropic: `/messages`）
- **认证**: `Authorization: Bearer <key>` 或 `x-api-key: <key>` 均可
- **余额不足**: HTTP **403**（非 tokenrhythm 的 402）；错误文本含 `insufficient balance` / `insufficient quota` / "余额不足"
- **无 Responses API**: 不要新增 `/v1/responses` 相关代码
- **余额接口**: chat.b.ai tRPC `usage.points`（cookie `__Secure-authjs.session-token`）
- **Anthropic thinking**: 仅 `{ type: "enabled", budget_tokens }` / `{ type: "disabled" }`，不支持 `adaptive`；enabled 时必须省略 temperature/top_p
- **Cookie 绑定提示**: 用户从浏览器 DevTools → Application → Cookies 复制 `__Secure-authjs.session-token` 值

### 6.7 平台调研文档

平台 API 细节与踩坑记录见 `docs/bai-api-research.md`（含完整模型清单与定价、tRPC 接口格式、错误码对照、自动化浏览器被 Google 封锁等实测记录）。
