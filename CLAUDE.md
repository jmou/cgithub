## Project Overview

cgithub is a lightweight GitHub alternative frontend that scrapes GitHub's server-rendered HTML instead of using the API. Data is usually extracted from embedded JSON data from `<script type="application/json">` tags that GitHub includes for hydration.

## Commands

```bash
# Development (watch mode with hot reload)
pnpm run dev

# Production build (bundles to dist/)
pnpm run build

# Run tests
pnpm test
```

## Architecture

**Stack:** Hono (web framework) + Eta (templating) + TypeScript, bundled with esbuild

**Source files:**
- `src/index.ts` - Hono routes and server setup (supports systemd socket activation via `LISTEN_FDS=1`)
- `src/scraper.ts` - GitHub HTML fetching and JSON extraction logic

**Templates:** `views/*.eta` - Eta templates with layout inheritance (`layout.eta` as base)

**Routes:**
- `GET /:owner/:repo` - Repository info with directory listing
- `GET /:owner/:repo/tree/:branch/:path*` - Directory listing
- `GET /:owner/:repo/blob/:branch/:path` - File content view

## Instructions

- Use `for (const ... of ...)` instead of `.forEach()`
- Update `scraper.test.ts`