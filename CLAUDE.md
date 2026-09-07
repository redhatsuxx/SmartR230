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

## PayPal Buy Now button (DONE - first cut, 2026-09-07)

Operator now has a PayPal Business account (the "on hold" note below is
superseded for the simple button case - it still applies to the fuller
webhook/automation build). Built `order.html`: a standalone order page
using PayPal's classic hosted `_xclick` Buy Now button (form POSTs to
`https://www.paypal.com/cgi-bin/webscr`, `business=payments@smartr230.co.uk`
- see the payments@ mailbox set up 2026-09-07) rather than a PayPal-dashboard
-generated Smart Button, specifically so it needed no PayPal-side button
creation - just the business email. No webhook/IPN, no confirmation emails,
no Resend integration yet - PayPal's own hosted checkout/receipt page is the
entire flow for now, deliberately deferring the "further automation" scope
from the original plan below.

Deliberately **UK-only for now**: single fixed price £88.50 (£85 item + £3.50
UK shipping bundled into one `amount`), because the operator has sold
internationally (US, Europe) at different actual shipping costs each time
and there's no fixed international rate to hardcode into a button yet - the
page's "Shipping outside the UK?" section keeps the same request-based flow
already on the home page (email `payments@smartr230.co.uk` for a quote),
just pointed at a page instead of the general enquiry line. Revisit if/when
the operator settles on fixed international shipping tiers (e.g. one flat
EU rate, one flat US rate) - at that point this would become multiple
buttons or a shipping-selection button rather than the current single form.

**Deliberately UNLINKED** - no page on the live site links to `order.html`
(confirmed via a repo-wide grep before considering this done) and it carries
`<meta name="robots" content="noindex, nofollow">`, per the operator's
explicit request to review the live PayPal flow privately before going live.
Since deploy is git auto-deploy (see "Deploy setup" below), pushing this
file DOES make it publicly fetchable at the URL for anyone who has it - "no
links" means undiscoverable via navigation/search, not access-controlled.
**When ready to go live: add a nav link (and probably a "Buy Now" callout
on the home page's Pricing section) pointing to `order.html`, and consider
removing the noindex/nofollow meta tag at the same time.**

## Open questions (ask before building the rest of #3)

- Transactional email: operator already has a **Resend** account - use that
  when the fuller email-sending piece (order confirmation to buyer +
  new-order notification to operator) is eventually built, no need to
  evaluate alternatives. The Buy Now button above does NOT send either
  email yet - PayPal's own receipt page is standing in for that.
- Fixed international shipping tiers not yet defined (see above) - needed
  before an international Buy Now option can be built the same way.
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
