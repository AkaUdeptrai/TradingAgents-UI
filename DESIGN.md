---
version: alpha
name: TradingAgents UI
description: A calm, light research workspace with one forest-green accent, grouped settings and compact status.
colors:
  primary: '#1f5c43'
  primary-soft: '#e8f2ec'
  background: '#f7f8f7'
  surface: '#ffffff'
  text: '#17251f'
  muted: '#5f6f67'
  border: '#e3e8e5'
  focus: '#3a9c78'
typography:
  sans:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
  mono:
    fontFamily: 'ui-monospace, monospace'
rounded:
  control: '6px'
  panel: '10px'
spacing:
  page: '32px'
  mobile: '16px'
components:
  button: {}
  login: {}
  feedback: {}
---

# TradingAgents UI Design System

## Overview

The visual reference is a quiet research desk: a light sidebar, white work surfaces,
one forest-green accent for actions and the active route, and compact status text. This is a product interface for people using the
existing TradingAgents runtime, not a trading terminal or marketing page.
The TradingAgents UI interface is localized in Vietnamese. No Japan-market or other
jurisdiction-specific workflow is assumed.
User decisions on 2026-10-30: Google sign-in, explicitly allowed emails only,
allowlist initially empty. No public registration or password form.

Tokens live in `frontend/src/tokens.css`; components in `styles.css`.
This file mirrors their shared values. The login surface uses the same tokens.

Layout rules (2026-11 redesign):
- Sidebar: brand, five routes, then the signed-in account with an icon logout button.
  No topbar or footer; the app name is not repeated on every screen.
- Every page starts with `.page-header` (title, one-line purpose, optional primary action).
- Forms with results (Phân tích mới, Lịch tự động) use `.split`: form left, output right.
- Settings are grouped (Mô hình AI, Quy trình phân tích, Tin tức & dữ liệu, Nâng cao).
  JSON-valued keys stay in the collapsed "Nâng cao" group. A sticky save bar appears
  only for admins with unsaved changes.
- Status uses badges (`.badge.status-*`, `.badge.rating-*`); no large status cards.

## Colors

The primary green marks actions and the active route; everything else stays neutral.
White surfaces use border contrast rather than decorative shadows. Muted auth
copy uses the darker readable text token. Focus remains visible on all controls.

## Typography

Use the existing system sans stack for headings and body, monospace only for
configuration data. Login uses the existing 32px heading with restrained weight;
body copy is 14px with a 1.7 line height. No external font request.

## Layout

The desktop sidebar becomes a top bar with horizontally scrolling navigation below 760px. Login is a
centered, max-width 460px surface with natural document scrolling; at narrow
widths it retains 20px page padding. Keep the Google action at a stable height
and leave room for inline messages. Long email addresses wrap without clipping.

## Elevation & Depth

Thin borders and surface contrast establish depth. No new modal, overlay or
background imagery is required by sign-in.

## Shapes

Reuse 6px controls and 10px panels. The existing ta-arrow mark carries identity;
Google provider identification must remain clearly labeled in text.

## Components

### Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Auth | `components/AuthGate.tsx` | internal auth routes + user decisions | checking, signed out, signed in, expired | auth tests |
| Feedback | `components/States.tsx` | existing retry pattern | loading, error, empty | component tests |
| Navigation | `App.tsx` / React Router | registered routes | protected, login | route tests |
| Scrollbar | `base.css` | `tokens.css` | global, forced-colors | static audit + browser |

Buttons are semantic buttons/links with visible focus. Logout is reversible and
needs no confirmation; disable while in flight and retain the session on network
failure. A 401 clears protected content and returns to sign-in. The application
validates permission on every protected request. Loading and request failures have
status/alert roles and retry actions. Do not put secrets into browser storage.

Only opacity/color transitions are needed; reduced-motion disables transitions.
No custom dialogs or toast library. Deleting a scan asks for a native confirmation.

## Do's and Don'ts

- Do keep login, session expiry and logout feedback in the same visual language.
- Do show who is signed in and retain a safe intended route across authentication.
- Don't show private settings before the session check finishes.
- Don't fabricate login success or offer a bypass when Google is not configured.
