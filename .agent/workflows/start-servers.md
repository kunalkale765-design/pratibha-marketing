---
description: How to start the development servers for Pratibha Marketing App
---

# Starting Development Servers

This app requires **two servers** running simultaneously for development:

## 1. Backend Server (Express/Node.js)
- **Port**: 3000
- **Command**: `npm run dev` (or `npm start`)
- **Purpose**: API endpoints and database operations

// turbo
```bash
cd /Users/kunal/Desktop/pratibha\ marketing\ app && npm run dev
```

## 2. Frontend Server (Vite)
- **Port**: 5173 (or 5174 if 5173 is busy)
- **Command**: `npm run dev:frontend`
- **Purpose**: Serves the frontend with hot module reloading

// turbo
```bash
cd /Users/kunal/Desktop/pratibha\ marketing\ app && npm run dev:frontend
```

## Access the App
- **Frontend URL**: http://localhost:5173/ (or http://localhost:5174/)
- **Backend API**: http://localhost:3000/api/

## Common Issues
- If port 3000 shows JSON error about missing `index.html`, the **frontend server is not running**
- Always start both servers for development
