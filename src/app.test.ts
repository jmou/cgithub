import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import { Eta } from "eta";
import { createApp } from "./app.ts";

// The routes exercised here redirect without scraping, so no network is needed.
const eta = new Eta({ views: path.join(import.meta.dirname, "..", "views") });
const app = createApp(eta);

describe("branch picker", () => {
  const repo = { owner: "actions", name: "deploy-pages" };
  const refs = [{ name: "main", isDefault: true }, { name: "v4" }];

  it("should keep the current view and path", () => {
    const blob = eta.render("_refs.eta", {
      repo,
      refs,
      type: "branches",
      view: "blob",
      path: "src/main.ts",
    });
    const tree = eta.render("_refs.eta", {
      repo,
      refs,
      type: "branches",
      view: "tree",
      path: "src",
    });

    assert.match(blob, /href="\/actions\/deploy-pages\/blob\/main\/src\/main.ts"/);
    assert.match(blob, /href="\/actions\/deploy-pages\/blob\/v4\/src\/main.ts"/);
    assert.match(tree, /href="\/actions\/deploy-pages\/tree\/v4\/src"/);
  });

  it("should link to the root tree without a path", () => {
    const html = eta.render("_refs.eta", { repo, refs, type: "branches", view: "tree", path: "" });

    assert.match(html, /href="\/actions\/deploy-pages\/tree\/main"/);
  });

  it("should not build ref links for views it does not serve", async () => {
    const res = await app.request("http://cgithub.example/api/a/b/refs/branches/raw/README.md");

    assert.strictEqual(res.status, 404);
  });

  it("should tell the refs endpoint where the picker was opened", () => {
    const nav = { repo, branch: "main", path: "src" };

    const blob = eta.render("_nav.eta", { ...nav, view: "blob", path: "src/main.ts" });
    assert.match(blob, /data-view="blob" data-path="src\/main.ts"/);
    assert.match(
      eta.render("_nav.eta", { ...nav, view: "tree" }),
      /data-view="tree" data-path="src"/,
    );
    assert.doesNotMatch(eta.render("_nav.eta", { ...nav, view: "tree", path: "" }), /data-path=/);
  });
});

describe("sidebar fragment", () => {
  const repo = { owner: "actions", name: "deploy-pages" };
  const languages = [{ name: "JavaScript", percentage: 100, color: "#f1e05a" }];
  const latestRelease = { tag: "v5.0.0", publishedAt: "2026-03-25T16:59:14Z" };

  // The release replaces the empty element it names, beside the release count.
  it("should render the latest release and the languages", () => {
    const html = eta.render("_sidebar.eta", { repo, languages, latestRelease });

    assert.match(html, /<span data-target="latest-release">\(<a href/);
    assert.match(html, /href="\/actions\/deploy-pages\/releases\/tag\/v5.0.0"/);
    assert.match(html, /<time class="timestamp" title="2026-03-25T16:59:14Z">2026-03-25<\/time>/);
    assert.match(html, /<div class="languages box">/);
  });

  it("should name a spot the repo page holds open", () => {
    const html = eta.render("repo.eta", {
      repo,
      branch: "main",
      path: "/",
      items: [],
      info: { description: null, website: null, stars: null, forks: null, numReleases: 38 },
    });

    assert.match(html, /<span id="latest-release"><\/span>/);
  });

  it("should render nothing when the repository has neither", () => {
    const html = eta.render("_sidebar.eta", { repo, languages: [], latestRelease: null });

    assert.strictEqual(html.trim(), "");
  });
});

describe("redirects to GitHub", () => {
  // An HTTP redirect would be caught by the extension's declarativeNetRequest
  // rules and bounced straight back here.
  it("should redirect unknown paths with a meta refresh", async () => {
    const res = await app.request("http://cgithub.example/a/b/c?x=1");

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("location"), null);
    assert.strictEqual(res.headers.get("Referrer-Policy"), "no-referrer");

    const body = await res.text();
    assert.match(
      body,
      /<meta http-equiv="refresh" content="1; url=https:\/\/github.com\/a\/b\/c\?x=1">/,
    );
    assert.doesNotMatch(body, /<script/);
  });

  // Same-origin requests are mostly subresources, which render an HTML page as
  // a broken image rather than following its refresh.
  it("should redirect over HTTP when the referer is one of our own pages", async () => {
    const res = await app.request("http://cgithub.example/a/b/c?x=1", {
      headers: { Referer: "http://cgithub.example/a/b" },
    });

    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get("location"), "https://github.com/a/b/c?x=1");
  });

  it("should use a meta refresh when the referer is another site", async () => {
    const res = await app.request("http://cgithub.example/a/b/c?x=1", {
      headers: { Referer: "https://github.example/a/b" },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("location"), null);
  });

  it("should redirect unhandled search types", async () => {
    const res = await app.request(
      "http://cgithub.example/actions/deploy-pages/search?q=x&type=code",
    );

    assert.strictEqual(res.status, 200);
    assert.match(
      await res.text(),
      /https:\/\/github.com\/actions\/deploy-pages\/search\?q=x&amp;type=code/,
    );
  });

  it("should redirect raw file requests to raw.githubusercontent.com", async () => {
    const res = await app.request("http://cgithub.example/actions/deploy-pages/raw/main/README.md");

    assert.strictEqual(res.status, 200);
    assert.match(
      await res.text(),
      /url=https:\/\/raw.githubusercontent.com\/actions\/deploy-pages\/main\/README.md"/,
    );
  });
});
