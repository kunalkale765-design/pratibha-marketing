#!/bin/bash
# Pratibha Marketing - Backup Script
# Backs up MongoDB and storage files (invoices, delivery bills)
#
# Usage:
#   sudo bash scripts/backup.sh
#
# Cron example (daily at 2 AM):
#   0 2 * * * /var/www/pratibha-marketing/scripts/backup.sh >> /var/log/pratibha-backup.log 2>&1
#
# Restore MongoDB:
#   mongorestore --uri="$MONGODB_URI" --gzip --archive=backups/mongodb/backup-YYYYMMDD-HHMMSS.gz
#
# Restore storage:
#   tar -xzf backups/storage/storage-YYYYMMDD-HHMMSS.tar.gz -C backend/

set -euo pipefail

# Configuration
APP_DIR="${APP_DIR:-/var/www/pratibha-marketing}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Load environment
if [ -f "$APP_DIR/.env" ]; then
    # shellcheck disable=SC1091
    source "$APP_DIR/.env"
fi

if [ -z "${MONGODB_URI:-}" ]; then
    echo "[BACKUP] ERROR: MONGODB_URI not set. Cannot back up database."
    exit 1
fi

# Create backup directories
mkdir -p "$BACKUP_DIR/mongodb"
mkdir -p "$BACKUP_DIR/storage"

echo "[BACKUP] Starting backup at $(date)"

# 1. MongoDB backup
MONGO_BACKUP="$BACKUP_DIR/mongodb/backup-$TIMESTAMP.gz"
echo "[BACKUP] Dumping MongoDB to $MONGO_BACKUP..."
if mongodump --uri="$MONGODB_URI" --gzip --archive="$MONGO_BACKUP" 2>/dev/null; then
    echo "[BACKUP] MongoDB backup complete ($(du -h "$MONGO_BACKUP" | cut -f1))"
else
    echo "[BACKUP] ERROR: MongoDB backup failed!"
    exit 1
fi

# 2. Storage backup (invoices + delivery bills)
STORAGE_DIR="$APP_DIR/backend/storage"
if [ -d "$STORAGE_DIR" ]; then
    STORAGE_BACKUP="$BACKUP_DIR/storage/storage-$TIMESTAMP.tar.gz"
    echo "[BACKUP] Archiving storage to $STORAGE_BACKUP..."
    tar -czf "$STORAGE_BACKUP" -C "$APP_DIR/backend" storage/
    echo "[BACKUP] Storage backup complete ($(du -h "$STORAGE_BACKUP" | cut -f1))"
else
    echo "[BACKUP] No storage directory found, skipping."
fi

# 3. Prune old backups
echo "[BACKUP] Pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "backup-*.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "storage-*.tar.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

echo "[BACKUP] Backup completed at $(date)"
