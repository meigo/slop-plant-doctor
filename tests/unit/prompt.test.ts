import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserContent } from '../../src/lib/prompt';

describe('prompt builders', () => {
  it('system prompt includes the schema and key rules', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('horticulturist');
    expect(p).toContain('confidence');
    expect(p).toContain('whatWouldChangeMyMind');
    expect(p).toContain('species');
    expect(p).toContain('recovery');
    expect(p).toContain('JSON');
  });

  it('user content includes the photo and freeform text', () => {
    const c = buildUserContent('data:image/jpeg;base64,XYZ', 'leaves yellow');
    expect(Array.isArray(c)).toBe(true);
    const types = c.map(x => x.type);
    expect(types).toContain('image_url');
    expect(types).toContain('text');
    const text = c.find(x => x.type === 'text');
    expect(text?.text).toContain('leaves yellow');
  });

  it('user content handles missing freeform text', () => {
    const c = buildUserContent('data:image/jpeg;base64,XYZ', '');
    const text = c.find(x => x.type === 'text');
    expect(text?.text).toContain('no additional context');
  });

  it('user content respects retry mode instruction', () => {
    const c = buildUserContent('data:image/jpeg;base64,XYZ', 'x', { retry: true });
    const text = c.find(x => x.type === 'text');
    expect(text?.text.toLowerCase()).toContain('previous response did not match the schema');
  });
});
