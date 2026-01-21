# Sales Bot

<p align="center">
  Telegram assistant for Yandex Tracker with AI search + summaries.
</p>

<div align="center">

> **warning:** this project is production-facing. deploy with allowlist enabled.

</div>

<p align="center">
  <a href="#features"><strong>features</strong></a> ·
  <a href="#built-with"><strong>built with</strong></a> ·
  <a href="#deploy-your-own"><strong>deploy your own</strong></a> ·
  <a href="#running-locally"><strong>running locally</strong></a>
</p>
<br/>

- Yandex Tracker search, issue lookup, and comments context
- Natural-language answers in Russian with model fallback
- Supermemory-backed long-term history per user
- Runtime skills for shortcut commands
- Telegram allowlist for safe access

## Features

- [GrammY](https://grammy.dev)
  - Telegram bot runtime and webhook handling
- [AI SDK](https://sdk.vercel.ai/docs)
  - Model orchestration and tool calls
  - Reference: provider-agnostic LLM interface (OpenAI used here)
- [OpenAI](https://openai.com)
  - Primary LLM provider for responses
- [Yandex Tracker API](https://yandex.ru/support/tracker/en/)
  - Issue search, status, and comments data
- [Supermemory](https://supermemory.ai)
  - Persistent, per-user memory
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
  - Webhook deployment target

## Model Providers

This app ships with [Openai](https://openai.com/) provider as the default. However, with the [AI SDK](https://sdk.vercel.ai/docs), you can switch LLM providers to [Ollama](https://ollama.com), [Anthropic](https://anthropic.com), [Cohere](https://cohere.com/), and [many more](https://sdk.vercel.ai/providers/ai-sdk-providers) with just a few lines of code.

- Mini model (`gpt-4o-mini`): A fast and efficient model suitable for simple tasks
- Large model (`gpt-4o`): A powerful model designed for complex tasks
- Reasoning model (`o4-mini`): An advanced model configured for multi-step reasoning tasks

## Deploy your own

Cloudflare Workers is the recommended deployment target (webhook mode).

1) Login

```
npx wrangler login
```

2) Configure secrets (do not commit these)

```
npx wrangler secret put BOT_TOKEN --config worker/wrangler.toml
npx wrangler secret put TRACKER_TOKEN --config worker/wrangler.toml
npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.toml
npx wrangler secret put SUPERMEMORY_API_KEY --config worker/wrangler.toml
```

3) Configure vars

```
ALLOWED_TG_IDS = 
TRACKER_CLOUD_ORG_ID = 
OPENAI_MODEL = "openai/gpt-5.2"
```

These live in `worker/wrangler.toml` under `[vars]`, or can be set in the
Cloudflare dashboard.

4) Deploy

```
npx wrangler deploy --config worker/wrangler.toml
```

5) Set Telegram webhook

```
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<your-worker>.workers.dev/telegram
```

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run OpenChat.

> Note: You should not commit your `.env` file or it will expose secrets that will allow others to control access to your various OpenAI and authentication provider accounts.

```
bun install
bun dev
```

## Commands

- `/start` - intro
- `/help` - usage
- `/tools` - list Yandex Tracker tools
- `/status` - Tracker health check + uptime
- `/model` - show current model and fallbacks
- `/model list` - list available models
- `/model set <ref>` - switch model for this session
- `/model reasoning <level>` - set reasoning level (off|low|standard|high)
- `/skills` - list runtime skills
- `/skill <name> <json>` - run a runtime skill
- `/tracker <tool> <json>` - call a tool with JSON arguments

## Skills

Runtime skills are loaded from `skills/**/skill.json` at startup.

- `skills/yandex-tracker/SKILL.md` - tool map and usage notes
- `skills/yandex-tracker/tracker-issues-find/skill.json` - runtime skill example
- `skills/yandex-tracker/tracker-issues-find/SKILL.md` - runtime skill docs and usage
