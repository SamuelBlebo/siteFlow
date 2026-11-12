#!/usr/bin/env bash
# Launch step C.7: email the owner when the functions log an error. A log-based alert policy in Cloud
# Monitoring watches every function (they run on Cloud Run) for entries at ERROR or worse, and sends at
# most one email per 30 minutes while errors keep coming. Safe to run again; existing parts are kept.
# Run by the owner, after the first deploy:  bash scripts/launch/4-prod-error-alerts.sh you@your-domain
# A second argument picks another project, e.g. siteflow-dp-dev, to try it there first.
set -euo pipefail
G="$(cygpath -u "${LOCALAPPDATA:-}" 2>/dev/null)/Google/Cloud SDK/google-cloud-sdk/bin"; [ -d "$G" ] && export PATH="$G:$PATH"
EMAIL="${1:?Usage: bash scripts/launch/4-prod-error-alerts.sh you@your-domain [project]}"
P="${2:-siteflow-dp-prod}"
NAME="SiteFlow: function errors"
# siteflow-alert-test lets the owner fire the alert by hand (see the end of this script)
FILTER='severity>=ERROR AND (resource.type="cloud_run_revision" OR resource.type="cloud_function" OR logName:"siteflow-alert-test")'

echo "== Turning on Cloud Monitoring"
gcloud services enable monitoring.googleapis.com logging.googleapis.com --project=$P

echo "== Email channel for $EMAIL"
CH=$(gcloud beta monitoring channels list --project=$P --filter="type=email AND labels.email_address=\"$EMAIL\"" --format='value(name)' | head -1)
if [ -n "$CH" ]; then
  echo "   already exists"
else
  CH=$(gcloud beta monitoring channels create --project=$P --type=email --display-name="SiteFlow owner ($EMAIL)" \
    --channel-labels=email_address="$EMAIL" --format='value(name)')
fi

echo "== Alert policy \"$NAME\""
if gcloud alpha monitoring policies list --project=$P --filter="displayName=\"$NAME\"" --format='value(name)' | grep -q .; then
  echo "   already exists; to change it, delete it in Monitoring > Alerting and run this again"
else
  POLICY=$(NAME="$NAME" FILTER="$FILTER" CH="$CH" P="$P" node -e '
    const { NAME, FILTER, CH, P } = process.env;
    process.stdout.write(JSON.stringify({
      displayName: NAME,
      combiner: "OR",
      conditions: [{ displayName: "A function logged an error", conditionMatchedLog: { filter: FILTER } }],
      alertStrategy: { notificationRateLimit: { period: "1800s" }, autoClose: "604800s" },
      notificationChannels: [CH],
      documentation: {
        mimeType: "text/markdown",
        content: `A SiteFlow function on ${P} logged an error. Open Logs Explorer with this filter:\n\n` +
          "`" + FILTER + "`\n\nSee docs/OPERATIONS.md, \"Which log messages matter\".",
      },
    }));')
  gcloud alpha monitoring policies create --project=$P --policy="$POLICY" --format=none
fi

echo
echo "Done. To check the email arrives (it can take a few minutes):"
echo "  gcloud logging write siteflow-alert-test 'SiteFlow alert test' --severity=ERROR --project=$P"
