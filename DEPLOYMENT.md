# Digital Ocean Deployment Guide - Pratibha Marketing

## Prerequisites
- Domain: pratibhamarketing.in (already set up)
- Digital Ocean account
- MongoDB Atlas connection string
- GitHub repository: https://github.com/kunalkale765-design/pratibha-marketing.git

## Step 1: Create Digital Ocean Droplet

### 1.1 Login to Digital Ocean
Go to https://cloud.digitalocean.com/

### 1.2 Create Droplet
- Click "Create" → "Droplets"
- **Choose Image**: Ubuntu 22.04 LTS
- **Choose Plan**:
  - Basic Plan
  - Regular CPU
  - $6/month (1 GB RAM, 1 CPU, 25 GB SSD) - Recommended for start
- **Choose Datacenter Region**:
  - Bangalore (BLR1) - Closest to India
  - Or Mumbai if available
- **Authentication**:
  - Choose "SSH Keys" (recommended) OR "Password"
  - If using password, set a strong root password
- **Hostname**: pratibha-marketing
- Click "Create Droplet"

### 1.3 Note Your Droplet IP
After creation, copy the IP address (e.g., 143.198.xxx.xxx)

## Step 2: Update Domain DNS

### 2.1 Configure DNS Records
In your Digital Ocean DNS settings for pratibhamarketing.in:

1. Add/Update **A Record**:
   - Hostname: `@`
   - Will Direct to: Your droplet IP
   - TTL: 3600

2. Add/Update **A Record** for www:
   - Hostname: `www`
   - Will Direct to: Your droplet IP
   - TTL: 3600

**Note**: DNS changes can take up to 48 hours but usually propagate within 15-30 minutes.

## Step 3: Connect to Your Droplet

Open Terminal and connect via SSH:

```bash
ssh root@YOUR_DROPLET_IP
```

If using SSH key, it will connect directly.
If using password, enter the password you set.

## Step 4: Initial Server Setup

### 4.1 Update System
```bash
apt update && apt upgrade -y
```

### 4.2 Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

Verify installation:
```bash
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 4.3 Install Nginx
```bash
apt install -y nginx
```

### 4.4 Install PM2 (Process Manager)
```bash
npm install -g pm2
```

### 4.5 Configure Firewall
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Type `y` when prompted.

## Step 5: Deploy Application

### 5.1 Create Application Directory
```bash
mkdir -p /var/www/pratibha-marketing
cd /var/www/pratibha-marketing
```

### 5.2 Clone Repository
```bash
git clone https://github.com/kunalkale765-design/pratibha-marketing.git .
```

### 5.3 Install Dependencies
```bash
npm install --production
```

### 5.4 Create Production Environment File
```bash
nano .env
```

Paste the following (update MONGODB_URI with your actual connection string):

```env
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb+srv://kunalkale765_db_user:kunal786@vegetable-supply.0p91ste.mongodb.net/pratibha_db?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_random_key_change_this_in_production_12345
ALLOWED_ORIGINS=https://pratibhamarketing.in,https://www.pratibhamarketing.in
```

**IMPORTANT**: Change the JWT_SECRET to a strong random string!

Generate a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save and exit (Ctrl+X, then Y, then Enter)

### 5.5 Update MongoDB Atlas Whitelist
1. Go to MongoDB Atlas (https://cloud.mongodb.com/)
2. Navigate to Network Access
3. Click "Add IP Address"
4. Add your droplet's IP address
5. Click "Confirm"

### 5.6 Seed Database (First Time Only)
```bash
node backend/seed.js
```

This will create:
- 22 vegetable products
- 5 sample customers
- 5 sample orders
- Admin user: admin@pratibhamarketing.in / admin123
- 2 customer test accounts

## Step 6: Start Application with PM2

### 6.1 Start Application
```bash
pm2 start backend/server.js --name pratibha-marketing
```

### 6.2 Save PM2 Configuration
```bash
pm2 save
```

### 6.3 Setup PM2 Auto-Start on Reboot
```bash
pm2 startup
```

Copy and run the command that PM2 outputs (it will be specific to your system).

### 6.4 Check Application Status
```bash
pm2 status
pm2 logs pratibha-marketing
```

The app should be running on port 3000.

## Step 7: Configure Nginx Reverse Proxy

### 7.1 Create Nginx Configuration
```bash
nano /etc/nginx/sites-available/pratibha-marketing
```

Paste the following configuration:

```nginx
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
```

Save and exit (Ctrl+X, then Y, then Enter)

### 7.2 Enable Site
```bash
ln -s /etc/nginx/sites-available/pratibha-marketing /etc/nginx/sites-enabled/
```

### 7.3 Remove Default Nginx Site
```bash
rm /etc/nginx/sites-enabled/default
```

### 7.4 Test Nginx Configuration
```bash
nginx -t
```

Should show "syntax is ok" and "test is successful"

### 7.5 Restart Nginx
```bash
systemctl restart nginx
```

### 7.6 Test HTTP Access
Open browser and visit: http://pratibhamarketing.in

You should see your application (without HTTPS yet).

## Step 8: Setup SSL Certificate (HTTPS)

### 8.1 Install Certbot
```bash
apt install -y certbot python3-certbot-nginx
```

### 8.2 Obtain SSL Certificate
```bash
certbot --nginx -d pratibhamarketing.in -d www.pratibhamarketing.in
```

Follow the prompts:
1. Enter your email address
2. Agree to terms of service (Y)
3. Share email with EFF (optional, Y or N)
4. Choose option 2: Redirect HTTP to HTTPS (recommended)

### 8.3 Test Auto-Renewal
```bash
certbot renew --dry-run
```

Should show "Congratulations, all simulated renewals succeeded"

### 8.4 Verify HTTPS
Visit: https://pratibhamarketing.in

You should now see a secure connection (padlock icon).

## Step 9: Post-Deployment Verification

### 9.1 Check All Services
```bash
# Check Nginx status
systemctl status nginx

