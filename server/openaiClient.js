import { config } from './config.js';

const BASE = 'https://api.openai.com/v1';

async function call(path, body) {
  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY নেই');
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: {
          authorization: `Bearer ${config.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`OpenAI HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${res.status}: ${detail.slice(0, 300)}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.name === 'TimeoutError') continue;
      if (String(err).includes('HTTP 4')) throw err;
    }
  }
  throw lastError;
}

export async function embedBatch(texts) {
  const data = await call('/embeddings', {
    model: config.OPENAI_EMBED_MODEL,
    input: texts,
  });
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/* JSON-মোড চ্যাট — অবজেক্ট ফেরত দেয়, পার্স-ব্যর্থতায় null।
   gpt-5/o-সিরিজ reasoning মডেল temperature নেয় না, reasoning_effort নেয়। */
export async function chatJSON(system, user, model, effort = 'low') {
  const chosen = model ?? config.OPENAI_MODEL;
  const isReasoning = /^(gpt-5|o\d)/.test(chosen);
  const data = await call('/chat/completions', {
    model: chosen,
    ...(isReasoning ? { reasoning_effort: effort } : { temperature: 0.2 }),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return null;
  }
}
