---
name: Managed Clerk auth flow
description: Rules for keeping Campus Pick authentication functional across preview and published builds.
---

Campus Pick uses Replit-managed Clerk for browser authentication. Sign-in and sign-up screens must use the Clerk React components with the hostname-resolved publishable key and the Clerk proxy URL; do not replace them with local placeholder forms.

**Why:** The original custom forms called preventDefault without sending credentials, so users could type into the UI but never create a session.

**How to apply:** Preserve the exact `/sign-in/*?` and `/sign-up/*?` routes, keep the Clerk provider around the Wouter router, and keep the branded appearance/logo in sync with the app.