import assert from "node:assert";
import { describe, it } from "node:test";
import {
  getGitHubBlob,
  getGitHubCommits,
  getGitHubIssues,
  getGitHubPulls,
  getGitHubRelease,
  getGitHubReleases,
  getGitHubRepo,
  getGitHubOwner,
  getGitHubTree,
  GitHubHTTPError,
  RedirectError,
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
      assert.strictEqual(data.info.forks?.length, 3);
      assert.strictEqual(data.info.numReleases, 38);
      assert.strictEqual(data.info.latestReleaseTag, "v5.0.0");
      assert.ok(data.info.latestReleaseDate?.startsWith("2026-03-25"));

      assert.ok(data.items.length > 0);
      assert.ok(Object.keys(data.overviewHtml ?? {}).includes("README.md"));
    });

    it("should fetch tree", async () => {
      const data = await getGitHubTree("github", "rally", "main", "lib");

      assert.strictEqual(data.repo.owner, "github");
      assert.strictEqual(data.repo.name, "rally");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "lib");

      assert.deepStrictEqual(data.items, [
        {
          name: "README.md",
          path: "lib/README.md",
          contentType: "file",
        },
        {
          name: "RallyValidate.js",
          path: "lib/RallyValidate.js",
          contentType: "file",
        },
      ]);

      assert.ok(Object.keys(data.overviewHtml ?? {}).includes("README.md"));
    });

    it("should fetch text blob", async () => {
      const data = await getGitHubBlob("actions", "deploy-pages", "main", "LICENSE");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "LICENSE");

      assert.strictEqual(data.size, "1.04 KB / 21 lines / 17 loc");
      assert.strictEqual(data.language, "Text");
      assert.strictEqual(data.image, false);

      assert.strictEqual(data.textLines?.length, 21);
      assert.strictEqual(data.textLines[0], "MIT License");
      assert.strictEqual(data.htmlLines?.length, 21);
      assert.strictEqual(data.htmlLines[0], "MIT License");
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
      assert.strictEqual(data.image, false);

      assert.strictEqual(data.textLines?.[0], "# deploy-pages 🚀");
      assert.strictEqual(
        data.htmlLines?.[0],
        '<span class="pl-mh"># <span class="pl-en">deploy-pages 🚀</span></span>',
      );
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
      assert.strictEqual(data.image, false);

      assert.deepStrictEqual(data.textLines, ["dist/** -diff linguist-generated=true "]);
      assert.deepStrictEqual(data.htmlLines, [
        '\u003cspan class="pl-e"\u003edist\u003c/span\u003e/\u003cspan class="pl-k"\u003e**\u003c/span\u003e \u003cspan class="pl-k"\u003e-\u003c/span\u003e\u003cspan class="pl-v"\u003ediff\u003c/span\u003e \u003cspan class="pl-v"\u003elinguist-generated\u003c/span\u003e=\u003cspan class="pl-c1"\u003etrue\u003c/span\u003e ',
      ]);
      assert.strictEqual(data.htmlContent, null);
    });

    it("should fetch issues", async () => {
      const data = await getGitHubIssues("actions", "deploy-pages");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.q, undefined);

      const issue402 = data.issues.find((issue) => issue.number === 402);
      assert.ok(issue402);
      assert.strictEqual(issue402.title, "Dry Run");
      assert.strictEqual(issue402.state, "OPEN");
      assert.strictEqual(issue402.createdAt, "2025-07-03T19:07:08Z");
    });

    it("should fetch filtered issues with q", async () => {
      const data = await getGitHubIssues("actions", "deploy-pages", {
        q: "is:issue state:closed",
      });

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.q, "is:issue state:closed");
      const issue417 = data.issues.find((issue) => issue.number === 417);
      assert.ok(issue417);
      assert.strictEqual(issue417.title, "Chats");
      assert.ok(data.issues.every((issue) => issue.title !== ""));
    });

    it("should fetch pull requests", async () => {
      const data = await getGitHubPulls("actions", "deploy-pages", { q: "state:closed" });

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      const pr411 = data.pulls.find((pull) => pull.number === 411);
      assert.ok(pr411);
      assert.strictEqual(pr411.title, "update node version");
    });

    it("should fetch commits", async () => {
      const data = await getGitHubCommits("actions", "deploy-pages", "main", "");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "");

      assert.ok(data.commitGroups.length > 0);
      const firstGroup = data.commitGroups[0];
      assert.ok(firstGroup.title.length > 0);
      assert.ok(firstGroup.commits.length > 0);

      const firstCommit = firstGroup.commits[0];
      assert.ok(firstCommit.oid.length === 40);
      assert.ok(firstCommit.shortMessage.length > 0);
      assert.ok(firstCommit.authors.length > 0);
    });

    it("should fetch commits with path", async () => {
      const data = await getGitHubCommits("actions", "deploy-pages", "main", "src");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "src");

      assert.ok(data.commitGroups.length > 0);
    });

    it("should fetch releases", async () => {
      const data = await getGitHubReleases("actions", "deploy-pages");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");

      assert.ok(data.releases.length > 0);
      const firstRelease = data.releases[0];
      assert.ok(firstRelease.tagName.length > 0);
      assert.ok(firstRelease.title.match(/^v\d/));
      assert.ok(firstRelease.publishedAt.length > 0);
      assert.ok(firstRelease.bodyHtml.length > 0);
    });

    it("should fetch single release", async () => {
      const data = await getGitHubRelease("actions", "deploy-pages", "v4.0.5");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");

      assert.ok(data.release.tagName.length > 0);
      assert.ok(data.release.title.length > 0);
      assert.ok(data.release.publishedAt.length > 0);
      assert.ok(data.release.bodyHtml.length > 0);
      assert.ok(data.release.assets && data.release.assets.length >= 2);
      assert.strictEqual(data.release.assets[0].name, "Source code (zip)");
      assert.strictEqual(
        data.release.assets[0].url,
        "https://github.com/actions/deploy-pages/archive/refs/tags/v4.0.5.zip",
      );
    });
  });

  describe("dustinlyons/nixos-config repository", () => {
    it("should fetch nix blob with combined overlapping styling directives", async () => {
      const data = await getGitHubBlob("dustinlyons", "nixos-config", "main", "flake.nix");

      assert.strictEqual(data.repo.owner, "dustinlyons");
      assert.strictEqual(data.repo.name, "nixos-config");
      assert.strictEqual(data.path, "flake.nix");
      assert.strictEqual(data.image, false);
      assert.strictEqual(data.htmlContent, null);
      assert.ok(data.htmlLines !== null && data.htmlLines.length > 0);

      // Line 2 has directives [2,13,"pl-c1"] and [2,13,"pl-s1"] with identical ranges.
      // They should be combined into one span, not duplicated.
      const line2 = data.htmlLines[1];
      assert.ok(line2.includes('class="pl-c1 pl-s1"'), `expected combined classes in: ${line2}`);
      assert.ok(
        (line2.match(/description/g) ?? []).length === 1,
        `expected "description" to appear once in: ${line2}`,
      );
    });
  });

  describe("rich file types", () => {
    it("should support PNG", async () => {
      const data = await getGitHubBlob("github", "docs", "main", "assets/images/site/logo.png");

      assert.strictEqual(data.repo.owner, "github");
      assert.strictEqual(data.repo.name, "docs");
      assert.strictEqual(data.branch, "main");
      assert.strictEqual(data.path, "assets/images/site/logo.png");

      assert.strictEqual(data.size, "1.26 KB");
      assert.strictEqual(data.language, null);
      assert.strictEqual(data.image, true);
      assert.strictEqual(data.textLines, null);
      assert.strictEqual(data.htmlLines, null);
      assert.strictEqual(data.htmlContent, null);
    });
  });

  describe("owner pages", () => {
    it("should fetch user profile", async () => {
      const data = await getGitHubOwner("torvalds");

      assert.strictEqual(data.type, "user");
      assert.strictEqual(data.login, "torvalds");
      assert.strictEqual(data.name, "Linus Torvalds");
      assert.strictEqual(data.company, "Linux Foundation");
      assert.strictEqual(data.location, "Portland, OR");
      assert.ok(data.avatarUrl?.startsWith("https://avatars.githubusercontent.com/"));
      assert.ok(data.followers);
      assert.ok(data.following !== null);

      assert.ok(data.pinned.length > 0);
      const linux = data.pinned.find((repo) => repo.name === "linux");
      assert.ok(linux);
      assert.strictEqual(linux.owner, "torvalds");
      assert.strictEqual(linux.description, "Linux kernel source tree");
      assert.strictEqual(linux.language, "C");
      assert.ok(linux.stars);
      assert.ok(linux.forks);
    });

    it("should fetch user bio and links", async () => {
      const data = await getGitHubOwner("sindresorhus");

      assert.strictEqual(data.login, "sindresorhus");
      assert.ok(data.bio && data.bio.length > 0);
      assert.ok(data.links.length > 0);
      assert.ok(data.links.every((link) => link.href.startsWith("https://")));
    });

    it("should fetch organization profile", async () => {
      const data = await getGitHubOwner("github");

      assert.strictEqual(data.type, "organization");
      assert.strictEqual(data.login, "github");
      assert.strictEqual(data.name, "GitHub");
      assert.strictEqual(data.bio, "How people build software.");
      assert.strictEqual(data.location, "United States of America");
      assert.ok(data.avatarUrl?.startsWith("https://avatars.githubusercontent.com/"));
      assert.ok(data.followers);
      assert.strictEqual(data.following, null);
      assert.ok(data.links.some((link) => link.href === "https://github.com/about"));

      assert.ok(data.pinned.length > 0);
      assert.ok(data.pinned.every((repo) => repo.owner === "github"));
      assert.ok(data.pinned.some((repo) => repo.stars && repo.forks));
    });

    it("should redirect to GitHub for non-profile pages", async () => {
      await assert.rejects(getGitHubOwner("features"), (err) => {
        assert(err instanceof RedirectError, "error should be a RedirectError");
        assert.strictEqual(err.location, "https://github.com/features");
        return true;
      });
    });

    it("should throw for non-existent owner", async () => {
      await assert.rejects(getGitHubOwner("nosuchuserzzzz"), (err) => {
        assert(err instanceof GitHubHTTPError, "error should be an HTTPError");
        assert.strictEqual(err.status, 404);
        return true;
      });
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

    it("should redirect when fetching a directory as a blob", async () => {
      await assert.rejects(
        getGitHubBlob("earendil-works", "pi", "main", "packages/agent"),
        (err) => {
          assert(err instanceof RedirectError, "error should be a RedirectError");
          assert.strictEqual(err.location, "/earendil-works/pi/tree/main/packages/agent");
          return true;
        },
      );
    });

    it("should redirect when fetching a file as a tree", async () => {
      await assert.rejects(
        getGitHubTree("earendil-works", "pi", "main", "packages/agent/package.json"),
        (err) => {
          assert(err instanceof RedirectError, "error should be a RedirectError");
          assert.strictEqual(
            err.location,
            "/earendil-works/pi/blob/main/packages/agent/package.json",
          );
          return true;
        },
      );
    });
  });
});
