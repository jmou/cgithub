import assert from "node:assert";
import { describe, it } from "node:test";
import {
  getGitHubBlob,
  getGitHubCommits,
  getGitHubIssues,
  getGitHubSidebar,
  getGitHubLatestCommit,
  getGitHubPulls,
  getGitHubRaw,
  getGitHubRefs,
  getGitHubRelease,
  getGitHubReleases,
  getGitHubRepo,
  getGitHubOwner,
  getGitHubTree,
  getGitHubWiki,
  getGitHubWikiPages,
  ExternalRedirectError,
  GitHubHTTPError,
  InternalRedirectError,
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
      assert.strictEqual(data.info.numReleases, 39);

      assert.ok(data.items.length > 0);
      assert.ok(typeof data.overviewHtml?.["README.md"] === "string");
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

      assert.ok(typeof data.overviewHtml?.["README.md"] === "string");
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

      assert.strictEqual(data.size, "9.12 KB / 133 lines / 94 loc");
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

    // GitHub serves a file's history from the same route as a directory's.
    it("should fetch the history of a blob", async () => {
      const data = await getGitHubCommits("actions", "deploy-pages", "main", "src/index.js");

      assert.strictEqual(data.path, "src/index.js");

      assert.ok(data.commitGroups.length > 0);
      const commit = data.commitGroups[0].commits[0];
      assert.strictEqual(commit.oid.length, 40);
      assert.ok(commit.shortMessage.length > 0);
    });

    // What a history page's "Browse" link resolves to: the file as it stood at
    // one of its commits. Nothing in a commits payload says whether the path is
    // a file or a directory, so those links all point at the tree and rely on
    // GitHub redirecting a file's to its blob.
    it("should redirect a blob browsed at a commit to its blob view", async () => {
      const oid = "b39c421b98f49d83ae50ec502c3ddfc3bf28f2c6";

      await assert.rejects(getGitHubTree("actions", "deploy-pages", oid, "src/index.js"), (err) => {
        assert(err instanceof InternalRedirectError, "error should be an InternalRedirectError");
        assert.strictEqual(err.location, `/actions/deploy-pages/blob/${oid}/src/index.js`);
        return true;
      });

      const data = await getGitHubBlob("actions", "deploy-pages", oid, "src/index.js");

      assert.strictEqual(data.branch, oid);
      assert.strictEqual(data.path, "src/index.js");
      assert.strictEqual(data.size, "1.37 KB / 51 lines / 40 loc");
      assert.strictEqual(data.textLines?.length, 51);
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

    it("should fetch latest commit for a path", async () => {
      const data = await getGitHubLatestCommit("actions", "deploy-pages", "main", "src");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.ok(data.commit);
      assert.strictEqual(data.commit.oid.length, 40);
      assert.ok(data.commit.shortMessageHtml.length > 0);
      assert.ok(data.commit.date.length > 0);
      assert.ok(data.commit.authors.length > 0);
    });

    it("should fetch the sidebar", async () => {
      const data = await getGitHubSidebar("actions", "deploy-pages");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");

      assert.deepStrictEqual(data.languages, [
        { name: "JavaScript", percentage: 100, color: "#f1e05a" },
      ]);

      assert.strictEqual(data.latestRelease?.tag, "v5.0.1");
      assert.ok(data.latestRelease?.publishedAt?.startsWith("2026-09-01"));
    });

    it("should fetch the sidebar for a multi-language repository", async () => {
      const data = await getGitHubSidebar("rust-lang", "rust");

      const rust = data.languages.find((language) => language.name === "Rust");
      assert.ok(rust);
      assert.ok(rust.percentage > 50);
      assert.strictEqual(rust.color, "#dea584");

      // The aggregate bucket comes back without a name.
      const other = data.languages.find((language) => language.name === "Other");
      assert.ok(other);

      const total = data.languages.reduce((sum, language) => sum + language.percentage, 0);
      assert.ok(Math.abs(total - 100) < 1);
    });

    it("should fetch branches", async () => {
      const data = await getGitHubRefs("actions", "deploy-pages", "branches");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.type, "branches");

      assert.ok(data.refs.length > 0);
      const main = data.refs.find((ref) => ref.name === "main");
      assert.ok(main);
      assert.strictEqual(main.isDefault, true);
    });

    it("should fetch tags", async () => {
      const data = await getGitHubRefs("actions", "deploy-pages", "tags");

      assert.strictEqual(data.repo.owner, "actions");
      assert.strictEqual(data.repo.name, "deploy-pages");
      assert.strictEqual(data.type, "tags");

      assert.ok(data.refs.length > 0);
      const tag = data.refs.find((ref) => ref.name === "v5.0.0");
      assert.ok(tag);
      assert.ok(tag.date?.length);
      assert.strictEqual(data.hasMore, true);
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
      assert.strictEqual(data.renderFileType, null);
      assert.strictEqual(data.textLines, null);
      assert.strictEqual(data.htmlLines, null);
      assert.strictEqual(data.htmlContent, null);
    });

    // GitHub renders a PDF with a viewer of its own, so the page carries no
    // content for it beyond the file type.
    it("should support PDF", async () => {
      const data = await getGitHubBlob("mozilla", "pdf.js", "master", "test/pdfs/basicapi.pdf");

      assert.strictEqual(data.repo.owner, "mozilla");
      assert.strictEqual(data.repo.name, "pdf.js");
      assert.strictEqual(data.branch, "master");
      assert.strictEqual(data.path, "test/pdfs/basicapi.pdf");

      assert.strictEqual(data.size, "103 KB");
      assert.strictEqual(data.language, null);
      assert.strictEqual(data.image, false);
      assert.strictEqual(data.renderFileType, "pdf");
      assert.strictEqual(data.textLines, null);
      assert.strictEqual(data.htmlLines, null);
      assert.strictEqual(data.htmlContent, null);
    });

    // Why the embed route exists rather than the blob view pointing a viewer
    // at GitHub: as application/octet-stream a browser downloads the file
    // instead of displaying it.
    it("should fetch a raw PDF that GitHub types as a download", async () => {
      const response = await getGitHubRaw("mozilla", "pdf.js", "master", "test/pdfs/basicapi.pdf");

      assert.strictEqual(response.headers.get("Content-Type"), "application/octet-stream");
      assert.ok((await response.text()).startsWith("%PDF-"));
    });

    // A binary file GitHub has no preview for: no content of any kind, and the
    // path exercises escaping of a space.
    it("should support an unpreviewable binary file", async () => {
      const data = await getGitHubBlob("justrajdeep", "fonts", "master", "Times New Roman.ttf");

      assert.strictEqual(data.repo.owner, "justrajdeep");
      assert.strictEqual(data.repo.name, "fonts");
      assert.strictEqual(data.branch, "master");
      assert.strictEqual(data.path, "Times New Roman.ttf");

      assert.strictEqual(data.size, "815 KB");
      assert.strictEqual(data.language, null);
      assert.strictEqual(data.image, false);
      assert.strictEqual(data.renderFileType, null);
      assert.strictEqual(data.textLines, null);
      assert.strictEqual(data.htmlLines, null);
      assert.strictEqual(data.htmlContent, null);
    });
  });

  describe("wikis", () => {
    it("should fetch the home page a wiki serves off /wiki itself", async () => {
      const data = await getGitHubWiki("microsoft", "vscode");

      assert.strictEqual(data.repo.owner, "microsoft");
      assert.strictEqual(data.repo.name, "vscode");
      assert.strictEqual(data.title, "Home");
      assert.strictEqual(data.updatedBy, "Greg Van Liew");
      assert.strictEqual(data.updatedAt, "2019-11-22T03:08:32Z");

      assert.match(data.bodyHtml, /Welcome to the Visual Studio Code Wiki/);
      // The _Sidebar and _Footer pages this wiki defines.
      assert.match(data.sidebarHtml ?? "", /href="\/microsoft\/vscode\/wiki\/Roadmap"/);
      assert.match(data.footerHtml ?? "", /Want to contribute to this Wiki\?/);
    });

    it("should fetch a page by its slug", async () => {
      const data = await getGitHubWiki("microsoft", "vscode", "Commit-Signing");

      assert.strictEqual(data.title, "Commit Signing");
      assert.match(data.bodyHtml, /GPG/);
    });

    // The slug arrives from our route already decoded, so it has to be encoded
    // again rather than interpolated into the URL as-is.
    it("should fetch a page whose slug is not path-safe", async () => {
      const data = await getGitHubWiki(
        "microsoft",
        "vscode",
        "[DEV]-Perf-Tools-for-VS-Code-Development",
      );

      assert.strictEqual(data.title, "[DEV] Perf Tools for VS Code Development");
      assert.ok(data.bodyHtml.length > 0);
    });

    it("should fetch an older revision of a page", async () => {
      const oid = "f1c60035ba38b68ba383f58e482c312218daf86c";
      const data = await getGitHubWiki("microsoft", "vscode", "Commit-Signing", oid);

      assert.strictEqual(data.title, "Commit Signing");
      assert.strictEqual(data.updatedBy, "Joaqu\u00edn Ruales");
      assert.strictEqual(data.updatedAt, "2025-10-17T15:07:14Z");
    });

    // The sidebar list is complete; its "Show N more pages…" button only
    // unhides the rest, so no second request is needed to link every page.
    it("should collect every page from the sidebar of any page", async () => {
      const data = await getGitHubWiki("microsoft", "vscode");

      assert.ok(data.pages.length > 15);
      assert.deepStrictEqual(data.pages[0], { name: "Home", href: "/microsoft/vscode/wiki" });
      assert.ok(data.pages.some((page) => page.href === "/microsoft/vscode/wiki/Commit-Signing"));
    });

    // An archived repository, so neither its wiki nor these dates can move.
    it("should fetch the page index with its last-updated dates", async () => {
      const data = await getGitHubWikiPages("ariya", "phantomjs");

      assert.strictEqual(data.repo.owner, "ariya");
      assert.ok(data.pages.length > 1);
      assert.ok(data.pages.every((page) => page.updatedAt));

      const home = data.pages.find((page) => page.name === "Home");
      assert.ok(home);
      assert.strictEqual(home.href, "/ariya/phantomjs/wiki");
      assert.strictEqual(home.updatedAt, "2018-02-08T18:57:56Z");
    });

    it("should redirect to the repository when it has no wiki", async () => {
      await assert.rejects(getGitHubWiki("git", "git"), (err) => {
        assert(err instanceof InternalRedirectError, "error should be an InternalRedirectError");
        assert.strictEqual(err.location, "/git/git");
        return true;
      });
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

      assert.deepStrictEqual(data.repos, []);
      const navTexts = data.nav.map((item) => item.text);
      assert.deepStrictEqual(navTexts, ["Repositories", "Projects", "Packages"]);
      const reposTab = data.nav.find((item) => item.text === "Repositories");
      assert.strictEqual(reposTab?.href, "/torvalds?tab=repositories");
    });

    it("should fetch user bio and links", async () => {
      const data = await getGitHubOwner("sindresorhus");

      assert.strictEqual(data.login, "sindresorhus");
      assert.ok(data.bio && data.bio.length > 0);
      assert.ok(data.links.length > 0);
      assert.ok(data.links.every((link) => link.href.startsWith("https://")));
      assert.ok(data.nav.some((item) => item.text === "Sponsoring"));
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
      assert.ok(data.pinned.length <= 6, "pinned should not include the repository list");
      assert.ok(data.pinned.every((repo) => repo.owner === "github"));
      assert.ok(data.pinned.some((repo) => repo.stars && repo.forks));

      assert.ok(data.repos.length > 0);
      assert.ok(data.repos.every((repo) => repo.owner === "github"));

      const navTexts = data.nav.map((item) => item.text);
      assert.deepStrictEqual(navTexts, [
        "Repositories",
        "Projects",
        "Packages",
        "People",
        "Sponsoring",
      ]);
      const reposTab = data.nav.find((item) => item.text === "Repositories");
      assert.strictEqual(reposTab?.href, "/orgs/github/repositories");
    });

    it("should redirect to GitHub for non-profile pages", async () => {
      await assert.rejects(getGitHubOwner("features"), (err) => {
        assert(err instanceof ExternalRedirectError, "error should be an ExternalRedirectError");
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
          assert(err instanceof InternalRedirectError, "error should be an InternalRedirectError");
          assert.strictEqual(err.location, "/earendil-works/pi/tree/main/packages/agent");
          return true;
        },
      );
    });

    it("should redirect when fetching a file as a tree", async () => {
      await assert.rejects(
        getGitHubTree("earendil-works", "pi", "main", "packages/agent/package.json"),
        (err) => {
          assert(err instanceof InternalRedirectError, "error should be an InternalRedirectError");
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
