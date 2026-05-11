const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  secretKey: string,
  token: string,
  remoteIp: string
): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token, remoteip: remoteIp });
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    const json = (await res.json()) as { success: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
