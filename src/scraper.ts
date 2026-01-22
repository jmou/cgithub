export interface GitHubTreeItem {
  name: string;
  path: string;
  contentType: "directory" | "file";
}

export interface GitHubTree {
  path: string;
  branch: string;
  items: GitHubTreeItem[];
  repo: {
    name: string;
    owner: string;
    isPublic: boolean;
  };
}

export interface GitHubBlob {
  path: string;
  branch: string;
  content: string;
  rawContent: string;
  language: string | null;
  size: number;
  repo: {
    name: string;
    owner: string;
    isPublic: boolean;
  };
}

export async function getGitHubTree(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<GitHubTree> {
  const url = `https://github.com/${owner}/${repo}/tree/${branch}/${path}`;

  // GitHub throttles/blocks requests without realistic browser headers.
  // These headers make the request appear as a standard browser visit.
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });
  const html = await response.text();

  // GitHub uses different formats for root vs subdirectories.
  let payload;

  // Try root format first.
  const rootFormatMatches = [
    ...html.matchAll(
      /<script type="application\/json" data-target="react-partial\.embeddedData">([^<]+)<\/script>/g,
    ),
  ];
  for (const match of rootFormatMatches) {
    try {
      const data = JSON.parse(match[1]);
      if (data.props?.initialPayload?.tree) {
        payload = data.props.initialPayload;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // Try subdirectory format.
  if (!payload) {
    const dirFormatMatch = html.match(
      /<script type="application\/json" data-target="react-app\.embeddedData">([^<]+)<\/script>/,
    );
    if (dirFormatMatch) {
      try {
        const data = JSON.parse(dirFormatMatch[1]);
        if (data.payload?.tree) {
          payload = data.payload;
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }

  if (!payload) {
    throw new Error("Could not find tree data in embedded JSON");
  }

  return {
    path: payload.path,
    branch: payload.refInfo.name,
    items: payload.tree.items,
    repo: {
      name: payload.repo.name,
      owner: payload.repo.ownerLogin,
      isPublic: payload.repo.public,
    },
  };
}

export async function getGitHubBlob(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<GitHubBlob> {
  const url = `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });
  const html = await response.text();

  // GitHub embeds file data in a JSON script tag
  let payload;

  const match = html.match(
    /<script type="application\/json" data-target="react-app\.embeddedData">([^<]+)<\/script>/,
  );
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      if (data.payload?.blob) {
        payload = data.payload;
      }
    } catch (e) {
      // Skip invalid JSON
    }
  }

  if (!payload) {
    throw new Error("Could not find blob data in embedded JSON");
  }

  const blob = payload.blob;
  const rawLines = blob.rawLines || [];
  const rawContent = rawLines.join("\n");
  const highlightedLines = blob.highlightedLines || [];
  const content = highlightedLines
    .map((line: any) => line.text || "")
    .join("\n");

  return {
    path: payload.path,
    branch: payload.refInfo.name,
    content: content || rawContent,
    rawContent,
    language: blob.language || null,
    size: blob.size,
    repo: {
      name: payload.repo.name,
      owner: payload.repo.ownerLogin,
      isPublic: payload.repo.public,
    },
  };
}
