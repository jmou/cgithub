import type { Eta } from "eta";
import { type Context, Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { buildCommit } from "./build.generated.ts";
import {
  getGitHubBlob,
  getGitHubCommits,
  getGitHubIssues,
  getGitHubSidebar,
  getGitHubLatestCommit,
  getGitHubOwner,
  getGitHubPulls,
  getGitHubRaw,
  getGitHubRefs,
  getGitHubRelease,
  getGitHubReleases,
  getGitHubRepo,
  getGitHubTree,
  getGitHubWiki,
  getGitHubWikiPages,
  GitHubHTTPError,
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
    // Include render data for layout.eta.
    c.setRenderer((template, data) =>
      c.html(eta.render(template, { ...data, githubUrl: githubUrlFor(c), buildCommit })),
    );
    await next();
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

  app.get("/", async (c) => {
    return c.render("home.eta");
  });

  async function tryRender<T extends object>(c: Context, template: string, promise: Promise<T>) {
    let data: T;
    try {
      data = await promise;
    } catch (e) {
      if (e instanceof RedirectError) {
        if (e.location.startsWith("https://")) {
          return redirectTo(c, e.location);
        }
        return c.redirect(e.location);
      } else if (e instanceof GitHubHTTPError) {
        c.status(e.status as StatusCode);
        const message = `GitHub responded with HTTP ${e.status} ${e.message}`;
        return c.render("error.eta", { title: e.message, message });
      } else {
        c.status(500);
        return c.render("error.eta", { message: "" + e });
      }
    }
    return c.render(template, data);
  }

  // For fragments fetched asynchronously by client-side JS (see public/static/refs.js):
  // errors render as an empty body rather than the full error.eta page.
  async function tryRenderFragment<T extends object>(
    c: Context,
    template: string,
    promise: Promise<T>,
  ) {
    let data: T;
    try {
      data = await promise;
    } catch (e) {
      const status =
        e instanceof GitHubHTTPError
          ? (e.status as StatusCode)
          : e instanceof RedirectError
            ? 404
            : 500;
      c.status(status);
      return c.body(null);
    }
    return c.render(template, data);
  }

  app.get("/:owner", async (c) => {
    const { owner } = c.req.param();
    return tryRender(c, "owner.eta", getGitHubOwner(owner));
  });

  app.get("/:owner/:repo", async (c) => {
    const { owner, repo } = c.req.param();
    return tryRender(c, "repo.eta", getGitHubRepo(owner, repo));
  });

  app.get("/:owner/:repo/tree/:branch/:path{.*}?", async (c) => {
    const { owner, repo, branch, path = "" } = c.req.param();
    return tryRender(c, "tree.eta", getGitHubTree(owner, repo, branch, path));
  });

  app.get("/:owner/:repo/blob/:branch/:path{.*}", async (c) => {
    const { owner, repo, branch, path } = c.req.param();
    return tryRender(c, "blob.eta", getGitHubBlob(owner, repo, branch, path));
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
    return tryRender(c, "wiki.eta", getGitHubWiki(owner, repo));
  });

  app.get("/:owner/:repo/wiki/_pages", async (c) => {
    const { owner, repo } = c.req.param();
    return tryRender(c, "wikiPages.eta", getGitHubWikiPages(owner, repo));
  });

  // An older revision of a page renders exactly like its current one.
  app.get("/:owner/:repo/wiki/:page/:oid", async (c) => {
    const { owner, repo, page, oid } = c.req.param();
    if (page.startsWith("_") || !/^[0-9a-f]{40}$/.test(oid)) {
      return redirectToGitHub(c);
    }
    return tryRender(c, "wiki.eta", getGitHubWiki(owner, repo, page, oid));
  });

  app.get("/:owner/:repo/wiki/:page", async (c) => {
    const { owner, repo, page } = c.req.param();
    if (page.startsWith("_")) {
      return redirectToGitHub(c);
    }
    return tryRender(c, "wiki.eta", getGitHubWiki(owner, repo, page));
  });

  app.get("/:owner/:repo/issues", async (c) => {
    const { owner, repo } = c.req.param();
    const q = c.req.query("q");

    // GitHub supports combined issue/PR search, apparently for legacy. We just
    // redirect to issue-only search.
    if (q && !/\bis:issue\b/.test(q)) {
      return c.redirect(`/${owner}/${repo}/issues?q=${encodeURIComponent(`is:issue ${q}`)}`);
    }

    return tryRender(c, "issues.eta", getGitHubIssues(owner, repo, { q }));
  });

  app.get("/:owner/:repo/pulls", async (c) => {
    const { owner, repo } = c.req.param();
    const q = c.req.query("q");
    return tryRender(c, "pulls.eta", getGitHubPulls(owner, repo, { q }));
  });

  app.get("/:owner/:repo/search", async (c) => {
    const { owner, repo } = c.req.param();
    const q = c.req.query("q") ?? "";
    const type = c.req.query("type") ?? "issues";

    if (type === "issues") {
      return c.redirect(`/${owner}/${repo}/issues?q=${encodeURIComponent(q)}`);
    } else if (type === "pullrequests") {
      return c.redirect(`/${owner}/${repo}/pulls?q=${encodeURIComponent(q)}`);
    }

    // Redirect unhandled search types (like code, which requires sign in anyway).
    return redirectToGitHub(c);
  });

  app.get("/:owner/:repo/commits/:branch/:path{.*}?", async (c) => {
    const { owner, repo, branch, path = "" } = c.req.param();
    return tryRender(c, "commits.eta", getGitHubCommits(owner, repo, branch, path));
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
    const refs = getGitHubRefs(owner, repo, type).then((data) => ({ ...data, view, path }));
    return tryRenderFragment(c, "_refs.eta", refs);
  });

  app.get("/api/:owner/:repo/latest-commit/:branch/:path{.*}?", async (c) => {
    const { owner, repo, branch, path = "" } = c.req.param();
    return tryRenderFragment(
      c,
      "_latestCommit.eta",
      getGitHubLatestCommit(owner, repo, branch, path),
    );
  });

  app.get("/api/:owner/:repo/sidebar", async (c) => {
    const { owner, repo } = c.req.param();
    return tryRenderFragment(c, "_sidebar.eta", getGitHubSidebar(owner, repo));
  });

  app.get("/:owner/:repo/releases/tag/:tag", async (c) => {
    const { owner, repo, tag } = c.req.param();
    return tryRender(c, "release.eta", getGitHubRelease(owner, repo, tag));
  });

  app.get("/:owner/:repo/releases", async (c) => {
    const { owner, repo } = c.req.param();
    return tryRender(c, "releases.eta", getGitHubReleases(owner, repo));
  });

  app.all("*", async (c) => {
    return redirectToGitHub(c);
  });

  return app;
}
