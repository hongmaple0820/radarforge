<div align="center">

# 📡 RadarForge

**AI News Radar · Content Creator's Production Line**

[![中文](https://img.shields.io/badge/文档-中文-red)](README.md) | [![English](https://img.shields.io/badge/docs-English-blue)](README.en.md)

*Radar for intelligence, forge for content — from a raw signal to a published story.*

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-SQLite-2D3748?logo=prisma)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)

</div>

---

## What is this

RadarForge is a **content-creator workflow platform** that runs in your browser. It uses AI-powered web search as a radar to keep scanning for trending signals in your niche, then forges those signals into finished work — an illustrated article with an AI-generated cover, or a narrated short video.

One pipeline covers **topic → research → writing → artwork → video**, with no clipboard shuttling and no juggling eight windows along the way.

![Main UI](download/assets/app-main.png)

## Core capabilities

### 📡 Intelligence radar
- **AI search backend** (Yuanbao SearchPro): real web results with real citations, not model hallucinations
- **Topic tracking**: subscribe to the beats you care about; fresh signals land in your inbox
- **Source tracing**: every claim carries its original source link — checkable, quotable
- **Freshness scoring**: data-newness is visualized, so you never reheat cold takes

### ✍️ Article pipeline (6 steps)
Topic → research → viewpoint → draft → AI cover art → export as Markdown

### 🎬 Video pipeline (3 channels)
Storyboard script → version management → ffmpeg-rendered output (720P, ready to publish)

### 🔌 Multi-model gateway
One unified adapter layer for four provider families — LLM / search / image / video — with **health probing**, key pools, and exponential backoff on failures. Switching providers never touches your code.

### 🧩 Plugin ecosystem
MCP server management plus a local plugin workspace (`skill-pool/`, kept out of git — see `.gitignore`) keeps capabilities pluggable.

![Pipeline](download/assets/content-pipeline.png)

## Architecture at a glance

![Architecture](download/assets/architecture.png)

| Layer | Stack |
|---|---|
| Frontend | Next.js 16 App Router + Tailwind 4 |
| Backend | Next.js API Routes + z-ai-web-dev-sdk |
| Data | Prisma + SQLite (14 tables) |
| Gateway | Provider adapters for 4 model families (429 backoff / WAF retry) |
| Media | ffmpeg compositing + AI image generation |

## Quick start

```bash
# 1. Install dependencies
bun install

# 2. Set up the database (SQLite, tables created automatically)
echo 'DATABASE_URL=file:./db/custom.db' > .env
bun run db:push

# 3. Run
bun run dev        # http://localhost:3000
```

> 💡 All model keys are configured inside the app's **Settings hub** (persisted to `SettingKV`). The `.env` file only needs `DATABASE_URL` — keys never enter git.

## Quality gates

- `tsc` and `eslint src/` both at zero
- 36-item end-to-end regression suite (`scripts/full-regression.mjs`)
- Every change logged in `worklog.md`: what was built, what broke, how it was fixed

## Repository tour

```
src/
├── app/            # pages & API routes
├── components/     # UI components (incl. the settings hub)
├── lib/
│   ├── gateway/    # multi-model provider adapters
│   ├── settings.ts # settings read/write (with DEFAULTS fallback)
│   └── ...         # radar / article / video pipelines
prisma/schema.prisma # data model, 14 tables
scripts/            # regression / build / maintenance scripts
worklog.md          # full development log (Chinese)
download/           # screenshots & delivered assets
```

## Related work

- 📄 Contest write-up "AI News Radar 2.0" (Chinese): a four-tab walkthrough with 15 real screenshots (`download/比赛文章/`, not committed)
- 🛠️ Every "haunted bug" has a post-mortem: WAF retry, 429 backoff, a bare `.gitignore` rule that silently swallowed an API route, and a full-history secret scrub — all documented in `worklog.md`

## License

MIT
