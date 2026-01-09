# Sentry Error Monitoring Setup Guide

## Quick Setup (5 minutes)

### Step 1: Create a Sentry Account
1. Go to [sentry.io](https://sentry.io) and sign up (free tier available)
2. Create a new project and select **Node.js** as the platform
3. Copy your **DSN** (Data Source Name) - it looks like:
   ```
   https://xxx@xxx.ingest.sentry.io/xxx
   ```

### Step 2: Add DSN to Environment
Add to your `.env` file:
```bash
SENTRY_DSN=https://your-dsn-here@sentry.io/xxx
```

### Step 3: Verify Setup
1. Start the server: `npm run dev`
2. Check the health endpoint: `http://localhost:5000/api/health`
   - Should show `"sentry": "configured"`
3. Test error capture (development only): `http://localhost:5000/api/debug-sentry`
   - This will throw a test error and send it to Sentry
   - Check your Sentry dashboard to see it

---

## What Gets Captured

- All unhandled Express errors
- Unhandled Promise rejections
- Uncaught exceptions
- API errors (400, 404, 500)

## What Doesn't Get Captured

- Successful requests
- Expected errors (like validation failures)
- Test environment errors (Sentry is disabled in tests)

---

## Configuration Options

In `backend/server.js`, Sentry is configured with:

```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // ... integrations
});
```

### Adjustable Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `environment` | NODE_ENV | Groups errors by environment |
| `tracesSampleRate` | 0.1 in prod, 1.0 in dev | Performance monitoring sample rate |

---

## Sentry Dashboard Features

Once set up, you can:
- View all errors with stack traces
- See which users/requests caused errors
- Get email/Slack alerts for new errors
- Track error frequency over time
- Set up release tracking

---

## Production Checklist

- [ ] Set `SENTRY_DSN` in production environment
- [ ] Verify errors appear in Sentry dashboard
- [ ] Configure alert rules (email/Slack notifications)
- [ ] (Optional) Set up release tracking for deployment visibility

---

## Troubleshooting

### Errors not appearing in Sentry?
1. Check `SENTRY_DSN` is set correctly
2. Verify `/api/health` shows `"sentry": "configured"`
3. Try the test endpoint: `/api/debug-sentry`
4. Check network - Sentry needs outbound HTTPS access

### Too many errors?
1. Add error filtering in Sentry dashboard
2. Reduce `tracesSampleRate` for high-traffic apps
3. Use `beforeSend` hook to filter specific errors

---

## Useful Links

- [Sentry Node.js Docs](https://docs.sentry.io/platforms/node/)
- [Express Integration](https://docs.sentry.io/platforms/node/guides/express/)
- [Sentry Dashboard](https://sentry.io)
