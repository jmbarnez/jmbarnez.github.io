/* eslint-env node */
const express = require('express');
const http = require('http');
const admin = require('firebase-admin');

// AI: Removed WebSocket dependency since we're using Firebase RTDB for real-time communication

// Initialize Firebase Admin SDK
let serviceAccount;
console.log('=== Firebase Credentials Setup ===');
console.log('Environment variables available:', Object.keys(process.env).filter(key => key.includes('FIREBASE')));
console.log('FIREBASE_SERVICE_ACCOUNT exists:', !!process.env.FIREBASE_SERVICE_ACCOUNT);

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log('Using environment variable for Firebase credentials');
  console.log('Environment variable length:', process.env.FIREBASE_SERVICE_ACCOUNT.length);
  try {
    // In production (like on Render), use the environment variable.
    // The variable should be a base64 encoded string of the JSON key file.
    console.log('Attempting to decode Base64 string...');
    const serviceAccountString = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
    console.log('Decoded string length:', serviceAccountString.length);
    console.log('Decoded string preview:', serviceAccountString.substring(0, 100) + '...');

    console.log('Attempting to parse JSON...');
    serviceAccount = JSON.parse(serviceAccountString);
    console.log('Successfully decoded Firebase credentials from environment variable');
    console.log('Project ID:', serviceAccount.project_id);
  } catch (error) {
    console.error('Error processing FIREBASE_SERVICE_ACCOUNT environment variable:');
    console.error('Error message:', error.message);
    console.error('Error type:', error.constructor.name);
    console.error('Error stack:', error.stack);

    // Log the first part of the environment variable to debug
    console.error('Environment variable starts with:', process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 100));

    process.exit(1);
  }
} else {
  console.log('Environment variable not found, falling back to local file');
  // In local development, fall back to the JSON file.
  try {
    serviceAccount = require('./google-credentials.json');
    console.log('Successfully loaded Firebase credentials from local file');
  } catch (error) {
    console.error("Error: 'google-credentials.json' not found.");
    console.error("Please make sure the file exists for local development, or set the FIREBASE_SERVICE_ACCOUNT environment variable for production.");
    console.error("Available environment variables:", Object.keys(process.env));
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
});

console.log(`Firebase initialized for project: ${serviceAccount.project_id}`);

const path = require('path');
const db = admin.database();
const AREA_ID = 'beach'; // Current area, can be made dynamic later
// Load server-side enemy templates; keep in sync with client `src/data/enemies.json`.
const templatesPath = path.join(__dirname, '..', 'src', 'data', 'enemies.json');
let enemyTemplates = { templates: [] };
try {
  enemyTemplates = require(templatesPath);
  console.log(`Loaded ${enemyTemplates.templates.length} enemy templates from ${templatesPath}`);
} catch (err) {
  console.warn('Could not load enemy templates from', templatesPath, err.message);
}

const ENEMY_HP = 3; // Fallback standard enemy HP when template missing
const enemiesRef = db.ref(`areas/${AREA_ID}/enemies`);

const app = express();
const server = http.createServer(app);

// AI: Removed WebSocket server - using Firebase RTDB for real-time sync
// This approach is more reliable and scales better

let enemies = {};
const MAX_ENEMIES = 20; // Spawn 20 bugs initially, no respawning
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

// Enemies are now static - removed all movement and fleeing configurations

// Function to choose weighted template
function chooseWeightedTemplate(templates) {
    if (!templates || templates.length === 0) return null;
    const weights = templates.map(t => (t.spawnWeight || 1));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return templates[0];
    let r = Math.random() * total;
    for (let i = 0; i < templates.length; i++) {
        r -= weights[i];
        if (r <= 0) return templates[i];
    }
    return templates[templates.length - 1];
}

