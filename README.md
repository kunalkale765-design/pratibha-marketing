# Fresh Supply Co. - Agricultural Supply Chain Management

A full-stack web application for managing agricultural supply chain operations including customer management, order processing, inventory tracking, and dynamic market pricing.

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB (with Mongoose ODM)
- **Frontend**: HTML, CSS (Tailwind CSS), Vanilla JavaScript
- **Security**: Helmet, CORS, Rate Limiting, Input Validation, Data Sanitization

## Features

- Customer Management with personalized pricing
- Order Processing and Tracking
- Product Inventory Management
- Dynamic Market Rate Updates
- Real-time Dashboard with Statistics
- Secure API with input validation
- Responsive design for all devices

## Project Structure

```
pratibha-marketing-app/
├── backend/
│   ├── server.js                 # Express server
│   ├── config/
│   │   └── database.js           # MongoDB connection
│   ├── models/                   # Mongoose schemas
│   │   ├── Customer.js
│   │   ├── Order.js
│   │   ├── Product.js
│   │   └── MarketRate.js
│   ├── routes/                   # API endpoints
│   │   ├── customers.js
│   │   ├── orders.js
│   │   ├── products.js
│   │   └── marketRates.js
│   └── middleware/
│       └── errorHandler.js
├── frontend/                     # Static HTML pages
│   ├── index.html               # Dashboard
│   ├── customer-order-form.html
│   ├── customer-management.html
│   └── market-rates.html
├── .env                         # Environment variables
├── .gitignore
├── package.json
└── README.md
```

## Prerequisites

- Node.js (v18 or higher)
- MongoDB Atlas account (or local MongoDB installation)
- Digital Ocean account (for deployment)
- Domain name (optional but recommended)

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Edit the `.env` file with your MongoDB credentials:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/pratibha_db?retryWrites=true&w=majority

# CORS Settings
ALLOWED_ORIGINS=http://localhost:5000,https://yourdomain.com
```

**Important**: Replace the MongoDB URI with your actual connection string from MongoDB Atlas.

### 3. Start Development Server

```bash
npm run dev
```

Or for production:

```bash
npm start
```

The application will be available at `http://localhost:5000`

## API Endpoints

### Customers
- `GET /api/customers` - Get all customers
- `GET /api/customers/:id` - Get single customer
- `POST /api/customers` - Create new customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Deactivate customer
- `POST /api/customers/:id/payment` - Add payment record

### Orders
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get single order
- `GET /api/orders/customer/:customerId` - Get customer orders
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id/status` - Update order status
- `PUT /api/orders/:id/payment` - Update payment
- `DELETE /api/orders/:id` - Cancel order

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Deactivate product
- `PUT /api/products/:id/stock` - Update stock

### Market Rates
- `GET /api/market-rates` - Get current rates
- `GET /api/market-rates/all` - Get all rate records
- `GET /api/market-rates/history/:productId` - Get rate history
- `POST /api/market-rates` - Create/Update rate
- `PUT /api/market-rates/:id` - Update rate
- `DELETE /api/market-rates/:id` - Delete rate

## Deployment to Digital Ocean

### Step 1: Prepare Your Droplet

SSH into your Digital Ocean droplet:

```bash
ssh root@your_droplet_ip
```

Update system packages:

```bash
apt update && apt upgrade -y
```

### Step 2: Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs
```

Verify installation:

```bash
node --version
npm --version
```

### Step 3: Install and Configure Nginx

```bash
apt install nginx -y
```

Create Nginx configuration:

```bash
nano /etc/nginx/sites-available/pratibha-app
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://localhost:5000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
ln -s /etc/nginx/sites-available/pratibha-app /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Step 4: Deploy Application

Create app directory:

```bash
mkdir -p /var/www/pratibha-app
cd /var/www/pratibha-app
```

Upload your code (using git, scp, or rsync):

```bash
# Option 1: Using git
git clone your-repo-url .

