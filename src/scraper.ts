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

interface TreeItem {
  contentType: "directory" | "file";
  name: string;
  path: string;
}

interface OverviewFile {
  displayName: string;
  richText?: string;
  loaded: boolean;
}

interface IssueNode {
  number: number;
  title: string;
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

interface RawPayload {
  repo: {
    ownerLogin: string;
    name: string;
  };
  refInfo: { name: string };
  path: string;
  tree?: {
    items: TreeItem[];
  };
  blob?: {
    headerInfo: {
      blobSize: string;
      lineInfo: {
        truncatedLoc: string | null;
        truncatedSloc: string | null;
      };
    };
    language: string | null;
    image: boolean;
    rawLines: string[] | null;
    colorizedLines: string[] | null;
    richText: string | null;
    stylingDirectives: StylingDirective[][] | null;
  };
  overview?: {
    overviewFiles?: OverviewFile[];
  };
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

function applyStyling(line: string, directives: StylingDirective[]): string {
  let result = "";
  let lastPos = 0;
  for (const [start, end, className] of directives) {
    result += escapeHtml(line.substring(lastPos, start));
    result += `<span class="${className}">${escapeHtml(line.substring(start, end))}</span>`;
    lastPos = end;
  }
  result += escapeHtml(line.substring(lastPos));
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
}

export interface GitHubCommits extends GitHubNav {
  commitGroups: CommitGroup[];
}

interface Release {
  tagName: string;
  title: string;
  publishedAt: string;
  bodyHtml: string;
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
  const response = await fetch(`https://github.com/${path}`, { headers });
  if (!response.ok) throw new GitHubHTTPError(response.status, response.statusText);
  return response.text();
}

function parsePayload(html: string, dataTarget: string, prop: string[]): RawPayload | null {
  const regex = new RegExp(
    `<script type="application/json" data-target="${dataTarget}">([^<]+)</script>`,
    "g",
  );

  match: for (const match of html.matchAll(regex)) {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    for (const key of prop) {
      data = data[key];
      if (data === undefined) continue match;
    }
    return data;
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
      ) as Element;
      if (websiteElem) {
        website = getAttributeValue(websiteElem, "href") || null;
      }
    }
  }

  const starsElem = cssSelect.selectOne("#repo-stars-counter-star", document) as unknown as Element;
  const stars = starsElem
    ? getAttributeValue(starsElem, "title") || textContent(starsElem).trim()
    : null;

  const watchersElem = cssSelect.selectOne("a[href$='/watchers'] strong", document);
  const watchers = watchersElem ? textContent(watchersElem).trim() : null;

  const forksElem = cssSelect.selectOne("#repo-network-counter", document) as unknown as Element;
  const forks = forksElem
    ? getAttributeValue(forksElem, "title") || textContent(forksElem).trim()
    : null;

  const releaseElem = cssSelect.selectOne(
    "a[href$='/releases'] .Counter",
    document,
  ) as unknown as Element;
  let numReleases: number | undefined;
  if (releaseElem) {
    const releaseText = getAttributeValue(releaseElem, "title") || textContent(releaseElem);
    numReleases = parseInt(releaseText.replace(/,/g, ""), 10);
  }

  return {
    description,
    website,
    stars,
    watchers,
    forks,
    numReleases,
  };
}

