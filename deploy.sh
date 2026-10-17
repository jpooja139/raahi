#!/usr/bin/env bash
# Deploy Raahi to Cloud Run. Needs: gcloud auth login, a project with billing,
# Cloud Run + Cloud Build APIs enabled. Run from this directory.
set -euo pipefail
PROJECT="${1:?usage: ./deploy.sh <gcp-project-id>}"
gcloud run deploy raahi \
  --source . \
  --project "$PROJECT" \
  --region asia-south1 \
  --allow-unauthenticated \
  --timeout=3600 \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY:?export it first},YOUTUBE_API_KEY=${YOUTUBE_API_KEY:?export it first},CONTEXT_BUCKET=raahi-context-store"
echo "Verify: curl -s <service-url>/api/health"
