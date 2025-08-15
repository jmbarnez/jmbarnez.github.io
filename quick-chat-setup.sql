-- Optimized chat setup for Supabase
-- This creates efficient tables for chat functionality

-- Create chat_messages table with optimizations
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('chat', 'system', 'join', 'leave')),
    text TEXT NOT NULL CHECK (length(text) > 0 AND length(text) <= 500),
    player_name TEXT NOT NULL CHECK (length(player_name) > 0 AND length(player_name) <= 50),
    player_id TEXT NOT NULL CHECK (length(player_id) > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient message retrieval
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_player_id ON public.chat_messages (player_id);

-- Create chat_players table with optimizations
CREATE TABLE IF NOT EXISTS public.chat_players (
    player_id TEXT PRIMARY KEY CHECK (length(player_id) > 0),
    player_name TEXT NOT NULL CHECK (length(player_name) > 0 AND length(player_name) <= 50),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient active player queries
CREATE INDEX IF NOT EXISTS idx_chat_players_last_seen ON public.chat_players (last_seen DESC);

-- Grant permissions to service role (required for Netlify functions)
GRANT ALL ON public.chat_messages TO service_role;
GRANT ALL ON public.chat_players TO service_role;

-- Enable RLS with optimized policies
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_players ENABLE ROW LEVEL SECURITY;

-- Create efficient policies
CREATE POLICY "Allow read access to chat messages" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Allow insert access to chat messages" ON public.chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all operations on chat players" ON public.chat_players FOR ALL USING (true) WITH CHECK (true);

-- Auto-cleanup old messages (keep last 1000 messages)
CREATE OR REPLACE FUNCTION cleanup_old_chat_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM public.chat_messages 
    WHERE id NOT IN (
        SELECT id FROM public.chat_messages 
        ORDER BY created_at DESC 
        LIMIT 1000
    );
END;
$$ LANGUAGE plpgsql;

-- Test the setup
SELECT 'Setup complete - tables created successfully' as status;

-- Optimized market schema
CREATE TABLE IF NOT EXISTS public.market_listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    seller_id TEXT NOT NULL CHECK (length(seller_id) > 0),
    seller_name TEXT NOT NULL CHECK (length(seller_name) > 0 AND length(seller_name) <= 50),
    item TEXT NOT NULL CHECK (length(item) > 0 AND length(item) <= 100),
    item_type TEXT CHECK (item_type IS NULL OR length(item_type) <= 50),
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000000),
    price INTEGER NOT NULL CHECK (price > 0 AND price <= 1000000000),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient market queries
CREATE INDEX IF NOT EXISTS idx_market_listings_created_at ON public.market_listings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller_id ON public.market_listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_item ON public.market_listings (item);
CREATE INDEX IF NOT EXISTS idx_market_listings_item_type ON public.market_listings (item_type) WHERE item_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.market_sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id UUID,
    seller_id TEXT NOT NULL CHECK (length(seller_id) > 0),
    seller_name TEXT NOT NULL CHECK (length(seller_name) > 0 AND length(seller_name) <= 50),
    buyer_id TEXT NOT NULL CHECK (length(buyer_id) > 0),
    buyer_name TEXT NOT NULL CHECK (length(buyer_name) > 0 AND length(buyer_name) <= 50),
    item TEXT NOT NULL CHECK (length(item) > 0 AND length(item) <= 100),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price INTEGER NOT NULL CHECK (price > 0),
    total_cost INTEGER NOT NULL CHECK (total_cost > 0),
    collected BOOLEAN DEFAULT FALSE,
    collected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient sales queries
CREATE INDEX IF NOT EXISTS idx_market_sales_seller_id ON public.market_sales (seller_id);
CREATE INDEX IF NOT EXISTS idx_market_sales_buyer_id ON public.market_sales (buyer_id);
CREATE INDEX IF NOT EXISTS idx_market_sales_created_at ON public.market_sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_sales_collected ON public.market_sales (collected) WHERE collected = false;

-- Grant permissions
GRANT ALL ON public.market_listings TO service_role;
GRANT ALL ON public.market_sales TO service_role;

-- Enable RLS with optimized policies
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to market listings" ON public.market_listings FOR SELECT USING (true);
CREATE POLICY "Allow insert/update/delete to market listings" ON public.market_listings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on market sales" ON public.market_sales FOR ALL USING (true) WITH CHECK (true);

-- Auto-cleanup old listings (remove expired ones after 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_market_listings()
RETURNS void AS $$
BEGIN
    DELETE FROM public.market_listings 
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;