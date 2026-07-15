import { createAdaptorServer, serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Eta } from "eta";
import { Hono } from "hono";
import path from "node:path";
import url from "node:url";
import { createApp } from "./app.ts";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const eta = new Eta({ views: path.join(__dirname, "..", "views") });

const app = new Hono();
app.use("/static/*", serveStatic({ root: path.join(__dirname, "..", "public") }));
app.route("/", createApp(eta));

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
