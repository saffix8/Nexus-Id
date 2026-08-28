# NexusID API Reference

Base URL: `http://localhost:4000/api/v1` (dev) / `https://api.nexusid.com/api/v1` (prod)

See NEXUSID_PROJECT.md → "API REFERENCE" for the full endpoint list and
request/response shapes — this file should expand that into per-endpoint
docs with example curl commands as each route stabilizes.

## Sections to fill in
- [ ] Auth (register / login / refresh)
- [ ] Users (profile, push-token, public-key)
- [ ] Credentials (nadra / hec / au / linkedin)
- [ ] Verification (request / submit-proof / reject / history)
- [ ] Verifiers (register / lookup)
- [ ] Issuers (public-key / revocation)
- [ ] Analytics (verifier-only, requires x-api-key header)
- [ ] Admin (fraud-flags / audit-logs, requires JWT)
