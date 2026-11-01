#!/usr/bin/env bash
# Launch steps C.2 (storage versioning), C.3 (let Storage rules read the database) and C.5 (deploy).
# Run by the owner AFTER script 1 and after the console steps (Authentication providers, Storage
# "Get started" in europe-west1):  bash scripts/launch/2-prod-storage-and-deploy.sh
# Deploys the current main commit, only if CI passed for it, and tags it prod-YYYYMMDD-HHMM.
set -euo pipefail
G="$(cygpath -u "${LOCALAPPDATA:-}" 2>/dev/null)/Google/Cloud SDK/google-cloud-sdk/bin"; [ -d "$G" ] && export PATH="$G:$PATH"
P=siteflow-dp-prod
BUCKET=gs://siteflow-dp-prod.firebasestorage.app
cd "$(dirname "$0")/../.."

echo "== Checking the code: main, clean, pushed, CI passed"
git fetch -q origin
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "Switch to main first (git checkout main)"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Uncommitted changes; commit or stash them first"; exit 1; }
SHA=$(git rev-parse HEAD)
[ "$SHA" = "$(git rev-parse origin/main)" ] || { echo "Local main differs from GitHub; run git pull"; exit 1; }
CI=$(gh api "repos/SamuelBlebo/siteFlow/commits/$SHA/check-runs?check_name=CI%20passed" --jq '[.check_runs[].conclusion] | if index("success") then "success" else (.[0] // "none") end')
[ "$CI" = success ] || { echo "CI has not passed for $SHA ($CI)"; exit 1; }
echo "   $SHA, CI passed"

echo "== Storage bucket: keep old versions of files"
gcloud storage buckets describe $BUCKET --format='value(location)' >/dev/null || { echo "No bucket yet: do Storage > Get started in the Firebase console first"; exit 1; }
gcloud storage buckets update $BUCKET --versioning

echo "== Let Storage rules read the database (Firebase Rules Firestore Service Agent)"
NUM=$(gcloud projects describe $P --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $P \
  --member="serviceAccount:service-$NUM@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
  --role=roles/firebaserules.firestoreServiceAgent --condition=None --format=none

echo "== Production configuration"
node scripts/fetch-firebase-config.mjs prod
node scripts/check-env.mjs prod

echo "== Deploying web, functions, rules and indexes to $P"
# --force: accepts the retry policy on onAttendanceChanged/onBudgetChanged/onExpenseChanged/onReportDeleted (idempotent)
npx -y firebase-tools deploy --project prod --non-interactive --force

TAG="prod-$(date -u +%Y%m%d-%H%M)"
git tag "$TAG" "$SHA"
git push -q origin "$TAG"
echo
echo "Live: https://siteflow-dp-prod.web.app  (release $TAG = $SHA)"
echo "Firestore indexes may take a few minutes to show Enabled."
