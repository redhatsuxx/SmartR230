# SR230WEBSITE

Public marketing/informational website for **SmartR230**, at **www.smartr230.co.uk**
(already deployed and live). This project is the site's source and content —
it is **separate from R230Logic/Mila** (the sibling `SmartR230/` folder, a
Mercedes-Benz R230 CAN reverse-engineering environment and its C# WinForms
tool). The two projects share a product name and a long-term business
relationship (this site markets the product R230Logic's findings feed into),
but **no codebase, technology stack, or domain knowledge is shared between
them**.

**Do not pull in CAN bus / GVRET / Vario roof / R230 vehicle-signal context
when working here** — it isn't relevant to a marketing website and doesn't
belong in this project's code, copy, or commit history. If a task genuinely
needs to reference the other project (e.g. describing what the product does
on a features page), treat it as content to ask the user about or verify,
not as something to infer from R230Logic's internal technical files.

## Source of truth / provenance (established 2026-09-02)

The canonical source previously lived only at
`G:\My Drive\SmartR230\SmartR230 Website\` (a Google Drive-synced folder) -
the operator zips its contents and manually uploads that zip to **Cloudflare
Pages (free tier)** to deploy. This folder (`F:\Projects\SR230WEBSITE`) is now
the working copy for active development; the Drive folder is untouched and
still holds the operator's own copy. Reconcile any divergence with the
operator before overwriting either side.

What was found in the Drive folder:
- `smartr230_Production v1.zip` - the REAL current production build (matches
  the live site's content/structure). Contained `index.html` + `styles.css`
  (unused - the shipped index.html had every rule inlined in a `<style>`
  block instead) + a logo PNG (also unused - the shipped index.html embeds
  its logo as an inline base64 SVG instead) + a README describing an
  abandoned multi-page plan (`index.html`/`guidance.html`/`contact.html`)
  that was never built - the actual site is a single page.
  - Brought into this project as `index.html` (content preserved exactly)
    with its inline CSS extracted into `styles.css` (properly linked) now
    that more pages are coming - a pure refactor, no visual change.
- `index Holding page.html` - an OLD pre-launch "coming soon" placeholder,
  superseded by the production build above. Stale, not part of the current
  site - left untouched on the Drive, not brought into this project.
- `Graphics/` - real brand assets (multiple logo variants, a YouTube banner,
  `favicon.ico`) - copied into this project's `assets/` folder. The current
  index.html doesn't reference any of them yet (uses an inline SVG logo
  instead) except the newly-added favicon link.

## Current site content (as of the production zip)

Single page, dark theme (near-black `#0a0a0a` background, red `#e63946`
accent, green `#2ed573` for contrast/positive framing - not designed to
match Mila's unrelated silver/black/red theme, purely a coincidence both
lean red-accented). Sections: hero (logo/tagline/subtitle), "The Problem"
(problem vs. solution two-column), "What It Does" (description + a spec
list: compatibility, installation, protocol, power), "Pricing & Shipping"
(£85 + £3.50 UK shipping, international "on request"), "Get In Touch"
(mailto link as the ONLY current purchase path, YouTube channel link
confirmed correct by the operator: youtube.com/@SMARTR230, Facebook group
link), footer (trademark disclaimer).

No install page, no purchase automation, no email automation exist yet -
all genuinely new work, not modifying something broken.

## Established plan (2026-09-02, not yet built - review/discussion stage)

Operator wants, roughly in the order raised:
1. An "Install" page (or pages) with install links/guidance - relationship
   to the existing YouTube channel not yet nailed down (a page that embeds
   or links out to specific videos vs. a written guide - ask before
   building).
2. Direct links to the YouTube channel and (per the existing site) the
   Facebook group - largely already present on the home page; may just need
   surfacing in a nav bar once there's more than one page.
3. PayPal purchase flow for the emulator: buyer completes a PayPal payment
   on-site, buyer receives an order confirmation email, operator receives a
   "new order placed" notification email, with room for further automation
   later (unspecified scope - e.g. auto-issuing a license key, a fulfillment
   checklist, etc. - ask when it comes up).

