---
title: Browser Extension Email Capture
description: "Capture Gmail, Outlook, Fastmail, and other webmail messages into Streamient projects with the Chrome browser extension's one-click email action."
---

# Email Capture

The Streamient browser extension can store the email you are viewing into a project. It does not triage, summarize, suggest replies, create drafts, send mail, or manage internal notes. Use Mailtwine for those mail workflows.

## Supported Clients

- Gmail
- Outlook Web
- Fastmail
- Generic webmail fallback

## Action

- **Add Email** — extracts the message headers/body from the current page and stores it in Streamient.

The destination is your configured email project. The extension sends the extracted email to `POST /api/v1/emails`.

## Related

- [Email Storage](/guide/email/)
- [Forwarding Email](/guide/email/forwarding)
