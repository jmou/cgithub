import { createAdaptorServer, serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Eta } from "eta";
import { Hono } from "hono";
import * as path from "node:path";
import * as url from "node:url";
import { getGitHubBlob, getGitHubRepo, getGitHubTree } from "./scraper.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const app = new Hono();
const eta = new Eta({ views: path.join(__dirname, "..", "views") });

app.use("/static/*", serveStatic({ root: path.join(__dirname, "..") }));

app.get("/", async (c) => {
  return c.html(await eta.renderAsync("home.eta", {}));
});

app.get("/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const data = await getGitHubRepo(owner, repo);
  return c.html(await eta.renderAsync("repo.eta", data));
});

app.get("/:owner/:repo/tree/:branch/:path{.*}?", async (c) => {
  const { owner, repo, branch, path = "" } = c.req.param();
  const data = await getGitHubTree(owner, repo, branch, path);
  return c.html(await eta.renderAsync("tree.eta", data));
});

app.get("/:owner/:repo/blob/:branch/:path{.*}", async (c) => {
  const { owner, repo, branch, path } = c.req.param();
  const data = await getGitHubBlob(owner, repo, branch, path);
  return c.html(await eta.renderAsync("blob.eta", data));
});

app.get("/:owner/:repo/raw/:branch/:path{.*}", async (c) => {
  const { owner, repo, branch, path } = c.req.param();
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
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
