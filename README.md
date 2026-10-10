# Impression Jewelry — "Never Miss a Customer" AI Demo

Personalized live demo for **Impression Jewelry by Kiran Rajput**
(luxury gold-plated replica jewelry — bridal sets, engagement rings,
necklaces, custom designs; appointments & online only, worldwide delivery).

AI concierge: **Zara**. All client-side, zero network calls.
Leads persist to localStorage (simulated owner dashboard).

## Flows (all live in the chat widget)
- **Greeting** — Zara introduces the boutique
- **In-chat booking** — styling appointment (interest → name → phone → day → time → reference `IJ-XXXXX`)
- **After-hours capture** — a midnight necklace question becomes a morning order (saved to dashboard)
- **Review routing** — 5 stars → Google nudge; 1–4 stars → private feedback to the store manager
- **Pricing answers** — bridal sets, rings, necklaces, earrings, custom, shipping, gold-plating info
- **Hours / location / human handoff** — WhatsApp +92 300 0000000 (demo placeholder)

## Personalization
`?biz=` `?tagline=` `?city=` `?addr=` `?phone=` rewrite the page; `?services=` / `?hours=`
deep-personalize the grid. Defaults are hardcoded for Impression Jewelry.

## Test hooks
`?fast=1` skips delays. `window.__maya` exposes BIZ, state, `send()`, `open/close`,
`pickStars`, `getLeads/clearLeads`. `window.__getLeads/__clearLeads` too.
