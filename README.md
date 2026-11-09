# e-PocketShop Admin Verification Portal

Admin portal for seller and business verification using the e-PocketShop Admin API.

## Development

Run `npm install`, then `npm run dev`. By default, Vite proxies `/api` requests to `http://localhost:5000`. Set `VITE_API_BASE_URL` in `.env.local` to use another API instance.

Production requests use `https://api.prod.admin-service.epocketshop.store` unless `VITE_API_BASE_URL` is configured at build time.

## Verification and business directory

- The Queue shows pending verification applications and can filter by Tier 1 (merchant) or Tier 2 (business).
- Approvals and rejections explicitly send the current tier. Rejections require a reason.
- Sellers lists businesses across pending, approved, rejected, and not-submitted statuses, with tier filters and search. Expanding a seller loads full details, documents, rejection reason, and business-specific audit history.
- The Dashboard shows API verification totals and can dispatch the daily digest.
- Audit Log shows the platform audit trail. Team & Admins is available to SuperAdmins.

## Build

Run `npm run build` to create the production app in `dist/`.
