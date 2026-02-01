#!/bin/bash
# Database Backup Script for Pratibha Marketing
# Usage: ./backup.sh [mongodb_uri]
# Add to cron: 0 2 * * * /path/to/backup.sh >> /var/log/pratibha-backup.log 2>&1

set -e

BACKUP_DIR="${BACKUP_DIR:-/var/backups/pratibha-marketing}"
MONGODB_URI="${1:-${MONGODB_URI:-mongodb://localhost:27017/pratibha-marketing}}"
DATE=$(date +%Y-%m-%d_%H%M)
BACKUP_PATH="${BACKUP_DIR}/daily/${DATE}"

# Retention policy
DAILY_KEEP=7
WEEKLY_KEEP=4

echo "[$(date)] Starting backup..."

# Ensure backup directories exist
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"

# Run mongodump
mongodump --uri="${MONGODB_URI}" --out="${BACKUP_PATH}" --quiet

# Compress backup
tar -czf "${BACKUP_PATH}.tar.gz" -C "${BACKUP_DIR}/daily" "${DATE}"
rm -rf "${BACKUP_PATH}"

echo "[$(date)] Backup saved: ${BACKUP_PATH}.tar.gz ($(du -h "${BACKUP_PATH}.tar.gz" | cut -f1))"

# Weekly backup (keep copy on Sundays)
if [ "$(date +%u)" -eq 7 ]; then
    cp "${BACKUP_PATH}.tar.gz" "${BACKUP_DIR}/weekly/${DATE}.tar.gz"
    echo "[$(date)] Weekly backup created"
fi

# Cleanup old daily backups
find "${BACKUP_DIR}/daily" -name "*.tar.gz" -mtime +${DAILY_KEEP} -delete 2>/dev/null || true

# Cleanup old weekly backups
find "${BACKUP_DIR}/weekly" -name "*.tar.gz" -mtime +$((WEEKLY_KEEP * 7)) -delete 2>/dev/null || true

echo "[$(date)] Backup complete. Retained: ${DAILY_KEEP} daily, ${WEEKLY_KEEP} weekly"
