interface TreeItem {
  contentType: "directory" | "file";
  name: string;
  path: string;
}

interface OverviewFile {
  displayName: string;
  preferredFileType: string;
  richText?: string;
  loaded: boolean;
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
    language?: string;
    rawLines?: string[];
    highlightedLines?: {
      text?: string;
    }[];
    size: number;
  };
  overview?: {
    overviewFiles?: OverviewFile[];
  };
}

interface GitHubCommon {
  repo: {
    owner: string;
    name: string;
  };
  branch: string;
  path: string;
}

export interface GitHubTree extends GitHubCommon {
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

export interface GitHubBlob extends GitHubCommon {
  language: string | null;
  size: number | null;
  content: string;
  rawContent: string;
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
  const descMatch = html.match(/<p[^>]*class="[^"]*f4[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const description = descMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || null;
  const websiteMatch = html.match(/<a[^>]*rel="noopener noreferrer nofollow"[^>]*href="([^"]+)"/);
  const starsMatch = html.match(/id="repo-stars-counter-star"[^>]*>([^<]+)/);
  const watchersMatch = html.match(/<strong>(\d+)<\/strong>\s*watching/);
  const forksMatch = html.match(/id="repo-network-counter"[^>]*>([^<]+)/);

  let numReleases: number | undefined;
  const releaseCountMatch = html.match(
    /<a[^>]*href="[^"]*\/releases"[^>]*>[\s\S]*?<span[^>]*title="(\d+)"[^>]*(?:class="[^"]*Counter|data-view-component="true")[^>]*>/,
  );
  if (releaseCountMatch) {
    numReleases = parseInt(releaseCountMatch[1], 10);
  }

  return {
    description,
    website: websiteMatch?.[1] || null,
    stars: starsMatch?.[1]?.trim() || null,
    watchers: watchersMatch?.[1] || null,
    forks: forksMatch?.[1]?.trim() || null,
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

function extractGitHub<T>(payload: RawPayload, extra: T): GitHubCommon & T {
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
  const rawLines = blob.rawLines || [];
  const rawContent = rawLines.join("\n");
  const highlightedLines = blob.highlightedLines || [];
  const content = highlightedLines.map((line) => line.text || "").join("\n");

  // Calculate size from raw content if not provided
  const size = blob.size ?? (rawContent.length > 0 ? Buffer.byteLength(rawContent, "utf8") : null);

  return extractGitHub(payload, {
    content: content || rawContent,
    rawContent,
    language: blob.language || null,
    size,
  });
}
