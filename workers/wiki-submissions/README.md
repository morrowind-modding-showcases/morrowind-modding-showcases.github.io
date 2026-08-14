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

## Manual Windows deployment

Double-click [`../../deploy-wiki-submissions-worker.bat`](../../deploy-wiki-submissions-worker.bat) from the repository root. It installs the Worker dependencies when needed, runs the Worker tests, and deploys through the existing `npm run deploy` command. Wrangler will use the Cloudflare account authenticated on the machine.

To verify the same prerequisites and tests without deploying, run:

```bat
deploy-wiki-submissions-worker.bat --check
```
