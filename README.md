# Slay or Nay

A mobile-friendly nail-product voting website, built from scratch for GitHub + Netlify.

## What is built

- Slay/Nay voting carousel, skip, product search and category filters.
- Free username/password accounts with private recovery codes; secure cookie sessions.
- One immutable vote per account/product, enforced by the database even for concurrent requests.
- Scores with vote counts. Daily picks use the previous UTC day, require 10 votes and a majority. All-time ranked lists require 10 votes.
- Product submissions by community members and brands, with admin approval.
- Admin product creation/editing/hiding and disclosed affiliate links.
- Admin product-detail lookup from public HTTPS pages (JSON-LD/Open Graph), with review before applying. Purchase/affiliate links are preserved; an optional separate source link can supply metadata.
- Admin photo upload, stored in Netlify Blobs. The browser resizes photos; the server validates, re-encodes as WebP, and strips metadata. No extra service account is needed.
- Four starter products with official product/image sources. All start with zero votes.

## Publish using your browser

1. In Netlify, choose **Add new project → Import an existing project → GitHub**, then select `jnthnlee19/SlayorNay`.
2. Netlify reads `netlify.toml`: build command `npm run build`, publish directory `dist`, Functions in `netlify/functions`, Node 22.
3. Enable **Netlify Database** for this project in the Netlify dashboard. This needs an eligible credit-based plan. Check usage/pricing in your account before enabling it. No separate database account is needed.
4. Redeploy after enabling the database. Netlify applies the SQL migration from `netlify/database/migrations` before publishing. The production runtime obtains its database connection through `@netlify/database`.
5. For your administrator account, set a long, random private value (at least 24 characters) for **ADMIN_SETUP_TOKEN** in Netlify's environment variables, with Functions scope. Redeploy after changing it. Never put this value in GitHub or share it in chat.
6. Create your own account on the live site, save the recovery code, open **Admin** in the footer, expand **Set up the site owner**, and enter that private setup code. Only one account can claim admin. Remove `ADMIN_SETUP_TOKEN` from Netlify and redeploy after claiming.

## Account recovery

Signup displays a private recovery code once. **Forgot password?** accepts the username, recovery code, and a new password. It rotates the recovery code and revokes existing sessions. This avoids adding an email delivery provider. Email verification and email password reset are not implemented. Save the recovery code: without it, self-service recovery is unavailable.

## Local development (for developers; owner does not need to run this)

`npm ci`, then `npm run dev` runs at `http://localhost:4173` with a separate persistent PGlite database in `.local-data/`. Local accounts/votes never go to Netlify. `npm test` uses an isolated in-memory Postgres-compatible database. `npm run build` syntax-checks source and copies public files into `dist`.

## Boundaries and launch checks

- GitHub stores code; Netlify hosts public assets, server functions, and the database. No extra service is required for the implemented features.
- Native mobile packages and store submissions are future work. The responsive UI and separate JSON API provide a foundation; an app conversion still requires mobile authentication/integration and device testing.
- Unique accounts prevent repeat clicks, not determined people creating multiple accounts. Rate limits reduce abuse but do not prove someone is a nail professional or a unique person.
- Production deployment, Netlify database integration, secure cookies over HTTPS, admin setup, and a real cross-device vote must be checked on the live Netlify URL before inviting users.
- Review branding, product-photo permissions, privacy notice, community moderation policy, and account deletion/data retention requirements before public promotion. Starter images are remote references from official product pages, not a claim of image licensing or endorsement.
- Product photos support HTTPS image URLs or JPEG/PNG/WebP uploads. Browser input limit: 15 MB, resized before upload; server input limit: 2 MB and 25 megapixels. Uploads are admin-only. Email notifications are not implemented.
- Automatic lookup is best-effort: stores that require JavaScript or block automated requests (including some TikTok Shop pages) need manual details/photo upload. Amazon product-content import is not connected; keep Amazon affiliate purchase links and use permitted images or Amazon's approved content tools.
- When an Amazon purchase link is marked affiliate, the site displays the Amazon Associate statement and a nearby commission disclosure. Register the live website in your Associates account and use your own properly generated affiliate links.
- WebMCP product search is feature-detected. Browser support is optional and is not required for ordinary use.

## Official image sources

- https://www.opi.com/products/nail-lacquer-bubble-bath
- https://www.opi.com/products/nail-lacquer-big-apple-red
- https://www.opi.com/products/top-base-coats-opi-top-coat
- https://www.cnd.com/products/solaroil

Do not commit secrets, `.env`, `node_modules`, or development database files.
