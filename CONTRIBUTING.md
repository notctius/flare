# Contributing to Flare

Thanks for helping out! Whether you found a bug, have a feature idea, or want to
write code, here's how to get involved.

## Ways to contribute

- **Report a bug** — open an issue. Include what you were doing, what you
  expected, what happened, your browser + OS, and the exact steps to reproduce.
  Console errors help a lot (copy them into the issue).
- **Suggest a feature** — open an issue with a short description of the feature
  and why it's useful.
- **Ask questions** — use GitHub Discussions if enabled, or open a question issue.
- **Write code** — pick an open issue, comment that you're working on it, then
  open a pull request.

## Development setup

```bash
npm install
npm run dev
```

Optionally, you can open the folder with a static server (e.g. VS Code Live
Server) — see the README. The app needs internet on first load to fetch Three.js
from the CDN.

## Code style

- Keep it simple and readable. This is a small, dependency-light project.
- New mesh operations that are pure math/logic should go in `src/mesh/`
  (e.g. `ops.js`, `BMesh.js`) so they can be unit-tested without a browser.
- Tests: run `node src/mesh/ops.test.js`.

## Opening a pull request

1. Fork the repo and create a branch.
2. Make your change and test it in the browser.
3. Make sure any new mesh math has a test if practical.
4. Open a PR against `main` and describe what changed and why.

## License

Flare is MIT-licensed (see `LICENSE`). By contributing you agree to license your
contribution under the same terms.
