# GitHub Directory Listing Without API

## Summary

GitHub repository directory listings can be obtained **without using the API and without rate limits** by scraping the server-rendered HTML that GitHub sends to browsers.

## How It Works

When you visit a GitHub repository page in a browser, GitHub server-side renders the directory listing and embeds it as JSON data within `<script>` tags in the HTML. This approach avoids API rate limits entirely.

## The Pattern

**URL Pattern:** `https://github.com/{owner}/{repo}/tree/main/{path}`

This single URL pattern works for both root directories (with empty path) and subdirectories.

**Data Location:**
```html
<script type="application/json" data-target="react-app.embeddedData">
  {
    "payload": {
      "tree": {
        "items": [...]
      },
      ...
    }
  }
</script>
```

**Access Path:** `data.payload.tree.items`

## Item Structure

Each item in the `items` array has this structure:

```json
{
  "name": "filename.txt",
  "path": "path/to/filename.txt",
  "contentType": "file"  // or "directory"
}
```

## Complete Example

See `github-scraper.js` for a working implementation that:
- Fetches the HTML from GitHub
- Extracts the embedded JSON data
- Parses and returns the directory listing
- Works for both root and subdirectories
- Has zero API rate limits

## Usage

```bash
node github-scraper.js torvalds linux              # Root directory
node github-scraper.js torvalds linux Documentation # Subdirectory
node github-scraper.js git git Documentation/git    # Nested subdirectory
```

## Advantages Over API

| Feature | HTML Scraping | GitHub API |
|---------|--------------|------------|
| Rate Limits | None | 60/hour (unauth), 5000/hour (auth) |
| Authentication | Not required | Optional, but limits apply |
| Access | Any public repo | Any public repo |
| Stability | Depends on HTML structure | Stable API contract |

## Important Notes

1. **No authentication needed** - Works for all public repositories
2. **No rate limits** - Can scrape as many repos as needed
3. **Less stable** - HTML structure may change with GitHub updates
4. **Best for:** One-off scripts, personal tools, exploratory work
5. **Use API for:** Production applications, long-term projects

## Why This Works

GitHub uses server-side rendering to provide fast initial page loads. The directory data is embedded in the HTML so the page can render immediately without waiting for additional API calls. This embedded data is the same data that would come from the API, just pre-rendered in the page.
