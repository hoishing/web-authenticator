# Agent Instructions

- Be straightforward and direct. Do not predict the user's emotions or assume context that has not been given.
- Do not write unit tests unless explicitly asked.
- Create and update e2e tests for UI or feature changes.
- Remove e2e tests when the original UI or feature is removed.
- Version bump workflow: edit `pyproject.toml` or `package.json`, commit all files with a message summarizing the code changes, push, build, then publish. Do not run tests during that workflow.

## Project Runtime

Default to Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`.
- Use `bun test` instead of `jest` or `vitest`.
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`.
- Use `bun install` instead of `npm install`, `yarn install`, or `pnpm install`.
- Use `bun run <script>` instead of `npm run <script>`, `yarn run <script>`, or `pnpm run <script>`.
- Use `bunx <package> <command>` instead of `npx <package> <command>`.
- Bun automatically loads `.env`; do not add `dotenv`.

## Bun APIs

- Use `Bun.serve()` for HTTP/WebSocket routes; do not introduce `express`.
- Use `bun:sqlite` for SQLite; do not introduce `better-sqlite3`.
- Use `Bun.redis` for Redis; do not introduce `ioredis`.
- Use `Bun.sql` for Postgres; do not introduce `pg` or `postgres.js`.
- Use the built-in `WebSocket`; do not introduce `ws`.
- Prefer `Bun.file` over `node:fs` read/write helpers for app code.
- Prefer `Bun.$` over `execa`.

## Frontend And Testing

- This app uses Bun HTML imports with React and Tailwind. Do not add Vite.
- Run the app with `bun run dev` for local development.
- Run e2e tests with `bun run e2e`.
- The Playwright dev server is configured for `http://localhost:3000`.

## cmux Browser Control

This project is often worked on from inside a cmux terminal. Prefer cmux's in-app browser CLI/API when asked to open, inspect, navigate, click, type, screenshot, or debug the local app in the embedded browser.

Reference docs checked:

- `https://cmux.com/docs/getting-started`
- `https://cmux.com/docs/api`
- `https://cmux.com/docs/browser-automation`
- `https://cmux.com/docs/configuration`

Use the CLI first for normal browser work:

```sh
cmux capabilities --json
cmux identify --json
cmux browser open http://localhost:3000
cmux browser open-split http://localhost:3000
cmux browser identify
cmux browser surface:2 navigate http://localhost:3000 --snapshot-after
cmux browser surface:2 wait --load-state complete --timeout-ms 15000
cmux browser surface:2 snapshot --interactive --compact
cmux browser surface:2 screenshot --out /tmp/web-authenticator.png
```

Most `cmux browser` commands target a browser surface either positionally or with `--surface`:

```sh
cmux browser surface:2 url
cmux browser --surface surface:2 get title
```

Common interaction and inspection commands:

```sh
cmux browser surface:2 click "button[type='submit']" --snapshot-after
cmux browser surface:2 fill "#email" --text "ops@example.com"
cmux browser surface:2 press Enter
cmux browser surface:2 get text "h1"
cmux browser surface:2 get html "main"
cmux browser surface:2 is visible "#app"
cmux browser surface:2 find role button --name "Save"
cmux browser surface:2 console list
cmux browser surface:2 errors list
```

For persistent browser state or session debugging:

```sh
cmux browser surface:2 cookies get
cmux browser surface:2 storage local get theme
cmux browser surface:2 state save /tmp/web-authenticator-browser-state.json
cmux browser surface:2 state load /tmp/web-authenticator-browser-state.json
```

Use the socket API only for scripts or integrations that need direct protocol calls. The CLI and socket expose the same command surface.

- Discover the active socket with `cmux capabilities --json`; do not hard-code a path.
- The socket accepts one newline-terminated JSON request per call.
- Requests must use `method` and `params`; legacy `{"command":"..."}` payloads are not supported.
- Default access is normally restricted to processes spawned inside cmux (`cmuxOnly`). Keep it that way unless the user explicitly asks to change automation access.
- `CMUX_SOCKET_PATH` can override the socket path when needed.

Example socket calls:

```json
{"id":"ping","method":"system.ping","params":{}}
{"id":"identify","method":"system.identify","params":{}}
{"id":"browser-url","method":"browser.url.get","params":{"surface_id":"surface:2"}}
{"id":"browser-snapshot","method":"browser.snapshot","params":{"surface_id":"surface:2","interactive":true,"compact":true}}
```
