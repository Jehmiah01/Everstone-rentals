# Everstone Rentals

Car rental website for Everstone Consulting Group LLC (Baltimore, MD): booking calendar, online rental agreements with e-signature and PDF copies, Square checkout, one-time license + selfie check, and an owner dashboard at `/admin`.

Runs on Cloudflare Workers (free plan) with D1 (database) and KV (file storage).

- Build: `npm run build`
- Deploy (applies database migrations first): `npm run deploy`
- Secrets (Cloudflare > Worker > Settings > Variables and Secrets): `ADMIN_PASSWORD`, `SQUARE_ACCESS_TOKEN`, `RESEND_API_KEY`, optional `MAIL_FROM`, `BUSINESS_EMAIL`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_ENV=sandbox` for testing.
