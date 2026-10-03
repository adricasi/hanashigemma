# 0004. Public unauthenticated demo on Cloud Run

- Status: Accepted
- Date: 2026-10-04

## Context
Judges must be able to open the demo from a link with no login (G-4, product success
metric "Demo reach"). The engineering standards forbid `allUsers` bindings and require
public ingress to go through a load balancer with Cloud Armor. A global external load
balancer plus Cloud Armor costs more per month than the whole budget (NFR-006: 5 USD/month).

## Decision
The demo Cloud Run service allows unauthenticated invocation (public `run.invoker`),
as an explicit, time-limited exception to the standard. Mitigations:
- App-level limits: 10 turns per minute per client, a daily turn cap and request size
  limits (REQ-011, design.md).
- At most 1 instance; scale to zero.
- The service account can only read one secret; there is no data store.
- The Gemma API on the Gemini API is free-only, so abuse can use up the quota but can't
  create model costs; a billing budget alerts at 5 USD.
- The service is removed or made private after judging.

## Consequences
- Anyone with the URL can use the demo until the limits are reached.
- No WAF: traffic that isn't stopped by the app-level limits reaches the instance, which
  is capped at one.
- Infrastructure scanners (e.g. checkov) will flag the public binding; it is suppressed with a
  reference to this ADR.
