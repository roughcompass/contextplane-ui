# Vendored API contract

`openapi.json` is the pinned Contextplane OpenAPI document this app's generated
client is built from. `pnpm generate:api` reads **only this file** — never a
sibling checkout — and CI fails if regeneration from it produces a diff.

Current pin: contextplane commit `00613eb1b5dac801b0bdfa1c73541f407cc16410`.

To bump the contract: copy the new committed `openapi.json` from the
contextplane repository, update the pin hash above, run `pnpm generate:api`,
and land pin + regenerated client together in **one PR**, blocked by the server
PR that shipped the contract change. This file is a hotspot: contract-bump PRs
are serialized, one at a time.
