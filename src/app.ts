import type { Eta } from "eta";
import { type Context, Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import {
  getGitHubBlob,
  getGitHubCommits,
  getGitHubIssues,
  getGitHubLanguages,
  getGitHubLatestCommit,
  getGitHubOwner,
  getGitHubPulls,
  getGitHubRefs,
  getGitHubRelease,
  getGitHubReleases,
  getGitHubRepo,
  getGitHubTree,
  GitHubHTTPError,
  RedirectError,
} from "./scraper.ts";

export function createApp(eta: Eta) {
  const app = new Hono();

  app.get("/", async (c) => {
    return c.html(eta.render("home.eta", {}));
  });

  async function tryRender<T extends object>(c: Context, template: string, promise: Promise<T>) {
    let data: T;
    try {
      data = await promise;
    } catch (e) {
      if (e instanceof RedirectError) {
        if (e.location.startsWith("https://")) {
          c.header("Referrer-Policy", "no-referrer");
        }
        return c.redirect(e.location);
      } else if (e instanceof GitHubHTTPError) {
        c.status(e.status as StatusCode);
        const message = `GitHub responded with HTTP ${e.status} ${e.message}`;
        return c.html(eta.render("error.eta", { title: e.message, message }));
      } else {
        c.status(500);
        return c.html(eta.render("error.eta", { message: "" + e }));
      }
    }
    // Our URLs mirror GitHub's, so the page we scraped is the same path there.
    const { pathname, search } = new URL(c.req.url);
    const githubUrl = `https://github.com${pathname}${search}`;
    return c.html(eta.render(template, { ...data, githubUrl }));
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
    return c.html(eta.render(template, data));
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
    c.header("Referrer-Policy", "no-referrer");
    return c.redirect(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
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
    c.header("Referrer-Policy", "no-referrer");
    return c.redirect(
      `https://github.com/${owner}/${repo}/search?${new URLSearchParams(c.req.query()).toString()}`,
    );
  });

  app.get("/:owner/:repo/commits/:branch/:path{.*}?", async (c) => {
    const { owner, repo, branch, path = "" } = c.req.param();
    return tryRender(c, "commits.eta", getGitHubCommits(owner, repo, branch, path));
  });

  // Internal endpoints fetched asynchronously by client-side JS, not meant to
  // be visited directly. Keep the site's initial page loads plain server-
  // rendered HTML while still surfacing data (branches/tags, latest commit)
  // that would otherwise require an extra scrape on every page view.
  app.get("/api/:owner/:repo/refs/:type", async (c) => {
    const { owner, repo, type } = c.req.param();
    if (type !== "branches" && type !== "tags") {
      return c.notFound();
    }
    return tryRenderFragment(c, "_refs.eta", getGitHubRefs(owner, repo, type));
  });

  app.get("/api/:owner/:repo/latest-commit/:branch/:path{.*}?", async (c) => {
    const { owner, repo, branch, path = "" } = c.req.param();
    return tryRenderFragment(
      c,
      "_latestCommit.eta",
      getGitHubLatestCommit(owner, repo, branch, path),
    );
  });

  app.get("/api/:owner/:repo/languages", async (c) => {
    const { owner, repo } = c.req.param();
    return tryRenderFragment(c, "_languages.eta", getGitHubLanguages(owner, repo));
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
    const path = c.req.path;
    c.header("Referrer-Policy", "no-referrer");
    return c.redirect(`https://github.com${path}`);
  });

  return app;
}
