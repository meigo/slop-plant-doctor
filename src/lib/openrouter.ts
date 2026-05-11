type UserContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string };

export type OpenRouterCallArgs = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: UserContentPart[];
  maxOutputTokens: number;
};

export type OpenRouterCallResult = {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_cost?: number;
  };
};

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export async function callOpenRouter(args: OpenRouterCallArgs): Promise<OpenRouterCallResult> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
      // Optional but recommended by OpenRouter:
      'HTTP-Referer': 'https://slop-plant-doctor.pages.dev',
      'X-Title': 'Plant Doctor'
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxOutputTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userContent }
      ]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_cost?: number };
  };

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('OpenRouter response missing content');
  }

  return { content, usage: json.usage };
}
