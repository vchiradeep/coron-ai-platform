// backend/src/routes/tts.ts
import { Router } from 'express';

const router = Router();

router.post('/speak', async (req, res) => {
  try {
    const { text, languageCode } = req.body;
    if (!text) {
      return res.status(400).send('Text is required');
    }

    const shortLang = languageCode ? languageCode.split('-')[0] : 'en';

    // Clean text and limit length to prevent TTS silent failures (max 200 chars for smooth speech)
    const cleanText = text.replace(/[*_#`[\]()]/g, '');
    const safeText = cleanText.length > 200 ? cleanText.slice(0, 197) + '...' : cleanText;

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      safeText
    )}&tl=${shortLang}&client=tw-ob`;

    const ttsResponse = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (!ttsResponse.ok) throw new Error('Failed to generate cloud speech');

    const audioBuffer = await ttsResponse.arrayBuffer();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (error: any) {
    console.error('❌ TTS Error:', error);
    res.status(500).send('Audio generation failed');
  }
});

export default router;