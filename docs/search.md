# Search routes and `q=`

Every repository page shares one search form (`views/layouts/repo.eta`): a text
box named `q` and a type dropdown named `type`, submitted to
`/:owner/:repo/search`. The type is the only thing that decides which list a
search goes to, so the box never shows GitHub's `is:issue` or `is:pr`
qualifiers. They would be cumbersome to edit and only repeat the dropdown.

The qualifiers still have to reach GitHub, and they stay in our URLs, so a
github.com link and its cgithub counterpart carry the same query.

## The leading type

Only a leading `is:issue` or `is:pr` counts as the search's type
(`splitSearchType` in `src/app.ts`). It must be the very start of `q`, followed
by a single space or the end of `q`. Anything else is an ordinary part of the
query, sent to GitHub and shown in the box unchanged:

| `q`                | Type    | Shown in the box |
| ------------------ | ------- | ---------------- |
| `is:issue label:x` | `issue` | `label:x`        |
| `is:pr`            | `pr`    | (empty)          |
| `is:issue is:pr x` | `issue` | `is:pr x`        |
| `label:x is:pr`    | none    | `label:x is:pr`  |
| ` is:issue x`      | none    | ` is:issue x`    |
| `-is:pr x`         | none    | `-is:pr x`       |
| `IS:ISSUE x`       | none    | `IS:ISSUE x`     |

GitHub's other spellings (`is:pull-request`, `type:pr`, and so on) aren't
recognized either. Keeping the rule this narrow means stripping and restoring
the type can never change what the rest of the query means.

## Routes

### `/:owner/:repo/search`

Where the form submits. It turns `type` into a list and puts the type in front
of `q`:

| `type`             | Redirect                                      |
| ------------------ | --------------------------------------------- |
| `issues` (default) | `/:owner/:repo/issues?q=is:issue <q>`         |
| `pullrequests`     | `/:owner/:repo/pulls?q=is:pr <q>`             |
| `discussions`      | `/:owner/:repo/discussions?discussions_q=<q>` |
| anything else      | GitHub (code search requires signing in)      |

The type is added even when `q` already starts with one. The box only ever shows
`q` without its leading type, so submitting it again must restore that type
rather than read the next one: a box showing `is:pr foo` with Issues selected
searches issues for `is:issue is:pr foo` and stays on the issue list, instead of
flipping to pull requests.

An empty `q` redirects to the list without `q=`, so the type is never the whole
query. That shows GitHub's default list (open issues or pull requests) rather
than everything the bare `is:issue` would match.

### `/:owner/:repo/issues` and `/:owner/:repo/pulls`

Each list takes `q` from its URL, which is either from the search form or a
github.com link:

1. No `q`, or an empty one: render GitHub's default list.
2. A leading type naming the other list: redirect there with `q` unchanged, so
   `/issues?q=is:pr foo` becomes `/pulls?q=is:pr foo`.
3. Otherwise, fetch from GitHub with the list's type in front of `q` (or `q` as
   it is if it already starts with that type), and show the rest in the box.

The type must be sent: without `is:issue`, GitHub's issue list mixes in pull
requests, which come back in a different shape that `getGitHubIssues` can't
parse. The pull request list gets `is:pr` the same way, for symmetry.

### `/:owner/:repo/discussions`

Discussions have no type qualifier, and their query is `discussions_q`, as on
GitHub. It is passed through unchanged.

### `/search`

GitHub's global search isn't supported and redirects to GitHub. It has its own
route only so `/search` isn't scraped as a user called "search". Scoping a
global search to a repository would mean guessing: GitHub picks the result kind
from `type`, which isn't always in the URL, rather than from an `is:`
qualifier.
