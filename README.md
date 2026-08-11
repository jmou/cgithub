cgithub is a lightweight GitHub alternative frontend. It has no bloated
JavaScript and doesn't require API keys. It runs on Cloudflare Workers; to use
it, deploy your own instance then replace `github.com` in your URL with your
domain.

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

## Disclosures

AI coding assistants, in particular Claude, are used in the development process.

[Phospor Icons](https://phosphoricons.com/) used under MIT license.
