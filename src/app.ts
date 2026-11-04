import type { Eta } from "eta";
import { type Context, Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { buildCommit } from "./build.generated.ts";
import {
  getGitHubBlob,
  getGitHubCommits,
  getGitHubDiscussion,
  getGitHubDiscussions,
  getGitHubIssue,
  getGitHubIssues,
  getGitHubSidebar,
  getGitHubLatestCommit,
  getGitHubOrgDiscussion,
  getGitHubOrgDiscussions,
  getGitHubOrgRepositories,
  getGitHubOwner,
  getGitHubPulls,
  getGitHubRaw,
  getGitHubRefs,
  getGitHubRelease,
  getGitHubReleases,
  getGitHubRepo,
  getGitHubTree,
  getGitHubUserRepositories,
  getGitHubWiki,
  getGitHubWikiPages,
  ExternalRedirectError,
  GitHubHTTPError,
  InternalRedirectError,
  RedirectError,
} from "./scraper.ts";

declare module "hono" {
  interface ContextRenderer {
    (template: string, data?: object): Response;
  }
}

function githubUrlFor(c: Context) {
  const { pathname, search } = new URL(c.req.url);
  return `https://github.com${pathname}${search}`;
}

export function createApp(eta: Eta) {
  const app = new Hono();

  app.use(async (c, next) => {
    // Include render data for views/layouts/base.eta.
    c.setRenderer((template, data) =>
      c.html(eta.render(template, { ...data, githubUrl: githubUrlFor(c), buildCommit })),
    );
    await next();
    // Keep pages out of search results and caches; public/robots.txt asks
    // crawlers not to fetch them. public/_headers covers static files.
    c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  });

  // Redirect off-domain.
  function redirectTo(c: Context, location: string) {
    const referer = c.req.header("Referer");
    // If we are the referer, redirect directly so we can hotlink resources
    // (e.g., <img> in README).
    if (referer && URL.parse(referer)?.origin === new URL(c.req.url).origin) {
      c.header("Referrer-Policy", "no-referrer");
      return c.redirect(location);
    }

    // Otherwise use a meta refresh to make ourself the initiator. This will
    // avoid redirect loops if we are part of excludedInitiatorDomains in a
    // declarativeNetRequest.
    return c.render("redirect.eta", { location });
  }

  function redirectToGitHub(c: Context) {
    return redirectTo(c, githubUrlFor(c));
  }

  app.onError((e, c) => {
    // Fragments fetched asynchronously by client-side JS (see public/static/refs.js)
    // fail as an empty body rather than the full error.eta page.
    if (c.req.path.startsWith("/api/")) {
      c.status(
        e instanceof GitHubHTTPError
          ? (e.status as StatusCode)
          : e instanceof RedirectError
            ? 404
            : 500,
      );
      return c.body(null);
    }

    if (e instanceof InternalRedirectError) return c.redirect(e.location);
    if (e instanceof ExternalRedirectError) return redirectTo(c, e.location);
    if (e instanceof GitHubHTTPError) {
      c.status(e.status as StatusCode);
      const message = `GitHub responded with HTTP ${e.status} ${e.message}`;
      return c.render("error.eta", { title: e.message, message });
    }
    c.status(500);
    return c.render("error.eta", { message: "" + e });
  });

  app.get("/", async (c) => {
    return c.render("home.eta");
  });

  // Exclusion that immediately redirects to GitHub.
  app.get("/notifications", async (c) => {
    return redirectToGitHub(c);
  });

  // GitHub's global search, which we only serve when it is scoped to a single
  // repository: strip the qualifier and let that repository's search route
  // decide what to do with the rest.
  app.get("/search", async (c) => {
    const q = c.req.query("q") ?? "";
    const type = c.req.query("type");

    const repoQualifier = /(?:^|\s)repo:([^/\s]+)\/([^/\s]+)(?=\s|$)/.exec(q);
    if (type && repoQualifier) {
      const [qualifier, owner, repo] = repoQualifier;
      const rest =
        q.slice(0, repoQualifier.index) + q.slice(repoQualifier.index + qualifier.length);
      const params = new URLSearchParams({ q: rest.trim(), type });
      return c.redirect(`/${owner}/${repo}/search?${params}`);
    }

    return redirectToGitHub(c);
  });

  // Profile tabs are a query parameter on user pages. The repositories tab
  // is only the first, unfiltered page; anything else is left to GitHub.
  app.get("/:owner", async (c) => {
    const { owner } = c.req.param();
    const { tab, ...filters } = c.req.query();
    if (tab === undefined || tab === "overview") {
      return c.render("owner.eta", await getGitHubOwner(owner));
    }
    if (tab === "repositories" && Object.keys(filters).length === 0) {
      return c.render("owner.eta", await getGitHubUserRepositories(owner));
    }
    return redirectToGitHub(c);
  });

  // An organization's repositories tab, only the first, unfiltered page.
  app.get("/orgs/:org/repositories", async (c) => {
    const { org } = c.req.param();
    if (new URL(c.req.url).search) {
      return redirectToGitHub(c);
    }
    return c.render("owner.eta", await getGitHubOrgRepositories(org));
  });

  app.get("/:owner/:repo", async (c) => {
    const { owner, repo } = c.req.param();
    return c.render("repo.eta", await getGitHubRepo(owner, repo));
  });

  app.get("/:owner/:repo/tree/:branch/:path{.*}?", async (c) => {
    const { owner, repo, branch, path = "" } = c.req.param();
    return c.render("tree.eta", await getGitHubTree(owner, repo, branch, path));
  });

  app.get("/:owner/:repo/blob/:branch/:path{.*}", async (c) => {
    const { owner, repo, branch, path } = c.req.param();
    return c.render("blob.eta", await getGitHubBlob(owner, repo, branch, path));
  });

  app.get("/:owner/:repo/raw/:branch/:path{.*}", async (c) => {
    const { owner, repo, branch, path } = c.req.param();
    return redirectTo(c, `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
  });

  // This is not a native GitHub route, but instead it lets us render blob
  // content whose raw headers prevent hotlinking.
  app.get("/:owner/:repo/embed/:type/:branch/:path{.*}", async (c) => {
    const { owner, repo, type, branch, path } = c.req.param();

    if (type !== "pdf") {
      return c.notFound();
    }

    let response: Response;
    try {
      response = await getGitHubRaw(owner, repo, branch, path);
    } catch (e) {
      c.status(e instanceof GitHubHTTPError ? (e.status as StatusCode) : 500);
      return c.body(null);
    }

    let contentType = response.headers.get("Content-Type");
    if (contentType === null || contentType === "application/octet-stream") {
      contentType = "application/pdf";
    }

    return new Response(response.body, { headers: { "Content-Type": contentType } });
  });

  // GitHub's own wiki URLs, in the order it resolves them: names beginning with
  // an underscore are reserved for its actions (_pages, _new, _edit, ...), so a
  // page can never be mistaken for one.
  app.get("/:owner/:repo/wiki", async (c) => {
    const { owner, repo } = c.req.param();
    return c.render("wiki.eta", await getGitHubWiki(owner, repo));
  });

  app.get("/:owner/:repo/wiki/_pages", async (c) => {
    const { owner, repo } = c.req.param();
    return c.render("wikiPages.eta", await getGitHubWikiPages(owner, repo));
  });

  // An older revision of a page renders exactly like its current one.
  app.get("/:owner/:repo/wiki/:page/:oid", async (c) => {
    const { owner, repo, page, oid } = c.req.param();
    if (page.startsWith("_") || !/^[0-9a-f]{40}$/.test(oid)) {
      return redirectToGitHub(c);
    }
    return c.render("wiki.eta", await getGitHubWiki(owner, repo, page, oid));
  });

  app.get("/:owner/:repo/wiki/:page", async (c) => {
    const { owner, repo, page } = c.req.param();
    if (page.startsWith("_")) {
      return redirectToGitHub(c);
    }
    return c.render("wiki.eta", await getGitHubWiki(owner, repo, page));
  });

  app.get("/:owner/:repo/issues", async (c) => {
    const { owner, repo } = c.req.param();
    const q = c.req.query("q");

    // GitHub supports combined issue/PR search, apparently for legacy. We just
    // redirect to issue-only search.
    if (q && !/\bis:issue\b/.test(q)) {
      return c.redirect(`/${owner}/${repo}/issues?q=${encodeURIComponent(`is:issue ${q}`)}`);
    }

    return c.render("issues.eta", await getGitHubIssues(owner, repo, { q }));
  });

  // GitHub puts its own actions (new, assigned, ...) where a number goes, so
  // anything that isn't one is not an issue of ours to render.
  app.get("/:owner/:repo/issues/:number", async (c) => {
    const { owner, repo, number } = c.req.param();
    if (!/^\d+$/.test(number)) {
      return redirectToGitHub(c);
    }
    return c.render("issue.eta", await getGitHubIssue(owner, repo, Number(number)));
  });

  app.get("/:owner/:repo/pulls", async (c) => {
    const { owner, repo } = c.req.param();
    const q = c.req.query("q");
    return c.render("pulls.eta", await getGitHubPulls(owner, repo, { q }));
  });

  // Organization discussions are kept in one of the organization's
  // repositories, and render as that repository's.
  app.get("/orgs/:org/discussions", async (c) => {
    const { org } = c.req.param();
    const q = c.req.query("discussions_q");
    return c.render("discussions.eta", await getGitHubOrgDiscussions(org, { q }));
  });

  app.get("/orgs/:org/discussions/categories/:category", async (c) => {
    const { org, category } = c.req.param();
    const q = c.req.query("discussions_q");
    return c.render("discussions.eta", await getGitHubOrgDiscussions(org, { q, category }));
  });

  app.get("/orgs/:org/discussions/:number", async (c) => {
    const { org, number } = c.req.param();
    if (!/^\d+$/.test(number)) {
      return redirectToGitHub(c);
    }
    return c.render("discussion.eta", await getGitHubOrgDiscussion(org, Number(number)));
  });

  app.get("/:owner/:repo/discussions", async (c) => {
    const { owner, repo } = c.req.param();
    const q = c.req.query("discussions_q");
    return c.render("discussions.eta", await getGitHubDiscussions(owner, repo, { q }));
  });

  app.get("/:owner/:repo/discussions/categories/:category", async (c) => {
    const { owner, repo, category } = c.req.param();
    const q = c.req.query("discussions_q");
    return c.render("discussions.eta", await getGitHubDiscussions(owner, repo, { q, category }));
  });

  // GitHub puts its own actions (new, categories, ...) where a number goes, so
  // anything that isn't one is not a discussion of ours to render.
  app.get("/:owner/:repo/discussions/:number", async (c) => {
    const { owner, repo, number } = c.req.param();
    if (!/^\d+$/.test(number)) {
      return redirectToGitHub(c);
    }
    return c.render("discussion.eta", await getGitHubDiscussion(owner, repo, Number(number)));
  });

  app.get("/:owner/:repo/search", async (c) => {
    const { owner, repo } = c.req.param();
    const q = c.req.query("q") ?? "";
    const type = c.req.query("type") ?? "issues";

    if (type === "issues") {
      return c.redirect(`/${owner}/${repo}/issues?q=${encodeURIComponent(q)}`);
    } else if (type === "pullrequests") {
      return c.redirect(`/${owner}/${repo}/pulls?q=${encodeURIComponent(q)}`);
    } else if (type === "discussions") {
      return c.redirect(`/${owner}/${repo}/discussions?discussions_q=${encodeURIComponent(q)}`);
    }

    // Redirect unhandled search types (like code, which requires sign in anyway).
    return redirectToGitHub(c);
  });

  app.get("/:owner/:repo/commits/:branch/:path{.*}?", async (c) => {
    const { owner, repo, branch, path = "" } = c.req.param();
    return c.render("commits.eta", await getGitHubCommits(owner, repo, branch, path));
  });

  // Internal endpoints fetched asynchronously by client-side JS, not meant to
  // be visited directly. Keep the site's initial page loads plain server-
  // rendered HTML while still surfacing data (branches/tags, latest commit)
  // that would otherwise require an extra scrape on every page view.
  // The view and path are where the picker was opened, so each ref can link to
  // the same page on another ref.
  app.get("/api/:owner/:repo/refs/:type/:view/:path{.*}?", async (c) => {
    const { owner, repo, type, view, path = "" } = c.req.param();
    if (type !== "branches" && type !== "tags") {
      return c.notFound();
    }
    if (view !== "tree" && view !== "blob" && view !== "commits") {
      return c.notFound();
    }
    const refs = await getGitHubRefs(owner, repo, type);
    return c.render("_refs.eta", { ...refs, view, path });
  });

  app.get("/api/:owner/:repo/latest-commit/:branch/:path{.*}?", async (c) => {
    const { owner, repo, branch, path = "" } = c.req.param();
    return c.render("_latestCommit.eta", await getGitHubLatestCommit(owner, repo, branch, path));
  });

  app.get("/api/:owner/:repo/sidebar", async (c) => {
    const { owner, repo } = c.req.param();
    return c.render("_sidebar.eta", await getGitHubSidebar(owner, repo));
  });

  app.get("/:owner/:repo/releases/tag/:tag", async (c) => {
    const { owner, repo, tag } = c.req.param();
    return c.render("release.eta", await getGitHubRelease(owner, repo, tag));
  });

  app.get("/:owner/:repo/releases", async (c) => {
    const { owner, repo } = c.req.param();
    return c.render("releases.eta", await getGitHubReleases(owner, repo));
  });

  app.all("*", async (c) => {
    return redirectToGitHub(c);
  });

  return app;
}
