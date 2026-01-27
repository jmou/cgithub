import { createAdaptorServer, serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Eta } from "eta";
import { type Context, Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import path from "node:path";
import url from "node:url";
import { getGitHubBlob, getGitHubRepo, getGitHubTree, GitHubHTTPError } from "./scraper.ts";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const app = new Hono();
const eta = new Eta({ views: path.join(__dirname, "..", "views") });

app.use("/static/*", serveStatic({ root: path.join(__dirname, "..") }));

app.get("/", async (c) => {
  return c.html(await eta.renderAsync("home.eta", {}));
});

async function tryRender<T extends object>(c: Context, template: string, promise: Promise<T>) {
  let data: T;
  try {
    data = await promise;
  } catch (e) {
    if (e instanceof GitHubHTTPError) {
      c.status(e.status as StatusCode);
      const message = `GitHub responded with HTTP ${e.status} ${e.message}`;
      return c.html(await eta.renderAsync("error.eta", { title: e.message, message }));
    } else {
      c.status(500);
      return c.html(await eta.renderAsync("error.eta", { message: "" + e }));
    }
  }
  return c.html(await eta.renderAsync(template, data));
}

app.get("/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  return tryRender(c, "repo.eta", getGitHubRepo(owner, repo));
});

app.get("/:owner/:repo/tree/:branch/:path{.*}?", async (c) => {
  const { owner, repo, branch, path = "" } = c.req.param();
  return tryRender(c, "tree.eta", getGitHubTree(owner, repo, branch, path));
});

app.get("/:owner/:repo/blob/:branch/:path{.*}", async (c) => {
  const { owner, repo, branch, path } = c.req.param();
  return tryRender(c, "blob.eta", getGitHubBlob(owner, repo, branch, path));
});

app.get("/:owner/:repo/raw/:branch/:path{.*}", async (c) => {
  const { owner, repo, branch, path } = c.req.param();
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
});

app.all("*", async (c) => {
  const path = c.req.path;
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(`https://github.com${path}`);
});

if (process.env.LISTEN_FDS === "1") {
  const server = createAdaptorServer(app);
  // Listen on SD_LISTEN_FDS_START.
  server.listen({ fd: 3 }, () => {
    console.log("Server running via systemd socket activation");
  });
} else {
  const port = parseInt(process.env.PORT || "3000", 10);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server running on http://localhost:${info.port}`);
  });
}
