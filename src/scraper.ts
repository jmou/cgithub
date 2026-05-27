import { parseDocument } from "htmlparser2";
import { type Element } from "domhandler";
import { getAttributeValue, getInnerHTML, textContent } from "domutils";
import * as cssSelect from "css-select";

export class GitHubHTTPError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubHTTPError";
    this.status = status;
  }
}

export class RedirectError extends Error {
  location: string;

  constructor(location: string) {
    super(`Redirect to ${location}`);
    this.name = "RedirectError";
    this.location = location;
  }
}

interface TreeItem {
  contentType: "directory" | "file";
  name: string;
  path: string;
}

interface OverviewFile {
  displayName: string;
  richText?: string;
}

interface IssueNode {
  number: number;
  title?: string;
  titleHtml?: string;
  author?: {
    login: string;
  };
  createdAt: string;
  state: string;
  labels?: {
    edges: {
      node: {
        name: string;
      };
    }[];
  };
}

interface IssueIndexPageQuery {
  queryName: "IssueIndexPageQuery";
  result: {
    data: {
      repository: {
        search: {
          edges: {
            node: IssueNode;
          }[];
        };
      };
    };
  };
}

type StylingDirective = [number, number, string];

interface Commit {
  oid: string;
  url: string;
  authoredDate: string;
  committedDate: string;
  shortMessage: string;
  bodyMessageHtml: string;
  authors: {
    login: string;
    displayName: string;
    avatarUrl: string;
    path: string;
  }[];
}

export interface CommitGroup {
  title: string;
  commits: Commit[];
}

interface CodeViewLayoutRoute {
  repo: {
    ownerLogin: string;
    name: string;
  };
  refInfo: {
    name: string;
  };
  path: string;
}

interface CodeViewRepoRoute {
  tree: {
    items: TreeItem[];
  };
  overview?: {
    overviewFiles?: OverviewFile[];
  };
}

interface CodeViewTreeRoute {
  tree: {
    items: TreeItem[];
    readme?: OverviewFile;
  };
}

interface BlobHeaderInfo {
  blobSize: string;
  lineInfo?: {
    truncatedLoc: string | null;
    truncatedSloc: string | null;
  };
}

interface CodeViewBlobLayoutRoute {
  blob: {
    headerInfo: BlobHeaderInfo;
    language: string | null;
    image: boolean;
  };
}

interface CodeViewBlobLayoutRouteStyledBlob {
  rawLines: string[] | null;
  colorizedLines: string[] | null;
  stylingDirectives: StylingDirective[][] | null;
}

interface CodeViewBlobRoute {
  richText: string | null;
}

interface AppPayload {
  codeViewLayoutRoute?: CodeViewLayoutRoute;
  codeViewRepoRoute?: CodeViewRepoRoute;
  codeViewTreeRoute?: CodeViewTreeRoute;
  codeViewBlobLayoutRoute?: CodeViewBlobLayoutRoute;
  "codeViewBlobLayoutRoute.StyledBlob"?: CodeViewBlobLayoutRouteStyledBlob;
  codeViewBlobRoute?: CodeViewBlobRoute;
  commitGroups?: CommitGroup[];
  // Actually there may be other query types.
  preloadedQueries?: IssueIndexPageQuery[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Renders directives[i..] within [rangeStart, rangeEnd], producing nested spans.
// Returns the rendered content and the index of the first directive not consumed.
function renderRange(
  line: string,
  directives: StylingDirective[],
  i: number,
  rangeStart: number,
  rangeEnd: number,
): [string, number] {
  let result = "";
  let pos = rangeStart;

  while (i < directives.length) {
    const [start, end, className] = directives[i];
    // Stop at directives that start outside or extend past this range.
    if (start >= rangeEnd || end > rangeEnd) break;

    // Combine classes for directives with identical ranges.
    let classes = className;
    let j = i + 1;
    while (j < directives.length && directives[j][0] === start && directives[j][1] === end) {
      classes += " " + directives[j][2];
      j++;
    }

    result += escapeHtml(line.substring(pos, start));
    const [innerContent, nextI] = renderRange(line, directives, j, start, end);
    result += `<span class="${classes}">${innerContent}</span>`;
    pos = end;
    i = nextI;
  }

  result += escapeHtml(line.substring(pos, rangeEnd));
  return [result, i];
}

function applyStyling(line: string, directives: StylingDirective[]): string {
  // Sort by start ascending, then end descending so outer spans precede nested ones.
  const sorted = [...directives].sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : b[1] - a[1]));
  const [result] = renderRange(line, sorted, 0, 0, line.length);
  return result;
}

