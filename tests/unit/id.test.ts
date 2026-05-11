import { describe, it, expect } from 'vitest';
import { newId, ID_REGEX } from '../../src/lib/id';

describe('newId', () => {
  it('returns an 8-char URL-safe string', () => {
    const id = newId();
    expect(id).toMatch(ID_REGEX);
    expect(id.length).toBe(8);
  });

  it('generates unique IDs across many invocations', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(newId());
    expect(set.size).toBe(1000);
  });
});
