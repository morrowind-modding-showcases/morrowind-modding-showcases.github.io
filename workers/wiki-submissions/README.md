# Wiki submissions Worker

This manually deployed Cloudflare Worker accepts anonymous wiki proposals, verifies Turnstile and request limits, dispatches the repository workflow that creates canonical review pull requests, and proxies single-mod Nexus metadata lookups without exposing the API key. See [`../../docs/wiki-contributions.md`](../../docs/wiki-contributions.md) for the complete maintainer workflow.

Production requires these externally managed secrets:

- `GITHUB_WORKFLOW_TOKEN`
- `TURNSTILE_SECRET_KEY`
- `NEXUS_API_KEY`

Local tests do not make network requests:

```sh
npm ci
npm test
```
