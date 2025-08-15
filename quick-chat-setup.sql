-- Quick chat setup - run this in Supabase SQL editor first
-- This creates the minimum required tables for chat to work

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    player_name TEXT NOT NULL,
    player_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chat_players table
CREATE TABLE IF NOT EXISTS public.chat_players (
    player_id TEXT PRIMARY KEY,
    player_name TEXT NOT NULL,
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions to service role (required for Netlify functions)
GRANT ALL ON public.chat_messages TO service_role;
GRANT ALL ON public.chat_players TO service_role;

-- Enable RLS but allow all operations for now
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_players ENABLE ROW LEVEL SECURITY;

-- Create permissive policies
CREATE POLICY "Allow all operations" ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON public.chat_players FOR ALL USING (true) WITH CHECK (true);

-- Test the setup
SELECT 'Setup complete - tables created successfully' as status;

-- Minimal market schema
CREATE TABLE IF NOT EXISTS public.market_listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    seller_id TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    item TEXT NOT NULL,
    item_type TEXT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price INTEGER NOT NULL CHECK (price > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.market_sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id UUID,
    seller_id TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    buyer_name TEXT NOT NULL,
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    total_cost INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mark collection fields
ALTER TABLE public.market_sales ADD COLUMN IF NOT EXISTS collected BOOLEAN DEFAULT FALSE;
ALTER TABLE public.market_sales ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

GRANT ALL ON public.market_listings TO service_role;
GRANT ALL ON public.market_sales TO service_role;

ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on market_listings" ON public.market_listings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on market_sales" ON public.market_sales FOR ALL USING (true) WITH CHECK (true);