Architecture implication of #3: a static site (what this is today) cannot
send custom branded confirmation emails or reliably notify the operator on
its own - that needs *some* server-side piece to receive a payment-completed
event and act on it. Since deployment is already on Cloudflare, **Cloudflare
Pages Functions** (serverless functions bundled with a Pages deploy, free
tier available) is the natural fit rather than standing up separate hosting
- a function would receive PayPal's webhook/IPN callback and call a
transactional email API (not yet chosen - e.g. Resend, Postmark; ask about
any existing preference) to send both emails. NOT implemented yet - this is
a build for later once the operator has answered the open questions below
and confirmed the approach.

Given deployment is currently a manual "zip it and drag it into Cloudflare"
step, moving to Cloudflare Pages Functions would also mean either (a)
including the functions in that same manual zip upload (Pages supports a
`functions/` directory in a direct-upload deploy) or (b) switching to
Cloudflare's git-integrated deployment (auto-deploys on push, no manual zip
step) - worth raising with the operator as a possible convenience upgrade,
not a requirement.

## Open questions (ask before building #3)

- PayPal integration is ON HOLD (2026-09-02): operator does not have a
  PayPal Business account (required for webhooks/IPN and the Smart
  Buttons/Checkout integration this needs) and does not want to set one up
  unless it turns out to be genuinely necessary. Do not build any PayPal
  code until this changes - focus on the simple/static work instead (install
  page, nav, auto-deploy).
- Transactional email: operator already has a **Resend** account - use that
  when the email-sending piece is eventually built, no need to evaluate
  alternatives.
- What exactly should "further automation" cover, if anything, beyond the
  two confirmation emails - fulfillment tracking, a license key, inventory/
  stock decrement, something else? Still open, not urgent while PayPal is on
  hold.
- Deploy workflow: CONFIRMED 2026-09-02 - moving to Cloudflare's
  git-integrated auto-deploy (see "Deploy setup" below), replacing the
  manual zip-upload process.

## Deploy setup (DONE, 2026-09-02)

Moved from manual zip-upload to git-based auto-deploy. Repo:
https://github.com/redhatsuxx/SmartR230 (main branch). Commit identity:
"SmartR230" / info@smartr230.co.uk.

IMPORTANT - this deploys as a **Cloudflare Worker with static assets**
(`npx wrangler deploy`, build log showed "Framework: Static", Worker name
"smartr230"), NOT classic Cloudflare Pages, even though it was set up
through the "Connect to Git" flow - Cloudflare's dashboard evidently routes
new static-site git connections through Workers+assets now. This matters
for anyone following Pages-specific instructions later: they won't match
what's actually here. Custom domain is attached via Workers & Pages ->
smartr230 (the Worker) -> Settings -> Domains & Routes -> Add Custom Domain,
not a Pages "Custom domains" tab.

`wrangler.jsonc` is committed (name: smartr230, assets.directory: ".") so
the build doesn't have to re-auto-detect settings on every deploy.

INCIDENT (2026-09-02, fixed same day): the first deploy uploaded the ENTIRE
`.git` directory (full history, objects, config) and CLAUDE.md as public
static assets, fetchable from the live URL - `wrangler deploy`'s asset
scanner doesn't respect `.gitignore` and there was no `.assetsignore` yet.
Confirmed nothing sensitive was ever committed (no API keys/credentials in
that first commit - just HTML/CSS/images/favicon and this file's planning
notes), so no secret leaked, but it's still bad practice and was fixed
immediately: added `.assetsignore` (excludes `.git`, `.gitignore`,
`.assetsignore` itself, `.wrangler`, `wrangler.jsonc`, `node_modules`,
`CLAUDE.md`) and pushed. **Any future file added to this repo that
shouldn't be publicly servable (secrets, internal notes, source maps, etc.)
must be added to `.assetsignore` too - being in `.gitignore` alone does
NOT stop wrangler from deploying it if it's already tracked.**
