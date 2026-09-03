import assert from "node:assert";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";
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

describe("blob view", () => {
  const blob = {
    repo: { owner: "justrajdeep", name: "fonts" },
    branch: "master",
    path: "Times New Roman.ttf",
    language: null,
    size: "815 KB",
    image: false,
    renderFileType: null,
    textLines: null,
    htmlLines: null,
    htmlContent: null,
  };

  it("should embed a PDF", () => {
    const html = eta.render("blob.eta", {
      ...blob,
      path: "test/pdfs/basicapi.pdf",
      renderFileType: "pdf",
    });

    assert.match(html, /<object[^>]*type="application\/pdf"/);
    assert.match(html, /data="\/justrajdeep\/fonts\/embed\/pdf\/master\/test\/pdfs\/basicapi.pdf"/);
  });

  it("should not embed a file type it has no viewer for", () => {
    const html = eta.render("blob.eta", { ...blob, renderFileType: "stl" });

    assert.doesNotMatch(html, /<object/);
    assert.match(html, /This file cannot be displayed\./);
  });

  it("should give each syntax-highlighted line an anchor", () => {
    const html = eta.render("blob.eta", {
      ...blob,
      path: "src/app.ts",
      htmlLines: ['<span class="pl-k">const</span> x;', "x++;"],
    });

    assert.match(
      html,
      /<code><span id="L1"><span class="pl-k">const<\/span> x;<\/span>\n<span id="L2">x\+\+;<\/span><\/code>/,
    );
  });

  it("should give each plain-text line an anchor", () => {
    const html = eta.render("blob.eta", {
      ...blob,
      path: "notes.txt",
      textLines: ["a < b", "c"],
    });

    assert.match(html, /<code><span id="L1">a &lt; b<\/span>\n<span id="L2">c<\/span><\/code>/);
  });

  it("should offer the raw file when there is nothing to display", () => {
    const html = eta.render("blob.eta", blob);

    assert.match(html, /This file cannot be displayed\./);
    assert.match(html, /href="\/justrajdeep\/fonts\/raw\/master\/Times New Roman.ttf">View raw/);
  });
});

describe("commit history", () => {
  const repo = { owner: "actions", name: "deploy-pages" };
  const oid = "b39c421b98f49d83ae50ec502c3ddfc3bf28f2c6";
  const commitGroups = [
    {
      title: "Apr 18, 2023",
      commits: [
        { oid, shortMessage: "Remove deprecated input parameters", authors: [{ login: "jmg" }] },
      ],
    },
  ];
  const history = { repo, branch: "main", path: "src/index.js", commitGroups };

  // A commits payload never says whether its path is a file or a directory, so
  // every link goes to the tree and GitHub redirects a file's to its blob.
  it("should browse a file's history at each of its commits", () => {
    const html = eta.render("commits.eta", history);

    assert.match(html, new RegExp(`href="/actions/deploy-pages/blob/${oid}/src/index.js">Browse`));
  });

  it("should browse a directory's history the same way", () => {
    const html = eta.render("commits.eta", { ...history, path: "src" });

    assert.match(html, new RegExp(`href="/actions/deploy-pages/blob/${oid}/src">Browse`));
  });

  it("should browse the whole repository when the history has no path", () => {
    const html = eta.render("commits.eta", { ...history, path: "" });

    assert.match(html, new RegExp(`href="/actions/deploy-pages/blob/${oid}">Browse`));
  });

  // Walking up from a history stays in the history, and its last crumb is the
  // page you are already on, just as a blob or a tree ends on itself.
  it("should walk up through the history of each parent directory", () => {
    const html = eta.render("commits.eta", { ...history, path: "src/lib/index.js" });

    assert.match(html, /href="\/actions\/deploy-pages\/commits\/main">\(top\)</);
    assert.match(html, /href="\/actions\/deploy-pages\/commits\/main\/src">src</);
    assert.match(html, /href="\/actions\/deploy-pages\/commits\/main\/src\/lib">lib<\/a>\/index\.js/);
  });

  it("should say so when a path has no history", () => {
    const html = eta.render("commits.eta", { ...history, commitGroups: [] });

    assert.match(html, /No commits found\./);
  });

  it("should link a blob to its own history", () => {
    const html = eta.render("blob.eta", { ...history, textLines: ["x"] });

    assert.match(html, /href="\/actions\/deploy-pages\/commits\/main\/src\/index.js">History/);
  });
});

