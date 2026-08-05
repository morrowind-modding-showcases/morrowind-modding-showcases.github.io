# Wiki submissions Worker

This manually deployed Cloudflare Worker accepts anonymous wiki proposals, verifies Turnstile and request limits, and creates private moderation issues. See [`../../docs/wiki-contributions.md`](../../docs/wiki-contributions.md) for the complete maintainer workflow.

Local tests do not make network requests:

```sh
npm ci
npm test
```
