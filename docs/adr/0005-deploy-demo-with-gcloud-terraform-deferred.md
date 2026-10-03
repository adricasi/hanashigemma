# 0005. Deploy the demo with gcloud; Terraform deferred

- Status: Accepted
- Date: 2026-10-04

## Context
A GCP deployment earns extra points in the challenge, and the submission deadline is
2026-10-05 06:59 UTC. The engineering standards say all infrastructure is code
(Terraform, with plan → review → apply). The demo needs only a few resources: four
enabled APIs, one secret, one service account with one IAM binding, one Cloud Run
service and a billing budget. A Terraform setup adds a review cycle, image build wiring
and more failure points while time is short.

## Decision
For v1 the human sets up and deploys the demo with documented `gcloud` commands
(`docs/deploy.md`): `gcloud run deploy --source .` builds the repo's Dockerfile with Cloud
Build, stores the image in Artifact Registry and deploys it to Cloud Run. Porting these
resources to Terraform in `infra/` is a planned task after the deadline (T-011).

## Consequences
- The public URL can exist within an hour of the walking skeleton, and every redeploy is
  one command.
- This is a time-boxed exception to "all infrastructure is code": the setup is
  reproducible from `docs/deploy.md` but not plan-reviewed or drift-detected until T-011.
- Deployment commands are run by a human maintainer, never by automation in v1.
- `infra/` and its CI checks stay as the scaffold until T-011.