function extractOverviewHtml(payload: RawPayload): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const file of payload.overview?.overviewFiles ?? []) {
    if (file.loaded && file.richText !== undefined) {
      result[file.displayName] = file.richText;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractGitHub<T>(payload: RawPayload, extra: T): GitHubNav & T {
  return {
    repo: {
      owner: payload.repo.ownerLogin,
      name: payload.repo.name,
    },
    branch: payload.refInfo.name,
    path: payload.path,
    ...extra,
  };
}

export async function getGitHubRepo(owner: string, repo: string): Promise<GitHubRepo> {
  const html = await fetchGitHubPage(`${owner}/${repo}`);

  const payload = parsePayload(html, "react-partial.embeddedData", ["props", "initialPayload"]);

  if (payload?.tree === undefined) {
    throw new Error("Could not find tree data in embedded JSON");
  }

  const info = parseRepoInfo(html);
  const overviewHtml = extractOverviewHtml(payload);

  return extractGitHub(payload, { items: payload.tree.items, info, overviewHtml });
}

export async function getGitHubTree(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<GitHubTree> {
  const html = await fetchGitHubPage(`${owner}/${repo}/tree/${branch}/${path}`);

  // GitHub uses different formats for root vs subdirectories.
  const payload =
    // Root directory format.
    parsePayload(html, "react-partial.embeddedData", ["props", "initialPayload"]) ||
    // Subdirectory format.
    parsePayload(html, "react-app.embeddedData", ["payload"]);

  if (payload?.tree === undefined) {
    throw new Error("Could not find tree data in embedded JSON");
  }

  const overviewHtml = extractOverviewHtml(payload);

  return extractGitHub(payload, { items: payload.tree.items, overviewHtml });
}

export async function getGitHubBlob(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<GitHubBlob> {
  const html = await fetchGitHubPage(`${owner}/${repo}/blob/${branch}/${path}`);

  const payload = parsePayload(html, "react-app.embeddedData", ["payload"]);

  if (payload?.blob === undefined) {
    throw new Error("Could not find blob data in embedded JSON");
  }

  const blob = payload.blob;
  const { headerInfo, stylingDirectives } = blob;

  let htmlLines = blob.colorizedLines;
  if (!htmlLines && stylingDirectives && blob.rawLines) {
    htmlLines = blob.rawLines.map((line, i) => applyStyling(line, stylingDirectives[i]));
  }

  let size = headerInfo.blobSize;
  if (headerInfo.lineInfo.truncatedLoc) {
    size += ` / ${headerInfo.lineInfo.truncatedLoc} lines`;
  }
  if (headerInfo.lineInfo.truncatedSloc) {
    size += ` / ${headerInfo.lineInfo.truncatedSloc} loc`;
  }

  return extractGitHub(payload, {
    language: blob.language || null,
    size,
    image: blob.image,
    textLines: blob.rawLines,
    htmlLines,
    htmlContent: blob.richText,
  });
}

export async function getGitHubIssues(owner: string, repo: string): Promise<GitHubIssues> {
  const html = await fetchGitHubPage(`${owner}/${repo}/issues`);

  const payload = parsePayload(html, "react-app.embeddedData", ["payload"]);

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
    const { number, title, state, createdAt } = edge.node;
    return { number, title, state, createdAt };
  });

  return {
    repo: {
      owner,
      name: repo,
    },
    issues,
  };
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

  const payload = parsePayload(html, "react-app.embeddedData", ["payload"]);

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
    if (!title.startsWith("v")) continue;

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

export async function getGitHubRelease(
  owner: string,
  repo: string,
  tag: string,
): Promise<GitHubRelease> {
  const html = await fetchGitHubPage(`${owner}/${repo}/releases/tag/${tag}`);

  // Find the h1 tag with the release title
  const h1Match = html.match(/<h1[^>]*class="[^"]*d-inline[^"]*"[^>]*>([^<]*)<\/h1>/);
  const title = h1Match?.[1]?.trim() || tag;

  // Extract tag name from tree link
  const tagLinkMatch = html.match(/<a[^>]*href="[^"]*\/tree\/([^"]+)"[^>]*>/);
  const tagName = tagLinkMatch?.[1] || tag;

  // Extract published date
  const dateMatch = html.match(/<relative-time[^>]*datetime="([^"]*)"[^>]*>/);
  const publishedAt = dateMatch?.[1] || "";

  // Extract body HTML (markdown content) - find the markdown-body div
  const bodyMatch = html.match(
    /<div[^>]*class="[^"]*markdown-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="mb-3"/,
  );
  const bodyHtml = bodyMatch?.[1]?.trim() || "";

  return {
    repo: {
      owner,
      name: repo,
    },
    release: {
      tagName,
      title,
      publishedAt,
      bodyHtml,
    },
  };
}
