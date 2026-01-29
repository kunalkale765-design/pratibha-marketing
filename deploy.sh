#!/bin/bash

# Pratibha Marketing - Digital Ocean Deployment Script
# Run this script on your Digital Ocean droplet after initial SSH connection
# IMPORTANT: Use Digital Ocean Cloud Firewall (not UFW) for firewall rules

set -e  # Exit on any error

echo "╔═══════════════════════════════════════════════╗"
echo "║   Pratibha Marketing - Deployment Script      ║"
echo "║   Digital Ocean Ubuntu 22.04/24.04 LTS        ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use: sudo bash deploy.sh)"
    exit 1
fi

# Get server IP
SERVER_IP=$(curl -s ifconfig.me)
echo "Server IP: $SERVER_IP"
echo ""

echo "Step 1: Updating system packages..."
apt update && apt upgrade -y

echo ""
echo "Step 2: Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo ""
echo "Node.js installed:"
node --version
npm --version

echo ""
echo "Step 3: Installing Nginx..."
apt install -y nginx

echo ""
echo "Step 4: Installing PM2..."
npm install -g pm2

echo ""
echo "Step 5: Installing Certbot (for SSL)..."
apt install -y certbot python3-certbot-nginx

echo ""
echo "Step 6: Configuring firewall (DISABLING UFW - use DO Cloud Firewall instead)..."
# Disable UFW to avoid conflict with Digital Ocean Cloud Firewall
ufw disable || true
# Flush iptables for clean state
iptables -F || true
iptables -X || true
iptables -P INPUT ACCEPT || true
iptables -P FORWARD ACCEPT || true
iptables -P OUTPUT ACCEPT || true
echo "UFW disabled. Use Digital Ocean Cloud Firewall for security."
echo "Required DO Firewall rules: SSH (22), HTTP (80), HTTPS (443)"

echo ""
echo "Step 7: Creating application directory..."
mkdir -p /var/www/pratibha-marketing
cd /var/www/pratibha-marketing

echo ""
echo "Step 8: Cloning repository..."
if [ -d ".git" ]; then
    echo "Repository already exists, pulling latest changes..."
    git pull origin main
else
    git clone https://github.com/kunalkale765-design/pratibha-marketing.git .
fi

echo ""
echo "Step 9: Installing dependencies and building frontend..."
npm install

echo "Building frontend..."
npm run build:frontend

# Upload source maps to Sentry (if configured)
if [ -n "$VITE_SENTRY_DSN" ] && [ -n "$SENTRY_AUTH_TOKEN" ] && [ -n "$SENTRY_ORG" ] && [ -n "$SENTRY_PROJECT_FRONTEND" ]; then
    echo "Uploading source maps to Sentry..."
    RELEASE=$(git rev-parse --short HEAD)
    npx @sentry/cli releases new "$RELEASE" --org "$SENTRY_ORG" --project "$SENTRY_PROJECT_FRONTEND"
    npx @sentry/cli releases files "$RELEASE" upload-sourcemaps frontend/dist --org "$SENTRY_ORG" --project "$SENTRY_PROJECT_FRONTEND"
    npx @sentry/cli releases finalize "$RELEASE" --org "$SENTRY_ORG" --project "$SENTRY_PROJECT_FRONTEND"
    echo "Source maps uploaded. Removing from dist..."
    find frontend/dist -name '*.map' -delete
else
    echo "Sentry source map upload skipped (SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT_FRONTEND not set)"
    # Still remove source maps from dist so they aren't served
    find frontend/dist -name '*.map' -delete
fi

# Prune to production dependencies only
npm prune --production

echo ""
echo "Step 10: Creating environment file..."
if [ ! -f ".env" ]; then
    # Check if MONGODB_URI is provided as environment variable
    if [ -z "$MONGODB_URI" ]; then
        echo ""
        echo "╔═══════════════════════════════════════════════════════════════╗"
        echo "║  MONGODB_URI not set! Please provide your MongoDB connection  ║"
        echo "╚═══════════════════════════════════════════════════════════════╝"
        echo ""
        read -p "Enter your MongoDB URI: " MONGODB_URI
        if [ -z "$MONGODB_URI" ]; then
            echo "ERROR: MongoDB URI is required. Exiting."
            exit 1
        fi
    fi

    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    ADMIN_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64').slice(0,16))")

    cat > .env << ENVEOF
