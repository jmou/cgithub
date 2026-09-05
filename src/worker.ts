// Cloudflare Workers entry point. Static files under public/ are served by
// Workers Static Assets before the worker runs (see wrangler.jsonc).
import { Eta } from "eta";
import { createApp } from "./app.ts";
import { views } from "./views.generated.ts";

// Workers disallow runtime code generation, so templates are precompiled by
// scripts/build.ts and preloaded into Eta's cache here. With
// cache: true, Eta serves them from the cache and never compiles.
const eta = new Eta({ cache: true });

// Templates name each other as siblings ("./_tree") or from the views root
// ("/layouts/base.eta"); either way the name is the path under views/ that
// scripts/build.ts keyed the template by.
eta.resolvePath = (templatePath: string) => {
  let name = templatePath.replace(/^\.?\//, "");
  if (!name.endsWith(".eta")) name += ".eta";
  return name;
};

// Only reached on a cache miss, i.e. a template missing from the build.
eta.readFile = (path: string) => {
  throw new Error(`Unknown template: ${path}`);
};

for (const [name, fn] of Object.entries(views)) {
  eta.loadTemplate(name, fn);
}

export default createApp(eta);
