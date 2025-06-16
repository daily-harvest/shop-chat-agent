# Deployment to Cloudflare Workers

This document outlines the steps to deploy this Shopify Remix app to Cloudflare Workers using a custom D1 session storage solution.

## Prerequisites

1. A Cloudflare account
2. Cloudflare Workers subscription (includes a free tier)
3. Cloudflare D1 database for session storage
4. Wrangler CLI installed (`npm install -g wrangler`)

## Setup Steps

### 1. Install Dependencies

Run the following command to install all required dependencies:

```bash
npm install
```

### 2. Create a D1 Database

Create a D1 database in your Cloudflare account:

```bash
wrangler d1 create shop_auth
```

This will output a database ID which you should copy and add to your `wrangler.jsonc` file.

### 3. Setup the Database Schema

Apply the migration to create the necessary tables:

```bash
wrangler d1 execute shop_auth --command "CREATE TABLE IF NOT EXISTS shopify_sessions (id TEXT PRIMARY KEY, shop TEXT NOT NULL, state TEXT, isOnline INTEGER, scope TEXT, accessToken TEXT, expires INTEGER, onlineAccessInfo TEXT)"
```

### 4. Update Configuration

Make sure your `wrangler.jsonc` file has the correct D1 database ID and Shopify API credentials.

For production, it's recommended to set your Shopify API key and secret as secrets:

```bash
wrangler secret put SHOPIFY_API_KEY
wrangler secret put SHOPIFY_API_SECRET
```

### 4. Deploy to Cloudflare Workers

Build and deploy the app to Cloudflare Workers:

```bash
npm run build
npm run wrangler:deploy
```

### 5. Update Shopify App URL

After deployment, update your Shopify app's URL in the Shopify Partner Dashboard to point to your new Cloudflare Workers URL.

## Local Development

For local development with Cloudflare Workers:

```bash
npm run wrangler:dev
```

This will spin up a local development server that mimics the Cloudflare Workers environment.

## Special Configuration Notes

This implementation:

1. Uses a custom D1 session storage adapter 
2. Is configured to work properly in the Cloudflare Workers environment
3. Avoids globalThis usage which can cause issues in certain environments

## Troubleshooting

If you encounter any issues during deployment, check the Cloudflare Workers logs in the dashboard.

Common issues:
- Ensure your D1 database is properly linked in wrangler.jsonc
- Make sure your Shopify API key and secret are correct
- Check if the SHOPIFY_APP_URL in wrangler.jsonc matches your deployed worker URL

For other issues, refer to Cloudflare Workers documentation or Shopify Remix app documentation.
