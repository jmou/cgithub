cgithub is a lightweight GitHub alternative frontend. It has no bloated
JavaScript and doesn't require API keys. It runs on Cloudflare Workers; to use
it, deploy your own instance then replace `github.com` in your URL with your
domain.

![Screenshot of cgithub repository page.](docs/screenshot.png)

## Development

To run the server locally:
```
$ pnpm run dev
```

To run tests:
```
$ pnpm test
```

## Deployment

To deploy to Cloudflare Workers:
```
$ pnpm run deploy
```

The worker name and other settings live in `wrangler.jsonc`.

## Browser extension redirects

Pages cgithub can't render (marketing pages, code search, anything unrouted) are
redirected back to github.com. A browser extension that rewrites github.com URLs
to a cgithub instance with `declarativeNetRequest` will match those redirects
too and send the request straight back, looping forever.

To avoid this, cgithub never answers with an HTTP redirect: it serves a small
page that navigates to github.com with a two-second `<meta http-equiv="refresh">`.
Because that navigation is initiated by the cgithub origin, the extension can
let it through with `excludedInitiatorDomains`; without that, the user at least
lands on a page they can stop on, with a link, instead of an endless loop.

A rule that redirects to a cgithub instance should therefore look like this:

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

## Disclosures

AI coding assistants, in particular Claude, are used in the development process.

[Phospor Icons](https://phosphoricons.com/) used under MIT license.
