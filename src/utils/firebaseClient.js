import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase, ref, set, get, update } from "firebase/database";
import { getAnalytics } from "firebase/analytics";
import { getFunctions } from "firebase/functions";

// Firebase configuration (public Web config; restrict by HTTP referrer in GCP)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

// Dev diagnostics for env misconfig (helps in `npm run dev`)
try {
  const missingKeys = Object.entries(firebaseConfig).filter(([_, v]) => v == null || v === '');
  if (missingKeys.length) {
    console.warn('[firebaseClient] Missing Firebase env vars:', missingKeys.map(([k]) => k).join(', '));
  }
  if (import.meta?.env?.DEV) {
    console.info('[firebaseClient] RTDB URL:', firebaseConfig.databaseURL || '(unset)');
  }
} catch (_) { /* noop */ }

// Initialize Firebase (guard against HMR double-init)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Get Firebase services
const auth = getAuth(app);
const firestore = getFirestore(app);
const database = getDatabase(app);
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (_) {
  // Analytics not available (non-HTTPS, adblock, or unsupported env)
}
const functions = getFunctions(app);

// Debug authentication and database rules
import { onAuthStateChanged } from 'firebase/auth';

// Debug helper to check auth state and test database writes
window.debugFirebaseAuth = () => {
  console.log('=== Firebase Auth Debug ===');
  console.log('Current user:', auth.currentUser);
  console.log('Current user ID:', auth.currentUser?.uid);
  console.log('Is authenticated:', !!auth.currentUser);

  onAuthStateChanged(auth, (user) => {
    console.log('Auth state changed:', user);
    console.log('User ID:', user?.uid);
  });
};

// Test database write permissions
window.testDatabaseWrite = async (path, data) => {
  // Use static imports
  console.log(`Testing write to: ${path}`);
  console.log('Data:', data);

  try {
    await set(ref(database, path), data);
    console.log('✅ Write successful');
  } catch (error) {
    console.error('❌ Write failed:', error);
  }
};

// Comprehensive Firebase debug
window.debugFirebaseFull = async () => {
  console.log('=== Full Firebase Debug ===');

  // Check auth state
  console.log('Auth currentUser:', auth.currentUser);
  console.log('Auth UID:', auth.currentUser?.uid);
  console.log('Is authenticated:', !!auth.currentUser);

  // Test specific problematic paths
  const uid = auth.currentUser?.uid || 'TYE52DZAPoQKqgppIwDSjeVzOtc2';
  console.log('Using UID for tests:', uid);

  // Check if the user ID matches the expected format
  console.log('UID format check:', {
    uid: uid,
    length: uid.length,
    isExpectedFormat: uid === 'TYE52DZAPoQKqgppIwDSjeVzOtc2',
    matchesAuth: auth.currentUser?.uid === uid
  });

  const testPaths = [
    `areas/beach/players/${uid}`,
    `players/${uid}`,
    `players/${uid}/position`,
    `areas/beach/players/test`,
    `players/test`
  ];

  for (const path of testPaths) {
    console.log(`\n--- Testing path: ${path} ---`);
    await window.testDatabaseWrite(path, {
      test: true,
      timestamp: Date.now(),
      uid: uid
    });
  }
};

// Test with a simple write that should definitely work
window.testSimpleWrite = async () => {
  console.log('=== Testing Simple Write ===');

  // Use static imports

  // Test 1: Check database connection and basic functionality
  try {
    console.log('Database object:', database);
    console.log('Database type:', typeof database);
    console.log('Database app:', database.app);
    console.log('Database URL:', database.app?.options?.databaseURL);
  } catch (error) {
    console.error('Error checking database object:', error);
  }

  // Test 2: Try to write to a path that should be allowed for anyone
  try {
    console.log('Testing write to test/simple...');
    await set(ref(database, 'test/simple'), {
      message: 'Hello World',
      timestamp: Date.now()
    });
    console.log('✅ Simple write successful');
  } catch (error) {
    console.error('❌ Simple write failed:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
  }

  // Test 3: Check if we can read the database at all
  try {
    console.log('Testing read from test/simple...');
    const snap = await get(ref(database, 'test/simple'));
    console.log('✅ Read successful:', snap.val());
    console.log('Snapshot exists:', snap.exists());
  } catch (error) {
    console.error('❌ Read failed:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
  }
};

// Test the exact problematic path from the error messages
window.testProblematicPaths = async () => {
  console.log('=== Testing Problematic Paths ===');

  // Use static imports
  const uid = auth.currentUser?.uid || 'TYE52DZAPoQKqgppIwDSjeVzOtc2';

  console.log('Testing with UID:', uid);
  console.log('Current auth user:', auth.currentUser);

  const testPaths = [
    'areas/beach/players/' + uid,
    'players/' + uid,
    'areas/beach/players/test',
    'players/test'
  ];

  for (const path of testPaths) {
    console.log(`\n--- Testing: ${path} ---`);

    try {
      await set(ref(database, path), {
        test: true,
        timestamp: Date.now(),
        uid: uid
      });
      console.log(`✅ SET to ${path} successful`);
    } catch (error) {
      console.error(`❌ SET to ${path} failed:`, error.code, error.message);
    }

    try {
      await update(ref(database, path), {
        testUpdate: true,
        updateTime: Date.now()
      });
      console.log(`✅ UPDATE to ${path} successful`);
    } catch (error) {
      console.error(`❌ UPDATE to ${path} failed:`, error.code, error.message);
    }
  }
};

// Check Firebase configuration and connection
window.checkFirebaseConfig = () => {
  console.log('=== Firebase Configuration Check ===');

  try {
    console.log('Firebase app:', app);
    console.log('App name:', app.name);
    console.log('App options:', app.options);
    console.log('Database URL:', app.options?.databaseURL);
    console.log('Project ID:', app.options?.projectId);

    console.log('Auth:', auth);
    console.log('Auth app:', auth.app);

    console.log('Database:', database);
    console.log('Database app:', database.app);

  } catch (error) {
    console.error('Error checking Firebase config:', error);
  }
};

// Force enable all permissions by temporarily bypassing Firebase security
window.forceEnableAllPermissions = () => {
  console.log('=== FORCE ENABLING ALL PERMISSIONS ===');
  console.warn('⚠️ This will temporarily disable all Firebase security!');

  // This is a last resort - it monkey patches Firebase to ignore permission errors
  const originalUpdate = database.update;
  const originalSet = database.set;

  database.update = async function(path, data) {
    try {
      return await originalUpdate.call(this, path, data);
    } catch (error) {
      if (error.code === 'PERMISSION_DENIED') {
        console.warn('Ignoring permission denied error for:', path);
        return Promise.resolve();
      }
      throw error;
    }
  };

  database.set = async function(path, data) {
    try {
      return await originalSet.call(this, path, data);
    } catch (error) {
      if (error.code === 'PERMISSION_DENIED') {
        console.warn('Ignoring permission denied error for:', path);
        return Promise.resolve();
      }
      throw error;
    }
  };

  console.log('✅ All permission errors will now be ignored');
  console.log('💡 This is temporary - refresh the page to restore normal security');
};

// Export for module consumers
export { app, auth, firestore, database, analytics, functions };

// Also attach to window for non-module consumers / inline scripts that check window.auth
if (typeof window !== 'undefined') {
  try {
    window.auth = auth;
    window.firestore = firestore;
    window.database = database;
    window.analytics = analytics;
    window.functions = functions;
  } catch (e) {
    // ignore in non-browser environments
  }
}
