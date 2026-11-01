#!/usr/bin/env bash
# Launch step C.1 + C.4: production database (delete protection, point-in-time recovery, daily
# backups kept 14 weeks) and the functions' secrets. Email and WhatsApp start switched off ("none").
# Run once, by the owner:  bash scripts/launch/1-prod-database.sh
set -euo pipefail
G="$(cygpath -u "${LOCALAPPDATA:-}" 2>/dev/null)/Google/Cloud SDK/google-cloud-sdk/bin"; [ -d "$G" ] && export PATH="$G:$PATH"
P=siteflow-dp-prod
cd "$(dirname "$0")/../.."

echo "== Turning on the Google services production needs"
gcloud services enable firestore.googleapis.com firebaserules.googleapis.com firebasestorage.googleapis.com \
  storage.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com secretmanager.googleapis.com \
  cloudscheduler.googleapis.com identitytoolkit.googleapis.com firebasehosting.googleapis.com --project=$P

echo "== Database (europe-west1, delete protection)"
if gcloud firestore databases describe --database='(default)' --project=$P >/dev/null 2>&1; then
  echo "   already exists"
else
  gcloud firestore databases create --database='(default)' --location=europe-west1 --type=firestore-native --delete-protection --project=$P
fi

echo "== Point-in-time recovery"
gcloud firestore databases update --database='(default)' --enable-pitr --project=$P

echo "== Daily backups, kept 14 weeks"
if gcloud firestore backups schedules list --database='(default)' --project=$P --format='value(name)' | grep -q .; then
  echo "   schedule already exists"
else
  gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14w --project=$P
fi

echo "== Function secrets (all 'none' for now: email, WhatsApp and AI start switched off)"
for S in EMAIL_API_KEY WHATSAPP_TOKEN WHATSAPP_PHONE_ID ANTHROPIC_API_KEY; do
  printf none | npx -y firebase-tools functions:secrets:set "$S" --project $P --data-file=- --force
done

echo
echo "Done. Database settings:"
gcloud firestore databases describe --database='(default)' --project=$P --format='table(locationId,deleteProtectionState,pointInTimeRecoveryEnablement)'
