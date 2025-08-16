#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const outPath = path.join(process.cwd(), 'config.json');
const cfg = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
};

fs.writeFileSync(outPath, JSON.stringify(cfg, null, 2));

const maskedKey = (cfg.SUPABASE_ANON_KEY || '').slice(0, 8) + '...';
console.log(`✅ Wrote config.json with SUPABASE_URL=${cfg.SUPABASE_URL} and ANON_KEY=${maskedKey}`);