describe("embedded files", () => {
  function stubGitHub(t: TestContext, body: string, contentType: string, status = 200) {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(body, { status, headers: { "Content-Type": contentType } }),
    );
  }

  it("should retype a PDF GitHub sends as a download", async (t) => {
    stubGitHub(t, "%PDF-1.6", "application/octet-stream");

    const res = await app.request("http://cgithub.example/mozilla/pdf.js/embed/pdf/master/doc.pdf");

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Content-Type"), "application/pdf");
    assert.strictEqual(await res.text(), "%PDF-1.6");
  });

  it("should pass on a type GitHub already got right", async (t) => {
    stubGitHub(t, "%PDF-1.6", "application/pdf");

    const res = await app.request("http://cgithub.example/mozilla/pdf.js/embed/pdf/master/doc.pdf");

    assert.strictEqual(res.headers.get("Content-Type"), "application/pdf");
  });

  it("should not serve a file type it has no viewer for", async (t) => {
    stubGitHub(t, "<script>", "text/html");

    const res = await app.request("http://cgithub.example/mozilla/pdf.js/embed/html/master/x.html");

    assert.strictEqual(res.status, 404);
  });

  it("should pass on the status of a file GitHub does not have", async (t) => {
    stubGitHub(t, "404: Not Found", "text/plain", 404);

    const res = await app.request(
      "http://cgithub.example/mozilla/pdf.js/embed/pdf/master/nope.pdf",
    );

    assert.strictEqual(res.status, 404);
  });
});

describe("wiki", () => {
  const repo = { owner: "ariya", name: "phantomjs" };
  const page = {
    repo,
    title: "Home",
    updatedBy: "pixiuPL",
    updatedAt: "2018-02-08T18:57:56Z",
    bodyHtml: "<p>New to <strong>PhantomJS</strong>?</p>",
    sidebarHtml: null,
    footerHtml: null,
    pages: [
      { name: "Home", href: "/ariya/phantomjs/wiki" },
      { name: "API Reference WebPage", href: "/ariya/phantomjs/wiki/API-Reference-WebPage" },
    ],
  };

  it("should render the page beside who last edited it", () => {
    const html = eta.render("wiki.eta", page);

    assert.match(html, /<p>New to <strong>PhantomJS<\/strong>\?<\/p>/);
    assert.match(html, /pixiuPL edited this page/);
    assert.match(html, /<time title="2018-02-08T18:57:56Z">2018-02-08<\/time>/);
  });

  // The _Sidebar and _Footer pages a wiki can define, which GitHub renders
  // alongside every page rather than as pages of their own.
  it("should render the sidebar and footer only when the wiki has them", () => {
    // The page's own content is the last thing in its box, and the box is the
    // only one on the page.
    const bare = eta.render("wiki.eta", page);
    assert.match(bare, /New to <strong>PhantomJS<\/strong>\?<\/p>\s*<\/div>/);
    assert.doesNotMatch(bare, /Sidebar/);

    const html = eta.render("wiki.eta", {
      ...page,
      sidebarHtml: "<ul><li>nav</li></ul>",
      footerHtml: "<p>fine print</p>",
    });
    assert.match(html, /<footer>\s*<p>fine print<\/p>/);
    assert.match(html, /<header><span>Sidebar<\/span><\/header>\s*<ul><li>nav<\/li><\/ul>/);
  });

  it("should link every page of the wiki", () => {
    const html = eta.render("wiki.eta", page);

    assert.match(html, /<summary>2 pages<\/summary>/);
    assert.match(
      html,
      /href="\/ariya\/phantomjs\/wiki\/API-Reference-WebPage">API Reference WebPage/,
    );
  });

  it("should list the pages with when each was last updated", () => {
    const html = eta.render("wikiPages.eta", {
      repo,
      pages: [
        {
          name: "Home",
          href: "/ariya/phantomjs/wiki",
          updatedAt: "2018-02-08T18:57:56Z",
        },
      ],
    });

    assert.match(html, /href="\/ariya\/phantomjs\/wiki">Home/);
    assert.match(html, /<time title="2018-02-08T18:57:56Z">2018-02-08<\/time>/);
  });

  // The editor and the timestamp are scraped independently, so a page missing
  // one of them should still show the other.
  it("should render each part of the header meta it has", () => {
    assert.doesNotMatch(eta.render("wiki.eta", { ...page, updatedAt: null }), /<time/);
    assert.match(eta.render("wiki.eta", { ...page, updatedAt: null }), /pixiuPL edited this page/);
    assert.doesNotMatch(eta.render("wiki.eta", { ...page, updatedBy: null }), /edited this page/);
  });

  // GitHub reserves underscore-prefixed names for its own actions, so a page
  // can never be one; the rest of them are for signed-in users only.
  it("should not scrape a reserved wiki name as a page", async () => {
    const reserved = ["/ariya/phantomjs/wiki/_new", "/ariya/phantomjs/wiki/Home/_edit"];
    for (const path of reserved) {
      const res = await app.request(`http://cgithub.example${path}`);

      assert.strictEqual(res.status, 200);
      assert.match(await res.text(), new RegExp(`url=https://github.com${path}"`));
    }
  });

  it("should only read a revision off a path that names one", async () => {
    const res = await app.request("http://cgithub.example/ariya/phantomjs/wiki/Home/latest");

    assert.match(
      await res.text(),
      /url=https:\/\/github.com\/ariya\/phantomjs\/wiki\/Home\/latest"/,
    );
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