interface GitHubCommon {
  repo: {
    owner: string;
    name: string;
  };
}

interface GitHubNav extends GitHubCommon {
  branch: string;
  path: string;
}

export interface GitHubTree extends GitHubNav {
  items: TreeItem[];
  overviewHtml?: Record<string, string>;
}

export interface RepoInfo {
  description: string | null;
  website: string | null;
  stars: string | null;
  watchers: string | null;
  forks: string | null;
  numReleases?: number;
  latestReleaseTag?: string;
  latestReleaseDate?: string;
}

export interface GitHubRepo extends GitHubTree {
  info: RepoInfo;
}

export interface GitHubBlob extends GitHubNav {
  language: string | null;
  size: string;
  image: boolean;
  textLines: string[] | null;
  htmlLines: string[] | null;
  htmlContent: string | null;
}

interface Issue {
  number: number;
  title: string;
  state: string;
  createdAt: string;
  numReplies?: number;
  numPRs?: number;
}

export interface GitHubIssues extends GitHubCommon {
  issues: Issue[];
  q?: string;
}

export interface GitHubPulls extends GitHubCommon {
  pulls: Issue[];
  q?: string;
}

export interface GitHubCommits extends GitHubNav {
  commitGroups: CommitGroup[];
}

interface Release {
  tagName: string;
  title: string;
  publishedAt: string;
  bodyHtml: string;
  assets?: ReleaseAsset[];
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size?: string;
  publishedAt?: string;
}

export interface GitHubReleases extends GitHubCommon {
  releases: Release[];
}

export interface GitHubRelease extends GitHubCommon {
  release: Release;
}

async function fetchGitHubPage(path: string): Promise<string> {
  // GitHub throttles/blocks requests without realistic browser headers.
  // These headers make the request appear as a standard browser visit.
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  };
  const response = await fetch(`https://github.com/${path}`, { headers, redirect: "manual" });
  if (response.status === 301 || response.status === 302) {
    const location = response.headers.get("location");
    if (location) {
      const url = new URL(location);
      if (url.hostname === "github.com") {
        throw new RedirectError(url.pathname);
      }
    }
  }
  if (!response.ok) throw new GitHubHTTPError(response.status, response.statusText);
  return response.text();
}

function parsePayload(html: string): AppPayload | null {
  const regex = new RegExp(
    `<script type="application/json" data-target="react-app.embeddedData">([^<]+)</script>`,
    "g",
  );

  match: for (const match of html.matchAll(regex)) {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (data.payload === undefined) continue match;
    return data.payload;
  }
  return null;
}