# Check PM2 status
pm2 status

# Check application logs
pm2 logs pratibha-marketing --lines 50

# Check MongoDB connection
pm2 logs pratibha-marketing | grep "MongoDB Connected"
```

### 9.2 Test All Features
1. Visit https://pratibhamarketing.in
2. Test login: admin@pratibhamarketing.in / admin123
3. Test products page
4. Test supplier dashboard
5. Test orders page
6. Test signup for new users

## Step 10: Useful PM2 Commands

```bash
# View logs
pm2 logs pratibha-marketing

# Restart application
pm2 restart pratibha-marketing

# Stop application
pm2 stop pratibha-marketing

# View detailed info
pm2 info pratibha-marketing

# Monitor CPU/Memory usage
pm2 monit
```

## Step 11: Maintenance & Updates

### Update Application Code
```bash
cd /var/www/pratibha-marketing
git pull origin main
npm install --production
pm2 restart pratibha-marketing
```

### Update Database
```bash
# Re-run seed script (will clear existing data!)
node backend/seed.js

# Or create new migration script for updates
```

### Backup Database
MongoDB Atlas automatically creates backups, but you can also:
```bash
# Export specific collection
# (Install MongoDB tools first if needed)
```

### Monitor Disk Space
```bash
df -h
```

### Monitor Memory Usage
```bash
free -m
```

## Troubleshooting

### Application Not Starting
```bash
pm2 logs pratibha-marketing --lines 100
```

### Nginx Errors
```bash
tail -f /var/log/nginx/error.log
```

### Check Port 3000
```bash
netstat -tulpn | grep 3000
```

### Restart All Services
```bash
pm2 restart pratibha-marketing
systemctl restart nginx
```

### MongoDB Connection Issues
1. Verify MongoDB Atlas IP whitelist includes your droplet IP
2. Check .env file has correct MONGODB_URI
3. Test connection:
```bash
node -e "require('dotenv').config(); console.log(process.env.MONGODB_URI)"
```

## Security Best Practices

### 1. Change Default Passwords
- Change admin@pratibhamarketing.in password after first login
- Remove or change test customer passwords

### 2. Regular Updates
```bash
# Update system packages monthly
apt update && apt upgrade -y

# Update Node.js dependencies
cd /var/www/pratibha-marketing
npm audit
npm update
```

### 3. Enable Automatic Security Updates
```bash
apt install unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

### 4. Monitor Logs
```bash
pm2 logs pratibha-marketing
tail -f /var/log/nginx/access.log
```

### 5. Backup Strategy
- MongoDB Atlas: Enable automatic backups
- Digital Ocean: Enable weekly droplet backups ($1.20/month for $6 droplet)

## Cost Summary

- **Digital Ocean Droplet**: $6/month (Basic)
- **Digital Ocean Backups**: $1.20/month (optional)
- **MongoDB Atlas**: Free tier (M0)
- **Domain**: Already paid
- **SSL Certificate**: Free (Let's Encrypt)

**Total**: $6-7.20/month

## Success Checklist

- [ ] Droplet created and running
- [ ] Domain DNS updated (A records)
- [ ] SSH access working
- [ ] Node.js, Nginx, PM2 installed
- [ ] Application code deployed
- [ ] .env file configured
- [ ] MongoDB Atlas IP whitelisted
- [ ] Database seeded
- [ ] PM2 running application
- [ ] Nginx configured and running
- [ ] SSL certificate installed
- [ ] HTTPS working (https://pratibhamarketing.in)
- [ ] Admin login working
- [ ] All pages accessible
- [ ] Supplier dashboard showing data

## Support & Next Steps

### After Deployment
1. Change admin password
2. Create staff user accounts
3. Update product inventory with real data
4. Update market rates
5. Train staff on using the system
6. Start taking real customer orders!

### Future Enhancements
- Add WhatsApp notifications for orders
- Add payment gateway integration
- Add invoice generation
- Add more detailed analytics
- Mobile app (optional)

---

**Your app is now live at: https://pratibhamarketing.in** 🚀
