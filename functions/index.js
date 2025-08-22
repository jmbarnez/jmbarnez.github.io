const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require("firebase-functions/logger");
const { cleanupChat } = require("./cleanup");
exports.cleanupChat = cleanupChat;
// The spawner functions have been deprecated and moved to the dedicated server.
const { onValueWritten } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");

// Load enemy templates from repository data so server-authoritative spawns use same visuals
let enemyTemplateList = [];
try {
  const enemyData = require('../src/data/enemies.json');
  enemyTemplateList = enemyData.templates || [];
} catch (e) {
  logger.warn('Could not load enemy templates from ../src/data/enemies.json', e?.message || e);
}

function chooseWeightedTemplate(templatesArr) {
  if (!templatesArr || templatesArr.length === 0) return null;
  const weights = templatesArr.map(t => (t.spawnWeight || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return templatesArr[0];
  let r = Math.random() * total;
  for (let i = 0; i < templatesArr.length; i++) {
    r -= weights[i];
    if (r <= 0) return templatesArr[i];
  }
  return templatesArr[templatesArr.length - 1];
}

// Lazily initialize the admin SDK to prevent deployment issues.
let app;
function getAdminApp() {
    if (!app) {
        app = admin.initializeApp();
    }
    return app;
}

// DB Health Check
exports.healthDb = onRequest({ cors: true }, async (request, response) => {
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method not allowed' });
    }
    try {
        // A simple check to see if the function can be invoked
        return response.status(200).json({ ok: true });
    } catch (error) {
        logger.error('DB health check failed:', error?.message || error);
        return response.status(500).json({ ok: false });
    }
});

// Removed username/reCAPTCHA callables. Email-only auth now.

// Mirror RTDB presence to Firestore players/{uid}.isOnline for robust presence
exports.mirrorPresenceToFirestore = onValueWritten({ ref: "/status/{uid}" }, async (event) => {
  try {
    const uid = event.params.uid;
    const after = event.data?.after?.val() || {};
    const isOnline = after?.state === 'online';

    const db = admin.firestore();
    await db.collection('players').doc(uid).set(
      {
        isOnline,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    logger.error('mirrorPresenceToFirestore error', e?.message || e);
  }
});

// Authoritative damage handler: process client damage requests atomically
exports.handleDamageRequest = onValueWritten({ ref: "/actions/damageRequests/{areaId}/{reqId}" }, async (event) => {
  try {
    // Only handle creations (before should be null)
    if (event.data?.before && event.data.before.exists()) return;
    const after = event.data?.after?.val();
    if (!after) return;

    const areaId = event.params.areaId;
    const reqId = event.params.reqId;
    const enemyId = after.enemyId;
    const uid = after.uid;
    const damage = Number(after.damage) || 0;

    if (!enemyId || !uid || damage <= 0) {
      await getAdminApp().database().ref(`/actions/damageResults/${areaId}/${reqId}`).set({ success: false, error: 'invalid_request' });
      return;
    }

    const db = getAdminApp().database();
    const enemyRef = db.ref(`areas/${areaId}/enemies/${enemyId}`);

    const tranRes = await enemyRef.transaction((enemy) => {
      if (!enemy) return enemy; // nothing to do
      if (enemy.isDead) return enemy; // already dead

      enemy.hp = (Number(enemy.hp) || 0) - damage;
      enemy.lastHitBy = uid;
      enemy.damageContributors = enemy.damageContributors || {};
      enemy.damageContributors[uid] = (enemy.damageContributors[uid] || 0) + damage;

      if (enemy.hp <= 0) {
        enemy.hp = 0;
        enemy.isDead = true;
        enemy.deathAt = Date.now();
      }

      enemy.lastUpdate = Date.now();
      return enemy;
    }, undefined, false);

    if (!tranRes.committed) {
      await db.ref(`/actions/damageResults/${areaId}/${reqId}`).set({ success: false, error: 'transaction_failed' });
      return;
    }

    const updatedEnemy = tranRes.snapshot.val();

    // If enemy died now, create ground item(s) visible to contributors
    if (updatedEnemy && updatedEnemy.isDead && !updatedEnemy.lootProcessed) {
      const contributors = Object.keys(updatedEnemy.damageContributors || {});
      const loot = (updatedEnemy.loot && updatedEnemy.loot.items && updatedEnemy.loot.items.length > 0)
        ? updatedEnemy.loot.items[0]
        : { type: 'galactic_token', count: 1 };

      const giRef = db.ref(`areas/${areaId}/groundItems`).push();
      await giRef.set({
        type: loot.type || 'galactic_token',
        count: loot.count || 1,
        x: updatedEnemy.x || 0,
        y: updatedEnemy.y || 0,
        ownerId: null,
        visibleTo: contributors.length > 0 ? contributors : null,
        createdAt: Date.now(),
        releaseAt: Date.now() + 5000
      });

      // Mark enemy lootProcessed to avoid duplicate drops
      await enemyRef.child('lootProcessed').set(true);
    }

    // Write result for requester
    await db.ref(`/actions/damageResults/${areaId}/${reqId}`).set({ success: true, enemy: updatedEnemy });
  } catch (e) {
    logger.error('handleDamageRequest error', e?.message || e);
    try { await getAdminApp().database().ref(`/actions/damageResults/${event.params.areaId}/${event.params.reqId}`).set({ success: false, error: String(e?.message || e) }); } catch (_) {}
  }
});

// DISABLED: Enemy respawning is disabled
/*
exports.enqueueRespawnOnDeath = onValueWritten({ ref: "/areas/{areaId}/enemies/{enemyId}" }, async (event) => {
  try {
    const before = event.data?.before?.val();
    const after = event.data?.after?.val();
    if (!after) return; // removed

    const justDied = (!before || !before.isDead) && after.isDead;
    if (!justDied) return;

    const areaId = event.params.areaId;
    const enemyId = event.params.enemyId;
    const db = getAdminApp().database();

    const respawnRef = db.ref(`/actions/respawns/${areaId}/${enemyId}`);
    const now = Date.now();
    // Only enqueue if not already present
    const snap = await respawnRef.once('value');
    if (snap.exists()) return;

    await respawnRef.set({ enemyId, requestedAt: now, releaseAt: now + 30000 });
  } catch (e) {
    logger.error('enqueueRespawnOnDeath error', e?.message || e);
  }
});
// */

// DISABLED: Enemy spawning system is disabled
// exports.processRespawns = onSchedule('// */15 * * * *', async (schedEvent) => {
// //   try {
//     const db = getAdminApp().database();
//     const rootRef = db.ref('actions/respawns');
//     const now = Date.now();
//     const rootSnap = await rootRef.once('value');
//     if (!rootSnap.exists()) return;

//     const WORLD_WIDTH = 800;
//     const WORLD_HEIGHT = 600;
//     const MAX_ENEMIES = 10;
//     const ENEMY_HP = 3;

//     const areas = rootSnap.val() || {};
//     for (const areaId of Object.keys(areas)) {
//       const areaRespawns = areas[areaId] || {};
//       for (const key of Object.keys(areaRespawns)) {
//         const req = areaRespawns[key];
//         if (!req || typeof req.releaseAt !== 'number') continue;
//         if (req.releaseAt > now) continue; // not yet

//         const enemiesRef = db.ref(`areas/${areaId}/enemies`);
//         const enemiesSnap = await enemiesRef.once('value');
//         const currentCount = enemiesSnap.exists() ? Object.keys(enemiesSnap.val() || {}).length : 0;

//         if (currentCount >= MAX_ENEMIES) {
//           // postpone by small amount
//           await db.ref(`actions/respawns/${areaId}/${key}/releaseAt`).set(now + 10000);
//           continue;
//         }

//         // Spawn a new enemy using weighted templates if available
//         const id = `bug_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
//         const x = 20 + Math.random() * (WORLD_WIDTH - 40);
//         const y = 20 + Math.random() * (WORLD_HEIGHT - 40);

//         // Choose template for this area
//         const areaTemplates = enemyTemplateList.filter(t => !t.areas || t.areas.length === 0 || t.areas.includes(areaId));
//         const chosen = chooseWeightedTemplate(areaTemplates) || null;

//         const enemyObj = {
//           id,
//           x,
//           y,
//           hp: (chosen && (chosen.hp || chosen.maxHp)) || ENEMY_HP,
//           maxHp: (chosen && (chosen.maxHp || chosen.hp)) || ENEMY_HP,
//           templateId: chosen ? chosen.id : null,
//           loot: (chosen && chosen.loot) || null,
//           xpValue: (chosen && chosen.xpValue) || 1,
//           angle: Math.random() * Math.PI * 2,
//           lastUpdate: Date.now(),
//           isDead: false,
//           damageContributors: {}
//         };

//         await enemiesRef.child(id).set(enemyObj);

//         // remove the respawn request
//         await db.ref(`actions/respawns/${areaId}/${key}`).remove();
//         logger.log(`Respawned enemy ${id} in area ${areaId}`);
//       }
//     }
//   } catch (e) {
//     logger.error('processRespawns error', e?.message || e);
//   }
// });
// */

// Pickup request handler: atomic pickup + grant to player inventory
exports.handlePickupRequest = onValueWritten({ ref: "/actions/pickupRequests/{areaId}/{reqId}" }, async (event) => {
  try {
    if (event.data?.before && event.data.before.exists()) return;
    const after = event.data?.after?.val();
    if (!after) return;

    const areaId = event.params.areaId;
    const reqId = event.params.reqId;
    const itemId = after.itemId;
    const uid = after.uid;

    if (!itemId || !uid) {
      await getAdminApp().database().ref(`/actions/pickupResults/${areaId}/${reqId}`).set({ success: false, error: 'invalid_request' });
      return;
    }

    const db = getAdminApp().database();
    const itemRef = db.ref(`areas/${areaId}/groundItems/${itemId}`);

    const tranRes = await itemRef.transaction((item) => {
      if (!item) return item; // already gone

      const now = Date.now();
      const isVisibleToPlayer = !item.visibleTo || (Array.isArray(item.visibleTo) && item.visibleTo.includes(uid));
      const isReleased = !item.releaseAt || (typeof item.releaseAt === 'number' && item.releaseAt <= now);

      if (!(isVisibleToPlayer || isReleased)) {
        // not allowed to pick up
        return; // abort transaction
      }

      // Remove item by returning null
      return null;
    }, undefined, false);

    if (!tranRes.committed) {
      await db.ref(`/actions/pickupResults/${areaId}/${reqId}`).set({ success: false, error: 'not_allowed_or_already_taken' });
      return;
    }

    // Grant item to player inventory (simple increment under /players/{uid}/inventory/{type})
    const itemSnapshot = tranRes.snapshot; // snapshot is the pre-transaction value
    const itemValue = itemSnapshot.val();
    if (!itemValue) {
      // item removed by transaction but we still need its metadata (we can try to use 'after' payload)
    }

    const itemType = (itemValue && itemValue.type) || after.type || 'unknown';
    const count = (itemValue && itemValue.count) || after.count || 1;

    const invRef = db.ref(`players/${uid}/inventory/${itemType}`);
    await invRef.transaction((v) => {
      return (Number(v) || 0) + count;
    });

    await db.ref(`/actions/pickupResults/${areaId}/${reqId}`).set({ success: true, item: { type: itemType, count } });
  } catch (e) {
    logger.error('handlePickupRequest error', e?.message || e);
    try { await getAdminApp().database().ref(`/actions/pickupResults/${event.params.areaId}/${event.params.reqId}`).set({ success: false, error: String(e?.message || e) }); } catch (_) {}
  }
});

// DISABLED: Initial enemy spawning is disabled
/*
exports.spawnInitialEnemies = onRequest({ cors: true }, async (req, res) => {
  try {
    const areaId = (req.query.areaId || req.body && req.body.areaId) || 'beach';
    const db = getAdminApp().database();
    const enemiesRef = db.ref(`areas/${areaId}/enemies`);

    const snapshot = await enemiesRef.once('value');
    if (snapshot.exists() && Object.keys(snapshot.val() || {}).length > 0) {
      return res.json({ success: true, message: 'Enemies already present' });
    }

    const WORLD_WIDTH = 800;
    const WORLD_HEIGHT = 600;
    const MAX_ENEMIES = 20;
    const ENEMY_HP = 3;

    const newEnemies = {};
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const id = `bug_${Date.now()}_${Math.random().toString(36).slice(2,8)}_${i}`;
      const x = 20 + Math.random() * (WORLD_WIDTH - 40);
      const y = 20 + Math.random() * (WORLD_HEIGHT - 40);
      newEnemies[id] = {
        id,
        x,
        y,
        hp: ENEMY_HP,
        maxHp: ENEMY_HP,
        templateId: null,
        loot: null,
        xpValue: 1,
        angle: Math.random() * Math.PI * 2,
        lastUpdate: Date.now(),
        isDead: false,
        damageContributors: {}
      };
    }

    await enemiesRef.set(newEnemies);
    return res.json({ success: true, spawned: MAX_ENEMIES });
  } catch (e) {
    logger.error('spawnInitialEnemies error', e?.message || e);
    return res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});
// */

// Scheduled task: release visibility for ground items every minute
exports.releaseGroundItemVisibility = onSchedule('0 */1 * * *', async (event) => {
  try {
    const db = getAdminApp().database();
    const areasRef = db.ref('areas');
    const areasSnap = await areasRef.once('value');
    const areas = areasSnap.val() || {};

    for (const areaId of Object.keys(areas)) {
      const groundRef = db.ref(`areas/${areaId}/groundItems`);
      const snap = await groundRef.once('value');
      const items = snap.val() || {};
      const now = Date.now();
      for (const [id, item] of Object.entries(items)) {
        try {
          if (item && item.releaseAt && item.visibleTo && Array.isArray(item.visibleTo) && item.releaseAt <= now) {
            await groundRef.child(id).update({ visibleTo: null, contributors: null });
            logger.log(`[RELEASE_VISIBILITY] Released ${id} in area ${areaId}`);
          }
        } catch (innerErr) {
          logger.error('releaseGroundItemVisibility inner error', innerErr?.message || innerErr);
        }
      }
    }
  } catch (e) {
    logger.error('releaseGroundItemVisibility error', e?.message || e);
  }
});

// DISABLED: Enemy cleanup is disabled
/*
exports.onEnemyChanged = onValueWritten({ ref: "/areas/{areaId}/enemies/{enemyId}" }, async (event) => {
  try {
    const after = event.data?.after?.val();
    const areaId = event.params.areaId;
    const enemyId = event.params.enemyId;
    if (!after) return;
    if (after.isDead) {
      const db = getAdminApp().database();
      // If rewards have been granted or lootProcessed, remove the enemy to prevent lingering dead nodes
      if (after.rewardsGranted || after.lootProcessed) {
        await db.ref(`areas/${areaId}/enemies/${enemyId}`).remove();
        logger.log(`[ENEMY_CLEANUP] Removed dead enemy ${enemyId} from area ${areaId}`);
      }
    }
  } catch (e) {
    logger.error('onEnemyChanged error', e?.message || e);
  }
});
// */
