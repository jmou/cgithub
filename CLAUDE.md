# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

cgithub is a lightweight GitHub alternative frontend that scrapes GitHub's server-rendered HTML instead of using the API. This approach avoids API rate limits entirely by extracting embedded JSON data from `<script type="application/json">` tags that GitHub includes for hydration.

## Commands

```bash
# Development (watch mode with hot reload)
pnpm run dev

# Production build (bundles to dist/)
pnpm run build

# Deploy to production server
make deploy
```

## Architecture

**Stack:** Hono (web framework) + Eta (templating) + TypeScript, bundled with esbuild

**Source files:**
- `src/index.ts` - Hono routes and server setup (supports systemd socket activation via `LISTEN_FDS=1`)
- `src/scraper.ts` - GitHub HTML fetching and JSON extraction logic

**Templates:** `views/*.eta` - Eta templates with layout inheritance (`layout.eta` as base)

**Routes:**
- `GET /` - Home page
- `GET /:owner/:repo` - Repository info with directory listing
- `GET /:owner/:repo/tree/:branch/:path*` - Directory listing
- `GET /:owner/:repo/blob/:branch/:path` - File content view

**Scraper pattern:** GitHub embeds tree/blob data in two formats depending on page type:
- `react-partial.embeddedData` (props.initialPayload) for root directories
- `react-app.embeddedData` (payload) for subdirectories and blobs

The scraper uses browser-like headers to avoid throttling.
