import { customAlphabet } from 'nanoid';

// URL-safe alphabet — no dashes/underscores so IDs remain copy-pasteable.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const generate = customAlphabet(ALPHABET, 8);

export const ID_REGEX = /^[0-9a-z]{8}$/;

export function newId(): string {
  return generate();
}
