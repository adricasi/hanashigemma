# Deploying the public demo (Cloud Run)

The demo runs the same container as local use, on Cloud Run with hosted Gemma (Gemini API).
It is set up and deployed **by a human** with `gcloud` (design.md, D-5 / ADR-0005); CI does
not deploy and agents never run these commands. Terraform comes later (T-011).

Everything below uses these shell variables — set them first:

```bash
PROJECT_ID=your-project-id          # the demo project
REGION=europe-southwest1
BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX   # gcloud billing accounts list
SA=hanashigemma-run@${PROJECT_ID}.iam.gserviceaccount.com
gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
```

**Who runs this:** a project Owner can run everything below. A narrower deployer needs
`roles/run.sourceDeveloper` on the project and `roles/iam.serviceAccountUser` on the
`hanashigemma-run` service account only.

## 1. One-time setup

1. **Billing** must be linked to the project (Cloud Run, Cloud Build and Secret Manager
   need it even inside the free tier).

2. **APIs:**
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
     artifactregistry.googleapis.com secretmanager.googleapis.com \
     billingbudgets.googleapis.com
   ```

3. **The Gemini API key as a secret.** The value is read from the terminal, so it never
   lands in the repo, shell history or Terraform state (NFR-001):
   ```bash
   gcloud secrets create gemini-api-key --replication-policy=automatic
   read -rs GEMINI_KEY          # paste the key, press Enter (nothing is shown)
   printf '%s' "$GEMINI_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
   unset GEMINI_KEY
   ```
   In the Google Cloud console, restrict the key to the Generative Language API.

4. **A dedicated service account** that can read only that one secret (least privilege):
   ```bash
   gcloud iam service-accounts create hanashigemma-run \
     --display-name="HanashiGemma Cloud Run service"
   gcloud secrets add-iam-policy-binding gemini-api-key \
     --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor
   ```

5. **Build permissions.** In newer projects, `--source` builds run as the Compute Engine
   default service account, which needs the Cloud Run Builder role (and nothing broader —
   never `roles/editor`):
   ```bash
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role=roles/run.builder
   ```
   If the first deploy reports a different missing role, check it against Cloud Run's
   "Deploy from source code" page before granting it.

6. **Budget** of 5 USD for this project only, with alerts at 50/90/100% (NFR-006).
   Alerts don't stop spending; the hard ceiling is the API key's own quota (below).
   ```bash
   gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" \
     --display-name="hanashigemma demo" --budget-amount=5USD \
     --filter-projects="projects/${PROJECT_ID}" \
     --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 \
     --threshold-rule=percent=1.0
   ```

## 2. Every release

**Before the first deploy**, run one hosted turn locally with your key, so a request the
Gemini API rejects shows up here and not on the public URL (the key stays in your shell):
```bash
npm ci && npm run build
read -rs GEMINI_API_KEY && export GEMINI_API_KEY
GEMMA_BACKEND=gemini npm start      # open http://localhost:8080, start a scene
unset GEMINI_API_KEY
```

From the repository root, on the commit you want to ship. `gcloud` uploads only what
`.gcloudignore` allows (an allowlist: no `.env`, keys or local files), and Cloud Build
builds the `Dockerfile`:

```bash
gcloud run deploy hanashigemma --source . --region="$REGION" \
  --service-account="$SA" \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars=GEMMA_BACKEND=gemini,GEMMA_MODEL=gemma-4-26b-a4b-it,HOST=0.0.0.0,TRUST_PROXY=true \
  --allow-unauthenticated --min-instances=0 --max-instances=1 --memory=512Mi \
  --concurrency=20
```

- `--allow-unauthenticated` is the documented exception for a public demo (ADR-0004);
  the app's own limits protect it (REQ-011: 10 turns/min per client, `DAILY_TURN_CAP`
  turns per UTC day, default 500). Lower the cap with `DAILY_TURN_CAP=…` in
  `--set-env-vars` if the key's daily Gemma limit (AI Studio → Rate limits, Q-3) is below
  about twice that.
- The limits live in memory. With `--min-instances=0` the instance scales to zero when
  idle, which resets the daily counter, so `DAILY_TURN_CAP` caps an instance's lifetime,
  not strictly the day. The hard ceiling is the key's own Gemma quota (free tier only).
- `--concurrency=20`: a turn can hold a request for up to ~90 s (two 45 s attempts); 20
  is plenty for the demo on 512 MiB.

**Check after deploying** (T-004): open the service URL in a fresh browser, start a
scene, send one message. Then check the per-client limit is really per client: from one
device, 11 quick turns should be refused with "slow down" while a second device (other
network) still works. If the second device is refused too, every visitor shares one
counter — still safe, but judges could block each other: redeploy with a higher
`PER_MINUTE_LIMIT=…` in `--set-env-vars` and tell the developer.

## 3. Roll back or remove

```bash
gcloud run revisions list --service=hanashigemma --region="$REGION"
gcloud run services update-traffic hanashigemma --region="$REGION" \
  --to-revisions=PREVIOUS_REVISION=100
```

After judging, remove the public demo (ADR-0004, T-014):

```bash
gcloud run services delete hanashigemma --region="$REGION"
```

## Local container check (optional)

```bash
docker build -t hanashigemma .
docker run --rm -p 127.0.0.1:8080:8080 hanashigemma   # Ollama backend by default
curl http://localhost:8080/healthz                  # → ok
```

The container listens on `0.0.0.0` (`HOST` in the Dockerfile) so the published port works,
which also turns off the local-only Host check. Publish the port on `127.0.0.1` as above so
the container is not reachable from your network.
Reaching Ollama on the host from inside the container needs
`-e OLLAMA_URL=http://host.docker.internal:11434` (Docker Desktop).
