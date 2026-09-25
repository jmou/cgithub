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

describe("repository navigation", () => {
  const releases = { repo: { owner: "torvalds", name: "linux" }, releases: [] };

  it("should only link to the tabs GitHub shows", () => {
    const html = eta.render("releases.eta", { ...releases, tabs: ["code", "actions", "wiki"] });

    assert.match(html, /href="\/torvalds\/linux\/wiki"/);
    assert.doesNotMatch(html, /href="\/torvalds\/linux\/issues"/);
    assert.doesNotMatch(html, /href="\/torvalds\/linux\/pulls"/);
    assert.doesNotMatch(html, /href="\/torvalds\/linux\/discussions"/);
  });

  it("should link to every tab without GitHub's navigation to go by", () => {
    const html = eta.render("releases.eta", { ...releases, tabs: null });

    assert.match(html, /href="\/torvalds\/linux\/issues"/);
    assert.match(html, /href="\/torvalds\/linux\/wiki"/);
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
    assert.match(
      html,
      /href="\/actions\/deploy-pages\/commits\/main\/src\/lib">lib<\/a>\/index\.js/,
    );
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

describe("issues", () => {
  const repo = { owner: "cli", name: "cli" };
  const label = { name: "bug", color: "d73a4a", description: "Something isn't working" };
  const issue = {
    repo,
    number: 10000,
    titleHtml: "<code>--allow-forking=false</code> not interpreted correctly",
    state: "CLOSED",
    stateReason: "NOT_PLANNED",
    createdAt: "2024-12-03T23:01:40Z",
    labels: [label],
    assignees: ["BagToad"],
    milestone: { title: "gh v2.64", href: "/cli/cli/milestone/42" },
    body: {
      anchor: "issue-2716088121",
      author: "celloza",
      association: null,
      createdAt: "2024-12-03T23:01:40Z",
      bodyHtml: "<p>Forking is disabled.</p>",
    },
    timeline: [
      {
        kind: "comment",
        anchor: "issuecomment-2517193151",
        author: "BagToad",
        association: "Member",
        createdAt: "2024-12-06T20:49:46Z",
        bodyHtml: "<p>Working as intended.</p>",
      },
      {
        kind: "event",
        anchor: "event-15562412541",
        actor: "BagToad",
        createdAt: "2024-12-06T20:49:46Z",
        description: "added the",
        label,
        link: null,
      },
      {
        kind: "event",
        anchor: "",
        actor: "BagToad",
        createdAt: "2024-12-06T20:49:46Z",
        description: "closed this as not planned",
        label: null,
        link: null,
      },
    ],
    hiddenItems: 0,
  };

  it("should render the state and labels of every row of a list", () => {
    const rows = [
      {
        number: 10000,
        title: "Forking is disabled",
        state: "CLOSED",
        createdAt: "2024-12-03T23:01:40Z",
        labels: [label],
      },
      {
        number: 10001,
        title: "Add a flag",
        state: "OPEN",
        createdAt: "2024-12-04T10:00:00Z",
        labels: [],
      },
    ];

    const issues = eta.render("issues.eta", { repo, issues: rows });
    assert.match(issues, /<span class="pill state state-closed">Closed<\/span>/);
    assert.match(issues, /<span class="pill state state-open">Open<\/span>/);
    assert.match(issues, /<a href="\/cli\/cli\/issues\/10000">\s+Forking is disabled/);
    assert.match(issues, /<span class="pill-dot" style="background: #d73a4a"><\/span>bug/);

    // A pull request is also merged or a draft, and links to its own page.
    const pulls = eta.render("pulls.eta", {
      repo,
      pulls: [
        { ...rows[0], state: "MERGED" },
        { ...rows[1], state: "DRAFT" },
      ],
    });
    assert.match(pulls, /<span class="pill state state-merged">Merged<\/span>/);
    assert.match(pulls, /<span class="pill state state-draft">Draft<\/span>/);
    assert.match(pulls, /<a href="\/cli\/cli\/pull\/10000">/);
  });

  it("should render the issue above its timeline", () => {
    const html = eta.render("issue.eta", issue);

    assert.match(html, /<title>cli\/cli - issues\/10000<\/title>/);
    assert.match(html, /<h2><code>--allow-forking=false<\/code> not interpreted correctly<\/h2>/);
    assert.match(html, /#10000/);
    assert.match(html, /<span class="pill state state-closed">Closed as not planned<\/span>/);
    assert.match(html, /<div class="box comment" id="issue-2716088121">\s*<header>\s*<span>\s*<a href="\/celloza">celloza<\/a>/);
    assert.match(html, /<div class="box comment" id="issuecomment-2517193151">/);
    assert.match(html, /<span class="pill">Member<\/span>/);
    // The search box searches issues from an issue.
    assert.match(html, /<option value="issues" selected>/);
  });

  it("should render the labels, assignees, and milestone beside the state", () => {
    const html = eta.render("issue.eta", issue);

    assert.match(html, /<span class="pill-dot" style="background: #d73a4a"><\/span>bug/);
    assert.match(html, /title="Something isn&#39;t working"/);
    assert.match(html, /assigned to\s+<a href="\/BagToad">BagToad<\/a>/);
    assert.match(html, /milestone <a href="\/cli\/cli\/milestone\/42">gh v2.64<\/a>/);
  });

  // Events are a line each, rather than a box like the comments around them.
  it("should render an event per timeline entry that is not a comment", () => {
    const html = eta.render("issue.eta", issue);

    assert.match(html, /<div class="issue-event" id="event-15562412541">/);
    assert.match(html, /<div class="issue-event">/);
    assert.match(html, /added the <span class="pill"[^>]*>.*<\/span>\s+label/);
    assert.match(html, /closed this as not planned/);
  });

  it("should link timestamps to their comment or event", () => {
    const html = eta.render("issue.eta", issue);

    assert.match(html, /<a href="#issue-2716088121"><time/);
    assert.match(html, /<a href="#issuecomment-2517193151"><time/);
    assert.match(html, /<a href="#event-15562412541"><time/);
  });

  it("should say what GitHub keeps to itself", () => {
    assert.match(
      eta.render("issue.eta", { ...issue, hiddenItems: 8 }),
      /8 later\s+comments and events are only on GitHub\./,
    );
    assert.match(
      eta.render("issue.eta", { ...issue, hiddenItems: 1 }),
      /1 later\s+comment or event is only on GitHub\./,
    );
  });

  // GitHub's own actions live where a number goes, so they are not ours.
  it("should only scrape an issue path that names a number", async () => {
    const res = await app.request("http://cgithub.example/cli/cli/issues/new");

    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /url=https:\/\/github.com\/cli\/cli\/issues\/new"/);
  });
});

describe("discussions", () => {
  const repo = { owner: "jj-vcs", name: "jj" };
  const categories = [
    { slug: "general", name: "General", emoji: "\u{1F4AC}" },
    { slug: "q-a", name: "Q&A", emoji: "\u{1F64F}" },
  ];
  const comment = {
    anchor: "discussioncomment-2258263",
    author: "martinvonz",
    createdAt: "2022-02-26T21:56:47Z",
    labels: ["Maintainer"],
    bodyHtml: "<p>Good point.</p>",
    hiddenReason: null,
    isAnswer: false,
    replies: [],
    hiddenReplies: 0,
  };
  const discussion = {
    repo,
    number: 88,
    titleHtml: "&quot;at least&quot; .DS_Store was added back",
    author: "arxanas",
    category: categories[1],
    answerAnchor: null,
    body: { ...comment, anchor: "discussion-3903561", author: "arxanas" },
    comments: [comment],
  };

  it("should link every category beside the list", () => {
    const html = eta.render("discussions.eta", {
      repo,
      categories,
      category: categories[1],
      discussions: [],
      q: "hooks",
    });

    assert.match(html, /href="\/jj-vcs\/jj\/discussions">All<\/a>/);
    assert.match(html, /href="\/jj-vcs\/jj\/discussions\/categories\/q-a">\u{1F64F} Q&amp;A<\/a>/u);
    // The search box keeps the query the list was narrowed by.
    assert.match(html, /<input id="search-input"[^>]*value="hooks">/);
    assert.match(html, /<option value="discussions" selected>/);
    assert.match(html, /No discussions found\./);
  });

  it("should render a row per discussion", () => {
    const html = eta.render("discussions.eta", {
      repo,
      categories,
      category: null,
      discussions: [
        {
          number: 3549,
          titleHtml: "Feedback for <code>advance-branches</code>",
          author: "emesterhazy",
          createdAt: "2024-04-20T14:32:15Z",
          category: categories[0],
          answered: true,
        },
      ],
    });

    assert.match(html, /href="\/jj-vcs\/jj\/discussions\/3549">Feedback for <code>/);
    assert.match(html, /href="\/jj-vcs\/jj\/discussions\/categories\/general">General<\/a>/);
    assert.match(html, /<span class="answered pill">Answered<\/span>/);
    assert.match(html, /<time title="2024-04-20T14:32:15Z">2024-04-20<\/time>/);
  });

  it("should render the discussion above its comments", () => {
    const html = eta.render("discussion.eta", discussion);

    assert.match(html, /<title>jj-vcs\/jj - discussions\/88<\/title>/);
    assert.match(html, /<h2>&quot;at least&quot; \.DS_Store was added back<\/h2>/);
    assert.match(
      html,
      /#88\s+in <a href="\/jj-vcs\/jj\/discussions\/categories\/q-a">Q&amp;A<\/a>/,
    );
    // The author is named on the body comment, not in the header.
    assert.match(html, /<a href="\/arxanas">arxanas<\/a>/);
    assert.match(html, /<div class="box comment" id="discussion-3903561">/);
    // The timestamp is the comment's permalink.
    assert.match(
      html,
      /<a href="#discussioncomment-2258263"><time title="2022-02-26T21:56:47Z">2022-02-26<\/time><\/a>/,
    );
    assert.match(html, /<div class="box comment" id="discussioncomment-2258263">/);
    assert.match(html, /<span class="pill">Maintainer<\/span>/);
  });

  // The answer is called out both in the header, which links down to it, and
  // on the comment itself.
  it("should mark the comment that answered the discussion", () => {
    const html = eta.render("discussion.eta", {
      ...discussion,
      answerAnchor: "discussioncomment-2258263",
      comments: [{ ...comment, isAnswer: true }],
    });

    assert.match(html, /<a class="answered pill" href="#discussioncomment-2258263">Answered<\/a>/);
    assert.match(html, /<div class="box comment answer" id="discussioncomment-2258263">/);
    assert.match(html, /<span class="answered pill">Answer<\/span>/);
  });

  it("should run replies on from the comment they answer", () => {
    const html = eta.render("_discussionComment.eta", {
      comment: {
        ...comment,
        hiddenReplies: 5,
        replies: [{ ...comment, anchor: "discussioncomment-2258264", author: "arxanas" }],
      },
    });

    assert.match(
      html,
      /<div class="box reply placeholder">\s+5 earlier\s+replies are only on GitHub\./,
    );
    assert.match(html, /<div class="box comment reply" id="discussioncomment-2258264">/);
  });

  // A comment GitHub collapsed has nothing to show but why it was collapsed.
  it("should render a hidden comment as its reason", () => {
    const html = eta.render("_discussionComment.eta", {
      comment: {
        ...comment,
        author: null,
        createdAt: null,
        labels: [],
        bodyHtml: "",
        hiddenReason: "This comment has been hidden.",
      },
    });

    assert.match(html, /<div class="box comment" id="discussioncomment-2258263">/);
    assert.match(html, /<div class="placeholder">This comment has been hidden\.<\/div>/);
    assert.doesNotMatch(html, /<header>/);
    assert.doesNotMatch(html, /ghost/);
  });

  it("should send a discussions search to the discussion list", async () => {
    const res = await app.request(
      "http://cgithub.example/jj-vcs/jj/search?q=hooks&type=discussions",
    );

    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get("location"), "/jj-vcs/jj/discussions?discussions_q=hooks");
  });

  // GitHub's own actions live where a number goes, so they are not ours.
  it("should only scrape a discussion path that names a number", async () => {
    const res = await app.request("http://cgithub.example/jj-vcs/jj/discussions/new");

    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /url=https:\/\/github.com\/jj-vcs\/jj\/discussions\/new"/);
  });
});

describe("global search", () => {
  it("should keep the rest of the query around the qualifier", async () => {
    const res = await app.request(
      "http://cgithub.example/search?q=" +
        encodeURIComponent("is:issue repo:actions/deploy-pages label:bug") +
        "&type=issues",
    );

    assert.strictEqual(
      res.headers.get("location"),
      "/actions/deploy-pages/search?q=is%3Aissue+label%3Abug&type=issues",
    );
  });

  it("should redirect searches it cannot scope to a repository", async () => {
    for (const url of [
      "http://cgithub.example/search?q=dms&type=code",
      // An owner-wide search is not a single repository.
      "http://cgithub.example/search?q=" +
        encodeURIComponent("org:nix-community dms") +
        "&type=code",
      // Without a type there is no search to hand over.
      "http://cgithub.example/search?q=" + encodeURIComponent("repo:actions/deploy-pages dms"),
    ]) {
      const res = await app.request(url);

      assert.strictEqual(res.status, 200, url);
      assert.match(await res.text(), /url=https:\/\/github.com\/search\?/);
    }
  });
});

describe("redirects to GitHub", () => {
  // An HTTP redirect would be caught by the extension's declarativeNetRequest
  // rules and bounced straight back here.
  it("should redirect unknown paths with a meta refresh", async () => {
    const res = await app.request("http://cgithub.example/a/b/c?x=1");

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("location"), null);

    const body = await res.text();
    assert.match(body, /<meta name="referrer" content="no-referrer">/);
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
    assert.strictEqual(res.headers.get("Referrer-Policy"), "no-referrer");
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

  it("should redirect notifications without scraping them as a profile", async () => {
    const res = await app.request("http://cgithub.example/notifications?query=is%3Aunread");

    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /url=https:\/\/github.com\/notifications\?query=is%3Aunread"/);
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

describe("error page", () => {
  it("should render inside the page shell", () => {
    const html = eta.render("error.eta", {
      title: "Not Found",
      message: "GitHub responded with HTTP 404 Not Found",
      buildCommit: "v0-g1234567",
      githubUrl: "https://github.com/actions/deploy-pages",
    });

    assert.match(html, /<title>Not Found<\/title>/);
    assert.match(html, /GitHub responded with HTTP 404 Not Found/);
    assert.match(html, /<footer>Generated by cgithub commit <code>v0-g1234567<\/code>/);
    assert.match(html, /href="https:\/\/github.com\/actions\/deploy-pages"/);
  });

  // The title falls back to the message for errors that carry no status text.
  it("should title itself with the message when it has no title", () => {
    const html = eta.render("error.eta", { message: "Error: boom" });

    assert.match(html, /<title>Error: boom<\/title>/);
  });
});