function parseRepoInfo(html: string): RepoInfo {
  const document = parseDocument(html);

  const aboutSection = cssSelect.selectOne(".BorderGrid-cell h2:contains('About')", document);
  let description: string | null = null;
  let website: string | null = null;

  if (aboutSection) {
    const parent = aboutSection.parent;
    if (parent) {
      const descElem = cssSelect.selectOne("p.f4", parent);
      if (descElem) {
        description = textContent(descElem).trim();
      }
      const websiteElem = cssSelect.selectOne(
        "a[rel='noopener noreferrer nofollow']",
        parent,
      ) as Element | null;
      if (websiteElem) {
        website = getAttributeValue(websiteElem, "href") || null;
      }
    }
  }

  const starsElem = cssSelect.selectOne("#repo-stars-counter-star", document) as Element | null;
  const stars = starsElem
    ? getAttributeValue(starsElem, "title") || textContent(starsElem).trim()
    : null;

  const watchersElem = cssSelect.selectOne("a[href$='/watchers'] strong", document);
  const watchers = watchersElem ? textContent(watchersElem).trim() : null;

  const forksElem = cssSelect.selectOne("#repo-network-counter", document) as Element | null;
  const forks = forksElem
    ? getAttributeValue(forksElem, "title") || textContent(forksElem).trim()
    : null;

  const releaseElem = cssSelect.selectOne(
    "a[href$='/releases'] .Counter",
    document,
  ) as Element | null;
  let numReleases: number | undefined;
  let latestReleaseTag: string | undefined;
  let latestReleaseDate: string | undefined;

  if (releaseElem) {
    const releaseText = getAttributeValue(releaseElem, "title") || textContent(releaseElem);
    numReleases = parseInt(releaseText.replace(/,/g, ""), 10);

    // Find the latest release tag and date if available
    const cell = (releaseElem.parent as Element)?.parent?.parent as Element; // span -> a -> h2 -> cell
    if (cell) {
      const latestLink = cssSelect.selectOne("a[href*='/releases/tag/']", cell) as Element;
      if (latestLink) {
        const tagElem = cssSelect.selectOne(".css-truncate-target", latestLink);
        if (tagElem) {
          latestReleaseTag = textContent(tagElem).trim();
        }

        const timeElem = cssSelect.selectOne("relative-time", latestLink);
        if (timeElem) {
          latestReleaseDate = getAttributeValue(timeElem, "datetime") || undefined;
        }
      }
    }
  }

  return {
    description,
    website,
    stars,
    watchers,
    forks,
    numReleases,
    latestReleaseTag,
    latestReleaseDate,
  };
}

