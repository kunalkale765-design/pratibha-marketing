// PM2 Ecosystem Configuration
// Start with: pm2 start ecosystem.config.js
// Documentation: https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [{
    name: 'pratibha-marketing',
    script: 'backend/server.js',

    // Cluster mode for load balancing (use 'max' for all CPUs)
    instances: 1,
    exec_mode: 'fork',

    // Auto-restart on changes (disable in production)
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git'],

    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },

    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    merge_logs: true,

    // Log rotation (requires pm2-logrotate module)
    // Install: pm2 install pm2-logrotate
    // Configure: pm2 set pm2-logrotate:max_size 10M
    //           pm2 set pm2-logrotate:retain 7
    //           pm2 set pm2-logrotate:compress true

    // Memory management
    max_memory_restart: '500M',

    // Graceful shutdown
    kill_timeout: 20000,
    wait_ready: true,
    listen_timeout: 10000,

    // Auto-restart settings
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,

    // Exponential backoff restart delay
    exp_backoff_restart_delay: 100
  }],

  // Deployment configuration (for pm2 deploy)
  deploy: {
    production: {
      user: 'root',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'https://github.com/kunalkale765-design/pratibha-marketing.git',
      path: '/var/www/pratibha-marketing',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && npm run build:frontend && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
