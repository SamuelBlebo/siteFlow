#!/usr/bin/env bash
# Launch step D.3: restores the newest backup into a temporary database called restore-test,
# compares document counts with the live database, records the time taken, then deletes the copy.
# The live database is only read. Run by the owner:  bash scripts/launch/3-prod-restore-test.sh
set -euo pipefail
G="$(cygpath -u "${LOCALAPPDATA:-}" 2>/dev/null)/Google/Cloud SDK/google-cloud-sdk/bin"; [ -d "$G" ] && export PATH="$G:$PATH"
P=siteflow-dp-prod
COPY=restore-test
cd "$(dirname "$0")/../.."

if gcloud firestore databases describe --database=$COPY --project=$P >/dev/null 2>&1; then
  echo "A database called $COPY already exists; delete it first."; exit 1
fi

BACKUP=$(gcloud firestore backups list --project=$P --filter='state=READY' --sort-by=~snapshotTime --limit=1 --format='value(name)')
[ -n "$BACKUP" ] || { echo "No finished backup yet."; exit 1; }
SNAP=$(gcloud firestore backups list --project=$P --filter='state=READY' --sort-by=~snapshotTime --limit=1 --format='value(snapshotTime)')
echo "== Restoring $BACKUP (taken $SNAP) into $COPY"
START=$(date +%s)
gcloud firestore databases restore --source-backup="$BACKUP" --destination-database=$COPY --project=$P --format=none

echo "== Waiting for the restore to finish"
for i in $(seq 1 120); do
  PENDING=$(gcloud firestore operations list --database=$COPY --project=$P --filter='done!=true' --format='value(name)' 2>/dev/null || echo waiting)
  [ -z "$PENDING" ] && break
  sleep 15
done
[ -z "$PENDING" ] || { echo "Still restoring after 30 minutes. $COPY has been left in place: check the console."; exit 1; }
echo "   took $(( $(date +%s) - START )) seconds"

echo "== Document counts"
node scripts/launch/count-docs.mjs $P '(default)' > /tmp/live.txt
node scripts/launch/count-docs.mjs $P $COPY > /tmp/copy.txt
[ -s /tmp/copy.txt ] && HAS_DATA=yes || HAS_DATA=no
printf '%-28s %8s %8s\n' collection backup live
join -a1 -a2 -e0 -o 0,1.2,2.2 -t $'\t' <(sort /tmp/copy.txt) <(sort /tmp/live.txt) | while IFS=$'\t' read -r c a b; do printf '%-28s %8s %8s\n' "$c" "$a" "$b"; done
echo "(live can be higher: it includes everything added since the backup was taken)"

echo "== Deleting the temporary copy"
gcloud firestore databases delete --database=$COPY --project=$P --quiet --format=none
echo
echo "Restore test finished. Backup had data: $HAS_DATA. Restore time is above: note it in the incident log."
