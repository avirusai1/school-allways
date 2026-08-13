#!/bin/sh
# =============================================================================
# Nightly Postgres backup.
#
# READ THIS: you chose to keep files on the VM block volume rather than object
# storage. That is fine for cost, but it means THE BLOCK VOLUME IS A SINGLE
# POINT OF FAILURE for both your database and every uploaded book, photo and
# document. A backup that lives on the same volume protects you from nothing.
#
# So this script does two things:
#   1. pg_dump to /backups (fast local restore)
#   2. push the dump off-box (set BACKUP_REMOTE to enable — strongly advised)
#
# Oracle Object Storage Always Free gives you 10 GB standard + 10 GB archive.
# A compressed dump of 10 pilot schools will be well under 1 GB for a long
# time, so use archive tier for off-box copies at zero cost.
# =============================================================================

set -eu

BACKUP_DIR=/backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p "$BACKUP_DIR"

log() { echo "[backup] $(date -Iseconds) $*"; }

run_backup() {
  ts=$(date +%Y%m%d_%H%M%S)
  file="$BACKUP_DIR/saw_${ts}.dump"

  log "starting pg_dump -> $file"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h postgres \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --format=custom \
    --compress=9 \
    --file="$file"

  size=$(du -h "$file" | cut -f1)
  log "completed: $size"

  # --- Off-box copy. Configure BACKUP_REMOTE (rclone remote:path). ---
  if [ -n "${BACKUP_REMOTE:-}" ]; then
    if command -v rclone >/dev/null 2>&1; then
      log "uploading to $BACKUP_REMOTE"
      rclone copy "$file" "$BACKUP_REMOTE" --quiet || log "WARN: upload failed"
    else
      log "WARN: BACKUP_REMOTE set but rclone not installed"
    fi
  else
    log "WARN: BACKUP_REMOTE not set — backups are ON THE SAME VOLUME as the data."
    log "WARN: This protects against 'oops I deleted a table', NOT against volume loss."
  fi

  # --- Prune ---
  find "$BACKUP_DIR" -name 'saw_*.dump' -mtime "+$RETENTION_DAYS" -delete
  log "pruned dumps older than ${RETENTION_DAYS} days"
}

# Verify a dump is restorable. A backup you have never restored is a rumour.
verify_latest() {
  latest=$(ls -1t "$BACKUP_DIR"/saw_*.dump 2>/dev/null | head -1) || return 0
  [ -n "$latest" ] || return 0
  if pg_restore --list "$latest" >/dev/null 2>&1; then
    log "verify OK: $latest"
  else
    log "ERROR: latest dump failed verification: $latest"
  fi
}

log "backup loop started (interval ${INTERVAL_SECONDS}s, retention ${RETENTION_DAYS}d)"
while true; do
  run_backup || log "ERROR: backup failed"
  verify_latest
  sleep "$INTERVAL_SECONDS"
done
