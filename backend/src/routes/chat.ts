// backend/src/routes/chat.ts
import { Router } from 'express';
import admin from 'firebase-admin';
import { streamChatResponse } from '../services/aiService';

const router = Router();

// Stream chat response route
router.post('/stream', async (req, res) => {
  try {
    const { messages, language, isVoice, userEmail } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    let userProfile = undefined;
    if (userEmail) {
      try {
        const db = admin.firestore();
        const userDoc = await db.collection('users').doc(userEmail.toLowerCase()).get();
        if (userDoc.exists) {
          const data = userDoc.data();
          userProfile = {
            fullName: data?.fullName,
            bio: data?.bio,
            customContext: data?.customContext,
          };
        }
      } catch (e) {
        console.error('Error fetching user profile for chat:', e);
      }
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await streamChatResponse(
      messages,
      (chunkText) => {
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      },
      language,
      isVoice,
      userProfile
    );

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('Chat route error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ text: '\n\n⚠️ Error processing request.' })}\n\n`);
      res.end();
    }
  }
});

// Get chat sessions for cross-device cloud sync
router.get('/sessions', async (req, res) => {
  try {
    const email = req.query.email as string;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const db = admin.firestore();
    const docRef = db.collection('user_sessions').doc(email.toLowerCase());
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(200).json({ sessions: [] });
    }

    res.status(200).json({ sessions: doc.data()?.sessions || [] });
  } catch (error: any) {
    console.error('Failed to fetch sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions', details: error.message });
  }
});

// Save/Update chat sessions for cross-device cloud sync
router.post('/sessions', async (req, res) => {
  try {
    const { email, sessions } = req.body;
    if (!email || !sessions) return res.status(400).json({ error: 'Email and sessions required' });

    const db = admin.firestore();
    const docRef = db.collection('user_sessions').doc(email.toLowerCase());
    await docRef.set({
      sessions,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.status(200).json({ status: 'success' });
  } catch (error: any) {
    console.error('Failed to save sessions:', error);
    res.status(500).json({ error: 'Failed to save sessions', details: error.message });
  }
});

export default router;