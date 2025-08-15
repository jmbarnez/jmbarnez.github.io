-- Supabase SQL Schema for Sandbox Idle Game
-- Run these commands in your Supabase SQL editor

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret-here';

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User save data table
CREATE TABLE IF NOT EXISTS user_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    save_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Market listings table
CREATE TABLE IF NOT EXISTS market_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
    seller_name VARCHAR(50) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_per_unit INTEGER NOT NULL CHECK (price_per_unit > 0),
    total_price INTEGER GENERATED ALWAYS AS (quantity * price_per_unit) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

-- Chat messages table (for persistent chat history)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(20) NOT NULL,
    player_name VARCHAR(50) NOT NULL,
    message_type VARCHAR(20) DEFAULT 'chat', -- 'chat', 'system', 'join', 'leave'
    message_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Market transactions table (for history)
CREATE TABLE IF NOT EXISTS market_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID, -- May be null if listing is deleted
    seller_id UUID REFERENCES users(id),
    buyer_id UUID REFERENCES users(id),
    seller_name VARCHAR(50) NOT NULL,
    buyer_name VARCHAR(50) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL,
    price_per_unit INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_saves_user_id ON user_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller_id ON market_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_created_at ON market_listings(created_at);
CREATE INDEX IF NOT EXISTS idx_market_listings_item_name ON market_listings(item_name);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_market_transactions_created_at ON market_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_market_transactions_seller_id ON market_transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_transactions_buyer_id ON market_transactions(buyer_id);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_saves_updated_at BEFORE UPDATE ON user_saves
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security Policies

-- Users table policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

-- Users can update their own data
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- User saves policies
ALTER TABLE user_saves ENABLE ROW LEVEL SECURITY;

-- Users can manage their own saves
CREATE POLICY "Users can manage own saves" ON user_saves
    FOR ALL USING (auth.uid()::text = user_id::text);

-- Market listings policies
ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;

-- Anyone can view listings
CREATE POLICY "Anyone can view market listings" ON market_listings
    FOR SELECT USING (true);

-- Users can create listings
CREATE POLICY "Users can create listings" ON market_listings
    FOR INSERT WITH CHECK (auth.uid()::text = seller_id::text);

-- Users can update/delete their own listings
CREATE POLICY "Users can manage own listings" ON market_listings
    FOR UPDATE USING (auth.uid()::text = seller_id::text);

CREATE POLICY "Users can delete own listings" ON market_listings
    FOR DELETE USING (auth.uid()::text = seller_id::text);

-- Chat messages policies
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read chat messages (for the last 24 hours)
CREATE POLICY "Anyone can read recent chat messages" ON chat_messages
    FOR SELECT USING (created_at > NOW() - INTERVAL '24 hours');

-- Anyone can insert chat messages (with rate limiting in app)
CREATE POLICY "Anyone can send chat messages" ON chat_messages
    FOR INSERT WITH CHECK (true);

-- Market transactions policies
ALTER TABLE market_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view transactions they're involved in
CREATE POLICY "Users can view own transactions" ON market_transactions
    FOR SELECT USING (
        auth.uid()::text = seller_id::text OR 
        auth.uid()::text = buyer_id::text
    );

-- Only the system can insert transactions (via service role)
CREATE POLICY "System can create transactions" ON market_transactions
    FOR INSERT WITH CHECK (true);

-- Clean up functions

-- Function to clean up expired listings
CREATE OR REPLACE FUNCTION cleanup_expired_listings()
RETURNS void AS $$
BEGIN
    DELETE FROM market_listings 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old chat messages (keep last 1000)
CREATE OR REPLACE FUNCTION cleanup_old_chat_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM chat_messages 
    WHERE id NOT IN (
        SELECT id FROM chat_messages 
        ORDER BY created_at DESC 
        LIMIT 1000
    );
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup functions (if you have pg_cron extension)
-- SELECT cron.schedule('cleanup-expired-listings', '0 */6 * * *', 'SELECT cleanup_expired_listings();');
-- SELECT cron.schedule('cleanup-old-chat', '0 2 * * *', 'SELECT cleanup_old_chat_messages();');

-- Views for easier querying

-- Active market listings view
CREATE OR REPLACE VIEW active_market_listings AS
SELECT 
    id,
    seller_id,
    seller_name,
    item_name,
    quantity,
    price_per_unit,
    total_price,
    created_at,
    expires_at
FROM market_listings 
WHERE expires_at > NOW()
ORDER BY created_at DESC;

-- Recent chat messages view
CREATE OR REPLACE VIEW recent_chat_messages AS
SELECT 
    id,
    player_id,
    player_name,
    message_type,
    message_text,
    created_at
FROM chat_messages 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at ASC;

-- User transaction summary view
CREATE OR REPLACE VIEW user_transaction_summary AS
SELECT 
    user_id,
    username,
    total_sales,
    total_purchases,
    total_sales_value,
    total_purchases_value
FROM (
    SELECT 
        u.id as user_id,
        u.username,
        COALESCE(sales.count, 0) as total_sales,
        COALESCE(purchases.count, 0) as total_purchases,
        COALESCE(sales.value, 0) as total_sales_value,
        COALESCE(purchases.value, 0) as total_purchases_value
    FROM users u
    LEFT JOIN (
        SELECT 
            seller_id,
            COUNT(*) as count,
            SUM(total_price) as value
        FROM market_transactions 
        GROUP BY seller_id
    ) sales ON u.id = sales.seller_id
    LEFT JOIN (
        SELECT 
            buyer_id,
            COUNT(*) as count,
            SUM(total_price) as value
        FROM market_transactions 
        GROUP BY buyer_id
    ) purchases ON u.id = purchases.buyer_id
) summary;

COMMENT ON TABLE users IS 'User accounts with authentication data';
COMMENT ON TABLE user_saves IS 'Game save data stored as JSONB for each user';
COMMENT ON TABLE market_listings IS 'Active marketplace listings';
COMMENT ON TABLE chat_messages IS 'Chat message history';
COMMENT ON TABLE market_transactions IS 'Completed marketplace transactions';

-- Grant permissions for authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant permissions for anonymous users (for public endpoints)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON market_listings TO anon;
GRANT SELECT ON recent_chat_messages TO anon;