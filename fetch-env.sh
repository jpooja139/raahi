#!/usr/bin/env bash
# Pull the team .env securely from Google Secret Manager (project raahi-hackathon).
# Needs: gcloud auth login with an account that has secretAccessor on raahi-env.
set -euo pipefail
gcloud secrets versions access latest --secret=raahi-env --project=raahi-hackathon > .env
echo ".env written ($(wc -l < .env) lines). Never commit it."