// Function to spawn initial enemies (NO RESPAWNING)
function spawnInitialEnemies() {
    console.log(`[ENEMY_SPAWN] Spawning ${MAX_ENEMIES} initial enemies (no respawning)`);

    const newEnemies = {};
    for (let i = 0; i < MAX_ENEMIES; i++) {
        const randomSuffix = Math.random().toString(36).slice(2, 8);
        const id = `bug_${Date.now()}_${randomSuffix}_${i}`;

        // Generate random positions across the entire world
        const x = 20 + Math.random() * (WORLD_WIDTH - 40);
        const y = 20 + Math.random() * (WORLD_HEIGHT - 40);

        // Choose a template for this area using weights
        const areaTemplates = (enemyTemplates.templates || []).filter(t => !t.areas || t.areas.length === 0 || t.areas.includes(AREA_ID));
        const chosen = chooseWeightedTemplate(areaTemplates) || null;

        // Always spawn with full health
        const templateId = chosen ? chosen.id : null;
        const maxHpFromTemplate = chosen ? (chosen.maxHp || chosen.hp || ENEMY_HP) : ENEMY_HP;
        const hpFromTemplate = maxHpFromTemplate;

        console.log(`[ENEMY_SPAWN] Creating enemy ${id} at (${x}, ${y}) with ${hpFromTemplate}/${maxHpFromTemplate} HP`);

        newEnemies[id] = {
            id,
            x: x,
            y: y,
            hp: hpFromTemplate,
            maxHp: maxHpFromTemplate,
            xpValue: chosen ? (chosen.xpValue || 1) : 1,
            angle: Math.random() * Math.PI * 2,
            templateId,
            lastUpdate: Date.now(),
            isDead: false,
            behavior: chosen ? (chosen.behavior || 'passive') : 'passive'
        };
    }

    enemiesRef.set(newEnemies, (error) => {
        if (error) {
            console.error('[ENEMY_SPAWN] Error spawning initial enemies:', error);
        } else {
            console.log(`[ENEMY_SPAWN] Successfully spawned ${MAX_ENEMIES} initial enemies`);
        }
    });
}

// Spawn initial enemies if none exist (NO RESPAWNING)
console.log('[ENEMY_SPAWN] Checking for initial enemy setup...');
enemiesRef.once('value', (snapshot) => {
    if (!snapshot.exists() || Object.keys(snapshot.val() || {}).length === 0) {
        console.log('[ENEMY_SPAWN] No enemies found, spawning initial set...');
        spawnInitialEnemies();
    } else {
        console.log('[ENEMY_SPAWN] Enemies already exist - no respawning will occur');
    }
});

// AI: Removed periodic spawn check to prevent conflicts with death-triggered respawns
// Enemies now only respawn after death with proper 30-second delay

// AI: Listen for enemy changes - no need to broadcast via WebSocket since clients subscribe to RTDB
enemiesRef.on('value', (snapshot) => {
    // AI: This listener fetches all enemy data on every change.
    // While necessary for server-side state management, be aware of its data usage
    // if the 'enemies' node becomes very large or updates extremely frequently.
    // Clients should also subscribe to this path for real-time updates.
    enemies = snapshot.val() || {};
});

// Player position tracking removed - enemies don't move or flee

// Enemies are now static - no movement or fleeing behavior
// Removed all movement and fleeing logic since enemies don't move


// Handle damage via Firebase RTDB database triggers
// Dead enemies are permanently removed (no respawning)
enemiesRef.on('child_changed', (snapshot) => {
    const enemyId = snapshot.key;
    const enemy = snapshot.val();

    // If enemy HP drops to 0 or below, remove it permanently
    if (enemy && (enemy.hp <= 0 || enemy.isDead === true)) {
        console.log(`[ENEMY_DEATH] Enemy ${enemyId} HP reached 0 (HP: ${enemy.hp}), removing permanently (no respawn)`);

        // Remove the dead enemy immediately
        enemiesRef.child(enemyId).remove().then(() => {
            console.log(`[ENEMY_DEATH] Enemy ${enemyId} permanently removed from Firebase`);

            // Immediately remove from local cache
            if (enemies[enemyId]) {
                delete enemies[enemyId];
            }

            console.log(`[ENEMY_DEATH] Enemy ${enemyId} is gone forever`);
        }).catch(error => {
            console.error(`[ENEMY_DEATH] Error removing enemy ${enemyId}:`, error);
        });
    }
});

