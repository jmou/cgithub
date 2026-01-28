import assert from "node:assert";
import { describe, it } from "node:test";
import {
  getGitHubBlob,
  getGitHubIssues,
  getGitHubRepo,
  getGitHubTree,
  GitHubHTTPError,
} from "./scraper.ts";

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

    it("should fetch text blob", async () => {
      const data = await getGitHubBlob("actions", "deploy-pages", "main", "LICENSE");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "LICENSE");

      assert.strictEqual(data.size, "1.04 KB / 21 lines / 17 loc");
      assert.strictEqual(data.language, "Text");
      assert.strictEqual(data.rawLines?.[0], "MIT License");
      assert.strictEqual(data.htmlContent, null);
    });

    it("should fetch Markdown blob", async () => {
      const data = await getGitHubBlob("actions", "deploy-pages", "main", "README.md");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "README.md");

      assert.strictEqual(data.size, "8.95 KB / 133 lines / 94 loc");
      assert.strictEqual(data.language, "Markdown");
      assert.strictEqual(data.rawLines, null);
      const firstLine =
        /^<article class="markdown-body entry-content container-lg" itemprop="text"><div class="markdown-heading" dir="auto"><h1 tabindex="-1" class="heading-element" dir="auto">deploy-pages 🚀<\/h1>/;
      assert.match(data.htmlContent ?? "", firstLine);
    });

    it("should fetch code blob", async () => {
      const data = await getGitHubBlob("actions", "deploy-pages", "main", ".gitattributes");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, ".gitattributes");

      assert.strictEqual(data.size, "39 Bytes / 1 lines / 1 loc");
      assert.strictEqual(data.language, "Git Attributes");
      assert.deepStrictEqual(data.rawLines, ["dist/** -diff linguist-generated=true "]);
      assert.strictEqual(data.htmlContent, null);
    });

    it("should fetch issues", async () => {
      const data = await getGitHubIssues("actions", "deploy-pages");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");

      const issue402 = data.issues.find((issue) => issue.number === 402);
      assert.ok(issue402);
      assert.strictEqual(issue402.title, "Dry Run");
      assert.strictEqual(issue402.state, "OPEN");
      assert.strictEqual(issue402.createdAt, "2025-07-03T19:07:08Z");
    });
  });

  describe("error handling", () => {
    it("should throw for non-existent repository", async () => {
      await assert.rejects(getGitHubRepo("nosuchowner", "nosuchrepo"), (err) => {
        assert(err instanceof GitHubHTTPError, "error should be an HTTPError");
        assert.strictEqual(err.status, 404);
        return true;
      });
    });
  });
});
