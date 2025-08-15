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