// AI: Detect client-created/unauthorized enemy additions and normalize them.
// Some old clients or buggy clients may create enemy nodes directly which causes
// immediate respawns or incorrect HP values. Defend on the server by observing
// child_added events and correcting/removing suspicious entries.
// Removed recentRemovals and associated logic as it's no longer needed with server-authoritative death and no respawning.

enemiesRef.on('child_added', (snapshot) => {
    const id = snapshot.key;
    const enemy = snapshot.val();
    if (!enemy) return;

    console.log(`[ENEMY_ADD] New enemy ${id} added to server (HP: ${enemy.hp}/${enemy.maxHp}, template: ${enemy.templateId})`);

    // Normalize missing maxHp
    const maxHp = enemy.maxHp || ENEMY_HP;

    // If client created this enemy with 0 HP (dead enemy), remove it immediately
    if (typeof enemy.hp === 'number' && enemy.hp <= 0) {
        console.log(`[ENEMY_ADD] Removing dead enemy ${id} created by client: hp=${enemy.hp}`);
        enemiesRef.child(id).remove().then(() => {
            console.log(`[ENEMY_ADD] Removed dead enemy ${id}`);
        }).catch((err) => {
            console.warn(`[ENEMY_ADD] Failed to remove dead enemy ${id}:`, err);
        });
        return; // dead enemies should not exist on server
    }

    // CRITICAL: If client created this enemy with less than max HP (but not dead), correct it to full health.
    // This prevents the "decreasing health" bug where enemies respawn with partial health.
    if (typeof enemy.hp === 'number' && enemy.hp < maxHp) {
        console.log(`[ENEMY_ADD] Normalizing client-created enemy ${id}: hp=${enemy.hp} -> ${maxHp} (BUG FIX)`);
        const updates = {
            hp: maxHp,
            maxHp,
            lastUpdate: Date.now(),
            isDead: false // Ensure it's marked as alive
        };
        enemiesRef.child(id).update(updates).then(() => {
            console.log(`[ENEMY_ADD] Normalized enemy ${id} to full HP`);
        }).catch((err) => {
            console.warn(`[ENEMY_ADD] Failed to normalize HP for enemy ${id}:`, err);
        });
        return; // we've corrected it; nothing else to do for this add
    }

    // Removed client re-spawn detection (recentRemovals logic)

    console.log(`[ENEMY_ADD] Enemy ${id} passed all validation checks`);
});

// Handle enemy removal - NO RESPAWNING
enemiesRef.on('child_removed', (snapshot) => {
    const enemyId = snapshot.key;
    const removedEnemy = snapshot.val();

    console.log(`[ENEMY_REMOVE] Enemy ${enemyId} permanently removed from server (was at ${removedEnemy?.x || 0}, ${removedEnemy?.y || 0})`);
    console.log(`[ENEMY_REMOVE] Enemy ${enemyId} is gone forever - no respawning`);

    // Removed tracking of recent removals - no longer needed
    // Update local enemies cache
    if (enemies[enemyId]) {
        delete enemies[enemyId];
    }

    // NO RESPAWNING - Enemy is gone forever
});

// AI: Add basic health endpoint for server monitoring
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        enemies: Object.keys(enemies).length,
        maxEnemies: MAX_ENEMIES,
        timestamp: new Date().toISOString()
    });
});

// AI: Removed endpoint to manually trigger enemy respawn (for debugging)
// app.post('/respawn', (req, res) => {
//     console.log('Manual respawn triggered via API');
//     spawnMissingEnemies();
//     res.json({ message: 'Respawn triggered' });
// });

const port = process.env.PORT || 8081;
server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});