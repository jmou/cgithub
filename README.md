cgithub is a lightweight GitHub alternative frontend. It has no bloated
JavaScript and doesn't require API keys. It runs on Cloudflare Workers; to use
it, deploy your own instance then replace `github.com` in your URL with your
domain.

![Screenshot of cgithub repository page.](docs/screenshot.png)

## Features

Implemented:

- Repository overview
- Directory listing and file browsing (`tree`/`blob`)
- Commit history (but this often results in 429 Too Many Requests on Cloudflare)
- Issue and pull request lists and search (the search box leaves out a leading
  `is:issue` or `is:pr`, which the search type already says)
- Discussions, including organization discussions
- Release lists and details, with the releaser, tagged commit, and latest release
- Wiki
- User and organization profiles, and their repositories tab

Not implemented:

- Pull request and commit details
- Code search (GitHub requires signing in), and searching outside a repository
- Pagination (only the first page of issues, pull requests, discussions,
  commits, releases, branches, tags, and profile repositories is shown, and likewise only the replies
  GitHub sends with a discussion, and the timeline items it sends with an issue,
  rather than what is behind a "show more" button)
- Blame, contributors, stargazer/fork lists, network graphs, and insights
- Actions, checks, projects, packages, and gists
- Profile tabs other than the overview and repositories (projects, packages,
  people, sponsoring), and filtering the repositories tab
- Anything requiring an account: signing in, notifications, starring,
  commenting, editing, or any other write action
- Private repositories

## Browser extension redirects

cgithub redirects unsupported routes back to github.com. A browser extension
that rewrites github.com URLs to a cgithub instance with `declarativeNetRequest`
will match those redirects and send the request back, looping forever. To avoid
this, the extension should configure `excludedInitiatorDomains` with the cgithub
domain:

```jsonc
{
  "action": {
    "type": "redirect",
    "redirect": { "transform": { "host": "cgithub.example" } },
  },
  "condition": {
    "urlFilter": "||github.com",
    "resourceTypes": ["main_frame"],
    // So cgithub's own meta refresh to github.com isn't redirected back here.
    "excludedInitiatorDomains": ["cgithub.example"],
  },
}
```

## Related

- [GotHub](https://codeberg.org/gothub/gothub)

## Disclosures

AI coding assistants, in particular Claude, are used in the development process.

[Phospor Icons](https://phosphoricons.com/) used under MIT license.
