import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import { Eta } from "eta";
import { createApp } from "./app.ts";

// The routes exercised here redirect without scraping, so no network is needed.
const eta = new Eta({ views: path.join(import.meta.dirname, "..", "views") });
const app = createApp(eta);

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
      /<meta http-equiv="refresh" content="2; url=https:\/\/github.com\/a\/b\/c\?x=1">/,
    );
    assert.doesNotMatch(body, /<script/);
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
