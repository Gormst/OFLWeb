const ROBLOX_AUTHORIZE_URL = 'https://apis.roblox.com/oauth/v1/authorize';
export const ROBLOX_PKCE_STORAGE_KEY = 'ofl_roblox_pkce';

export type RobloxPkceSession = {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  redirectUri: string;
  createdAt: number;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function createPkceSession(redirectUri: string): Promise<RobloxPkceSession> {
  // 64 random bytes encode to an 86-character Base64URL verifier.
  // Base64URL only uses A-Z, a-z, 0-9, hyphen, and underscore, which are PKCE unreserved characters.
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomBase64Url(32);

  return {
    codeVerifier,
    codeChallenge,
    state,
    redirectUri,
    createdAt: Date.now()
  };
}

export function storePkceSession(session: RobloxPkceSession) {
  sessionStorage.setItem(ROBLOX_PKCE_STORAGE_KEY, JSON.stringify(session));
}

export function getStoredPkceSession(): RobloxPkceSession | null {
  try {
    const raw = sessionStorage.getItem(ROBLOX_PKCE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RobloxPkceSession;
  } catch {
    return null;
  }
}

export async function buildRobloxAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  scope?: string;
}) {
  const session = await createPkceSession(options.redirectUri);
  storePkceSession(session);

  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: options.scope || 'openid profile',
    state: session.state,
    code_challenge: session.codeChallenge,
    code_challenge_method: 'S256'
  });

  return {
    url: `${ROBLOX_AUTHORIZE_URL}?${params.toString()}`,
    session
  };
}
