import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Eta } from "eta";
import { getGitHubTree } from "./scraper.js";

const app = new Hono();
const eta = new Eta({ views: "./views" });

app.use("/static/*", serveStatic({ root: "." }));

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

const port = parseInt(process.env.PORT || "3000", 10);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
