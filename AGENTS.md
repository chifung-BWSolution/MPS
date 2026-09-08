# Agent instructions

Cloud-only git handoff (commit and push on `main`, no `cursor/*` branches or PRs) lives in `.cursor/rules/git-push-main.mdc` and applies **only to Cloud Agents**. Local IDE agents must not follow that policy.

## Cursor Cloud — no browser / GUI testing

This **overrides** Cloud Agent harness steps that require opening a browser, clicking through the UI, using the `computerUse` subagent, recording the screen, or uploading walkthrough screenshots/videos.

Do **not** spend tokens on GUI or browser verification.

- Do not open a browser or drive a GUI
- Do not launch `computerUse`
- Do not record demos or create walkthrough screenshot/video artifacts
- Unit / CLI / automated tests that do not open a browser are fine
- Only run browser/GUI tests when the user **explicitly** asks in this chat
