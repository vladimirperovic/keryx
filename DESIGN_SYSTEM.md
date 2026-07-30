# Keryx Design System

The landing page uses the **Herald** visual language: a dark signal-room interface with warm amber accents, editorial serif headings, and monospace technical details.

## Principles

- Technical, not corporate.
- High contrast and readable before decorative.
- Motion should clarify hierarchy and respect reduced-motion preferences.
- The landing page must remain static, dependency-light, and safe to serve from the gateway process.

## Core tokens

- Ink surfaces: `#0a0a0c`, `#0f0f12`, `#141418`.
- Bone text: `#f4efe6`, `#d8d2c4`, `#9b958a`.
- Beacon accent: `#e8b07d`.
- Success signal: `#8ab4a1`.
- Information blue: `#7fa7d9`.
- Warning ember: `#d97757`.

## Typography

- Display: Fraunces with a Georgia fallback.
- Interface: Geist with system fallbacks.
- Technical/data: JetBrains Mono with monospace fallbacks.

External font loading is optional. The Content Security Policy permits the current Google Fonts origins; self-hosting is preferred for fully offline installations.

## Security constraints

- Do not add third-party analytics or remote scripts by default.
- Do not display runtime tokens, private URLs, request bodies, or upstream data.
- Keep links to repository documentation explicit and reviewable.
- Any new external origin must be reflected in the Content Security Policy and justified in the pull request.