PORT=3000
NODE_ENV=production
MONGODB_URI=$MONGODB_URI
JWT_SECRET=$JWT_SECRET
ALLOWED_ORIGINS=https://pratibhamarketing.in,https://www.pratibhamarketing.in
COOKIE_DOMAIN=.pratibhamarketing.in
ADMIN_TEMP_PASSWORD=$ADMIN_PASSWORD
ENVEOF
    echo ".env file created with secure random secrets"
    echo ""
    echo "IMPORTANT: Your temporary admin password has been saved to .env"
    echo "           Run 'grep ADMIN_TEMP_PASSWORD .env' to view it"
    echo "           Change this password immediately after first login!"
else
    echo ".env file already exists, skipping..."
fi

echo ""
echo "Step 11: Seeding database..."
read -p "Do you want to seed the database with initial data? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    node backend/seed.js
fi

echo ""
echo "Step 12: Setting up logs and storage directories..."
mkdir -p logs
mkdir -p backend/storage/delivery-bills
mkdir -p backend/storage/invoices

echo ""
echo "Step 13: Installing PM2 log rotation..."
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

echo ""
echo "Step 14: Starting application with PM2..."
pm2 delete pratibha-marketing 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

# Setup PM2 to start on boot
# Note: Using root here since deploy.sh requires root. For better security,
# create a dedicated user (e.g., 'appuser') and run PM2 under that user.
pm2 startup systemd -u root --hp /root
pm2 save

echo ""
echo "Step 15: Configuring Nginx..."

# Remove any existing configs
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/pratibha-marketing
rm -f /etc/nginx/sites-available/pratibha-marketing

# Create nginx config using printf (more reliable than heredoc)
printf 'server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name pratibhamarketing.in www.pratibhamarketing.in _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
' > /etc/nginx/sites-available/pratibha-marketing

# Create symlink
ln -sf /etc/nginx/sites-available/pratibha-marketing /etc/nginx/sites-enabled/pratibha-marketing

echo ""
echo "Testing Nginx configuration..."
nginx -t

echo ""
echo "Restarting Nginx..."
systemctl restart nginx
systemctl enable nginx

echo ""
echo "Step 16: Verifying deployment..."
echo "-----------------------------------"

# Check if app is running
echo -n "PM2 Status: "
if pm2 list | grep -q "online"; then
    echo "OK (app running)"
else
    echo "WARNING (app may not be running)"
fi

# Check if nginx is running
echo -n "Nginx Status: "
if systemctl is-active --quiet nginx; then
    echo "OK (running)"
else
    echo "WARNING (not running)"
fi

# Check if app responds locally
echo -n "App Response: "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo "OK (responding on port 3000)"
else
    echo "WARNING (not responding)"
fi

# Check if nginx responds locally
echo -n "Nginx Response: "
if curl -s -o /dev/null -w "%{http_code}" http://localhost | grep -q "200"; then
    echo "OK (responding on port 80)"
else
    echo "WARNING (not responding)"
fi

# Show listening ports
echo ""
echo "Listening Ports:"
ss -tlnp | grep -E ':(80|3000|443)' || echo "  No relevant ports found"

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   Deployment Complete!                        ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "Server IP: $SERVER_IP"
echo ""
echo "Test locally: curl http://localhost"
echo "Test via IP:  http://$SERVER_IP"
echo ""
pm2 status
echo ""
echo "IMPORTANT NEXT STEPS:"
echo "====================="
echo ""
echo "1. DIGITAL OCEAN FIREWALL (Required!):"
echo "   Go to Networking > Firewalls"
echo "   Add Inbound Rules:"
echo "   - SSH (22) from All IPv4"
echo "   - HTTP (80) from All IPv4"
echo "   - HTTPS (443) from All IPv4"
echo "   Attach firewall to this droplet"
echo ""
echo "2. MONGODB ATLAS:"
echo "   Whitelist IP: $SERVER_IP"
echo ""
echo "3. DNS SETTINGS:"
echo "   A record @ -> $SERVER_IP"
echo "   A record www -> $SERVER_IP"
echo ""
echo "4. SSL CERTIFICATE (after DNS propagates):"
echo "   certbot --nginx -d pratibhamarketing.in -d www.pratibhamarketing.in"
echo "   OR use DNS challenge:"
echo "   certbot certonly --manual --preferred-challenges dns -d pratibhamarketing.in"
echo ""
echo "Admin Login:"
echo "   Email: admin@pratibhamarketing.in"
echo "   Password: View with 'grep ADMIN_TEMP_PASSWORD /var/www/pratibha-marketing/.env'"
echo "   CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!"
echo ""
echo "Useful Commands:"
echo "   pm2 logs pratibha-marketing    # View app logs"
echo "   pm2 restart pratibha-marketing # Restart app"
echo "   systemctl restart nginx        # Restart nginx"
echo "   tail -f /var/log/nginx/error.log  # Nginx errors"
echo ""