# Option 2: Using scp (from your local machine)
scp -r pratibha-marketing-app/* root@your_droplet_ip:/var/www/pratibha-app/
```

Install dependencies:

```bash
npm install --production
```

Create production `.env` file:

```bash
nano .env
```

Add your production environment variables:

```env
PORT=5000
NODE_ENV=production
MONGODB_URI=your_production_mongodb_uri
ALLOWED_ORIGINS=https://yourdomain.com
```

### Step 5: Install and Configure PM2

```bash
npm install -g pm2
```

Start the application:

```bash
pm2 start backend/server.js --name pratibha-app
```

Configure PM2 to start on system boot:

```bash
pm2 startup
pm2 save
```

Useful PM2 commands:

```bash
pm2 status              # Check app status
pm2 logs pratibha-app   # View logs
pm2 restart pratibha-app # Restart app
pm2 stop pratibha-app   # Stop app
```

### Step 6: Install SSL Certificate (HTTPS)

Install Certbot:

```bash
apt install certbot python3-certbot-nginx -y
```

Get SSL certificate:

```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts. Certbot will automatically:
- Obtain the certificate
- Update Nginx configuration
- Setup auto-renewal

Test auto-renewal:

```bash
certbot renew --dry-run
```

### Step 7: Configure Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

### Step 8: MongoDB Atlas Configuration

In your MongoDB Atlas dashboard:

1. Go to Network Access
2. Add your Digital Ocean droplet IP address
3. Or allow access from anywhere (0.0.0.0/0) - less secure but easier
4. Ensure database user has read/write permissions

## Security Best Practices

### Implemented Security Features

1. **Helmet.js** - Security headers (XSS protection, clickjacking prevention)
2. **CORS** - Cross-Origin Resource Sharing control
3. **Rate Limiting** - Prevents brute force attacks (100 requests per 15 minutes)
4. **Input Validation** - All inputs validated using express-validator
5. **Data Sanitization** - NoSQL injection prevention with express-mongo-sanitize
6. **HTTP Parameter Pollution** - Protected with HPP middleware
7. **Environment Variables** - Sensitive data in .env (never committed)
8. **HTTPS** - SSL/TLS encryption with Let's Encrypt

### Additional Recommendations

1. **Enable MongoDB Encryption at Rest** in Atlas
2. **Use Strong Passwords** for database users
3. **Regular Backups** - Enable automatic backups in Digital Ocean and MongoDB Atlas
4. **Monitor Logs** - Regularly check PM2 logs for suspicious activity
5. **Keep Dependencies Updated** - Run `npm audit` and `npm update` regularly
6. **Disable Root SSH** - Use non-root user with sudo privileges
7. **Implement Authentication** - Add JWT-based auth for production use

## Monitoring and Maintenance

### View Application Logs

```bash
pm2 logs pratibha-app
pm2 logs pratibha-app --lines 100
```

### Monitor Performance

```bash
pm2 monit
```

### Restart After Code Changes

```bash
cd /var/www/pratibha-app
git pull  # If using git
npm install --production
pm2 restart pratibha-app
```

### Database Backups

MongoDB Atlas provides automatic backups. To create manual backup:

1. Go to MongoDB Atlas Dashboard
2. Select your cluster
3. Click "Backup"
4. Create on-demand snapshot

## Troubleshooting

### App Not Starting

```bash
pm2 logs pratibha-app --err
# Check for errors in logs
```

### Cannot Connect to MongoDB

- Verify MongoDB connection string in `.env`
- Check if droplet IP is whitelisted in MongoDB Atlas
- Ensure database user credentials are correct

### Nginx 502 Bad Gateway

- Check if Node.js app is running: `pm2 status`
- Verify port in `.env` matches Nginx proxy_pass
- Check Nginx error logs: `tail -f /var/log/nginx/error.log`

### SSL Certificate Issues

```bash
certbot certificates  # Check certificate status
certbot renew        # Renew manually
```

## Development

### Adding New Features

1. Create new routes in `backend/routes/`
2. Add corresponding models in `backend/models/`
3. Update frontend HTML with API calls
4. Test locally before deploying

### Database Schema Changes

When modifying Mongoose schemas:

1. Update the model file
2. Test migrations locally
3. Consider backward compatibility
4. Deploy during low-traffic periods

## License

Proprietary - Fresh Supply Co.

## Support

For issues or questions, contact your system administrator.

---

**Version**: 1.0.0
**Last Updated**: January 2026
