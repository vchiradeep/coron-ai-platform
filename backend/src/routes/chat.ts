// backend/src/routes/chat.ts
import { Router } from 'express';
import admin from 'firebase-admin';
import { streamChatResponse } from '../services/aiService';

const router = Router();

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

export default router;