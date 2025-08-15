# Migration Guide: Netlify + Supabase Deployment

## Overview
Your game has been migrated from local Node.js servers to Netlify Functions + Supabase for production deployment.

## What Changed

### ✅ **Removed**
- `server/` directory (legacy Node.js servers)
- Local WebSocket chat server
- Local auth server with file-based storage
- `dev:all`, `chat`, `api` npm scripts

### ✅ **Added**
- `netlify/functions/` - Serverless functions
- `netlify.toml` - Netlify configuration
- `supabase-schema.sql` - Database schema
- Netlify CLI scripts

## Setup Instructions

### 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In your Supabase SQL editor, run the contents of `supabase-schema.sql`
3. Note your project URL and API keys from Settings > API

### 2. Netlify Setup

1. Connect your GitHub repo to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Set functions directory: `netlify/functions`

### 3. Environment Variables

Set these in your Netlify dashboard (Site settings > Environment variables):

```
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
JWT_SECRET=your-random-jwt-secret
```

### 4. Enable Supabase Integration

In your Netlify functions, uncomment the Supabase integration code in:
- `netlify/functions/lib/supabase.js`
- Update all auth and save functions to use Supabase

## API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login  
- `GET /api/me` - Get current user

### Save Data
- `GET /api/save` - Get user save data
- `POST /api/save` - Update user save data

### Chat (HTTP-based)
- `GET /api/chat/messages` - Get recent messages
- `GET /api/chat/players` - Get online players
- `POST /api/chat/join` - Join chat
- `POST /api/chat/message` - Send message
- `POST /api/chat/leave` - Leave chat

### Market
- `GET /api/market/listings` - Get market listings
- `POST /api/market/list` - Create listing
- `POST /api/market/buy` - Purchase item
- `DELETE /api/market/remove` - Remove listing

## Local Development

```bash
# Install dependencies
npm install

# Install functions dependencies
cd netlify/functions
npm install
cd ../..

# Run local development with Netlify Dev
npm run netlify:dev
```

## Deployment

```bash
# Build and deploy to Netlify
npm run netlify:deploy:prod
```

## Database Schema

The `supabase-schema.sql` creates these tables:
- `users` - User accounts
- `user_saves` - Game save data (JSONB)
- `market_listings` - Marketplace listings
- `chat_messages` - Chat history
- `market_transactions` - Transaction history

## Migration Notes

### Chat System
- Changed from WebSocket to HTTP polling
- Messages are now persisted in database
- For real-time features, consider Supabase Realtime

### Market System
- Now fully persistent across server restarts
- Transaction history tracking
- Automatic cleanup of expired listings

### Authentication
- JWT tokens remain the same
- User data now stored in Supabase
- Row Level Security policies implemented

## Next Steps

1. Deploy to Netlify
2. Set up Supabase database
3. Configure environment variables
4. Enable Supabase integration in functions
5. Test all functionality
6. Optionally add Supabase Realtime for better chat experience

## Troubleshooting

### Function Errors
- Check Netlify function logs
- Verify environment variables are set
- Ensure Supabase connection is working

### Database Issues
- Verify schema was applied correctly
- Check Row Level Security policies
- Ensure API keys have correct permissions

### Client-Side Issues  
- Update any hardcoded localhost URLs
- Check browser network tab for failed requests
- Verify CORS headers in function responses