function extractOverviewHtml(
  overviewFiles: OverviewFile[] = [],
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const file of overviewFiles) {
    if (file.richText !== undefined) {
      result[file.displayName] = file.richText;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractGitHub<T>(payload: AppPayload | null, extra: T): GitHubNav & T {
  const layoutRoute = payload?.codeViewLayoutRoute;
  if (layoutRoute === undefined) {
    throw new Error("Missing codeViewLayoutRoute");
  }

  return {
    repo: {
      owner: layoutRoute.repo.ownerLogin,
      name: layoutRoute.repo.name,
    },
    branch: layoutRoute.refInfo.name,
    path: layoutRoute.path,
    ...extra,
  };
}

export async function getGitHubRepo(owner: string, repo: string): Promise<GitHubRepo> {
  const html = await fetchGitHubPage(`${owner}/${repo}`);

  const payload = parsePayload(html);
  const repoRoute = payload?.codeViewRepoRoute;

  if (repoRoute?.tree === undefined) {
    throw new Error("Could not find tree data in embedded JSON");
  }

  const info = parseRepoInfo(html);
  const overviewHtml = extractOverviewHtml(repoRoute.overview?.overviewFiles);

  return extractGitHub(payload, { items: repoRoute.tree.items, info, overviewHtml });
}

export async function getGitHubTree(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<GitHubTree> {
  const html = await fetchGitHubPage(`${owner}/${repo}/tree/${branch}/${path}`);

  const payload = parsePayload(html);
  const treeRoute = payload?.codeViewTreeRoute;

  if (treeRoute?.tree === undefined) {
    throw new Error("Could not find tree data in embedded JSON");
  }

  const overviewHtml = extractOverviewHtml(treeRoute.tree.readme ? [treeRoute.tree.readme] : []);

  return extractGitHub(payload, { items: treeRoute.tree.items, overviewHtml });
}

export async function getGitHubBlob(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<GitHubBlob> {
  const html = await fetchGitHubPage(`${owner}/${repo}/blob/${branch}/${path}`);

  const payload = parsePayload(html);
  const blob = payload?.codeViewBlobLayoutRoute?.blob;
  const styledBlob = payload?.["codeViewBlobLayoutRoute.StyledBlob"];

  if (blob === undefined) {
    throw new Error("Could not find blob data in embedded JSON");
  }

  let htmlLines = styledBlob?.colorizedLines ?? null;
  const stylingDirectives = styledBlob?.stylingDirectives;
  if (!htmlLines && stylingDirectives && styledBlob?.rawLines) {
    htmlLines = styledBlob.rawLines.map((line, i) => applyStyling(line, stylingDirectives[i]));
  }

  let size = blob.headerInfo.blobSize;
  if (blob.headerInfo.lineInfo?.truncatedLoc) {
    size += ` / ${blob.headerInfo.lineInfo.truncatedLoc} lines`;
  }
  if (blob.headerInfo.lineInfo?.truncatedSloc) {
    size += ` / ${blob.headerInfo.lineInfo.truncatedSloc} loc`;
  }

  return extractGitHub(payload, {
    language: blob.language || null,
    size,
    image: blob.image,
    textLines: styledBlob?.rawLines ?? null,
    htmlLines,
    htmlContent: payload?.codeViewBlobRoute?.richText ?? null,
  });
}

export async function getGitHubIssues(
  owner: string,
  repo: string,
  // We only support is:issue searches (no PR results).
  { q }: { q?: string } = {},
): Promise<GitHubIssues> {
  const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
  const html = await fetchGitHubPage(`${owner}/${repo}/issues${suffix}`);
  const payload = parsePayload(html);

  let issuesQuery: IssueIndexPageQuery | undefined;
  for (const query of payload?.preloadedQueries ?? []) {
    if (query.queryName === "IssueIndexPageQuery") {
      issuesQuery = query;
    }
  }
  if (issuesQuery === undefined) {
    throw new Error("Could not find IssueIndexPageQuery in embedded JSON");
  }

  const issues: Issue[] = issuesQuery.result.data.repository.search.edges.map((edge) => {
    const { number, title, titleHtml, state, createdAt } = edge.node;
    const finalTitle = (title || titleHtml || "").replace(/<[^>]+>/g, "");
    return { number, title: finalTitle, state, createdAt };
  });

  return { repo: { owner, name: repo }, issues, q };
}

export async function getGitHubPulls(
  owner: string,
  repo: string,
  { q }: { q?: string } = {},
): Promise<GitHubPulls> {
  const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
  const html = await fetchGitHubPage(`${owner}/${repo}/pulls${suffix}`);
  const document = parseDocument(html);

  const pulls: Issue[] = [];
  for (const row of cssSelect.selectAll(".js-issue-row", document) as unknown as Element[]) {
    const id = getAttributeValue(row, "id"); // "issue_NNN"
    const number = id ? parseInt(id.replace("issue_", ""), 10) : 0;
    if (!number) continue;

    const titleLink = cssSelect.selectOne("a.markdown-title", row);
    const title = titleLink ? textContent(titleLink).trim() : "";

    const timeElem = cssSelect.selectOne("relative-time", row);
    const createdAt = timeElem ? getAttributeValue(timeElem, "datetime") || "" : "";

    const stateSpan = cssSelect.selectOne(".tooltipped[aria-label]", row) as Element | null;
    const ariaLabel = stateSpan ? (getAttributeValue(stateSpan, "aria-label") ?? "") : "";
    const state = ariaLabel.includes("Merged")
      ? "MERGED"
      : ariaLabel.includes("Closed")
        ? "CLOSED"
        : "OPEN";

    pulls.push({ number, title, state, createdAt });
  }

  return { repo: { owner, name: repo }, pulls, q };
}

export async function getGitHubCommits(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<GitHubCommits> {
  const urlPath = path
    ? `${owner}/${repo}/commits/${branch}/${path}`
    : `${owner}/${repo}/commits/${branch}`;
  const html = await fetchGitHubPage(urlPath);

  const payload = parsePayload(html);

  if (payload?.commitGroups === undefined) {
    throw new Error("Could not find commit history in embedded JSON");
  }

  return {
    repo: {
      owner,
      name: repo,
    },
    branch,
    path,
    commitGroups: payload.commitGroups,
  };
}

function parseRelease(section: Element, title: string): Release {
  // Extract tag name from link
  const tagLink = cssSelect.selectOne('a[href*="/tree/"]', section);
  let tagName = title;
  if (tagLink) {
    const href = getAttributeValue(tagLink, "href");
    if (href) {
      tagName = href.split("/").pop() || title;
    }
  }

  // Extract published date
  const relativeTime = cssSelect.selectOne("relative-time", section);
  const publishedAt = relativeTime ? getAttributeValue(relativeTime, "datetime") || "" : "";

  // Extract body HTML (markdown content)
  const body = cssSelect.selectOne(".markdown-body", section);
  const bodyHtml = body ? getInnerHTML(body).trim() : "";

  return {
    tagName,
    title,
    publishedAt,
    bodyHtml,
  };
}

export async function getGitHubReleases(owner: string, repo: string): Promise<GitHubReleases> {
  const html = await fetchGitHubPage(`${owner}/${repo}/releases`);

  const document = parseDocument(html);
  const releases: Release[] = [];

  // Not really sure the right way to express this type.
  const sections = cssSelect.selectAll("section", document) as unknown as Element[];

  for (const section of sections) {
    const h2 = cssSelect.selectOne("h2[id]", section);
    if (!h2) continue;

    const title = textContent(h2).trim();

    releases.push(parseRelease(section, title));
  }

  return {
    repo: {
      owner,
      name: repo,
    },
    releases,
  };
}

export async function getGitHubReleaseBase(
  owner: string,
  repo: string,
  tag: string,
): Promise<GitHubRelease> {
  const html = await fetchGitHubPage(`${owner}/${repo}/releases/tag/${tag}`);

  const document = parseDocument(html);

  const box = cssSelect.selectOne(".Box:has(h1)", document) as Element | null;
  if (!box) throw new Error("Could not find release box");

  const h1 = cssSelect.selectOne("h1", box);
  const title = h1 ? textContent(h1).trim() : "";

  const release = parseRelease(box, title);

  return {
    repo: {
      owner,
      name: repo,
    },
    release,
  };
}

export async function getGitHubReleaseAssets(
  owner: string,
  repo: string,
  tag: string,
): Promise<ReleaseAsset[]> {
  const html = await fetchGitHubPage(`${owner}/${repo}/releases/expanded_assets/${tag}`);
  const document = parseDocument(html);
  const assets: ReleaseAsset[] = [];

  for (const row of cssSelect.selectAll("li", document) as unknown as Element[]) {
    const link = cssSelect.selectOne("a[href]", row);
    if (!link) continue;

    const url = getAttributeValue(link, "href") || "";
    // Filename is in the link, often split into multiple spans
    const name = textContent(link).replace(/\s+/g, " ").trim();

    let size: string | undefined;
    let publishedAt: string | undefined;
    for (const s of cssSelect.selectAll("span.color-fg-muted.text-right", row)) {
      // Size is in a span with color-fg-muted and text-right, but avoid the one with relative-time
      const timeElem = cssSelect.selectOne("relative-time", row);
      if (timeElem) {
        publishedAt = timeElem ? getAttributeValue(timeElem, "datetime") || "" : "";
      } else {
        const text = textContent(s).trim();
        if (text) size = text;
      }
    }

    assets.push({
      name,
      url: url.startsWith("/") ? `https://github.com${url}` : url,
      size,
      publishedAt,
    });
  }

  return assets;
}

export async function getGitHubRelease(
  owner: string,
  repo: string,
  tag: string,
): Promise<GitHubRelease> {
  const [base, assets] = await Promise.all([
    getGitHubReleaseBase(owner, repo, tag),
    getGitHubReleaseAssets(owner, repo, tag),
  ]);
  base.release.assets = assets;
  return base;
}
