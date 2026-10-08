// backend/src/services/aiService.ts
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
});

async function searchWeb(query: string): Promise<string> {
  try {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!tavilyKey) return '';
    const enhancedQuery = `${query} October 2026`;
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: tavilyKey, query: enhancedQuery, max_results: 4, include_answer: true }),
    });
    const data = (await response.json()) as any;
    if (data.results && data.results.length > 0) {
      return data.results.map((r: any) => `Source: ${r.title}\nContent: ${r.content}`).join('\n\n');
    }
  } catch (error) {
    console.error('❌ Web search error:', error);
  }
  return '';
}

function routePrompt(prompt: string, hasImage: boolean, isVoice?: boolean): string {
  if (isVoice) {
    return 'openai/gpt-oss-20b';
  }
  if (hasImage) {
    return 'qwen/qwen3.8-27b';
  }
  const lower = prompt.toLowerCase();
  if (lower.includes('architect') || lower.includes('system design') || lower.length > 300) {
    return 'openai/gpt-oss-120b';
  }
  if (['code', 'function', 'script', 'react', 'typescript', 'python', 'sql', 'bug'].some((k) => lower.includes(k))) {
    return 'qwen/qwen3.8-27b';
  }
  return 'openai/gpt-oss-20b';
}

export async function streamChatResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string; attachment?: any }>,
  onChunk: (text: string) => void,
  language?: string,
  isVoice?: boolean,
  userProfile?: { fullName?: string; bio?: string; customContext?: string }
): Promise<void> {
  try {
    const lastMsg = messages[messages.length - 1];
    const hasImage = !!(lastMsg?.attachment && lastMsg.attachment.type?.startsWith('image/'));
    const lastPrompt = lastMsg?.content || '';

    const lowerPrompt = lastPrompt.toLowerCase();
    const needsSearch = ['latest', 'news', 'current', 'price', 'weather', '2026', 'today', 'who is'].some((k) =>
      lowerPrompt.includes(k)
    );

    let searchContext = '';
    if (needsSearch && !hasImage && !isVoice) {
      const rawResults = await searchWeb(lastPrompt);
      if (rawResults) searchContext = `\n\n[Recent Web Reference Data (Current Date: October 8, 2026):\n${rawResults}\n]`;
    }

    const selectedModel = routePrompt(lastPrompt, hasImage, isVoice);

    const langInstruction = language
      ? `CRITICAL LANGUAGE RULE: Respond ONLY in ${language}.`
      : `CRITICAL LANGUAGE RULE: Detect user's language and respond fluently in that exact same language.`;

    const voiceInstruction = isVoice
      ? `CRITICAL VOICE MODE RULE: Keep your response short, conversational, and punchy (maximum 2 to 3 short sentences). Do NOT output long essays, code blocks, or markdown tables since this will be spoken aloud.`
      : '';

    const profileDetails = userProfile
      ? `User Profile Knowledge Base:\n- Name: ${userProfile.fullName || 'Not specified'}\n- Bio: ${userProfile.bio || 'Not specified'}\n- Custom Context / Personal Details: ${userProfile.customContext || 'None'}\n`
      : '';

    const systemPrompt = {
      role: 'system' as const,
      content: `CRITICAL IDENTITY & KNOWLEDGE RULE: You are CORON, an independent AI assistant created and built exclusively by Chiru for the platform "CORON – One AI. Every Task". You are NOT created by OpenAI. Today's current date is October 8, 2026. ${profileDetails} ${voiceInstruction} ${langInstruction} When users ask about themselves, their background, projects, or personal details, automatically reference the User Profile Knowledge Base above and never say "I don't know" if it's stored there. Answer accurately and thoroughly.`,
    };

    const formattedMessages = [
      systemPrompt,
      ...messages.map((m, idx) => {
        let content = m.content;
        if (idx === messages.length - 1 && searchContext) content += searchContext;
        return { role: m.role, content };
      }),
    ];

    const stream = await client.chat.completions.create({
      model: selectedModel,
      messages: formattedMessages as any,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) onChunk(text);
    }
  } catch (error) {
    console.error('❌ AI Service Error:', error);
    throw error;
  }
}