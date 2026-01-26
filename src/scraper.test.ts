import assert from "node:assert";
import { describe, it } from "node:test";
import { getGitHubBlob, getGitHubRepo, getGitHubTree } from "./scraper.ts";

describe("GitHub scraper", () => {
  describe("actions/deploy-pages repository", () => {
    it("should fetch repository", async () => {
      const data = await getGitHubRepo("actions", "deploy-pages");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "/");

      assert.strictEqual(
        data.info.description,
        "GitHub Action to publish artifacts to GitHub Pages for deployments",
      );
      assert.strictEqual(data.info.website, "https://pages.github.com");
      assert.strictEqual(data.info.stars?.length, 3);
      assert.strictEqual(data.info.watchers?.length, 2);
      assert.strictEqual(data.info.forks?.length, 3);
      assert.strictEqual(data.info.numReleases, 36);

      assert.ok(data.items.length > 0);
      assert.ok(Object.keys(data.overviewHtml ?? {}).includes("README.md"));
    });

    it("should fetch tree", async () => {
      const data = await getGitHubTree("actions", "deploy-pages", "main", "src");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "src");

      assert.deepStrictEqual(data.items, [
        {
          name: "__tests__",
          path: "src/__tests__",
          contentType: "directory",
        },
        {
          name: "internal",
          path: "src/internal",
          contentType: "directory",
        },
        {
          name: "index.js",
          path: "src/index.js",
          contentType: "file",
        },
      ]);
    });

    it("should fetch blob", async () => {
      const data = await getGitHubBlob("actions", "deploy-pages", "main", "LICENSE");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "LICENSE");

      assert.strictEqual(data.size, 1068);
      assert.strictEqual(data.language, "Text");
      assert.match(data.rawContent, /^MIT License\n\n/);
      assert.match(data.content, /^MIT License\n\n/);
    });
  });
});
