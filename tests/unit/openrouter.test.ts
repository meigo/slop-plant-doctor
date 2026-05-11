import { describe, it, expect, vi } from 'vitest';
import { callOpenRouter } from '../../src/lib/openrouter';

describe('callOpenRouter', () => {
  it('posts to OpenRouter chat completions and returns content + usage', async () => {
    const mockResp = {
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_cost: 0.001 }
    };
    global.fetch = vi.fn(async () => new Response(JSON.stringify(mockResp), { status: 200 })) as any;

    const r = await callOpenRouter({
      apiKey: 'k',
      model: 'qwen/qwen-2.5-vl-72b-instruct',
      systemPrompt: 'sys',
      userContent: [{ type: 'text', text: 'hi' }],
      maxOutputTokens: 1500
    });

    expect(r.content).toBe('{"ok":true}');
    expect(r.usage?.completion_tokens).toBe(50);
    expect(r.usage?.total_cost).toBe(0.001);
  });

  it('throws on non-200 status', async () => {
    global.fetch = vi.fn(async () => new Response('err', { status: 500 })) as any;
    await expect(callOpenRouter({
      apiKey: 'k', model: 'm', systemPrompt: 's',
      userContent: [{ type: 'text', text: 'x' }], maxOutputTokens: 1500
    })).rejects.toThrow();
  });
});
