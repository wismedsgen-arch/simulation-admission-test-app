# Project Context

## Institutional Context

- This app is for the Weizmann Institute of Science.
- The more specific public-facing institutional anchor is the Miriam and Aaron Gutwirth MD-PhD Program.
- Official context reference used while shaping the product tone and branding:
  - `https://www.weizmann.ac.il/mdphd/`

## Product Framing

- The product name is `Weizmann Mail`.
- It should feel institution-specific and official, not like a generic Gmail clone.
- Avoid copy that over-explains the exam mechanics on public pages.
- Prefer subtle institutional signals:
  - Weizmann Institute of Science
  - Miriam and Aaron Gutwirth MD-PhD Program
  - clean academic / official tone

## UI Direction

- Keep the Gmail-inspired clarity and familiarity.
- Use the real Weizmann logo from `public/WIS_logo.png`.
- Favor clean white surfaces, soft blue accents, rounded panels, and restrained institutional copy.
- Public pages should communicate:
  - this is a Weizmann system
  - this is for the MD-PhD admissions context
  - student access is intentional and limited

## Session Model

- Psychologists claim students from a waiting pool.
- Releasing instructions creates `READY` sessions and shows instructions to students, but does not start the test.
- Students do not start the test themselves.
- Psychologists start the test for the released pool from the session desk.
- The live mailbox is only available once the session is `ACTIVE`.

## Mail UX Rules

- Only one major panel should be open at a time:
  - list
  - read view
  - compose
- Students and psychologists both have:
  - Inbox
  - Sent
  - Trash
- Psychologists need clear unresolved-message visibility and a way to mark messages handled without replying.

## Deployment Notes

- Sanitized copy note: the values below are documented fillers, not real deploy
  secrets or live service identifiers.
- Production URL:
  - `https://filler-production-url.example.com`
- Railway deploy and auth details live in:
  - `CODEX_EDITING_AND_DEPLOYING_NOTES.md`
