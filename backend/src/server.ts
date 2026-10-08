// backend/src/server.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import chatRouter from './routes/chat';
import ttsRoutes from './routes/tts';
import authRouter from './routes/auth';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());

// Increased payload limits to 50mb to allow image & media base64 uploads without errors
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Firebase Admin SDK with robust multi-path fallback for Render & Local
const possibleKeyPaths = [
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  path.resolve(process.cwd(), 'serviceAccountKey.json'),
  path.resolve(__dirname, '../serviceAccountKey.json'),
  path.resolve(__dirname, 'serviceAccountKey.json'),
  './serviceAccountKey.json',
  '../serviceAccountKey.json'
].filter(Boolean) as string[];

let resolvedKeyPath: string | null = null;
for (const p of possibleKeyPaths) {
  const resolved = path.resolve(p);
  if (fs.existsSync(resolved)) {
    resolvedKeyPath = resolved;
    break;
  }
}

if (resolvedKeyPath) {
  const serviceAccount = JSON.parse(fs.readFileSync(resolvedKeyPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log(`Firebase Admin initialized successfully using key at: ${resolvedKeyPath}`);
} else {
  console.error('CRITICAL ERROR: Firebase service account key not found in any expected path!');
}

const db = admin.firestore();

// Health Check Route
app.get('/health', async (req: Request, res: Response) => {
  try {
    const testRef = db.collection('system_health').doc('ping');
    await testRef.set({ lastChecked: admin.firestore.FieldValue.serverTimestamp() });
    const doc = await testRef.get();

    res.status(200).json({
      status: 'success',
      message: 'CORON AI Platform API (Auth & Neural Edition) is running successfully.',
      firestoreStatus: 'Connected',
      lastPing: doc.data()?.lastChecked
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Firestore unreachable', error });
  }
});

// Register API Routes
app.use('/api/chat', chatRouter);
app.use('/api/tts', ttsRoutes);
app.use('/api/auth', authRouter);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});