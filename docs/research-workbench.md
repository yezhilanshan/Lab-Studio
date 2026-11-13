# Radar Fieldnotes

Owner-private personal workbench with a D1-backed records API. Six navigation sections cover the overview and the five requested work areas. Records support create, edit, duplicate, soft-delete, JSON export and validated merge import. Data is stored server-side; no browser storage is used for research records.

## Provenance

- v2.6(2) design, Library libfile_d6b9325c42f081918fe0b40ea51fe01a, read 2026-11-07. Stage 0–5 and 0.2 s update contract follow this file. New mechanisms remain unverified.
- HARrad unified comparison 2026-11-05, Library libfile_dc8b7ee6e48081918b0db2c0ff70ad6e. Native results preserve seed42, subject8–9 cross-person recheck, interval-IoU event F1, and ±0.5 s boundary definitions. Unreported F1@1/3/5 and over-segmentation metrics remain empty.
- Official MM-Fi toolbox, HARrad/PARrad pages, MS-TCN and ASFormer repositories checked 2026-11-07. Resource verification only confirms the linked resource; it does not verify E01 extrinsics or temporal alignment.

## Updates

All sections can be maintained from their forms. Weekly notes can be entered or imported manually. Existing ChatGPT research automations are not connected to this Site. Agent architecture entries are research comparisons, not a deployed autonomous agent or LLM endpoint.

## Access

The records API relies on the owner-private Sites access boundary. Keep that audience; add explicit application authorization before allowing other audiences. No secrets or service credentials are stored in browser code.

## Validation

TypeScript checks, production build, local migration and browser interaction checks: create a disposable experiment, refresh and verify persistence, search, delete disposable record, select comparison columns, filter synchronization evidence states. Local preview data is not copied to production. The production deploy applies schema migrations and preserves the initial records as source defaults plus durable user overrides.
