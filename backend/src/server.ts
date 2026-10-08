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

// Explicit CORS configuration and preflight handling
const corsOptions = {
  origin: [
    'https://coron-ai-platform.vercel.app',
    /^https:\/\/coron-ai.*\.vercel\.app$/, // Allows any Vercel preview URLs
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle browser preflight checks

// Increased payload limits to 50mb to allow image & media base64 uploads without errors
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Firebase Admin SDK (Supports both Render Env Var & Local serviceAccountKey.json)
if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const localKeyPath = path.join(__dirname, '../serviceAccountKey.json');

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized successfully via environment variable.');
    } catch (error) {
      console.error('CRITICAL ERROR: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', error);
    }
  } else if (fs.existsSync(localKeyPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized successfully via local serviceAccountKey.json.');
    } catch (error) {
      console.error('CRITICAL ERROR: Failed to parse local serviceAccountKey.json:', error);
    }
  } else {
    console.error('CRITICAL ERROR: Firebase credentials missing! Neither FIREBASE_SERVICE_ACCOUNT_JSON nor serviceAccountKey.json was found.');
  }
}

// Safely instantiate firestore after initialization check
const db = admin.apps.length ? admin.firestore() : null;

// Health Check Route
app.get('/health', async (req: Request, res: Response) => {
  try {
    if (!db) throw new Error('Firestore not initialized');
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