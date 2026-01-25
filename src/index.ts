import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Eta } from "eta";
import { Hono } from "hono";
import * as path from "node:path";
import * as url from "node:url";
import { getGitHubBlob, getGitHubTree } from "./scraper.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const app = new Hono();
const eta = new Eta({ views: path.join(__dirname, "..", "views") });

app.use("/static/*", serveStatic({ root: path.join(__dirname, "..") }));

app.get("/:owner/:repo/tree/:branch/:path{.*}?", async (c) => {
  try {
    const owner = c.req.param("owner");
    const repo = c.req.param("repo");
    const branch = c.req.param("branch");
    const path = c.req.param("path") || "";

    const data = await getGitHubTree(owner, repo, branch, path);
    const html = await eta.renderAsync("tree.eta", data);

    return c.html(html);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.html(
      `<html><body><h1>Error</h1><p>${errorMessage}</p></body></html>`,
      500,
    );
  }
});

app.get("/:owner/:repo/blob/:branch/:path{.*}", async (c) => {
  try {
    const owner = c.req.param("owner");
    const repo = c.req.param("repo");
    const branch = c.req.param("branch");
    const path = c.req.param("path");

    const data = await getGitHubBlob(owner, repo, branch, path);
    const html = await eta.renderAsync("blob.eta", data);

    return c.html(html);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.html(
      `<html><body><h1>Error</h1><p>${errorMessage}</p></body></html>`,
      500,
    );
  }
});

const port = parseInt(process.env.PORT || "3000", 10);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
