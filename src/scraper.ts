import { parseDocument } from "htmlparser2";
import { isText, type AnyNode, type Element } from "domhandler";
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

export abstract class RedirectError extends Error {
  location: string;

  constructor(location: string) {
    super(`Redirect to ${location}`);
    this.name = this.constructor.name;
    this.location = location;
  }
}

export class InternalRedirectError extends RedirectError {}

export class ExternalRedirectError extends RedirectError {}

interface TreeItem {
  contentType: "directory" | "file";
  name: string;
  path: string;
}

interface OverviewFile {
  displayName: string;
  // null when GitHub includes the file without rendered content.
  richText?: string | null;
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

export interface Commit {
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

interface CommitsRefRoute {
  commitGroups: CommitGroup[];
}

interface CodeViewBlobRoute {
  richText: string | null;
  renderedFileInfo?: { renderFileType: string | null } | null;
}

interface SidebarAbout {
  description?: string | null;
  website?: string | null;
  stargazerCount?: number;
  forksCount?: number;
  // A section is false when the repository has none of that thing.
  sections?: { releases?: { releaseCount?: number } | false };
}

interface AppPayload {
  sidebarAbout?: SidebarAbout;
  codeViewLayoutRoute?: CodeViewLayoutRoute;
  codeViewRepoRoute?: CodeViewRepoRoute;
  codeViewTreeRoute?: CodeViewTreeRoute;
  codeViewBlobLayoutRoute?: CodeViewBlobLayoutRoute;
  "codeViewBlobLayoutRoute.StyledBlob"?: CodeViewBlobLayoutRouteStyledBlob;
  codeViewBlobRoute?: CodeViewBlobRoute;
  commitsRefRoute?: CommitsRefRoute;
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
  overviewHtml?: Record<string, string | null>;
}

export interface RepoInfo {
  description: string | null;
  website: string | null;
  stars: string | null;
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
  renderFileType: string | null;
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

interface DiscussionCategory {
  slug: string;
  name: string;
  // Every category has an emoji, but GitHub only prints it in some places.
  emoji: string | null;
}

interface DiscussionSummary {
  number: number;
  // Titles are Markdown, so they can carry code spans and emoji.
  titleHtml: string;
  author: string | null;
  createdAt: string | null;
  category: DiscussionCategory | null;
  answered: boolean;
}

export interface DiscussionComment {
  // What GitHub's permalinks point at, e.g. "discussioncomment-9174663".
  anchor: string;
  author: string | null;
  createdAt: string | null;
  // The badges beside the author: Author, Maintainer, Collaborator, ...
  labels: string[];
  bodyHtml: string;
  // How GitHub words a comment it keeps collapsed, e.g. "This comment has been
  // hidden." or "This comment was marked as off-topic."; null when the comment
  // is shown as usual. A collapsed comment arrives with no author or body.
  hiddenReason: string | null;
  isAnswer: boolean;
  replies: DiscussionComment[];
  // Replies GitHub keeps collapsed behind a "show more" button of its own.
  hiddenReplies: number;
}

export interface GitHubDiscussions extends GitHubCommon {
  discussions: DiscussionSummary[];
  categories: DiscussionCategory[];
  // The category the list is narrowed to, if any.
  category: DiscussionCategory | null;
  q?: string;
}

export interface GitHubDiscussion extends GitHubCommon {
  number: number;
  titleHtml: string;
  author: string | null;
  category: DiscussionCategory | null;
  // The comment a Q&A discussion is answered by, as an anchor on this page.
  answerAnchor: string | null;
  body: DiscussionComment;
  comments: DiscussionComment[];
}

export interface GitHubCommits extends GitHubNav {
  commitGroups: CommitGroup[];
}

export interface LatestCommit {
  oid: string;
  date: string;
  shortMessageHtml: string;
  authors: {
    login: string;
    displayName: string;
    avatarUrl: string;
  }[];
}

export interface GitHubLatestCommit extends GitHubCommon {
  commit: LatestCommit;
}

export interface Language {
  // "Other" for the aggregate bucket GitHub reports without a name.
  name: string;
  percentage: number;
  color: string | null;
}

export interface LatestRelease {
  tag: string;
  publishedAt: string | null;
}

export interface GitHubSidebar extends GitHubCommon {
  languages: Language[];
  latestRelease: LatestRelease | null;
}

export interface Ref {
  name: string;
  isDefault?: boolean;
  date?: string;
  authorLogin?: string;
}

export interface GitHubRefs extends GitHubCommon {
  type: "branches" | "tags";
  refs: Ref[];
  hasMore: boolean;
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

export interface WikiPage {
  name: string;
  href: string;
  updatedAt?: string;
}

export interface GitHubWiki extends GitHubCommon {
  title: string;
  updatedBy: string | null;
  updatedAt: string | null;
  bodyHtml: string;
  sidebarHtml: string | null;
  footerHtml: string | null;
  pages: WikiPage[];
}

export interface GitHubWikiPages extends GitHubCommon {
  pages: WikiPage[];
}

interface OwnerRepo {
  owner: string;
  name: string;
  description?: string;
  language?: string;
  stars?: string;
  forks?: string;
}

interface OwnerNavItem {
  text: string;
  href: string;
}

export interface GitHubOwner {
  type: "user" | "organization";
  login: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  followers: string | null;
  // Users only; always null for organizations.
  following: string | null;
  company: string | null;
  location: string | null;
  links: { text: string; href: string }[];
  nav: OwnerNavItem[];
  pinned: OwnerRepo[];
  // The repository list on organization overviews; empty for users.
  repos: OwnerRepo[];
}

// GitHub throttles/blocks requests without realistic browser headers.
// These headers make the request appear as a standard browser visit.
function browserHeaders(accept: string): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: accept,
    "Accept-Language": "en-US,en;q=0.5",
  };
}

async function fetchGitHubResponse(path: string, accept: string): Promise<Response> {
  const headers = browserHeaders(accept);
  const response = await fetch(`https://github.com/${path}`, { headers, redirect: "manual" });
  if (response.status === 301 || response.status === 302) {
    const location = response.headers.get("location");
    if (location) {
      const url = new URL(location);
      if (url.hostname === "github.com") {
        throw new InternalRedirectError(url.pathname);
      }
    }
  }
  if (!response.ok) throw new GitHubHTTPError(response.status, response.statusText);
  return response;
}

async function fetchGitHubPage(path: string): Promise<string> {
  const response = await fetchGitHubResponse(
    path,
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  );
  return response.text();
}

// Some routes (e.g. latest-commit) are the same endpoints the React UI itself
// calls to lazily fill in data; they 406 without an explicit JSON Accept.
async function fetchGitHubJson<T>(path: string): Promise<T> {
  const response = await fetchGitHubResponse(path, "application/json");
  return (await response.json()) as T;
}

function parseEmbeddedPayload<T>(html: string): T | null {
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

function parsePayload(html: string): AppPayload | null {
  return parseEmbeddedPayload<AppPayload>(html);
}

function extractOverviewHtml(
  overviewFiles: OverviewFile[] = [],
): Record<string, string | null> | undefined {
  const result: Record<string, string | null> = {};
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

  const about = payload?.sidebarAbout;
  const releases = about?.sections?.releases;
  const info = {
    description: about?.description ?? null,
    website: about?.website ?? null,
    stars: about?.stargazerCount?.toLocaleString("en-US") ?? null,
    forks: about?.forksCount?.toLocaleString("en-US") ?? null,
    numReleases: releases === false ? undefined : releases?.releaseCount,
  };
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
    renderFileType: payload?.codeViewBlobRoute?.renderedFileInfo?.renderFileType ?? null,
    textLines: styledBlob?.rawLines ?? null,
    htmlLines,
    htmlContent: payload?.codeViewBlobRoute?.richText ?? null,
  });
}

// For proxying embeds.
export async function getGitHubRaw(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<Response> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const response = await fetch(url, { headers: browserHeaders("*/*") });
  if (!response.ok) throw new GitHubHTTPError(response.status, response.statusText);
  return response;
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

// A category link names the category on its own in a discussion's header and
// in a list row; in the sidebar it wraps an emoji and a label of its own.
function parseDiscussionCategory(link: Element | null): DiscussionCategory | null {
  const href = link ? getAttributeValue(link, "href") : undefined;
  // A list row's category link carries the filter it would apply as a query.
  const slug = href?.split("?")[0].split("/").pop();
  if (!link || !slug) return null;

  const label = cssSelect.selectOne(".ActionList-item-label", link) ?? link;
  const emoji = cssSelect.selectOne("g-emoji", link);
  return {
    slug,
    name: textContent(label).replace(/\s+/g, " ").trim(),
    emoji: emoji ? textContent(emoji).trim() : null,
  };
}

function parseDiscussionCategories(document: AnyNode): DiscussionCategory[] {
  const categories: DiscussionCategory[] = [];
  const links = cssSelect.selectAll(
    'nav[aria-label="Categories"] a[href*="/discussions/categories/"]',
    document,
  ) as unknown as Element[];
  for (const link of links) {
    const category = parseDiscussionCategory(link);
    if (category) categories.push(category);
  }
  return categories;
}

function parseDiscussionSummary(row: Element): DiscussionSummary | null {
  const link = cssSelect.selectOne('a[data-hovercard-type="discussion"]', row);
  const href = link ? getAttributeValue(link, "href") : undefined;
  const number = parseInt(href?.split("/").pop() ?? "", 10);
  if (!link || !number) return null;

  const time = cssSelect.selectOne("relative-time", row);

  return {
    number,
    titleHtml: getInnerHTML(link).trim(),
    author: selectText('a[aria-label$="(author)"]', row),
    createdAt: time ? (getAttributeValue(time, "datetime") ?? null) : null,
    category: parseDiscussionCategory(cssSelect.selectOne('a[aria-label$="(category)"]', row)),
    // An answered thread is called out in green beside its category.
    answered: cssSelect.selectOne(".color-fg-success", row) !== null,
  };
}

export async function getGitHubDiscussions(
  owner: string,
  repo: string,
  { q, category }: { q?: string; category?: string } = {},
): Promise<GitHubDiscussions> {
  const base = category
    ? `${owner}/${repo}/discussions/categories/${category}`
    : `${owner}/${repo}/discussions`;
  const suffix = q ? `?discussions_q=${encodeURIComponent(q)}` : "";
  const html = await fetchGitHubPage(`${base}${suffix}`);
  const document = parseDocument(html);

  const discussions: DiscussionSummary[] = [];
  for (const row of cssSelect.selectAll(
    "li.js-navigation-item",
    document,
  ) as unknown as Element[]) {
    const summary = parseDiscussionSummary(row);
    if (summary) discussions.push(summary);
  }

  const categories = parseDiscussionCategories(document);

  return {
    repo: { owner, name: repo },
    discussions,
    categories,
    category: categories.find((c) => c.slug === category) ?? null,
    q,
  };
}

// A comment and a reply to it are the same markup, with the replies nested
// inside the comment they answer.
function parseDiscussionComment(item: Element): DiscussionComment {
  const target = cssSelect.selectOne(".discussions-timeline-scroll-target[id]", item);
  const header = cssSelect.selectOne(".timeline-comment-header-text", item);
  const time = header ? cssSelect.selectOne("relative-time", header) : null;
  const body = cssSelect.selectOne(".js-comment-body", item);

  // A comment GitHub collapsed has its reason where the header would be, and
  // nothing else: no author, no time, no body. The header of a comment shown
  // as usual comes first, so only a collapsed one owns the first match here;
  // in the others it belongs to a nested reply.
  const minimized = cssSelect.selectOne(".minimized-comment .timeline-comment-header-text", item);
  const hiddenReason =
    header !== null && header === minimized
      ? textContent(header).replace(/\s+/g, " ").trim()
      : null;

  const labels: string[] = [];
  if (header) {
    for (const label of cssSelect.selectAll(".Label", header) as unknown as Element[]) {
      labels.push(textContent(label).replace(/\s+/g, " ").trim());
    }
  }

  const replies: DiscussionComment[] = [];
  for (const reply of cssSelect.selectAll(
    ".discussion-nested-comment-timeline-item",
    item,
  ) as unknown as Element[]) {
    replies.push(parseDiscussionComment(reply));
  }

  // Long threads arrive with the older replies behind a "Show 5 previous
  // replies" button, which needs GitHub's JavaScript to load them.
  let hiddenReplies = 0;
  for (const button of cssSelect.selectAll(
    ".discussion-nested-comment-paging-form .Button-label",
    item,
  ) as unknown as Element[]) {
    const count = /(\d+)/.exec(textContent(button));
    if (count) hiddenReplies += parseInt(count[1], 10);
  }

  return {
    anchor: target ? (getAttributeValue(target, "id") ?? "") : "",
    author: header ? selectText('a[data-hovercard-type="user"]', header) : null,
    createdAt: time ? (getAttributeValue(time, "datetime") ?? null) : null,
    labels,
    bodyHtml: hiddenReason ? "" : body ? getInnerHTML(body).trim() : "",
    hiddenReason,
    isAnswer: cssSelect.selectOne(".discussion-footer-answered-badge", item) !== null,
    replies,
    hiddenReplies,
  };
}

export async function getGitHubDiscussion(
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubDiscussion> {
  const html = await fetchGitHubPage(`${owner}/${repo}/discussions/${number}`);
  const document = parseDocument(html);

  const header = cssSelect.selectOne("#partial-discussion-header", document) as Element | null;
  if (!header) {
    throw new Error("Could not find the discussion header");
  }

  // The discussion's own post opens the timeline; the rest are its comments.
  const items = cssSelect.selectAll(".discussion-timeline-item", document) as unknown as Element[];
  if (items.length === 0) {
    throw new Error("Could not find the discussion body");
  }
  const [body, ...comments] = items.map(parseDiscussionComment);

  const title = cssSelect.selectOne(".js-issue-title", header);
  // Who opened the discussion, and where, sits under the title; an answer, when
  // there is one, is in a state badge above it.
  const meta = cssSelect.selectOne("div.color-fg-muted", header) as Element | null;
  const answer = cssSelect.selectOne(".js-discussions-goto-answer-button", header);

  return {
    repo: { owner, name: repo },
    number,
    titleHtml: title ? getInnerHTML(title).trim() : "",
    author: meta ? selectText("a[href]", meta) : null,
    category: parseDiscussionCategory(
      meta ? cssSelect.selectOne('a[href*="/discussions/categories/"]', meta) : null,
    ),
    answerAnchor: answer ? (getAttributeValue(answer, "href") ?? "").replace(/^#/, "") : null,
    body,
    comments,
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

  const payload = parsePayload(html);
  const commitsRoute = payload?.commitsRefRoute;

  if (commitsRoute === undefined) {
    throw new Error("Could not find commit history in embedded JSON");
  }

  return {
    repo: {
      owner,
      name: repo,
    },
    branch,
    path,
    commitGroups: commitsRoute.commitGroups,
  };
}

interface LatestCommitPayload {
  oid: string;
  date: string;
  shortMessageHtmlLink: string;
  authors: {
    login: string;
    displayName: string;
    avatarUrl: string;
  }[];
}

// This is the same endpoint the React UI itself calls to lazily fill in the
// commit bar above a file listing, rather than the much heavier /commits
// history page: it returns just the single latest commit as JSON.
export async function getGitHubLatestCommit(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<GitHubLatestCommit> {
  const urlPath = path
    ? `${owner}/${repo}/latest-commit/${branch}/${path}`
    : `${owner}/${repo}/latest-commit/${branch}`;
  const payload = await fetchGitHubJson<LatestCommitPayload>(urlPath);

  return {
    repo: { owner, name: repo },
    commit: {
      oid: payload.oid,
      date: payload.date,
      shortMessageHtml: payload.shortMessageHtmlLink,
      authors: payload.authors,
    },
  };
}

interface SidebarPayload {
  languages?: {
    languages: {
      // Absent for the "Other" bucket.
      name?: string;
      percentage: number;
      color?: string;
    }[];
  };
  releases?: {
    // The name is the release title, which need not be the tag; the path is.
    latestRelease?: { name?: string; path: string; publishedAt?: string } | null;
  };
}

// The repository sidebar (languages, releases, contributors, ...) is not
// rendered into the repo page at all; GitHub's own UI lazily fetches it as
// JSON from here.
export async function getGitHubSidebar(owner: string, repo: string): Promise<GitHubSidebar> {
  const payload = await fetchGitHubJson<SidebarPayload>(`${owner}/${repo}/_sidebar`);

  const languages: Language[] = [];
  for (const entry of payload.languages?.languages ?? []) {
    languages.push({
      name: entry.name ?? "Other",
      percentage: entry.percentage,
      color: entry.color ?? null,
    });
  }

  const release = payload.releases?.latestRelease;
  const latestRelease = release
    ? {
        tag: decodeURIComponent(release.path.split("/releases/tag/")[1] ?? release.name ?? ""),
        publishedAt: release.publishedAt ?? null,
      }
    : null;

  return { repo: { owner, name: repo }, languages, latestRelease };
}

interface BranchRefEntry {
  name: string;
  isDefault: boolean;
  authoredDate?: string;
  author?: { login: string };
}

interface BranchesPayload {
  branches: {
    default?: BranchRefEntry;
    yours?: BranchRefEntry[];
    active?: BranchRefEntry[];
    stale?: BranchRefEntry[];
  };
  hasMore?: Record<string, boolean>;
}

async function getGitHubBranchRefs(owner: string, repo: string): Promise<GitHubRefs> {
  const html = await fetchGitHubPage(`${owner}/${repo}/branches`);
  const payload = parseEmbeddedPayload<BranchesPayload>(html);

  if (payload?.branches === undefined) {
    throw new Error("Could not find branches data in embedded JSON");
  }

  const { default: defaultBranch, yours = [], active = [], stale = [] } = payload.branches;
  const entries = [...(defaultBranch ? [defaultBranch] : []), ...yours, ...active, ...stale];

  const seen = new Set<string>();
  const refs: Ref[] = [];
  for (const entry of entries) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    refs.push({
      name: entry.name,
      isDefault: entry.isDefault || undefined,
      date: entry.authoredDate,
      authorLogin: entry.author?.login,
    });
  }

  const hasMore = Object.values(payload.hasMore ?? {}).some(Boolean);

  return { repo: { owner, name: repo }, type: "branches", refs, hasMore };
}

async function getGitHubTagRefs(owner: string, repo: string): Promise<GitHubRefs> {
  const html = await fetchGitHubPage(`${owner}/${repo}/tags`);
  const document = parseDocument(html);

  const refs: Ref[] = [];
  for (const row of cssSelect.selectAll(".Box-row", document) as unknown as Element[]) {
    const nameElem = cssSelect.selectOne("h2 a", row);
    if (!nameElem) continue;
    const name = textContent(nameElem).trim();
    if (!name) continue;

    // The row has two <relative-time> elements: a release/tag creation
    // timestamp, then the tagged commit's authored date. We want the latter.
    const timeElems = cssSelect.selectAll("relative-time", row);
    const timeElem = timeElems[1] as Element | undefined;
    const date = timeElem ? getAttributeValue(timeElem, "datetime") || undefined : undefined;

    refs.push({ name, date });
  }

  const hasMore = cssSelect.selectOne(".pagination a", document) !== null;

  return { repo: { owner, name: repo }, type: "tags", refs, hasMore };
}

export async function getGitHubRefs(
  owner: string,
  repo: string,
  type: "branches" | "tags",
): Promise<GitHubRefs> {
  return type === "branches" ? getGitHubBranchRefs(owner, repo) : getGitHubTagRefs(owner, repo);
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

function selectText(selector: string, context: AnyNode): string | null {
  const elem = cssSelect.selectOne(selector, context);
  if (!elem) return null;
  return textContent(elem).replace(/\s+/g, " ").trim() || null;
}

function parseRepoItems(items: Element[]): OwnerRepo[] {
  const repos: OwnerRepo[] = [];
  for (const item of items) {
    const link = cssSelect.selectOne(
      "a:has(span.repo), a[itemprop~='codeRepository']",
      item,
    ) as Element | null;
    const href = link ? getAttributeValue(link, "href") : undefined;
    if (!href) continue;
    const [owner, name] = href.replace(/^\//, "").split("/");
    if (!owner || !name) continue;

    repos.push({
      owner,
      name,
      description: selectText("p.pinned-item-desc, [itemprop='description']", item) ?? undefined,
      language: selectText("[itemprop='programmingLanguage']", item) ?? undefined,
      stars: selectText("a[href$='/stargazers']", item) ?? undefined,
      forks: selectText("a[href$='/forks']", item) ?? undefined,
    });
  }
  return repos;
}

function parsePinnedRepos(document: AnyNode): OwnerRepo[] {
  return parseRepoItems(
    cssSelect.selectAll(".pinned-item-list-item", document) as unknown as Element[],
  );
}

// The tabs we surface from the profile page's own navigation. Stars and
// Overview are deliberately excluded.
const OWNER_NAV_TABS = ["Repositories", "Projects", "Packages", "People", "Sponsoring"];

function parseOwnerNav(document: AnyNode): OwnerNavItem[] {
  const nav: OwnerNavItem[] = [];
  const seen = new Set<string>();
  const anchors = cssSelect.selectAll("a.UnderlineNav-item", document) as unknown as Element[];
  for (const anchor of anchors) {
    const href = getAttributeValue(anchor, "href");
    // Label text is e.g. "Repositories 12" including the counter.
    const text = textContent(anchor).replace(/\s+/g, " ").trim().split(" ")[0];
    if (!href || seen.has(href) || !OWNER_NAV_TABS.includes(text)) continue;
    seen.add(href);
    nav.push({ text, href });
  }
  return nav;
}

function parseUser(document: AnyNode, login: string): GitHubOwner {
  const avatarElem = cssSelect.selectOne("a[itemprop='image'] img", document) as Element | null;
  const avatarUrl = avatarElem ? getAttributeValue(avatarElem, "src") || null : null;

  const followers =
    selectText("a[href$='tab=followers']", document)?.replace(/ followers?$/, "") ?? null;
  const following =
    selectText("a[href$='tab=following']", document)?.replace(/ following$/, "") ?? null;

  const links: { text: string; href: string }[] = [];
  const linkItems = cssSelect.selectAll(
    "li[itemprop='url'], li[itemprop='social']",
    document,
  ) as unknown as Element[];
  for (const item of linkItems) {
    const anchor = cssSelect.selectOne("a[href]", item) as Element | null;
    const href = anchor ? getAttributeValue(anchor, "href") : undefined;
    if (!anchor || !href) continue;
    links.push({ text: textContent(anchor).replace(/\s+/g, " ").trim(), href });
  }

  return {
    type: "user",
    login,
    name: selectText(".p-name.vcard-fullname", document),
    bio: selectText(".p-note.user-profile-bio", document),
    avatarUrl,
    followers,
    following,
    company: selectText("li[itemprop='worksFor']", document),
    location: selectText("li[itemprop='homeLocation']", document),
    links,
    nav: parseOwnerNav(document),
    pinned: parsePinnedRepos(document),
    repos: [],
  };
}

function parseOrganization(document: AnyNode, owner: string): GitHubOwner {
  const avatarElem = cssSelect.selectOne(
    ".orghead img[itemprop='image']",
    document,
  ) as Element | null;
  const avatarUrl = avatarElem ? getAttributeValue(avatarElem, "src") || null : null;
  // The login only appears in the avatar's "@login" alt text.
  const alt = avatarElem ? getAttributeValue(avatarElem, "alt") : undefined;
  const login = alt?.replace(/^@/, "") || owner;

  const followers =
    selectText("a[href$='/followers']", document)?.replace(/ followers?$/, "") ?? null;

  const links: { text: string; href: string }[] = [];
  const anchors = cssSelect.selectAll(
    ".orghead a[itemprop='url'], .orghead [itemprop='email'] a",
    document,
  ) as unknown as Element[];
  for (const anchor of anchors) {
    const href = getAttributeValue(anchor, "href");
    if (!href) continue;
    links.push({ text: textContent(anchor).replace(/\s+/g, " ").trim(), href });
  }

  return {
    type: "organization",
    login,
    name: selectText(".orghead h1", document),
    bio: selectText(".orghead h1 + div", document),
    avatarUrl,
    followers,
    following: null,
    company: null,
    location: selectText(".orghead [itemprop='location']", document),
    links,
    nav: parseOwnerNav(document),
    pinned: parsePinnedRepos(document),
    repos: parseRepoItems(
      cssSelect.selectAll("#org-repositories [itemprop='owns']", document) as unknown as Element[],
    ),
  };
}

export async function getGitHubOwner(owner: string): Promise<GitHubOwner> {
  const html = await fetchGitHubPage(owner);
  const document = parseDocument(html);

  const login = selectText(".p-nickname.vcard-username", document);
  if (login) {
    return parseUser(document, login);
  }
  if (cssSelect.selectOne(".orghead", document)) {
    return parseOrganization(document, owner);
  }
  // Not a profile page (marketing pages like github.com/features, etc.).
  throw new ExternalRedirectError(`https://github.com/${owner}`);
}

// The text directly inside an element, ignoring any nested elements' text.
function directText(elem: Element): string {
  return elem.children
    .filter(isText)
    .map((node) => node.data)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

// The sidebar holds every wiki page, which are revealed by JavaScript.
function parseWikiSidebarPages(document: AnyNode): WikiPage[] {
  const pages: WikiPage[] = [];
  const anchors = cssSelect.selectAll(
    ".js-wiki-sidebar-page-container > div > a[href]",
    document,
  ) as unknown as Element[];
  for (const anchor of anchors) {
    const href = getAttributeValue(anchor, "href");
    const name = textContent(anchor).replace(/\s+/g, " ").trim();
    if (href && name) pages.push({ name, href });
  }
  return pages;
}

function wikiHtml(selector: string, document: AnyNode): string | null {
  const elem = cssSelect.selectOne(selector, document);
  if (!elem) return null;
  const html = getInnerHTML(elem).trim();
  return html || null;
}

export async function getGitHubWiki(
  owner: string,
  repo: string,
  // Empty for the wiki's home page, which GitHub serves off /wiki itself.
  page = "",
  // A revision SHA renders that older version of the page.
  oid = "",
): Promise<GitHubWiki> {
  // Page names keep characters that are not path-safe (C#, [DEV] ...), so the
  // slug has to be re-encoded rather than interpolated the way a ref is.
  const path = [`${owner}/${repo}/wiki`, page && encodeURIComponent(page), oid]
    .filter(Boolean)
    .join("/");
  const html = await fetchGitHubPage(path);
  const document = parseDocument(html);

  const heading = cssSelect.selectOne("h1.gh-header-title", document) as Element | null;
  if (!heading) {
    throw new Error("Could not find the wiki page heading");
  }

  // "<author> edited this page <date> · <n> revisions", where the author is the
  // only part not wrapped in an element of its own.
  const meta = cssSelect.selectOne(".gh-header-meta", document) as Element | null;
  const updatedBy = meta ? (/^(.+?) edited this page\b/.exec(directText(meta))?.[1] ?? null) : null;
  const time = meta ? cssSelect.selectOne("relative-time", meta) : null;

  return {
    repo: { owner, name: repo },
    title: directText(heading),
    updatedBy,
    updatedAt: time ? getAttributeValue(time, "datetime") || null : null,
    bodyHtml: wikiHtml("#wiki-body .markdown-body", document) ?? "",
    // Wikis can define _Sidebar and _Footer pages, rendered alongside every page.
    sidebarHtml: wikiHtml(".wiki-custom-sidebar", document),
    footerHtml: wikiHtml("#wiki-footer .markdown-body", document),
    pages: parseWikiSidebarPages(document),
  };
}

export async function getGitHubWikiPages(owner: string, repo: string): Promise<GitHubWikiPages> {
  const html = await fetchGitHubPage(`${owner}/${repo}/wiki/_pages`);
  const document = parseDocument(html);

  const pages: WikiPage[] = [];
  for (const row of cssSelect.selectAll(
    "#wiki-content li.Box-row",
    document,
  ) as unknown as Element[]) {
    const anchor = cssSelect.selectOne("a[href]", row) as Element | null;
    const href = anchor ? getAttributeValue(anchor, "href") : undefined;
    const name = anchor ? textContent(anchor).replace(/\s+/g, " ").trim() : "";
    if (!href || !name) continue;

    const time = cssSelect.selectOne("relative-time", row) as Element | null;
    pages.push({ name, href, updatedAt: time ? getAttributeValue(time, "datetime") : undefined });
  }

  return { repo: { owner, name: repo }, pages };
}
