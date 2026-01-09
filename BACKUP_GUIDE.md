# Database Backup Guide

This guide covers backup and recovery procedures for the Pratibha Marketing application.

## MongoDB Atlas Automated Backups

If using MongoDB Atlas (recommended for production):

### Enable Continuous Backups

1. Log into MongoDB Atlas: https://cloud.mongodb.com
2. Go to your cluster
3. Click **Backup** in the left sidebar
4. Enable **Continuous Backup** or **Cloud Provider Snapshots**

### Backup Options

| Option | Frequency | Retention | Cost |
|--------|-----------|-----------|------|
| Cloud Provider Snapshots | Daily | 7 days | Included in M10+ |
| Continuous Backup | Point-in-time | 7-365 days | Additional fee |

### Restore from Atlas Backup

1. Go to **Backup** > **Restores**
2. Select the snapshot or point-in-time to restore
3. Choose restore target (same cluster or new)
4. Click **Restore**

## Manual Backup (Self-Hosted MongoDB)

### Create Backup

```bash
# Full backup
mongodump --uri="$MONGODB_URI" --out=/backup/$(date +%Y%m%d)

# Specific database
mongodump --uri="$MONGODB_URI" --db=pratibha_db --out=/backup/$(date +%Y%m%d)

# Compressed backup
mongodump --uri="$MONGODB_URI" --gzip --archive=/backup/pratibha_$(date +%Y%m%d).gz
```

### Restore from Backup

```bash
# Full restore
mongorestore --uri="$MONGODB_URI" /backup/20260109/

# Specific database
mongorestore --uri="$MONGODB_URI" --db=pratibha_db /backup/20260109/pratibha_db/

# From compressed archive
mongorestore --uri="$MONGODB_URI" --gzip --archive=/backup/pratibha_20260109.gz
```

## Automated Backup Script

Create `/var/www/pratibha-marketing/scripts/backup.sh`:

```bash
#!/bin/bash
# Pratibha Marketing - Automated Backup Script

set -e

# Configuration
BACKUP_DIR="/backup/pratibha"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.gz"

# Load environment
source /var/www/pratibha-marketing/.env

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Create backup
echo "Creating backup: $BACKUP_FILE"
mongodump --uri="$MONGODB_URI" --gzip --archive="$BACKUP_FILE"

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup created successfully: $SIZE"
else
    echo "ERROR: Backup failed!"
    exit 1
fi

# Remove old backups
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find $BACKUP_DIR -name "backup_*.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup complete!"
```

### Schedule with Cron

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /var/www/pratibha-marketing/scripts/backup.sh >> /var/log/pratibha-backup.log 2>&1
```

## Backup Verification

### Test Restore Regularly

```bash
# Create a test database from backup
mongorestore --uri="$MONGODB_URI" \
  --nsFrom='pratibha_db.*' \
  --nsTo='pratibha_db_test.*' \
  --gzip --archive=/backup/pratibha_20260109.gz

# Verify data
mongo "$MONGODB_URI" --eval "db.getSiblingDB('pratibha_db_test').customers.count()"

# Clean up test database
mongo "$MONGODB_URI" --eval "db.getSiblingDB('pratibha_db_test').dropDatabase()"
```

## Disaster Recovery Checklist

### Before Disaster

- [ ] Automated backups enabled and running
- [ ] Backups stored in separate location (different region/provider)
- [ ] Backup restoration tested within last 30 days
- [ ] Recovery time objective (RTO) defined
- [ ] Recovery point objective (RPO) defined

### During Recovery

1. **Assess the damage**
   - What data is affected?
   - What is the most recent valid backup?

2. **Restore from backup**
   ```bash
   # Stop application
   pm2 stop pratibha-marketing

   # Restore database
   mongorestore --uri="$MONGODB_URI" --drop --gzip --archive=/backup/latest.gz

   # Restart application
   pm2 start pratibha-marketing
   ```

3. **Verify restoration**
   - Check customer count
   - Check order count
   - Verify recent orders exist
   - Test login functionality

4. **Document the incident**
   - What caused the data loss?
   - How long was the outage?
   - What data was lost (if any)?
   - How to prevent in future?

## Important Collections to Backup

| Collection | Importance | Notes |
|------------|------------|-------|
| customers | Critical | Customer data and pricing |
| orders | Critical | Order history and payments |
| users | Critical | Authentication data |
| products | High | Product catalog |
| marketrates | Medium | Historical pricing data |
| counters | Medium | Order number sequences |

## Offsite Backup (Recommended)

### Sync to Cloud Storage

```bash
# Install AWS CLI or similar
apt install awscli

# Configure credentials
aws configure

# Sync backups to S3
aws s3 sync /backup/pratibha s3://your-bucket/pratibha-backups/

# Or use rsync to another server
rsync -avz /backup/pratibha/ backup-server:/backup/pratibha/
```

## Contact Information

In case of data emergency:

- MongoDB Atlas Support: https://support.mongodb.com
- Application maintainer: [Your contact info]
