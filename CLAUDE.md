# SR230WEBSITE

Public marketing/informational website for **SmartR230**, at
**smartr230.co.uk** (already deployed and live - the apex domain; see
"DNS note" under Deploy setup below, `www.` does NOT resolve). This project
is the site's source and content —
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

Deliberately **UK-only for now**: because the operator has sold
internationally (US, Europe) at different actual shipping costs each time
and there's no fixed international rate to hardcode into a button yet - the
page's "Shipping outside the UK?" section keeps the same request-based flow
already on the home page (email `payments@smartr230.co.uk` for a quote),
just pointed at a page instead of the general enquiry line. Revisit if/when
the operator settles on fixed international shipping tiers (e.g. one flat
EU rate, one flat US rate) - at that point this would become multiple
buttons or a shipping-selection button rather than the current single form.

QUANTITY (added 2026-09-07, up to 5): the operator confirmed UK shipping is
a single flat £3.50 regardless of how many units go to the same address in
one order, for 1-5 units (their real-world shipping cost doesn't scale with
box count in that range). Rather than one fixed `amount` (which only worked
for qty=1), the form now uses PayPal Website Payments Standard's native
per-item pricing: `amount=85.00` (per unit) with a `<select name="quantity">`
dropdown (1-5) that PayPal reads directly as the line-item multiplier, plus
`shipping=3.50` (first-item shipping) and `shipping2=0.00` (shipping for
each ADDITIONAL item) - so PayPal computes item total + one flat shipping
charge no matter which quantity 1-5 is picked, without needing any
per-quantity price logic on our side. A small inline `<script>` (`updateTotal()`,
wired to the select's `onchange`) re-renders the on-page price display
(`#totalPrice`) to match PayPal's own math live, purely so the number shown
here never disagrees with what PayPal will actually charge at checkout -
this does NOT feed back into the form submission itself, it's a display-only
mirror of the same formula. Not yet tested against a real quantity>1
transaction end-to-end - worth a real order or PayPal sandbox test before
fully going live, since `shipping`/`shipping2` behavior was implemented from
documented PayPal Website Payments Standard semantics, not verified live.

BUTTON STYLING (2026-09-07): the operator found PayPal's classic hosted
button image (`btn_buynowCC_LG.gif`) looked unprofessional/dated, and
separately supplied a code snippet from a DIFFERENT, newer PayPal button
type (a hosted "Buy Now" link via `paypal.com/ncp/payment/<id>`, generated
in their PayPal account's own button/payment-link tool). That newer type
was evaluated and NOT adopted - it accepts no overridable form fields at
all (price/quantity/shipping are configured against that button's ID
entirely inside PayPal's dashboard), which is incompatible with the
per-quantity pricing above being controlled from our own HTML. Operator
chose to keep the self-hosted `_xclick` form and just restyle the trigger:
replaced the `<input type="image">` GIF with a plain `<button>` styled by
a new `.paypal-buy-btn` class in styles.css (solid `#e63946` fill, matching
the site's existing accent/button treatment), labelled "PayPal Buy Now".

LIVE ON THE HOME PAGE (2026-09-07): the whole order box (pricing, quantity
selector, PayPal Buy Now button, international-shipping note) was merged
into `index.html` itself, replacing its old static "Pricing & Shipping"
section - retitled **"Order the SmartR230 BCM Emulator"**. This is the site
going live for real with on-page purchasing; the "add a nav link when ready"
step once planned here is now moot since the buy flow IS the pricing
section, not a separate linked-to page.

`order.html` existed as a duplicate of index.html's order section (not the
canonical buy flow) for a while - now moot: **removed 2026-09-28**, same day
as the PayPal migration below, at the operator's request, since it was
redundant, unlinked, and would otherwise have needed the same PayPal fix
applied a second time by hand (see the copy-paste sync-drift warning that
used to be here). The order flow now lives only on `index.html`.

## PayPal migrated to JS SDK Smart Button (DONE, 2026-09-28)

The classic `_xclick`/`cgi-bin/webscr` button (described above) started
failing live in production with PayPal's generic "things don't appear to be
working right now, please try again later" error. Cause: PayPal deprecated
Website Payments Standard starting January 2026, with full shutdown expected
January 2027 - the classic button type was simply no longer being accepted,
not a bug in this site's code.

Fix, in both `index.html` and `order.html`:
- Removed the `<form action="https://www.paypal.com/cgi-bin/webscr">` block,
  the quantity `<select>`, and the `updateTotal()` script entirely.
- Replaced with PayPal's modern **JS SDK Smart Button**
  (`paypal.com/sdk/js?client-id=...&currency=GBP`), rendering into a
  `<div id="paypal-button-container">`. `createOrder` hardcodes a single
  fixed-price purchase unit (`88.50 GBP` = £85 unit + £3.50 shipping),
  `onApprove` captures the order and shows a plain thank-you message in
  `#paypal-status`, `onError` shows a fallback message pointing to
  `payments@smartr230.co.uk`.
- Client ID is a **public** identifier (safe to embed in frontend JS/HTML,
  unlike the Client Secret which must never appear client-side) - operator
  retrieved it from developer.paypal.com -> Apps & Credentials -> Live.

**Design decision (operator, 2026-09-28): dropped multi-unit ordering
entirely** rather than rebuilding per-quantity pricing against the new
button type (which - unlike the old `_xclick` form - doesn't take
overridable amount/quantity fields the way this site's HTML previously
drove them). Anyone wanting more than one unit, or international shipping,
now uses the same existing "email payments@smartr230.co.uk for a quote"
path on both pages. If per-quantity self-serve ordering is wanted again
later, it would need to be built as multiple fixed-amount `createOrder`
calls switched by a selector, or quantity multiplied into `amount.value`
client-side before `actions.order.create()` - not evaluated/built here.

Removed the now-unused `.paypal-buy-btn` CSS class from `styles.css` (was
only used by the old `<button type="submit">` inside the removed form).

**Still true from the old build, unchanged:** no webhook/IPN, no Resend
confirmation emails - PayPal's own checkout flow (now the JS SDK popup/
redirect rather than the old hosted receipt page) is still standing in for
that. `order.html` and `index.html` still have to be kept in sync by hand
(no templating on this static site) - both were updated together here.

## Added a second PayPal button for US orders (DONE, 2026-09-28)

Same day as the JS SDK migration above. Operator wanted a fixed US rate
($148, inc. shipping) alongside the existing UK button (£88.50), explicitly
**US-only** - every other country (Canada, EU, Australia, etc.) still uses
the "email payments@smartr230.co.uk for a quote" path, deliberately not
relabelled as a general "international" rate, since actual shipping costs
vary by destination and a flat US rate applied elsewhere would just get
buyers the wrong price. Decision driven by wanting an unambiguous, low-
confusion buyer experience over trying to cover more countries at once.

Technical approach: PayPal's JS SDK ties one `<script src="...sdk/js?...">`
load to one `currency` - you cannot mix currencies through a single loaded
instance. Used PayPal's documented **multi-currency pattern**: two SDK
`<script>` tags on the same page, each with its own `data-namespace`
(`paypal_uk` / `paypal_us`) so they don't collide on the global `window.paypal`
object, each with its own `currency` query param (GBP / USD) and its own
`components=buttons`. Two `paypal_uk.Buttons(...)` / `paypal_us.Buttons(...)`
instances render into two separate containers
(`#paypal-button-container-uk` / `-us`), each with its own hardcoded
fixed-price `createOrder` (`88.50 GBP` / `148.00 USD`) - same
capture/thank-you/error pattern as before, sharing one `#paypal-status`
line via a small `showPaypalStatus()` helper instead of two copies of the
inline handler logic.

Layout: `index.html`'s single `.pricing` box became a `.pricing-options`
CSS grid holding two `.pricing` boxes side by side ("UK Orders" / "US
Orders"), reusing the same visual style as the existing "Problem vs.
Solution" two-column section (`.problem-solution`) for consistency -
stacks to one column under 768px via the same media-query pattern.

**Correction (2026-09-28, same day):** originally added a note claiming
import/customs fees were the buyer's responsibility and not included -
this was wrong, an unconfirmed assumption on Claude's part rather than
anything the operator said. Operator corrected it: the $148 US price is
inclusive of delivery, customs, and import fees. Copy under the US button
now reads "Delivery, customs and import fees all included." and the
`createOrder` description string was updated to match. **Lesson for future
edits here: don't add claims about what a price does/doesn't cover without
explicit confirmation from the operator** - get it in writing from them
first, this is exactly the kind of detail that causes real customer
confusion/complaints if wrong.

**Not verified:** operator's PayPal Business account receiving USD without
issues (currency conversion on withdrawal, any account restrictions) -
that's a PayPal account setting, not something checkable from this repo;
worth the operator confirming directly with PayPal if not already done.

If a third country/currency is ever wanted, follow the same pattern: a
third namespaced SDK script + button pair, not a rebuild of the existing
two.

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

DNS NOTE (found 2026-09-07, not yet fixed): **`www.smartr230.co.uk` does not
resolve at all** (NXDOMAIN) - only the apex `smartr230.co.uk` has DNS records
and serves the site. This contradicts earlier notes/copy in this file
referring to "www.smartr230.co.uk" as the live URL - those were wrong/stale,
not a regression from anything built here. Use the apex domain in any
future hardcoded URL (PayPal return/cancel URLs, meta tags, etc.) until the
operator adds a `www` CNAME/record in Cloudflare DNS (or decides not to
bother, since the apex works fine on its own). Separately, Cloudflare's
Workers static-assets host 301/307-redirects `/<page>.html` to the
extensionless `/<page>` - link to/from the extensionless path where
possible to avoid the extra redirect hop.

## SEO (2026-10-03)

Goal: maximise how easily the site is found. Target audience: owners of a
Mercedes SL R230, and people looking to buy one. Plan agreed with the
operator: (1) audit, (2) on-page basics, (3) Search Console, (4) content
pages for real searches, (5) off-site signals (YouTube, Facebook group,
R230/SL forums).

Done (step 2, commit 8d0ba9c from a claude.ai session, merged 2026-10-03):
titles/meta descriptions, canonical URLs, Open Graph tags, Product JSON-LD
(GBP + USD offers), one `<h1>` per page (`h1.tagline`), image dimensions,
extensionless links, `robots.txt`, `sitemap.xml`. Install guide is public.

Rules for future edits:
- Canonicals and sitemap use the apex domain, extensionless paths
  (`https://smartr230.co.uk/install-instructions`).
- Every new public page goes in `sitemap.xml` (update `lastmod`) and gets
  its own title, meta description, canonical and OG tags.
- Product availability is `https://schema.org/MadeToOrder` - the operator
  sells to order. Don't change it to InStock.
- Firmware Updater (`update/flash.html`) and the clock placeholder
  (`clock-time.html`) are `noindex` and stay out of the sitemap. Don't block
  them in `robots.txt` - Google must be able to crawl them to see noindex.
- Price wording in meta/schema must match the on-page wording exactly (see
  the pricing-claims lesson above).
- `Firmware/` and `Claude MD/` are local-only: in both `.gitignore` and
  `.assetsignore`.
