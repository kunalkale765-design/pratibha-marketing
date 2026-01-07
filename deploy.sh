#!/bin/bash

# Pratibha Marketing - Digital Ocean Deployment Script
# Run this script on your Digital Ocean droplet after initial SSH connection

set -e  # Exit on any error

echo "╔═══════════════════════════════════════════════╗"
echo "║   Pratibha Marketing - Deployment Script     ║"
echo "║   Digital Ocean Ubuntu 22.04 LTS              ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use: sudo bash deploy.sh)"
    exit 1
fi

echo "📦 Step 1: Updating system packages..."
apt update && apt upgrade -y

echo ""
echo "📦 Step 2: Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo ""
echo "✓ Node.js installed:"
node --version
npm --version

echo ""
echo "📦 Step 3: Installing Nginx..."
apt install -y nginx

echo ""
echo "📦 Step 4: Installing PM2..."
npm install -g pm2

echo ""
echo "📦 Step 5: Installing Certbot (for SSL)..."
apt install -y certbot python3-certbot-nginx

echo ""
echo "🔥 Step 6: Configuring firewall..."
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'

echo ""
echo "📁 Step 7: Creating application directory..."
mkdir -p /var/www/pratibha-marketing
cd /var/www/pratibha-marketing

echo ""
echo "📥 Step 8: Cloning repository..."
if [ -d ".git" ]; then
    echo "Repository already exists, pulling latest changes..."
    git pull origin main
else
    git clone https://github.com/kunalkale765-design/pratibha-marketing.git .
fi

echo ""
echo "📦 Step 9: Installing application dependencies..."
npm install --production

echo ""
echo "⚙️  Step 10: Creating environment file..."
if [ ! -f ".env" ]; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    cat > .env << EOF
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb+srv://kunalkale765_db_user:kunal786@vegetable-supply.0p91ste.mongodb.net/pratibha_db?retryWrites=true&w=majority
JWT_SECRET=$JWT_SECRET
ALLOWED_ORIGINS=https://pratibhamarketing.in,https://www.pratibhamarketing.in
EOF
    echo "✓ .env file created with random JWT secret"
else
    echo "✓ .env file already exists, skipping..."
fi

echo ""
echo "🌱 Step 11: Seeding database..."
read -p "Do you want to seed the database with initial data? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    node backend/seed.js
fi

echo ""
echo "🚀 Step 12: Starting application with PM2..."
pm2 delete pratibha-marketing 2>/dev/null || true
pm2 start backend/server.js --name pratibha-marketing
pm2 save
pm2 startup | tail -n 1 | bash

echo ""
echo "🌐 Step 13: Configuring Nginx..."
cat > /etc/nginx/sites-available/pratibha-marketing << 'EOF'
server {
    listen 80;
    server_name pratibhamarketing.in www.pratibhamarketing.in;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # Proxy settings
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/pratibha-marketing /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo ""
echo "Testing Nginx configuration..."
nginx -t

echo ""
echo "Restarting Nginx..."
systemctl restart nginx

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   ✅ Deployment Complete!                     ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "📊 Status Check:"
echo "----------------"
pm2 status
echo ""
echo "🌐 Your application is running at:"
echo "   http://pratibhamarketing.in"
echo ""
echo "🔐 Next Steps:"
echo "   1. Update DNS A records to point to this server's IP"
echo "   2. Wait for DNS to propagate (15-30 minutes)"
echo "   3. Run SSL setup:"
echo "      certbot --nginx -d pratibhamarketing.in -d www.pratibhamarketing.in"
echo ""
echo "🔑 Default Admin Credentials:"
echo "   Email: admin@pratibhamarketing.in"
echo "   Password: admin123"
echo "   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!"
echo ""
echo "📝 Useful Commands:"
echo "   View logs:     pm2 logs pratibha-marketing"
echo "   Restart app:   pm2 restart pratibha-marketing"
echo "   Stop app:      pm2 stop pratibha-marketing"
echo "   Nginx logs:    tail -f /var/log/nginx/error.log"
echo ""
echo "💾 MongoDB Atlas:"
echo "   Don't forget to whitelist this server's IP in MongoDB Atlas!"
echo "   Get server IP: curl ifconfig.me"
echo ""
