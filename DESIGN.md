---
version: alpha
name: TradingAgents Portal
description: A quiet research workspace with a forest-green navigation rail and readable configuration surfaces.
colors:
  primary: '#244a37'
  rail: '#102d28'
  background: '#f6f8f7'
  surface: '#ffffff'
  text: '#233a35'
  muted: '#596c62'
  border: '#e0e7e1'
  focus: '#44ad8f'
typography:
  sans:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
  mono:
    fontFamily: 'ui-monospace, monospace'
rounded:
  control: '6px'
  panel: '10px'
spacing:
  page: '42px'
  mobile: '20px'
components:
  button: {}
  login: {}
  feedback: {}
---

# TradingAgents Portal Design System

## Overview

The visual reference is a quiet research desk: forest-green navigation, white work
surfaces and clear status text. This is a product interface for people using the
existing TradingAgents runtime, not a trading terminal or marketing page.
English is the existing UI language; conversation language does not change the
product locale. No Japan-market or other jurisdiction-specific workflow is assumed.
User decisions on 2026-10-30: Google sign-in, explicitly allowed emails only,
allowlist initially empty. No public registration or password form.

Runtime CSS in `portal/frontend/src/styles.css` is canonical. This file mirrors
its shared values. The added auth surface consumes `--portal-*` properties rather
than defining a second visual system. Existing Dashboard and Settings are the
sibling references; preserve their navigation and layout.

## Colors

Primary and rail distinguish action/navigation from the neutral workspace.
White surfaces use border contrast rather than decorative shadows. Muted auth
copy uses the darker readable text token. Focus remains visible on all controls.

## Typography

Use the existing system sans stack for headings and body, monospace only for
configuration data. Login uses the existing 32px heading with restrained weight;
body copy is 14px with a 1.7 line height. No external font request.

## Layout

The existing desktop sidebar becomes top navigation below 720px. Login is a
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
| Auth | `components/AuthGate.tsx` | backend auth routes + user decisions | checking, signed out, signed in, expired | auth tests |
| Feedback | `components/States.tsx` | existing retry pattern | loading, error, empty | component tests |
| Navigation | `App.tsx` / React Router | registered routes | protected, login | route tests |
| Scrollbar | `styles.css` | runtime tokens | global, forced-colors | static audit + browser |

Buttons are semantic buttons/links with visible focus. Logout is reversible and
needs no confirmation; disable while in flight and retain the session on network
failure. A 401 clears protected content and returns to sign-in. The backend
validates permission on every protected request. Loading and API failures have
status/alert roles and retry actions. Do not put secrets into browser storage.

Only opacity/color transitions are needed; reduced-motion disables transitions.
No dialogs, data-entry widgets, table selection or toast library is introduced.

## Do's and Don'ts

- Do keep login, session expiry and logout feedback in the same visual language.
- Do show who is signed in and retain a safe intended route across authentication.
- Don't show private settings before the session check finishes.
- Don't fabricate login success or offer a bypass when Google is not configured.
