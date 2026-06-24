import { useEffect, useMemo, useState } from 'react';
import { getStoredPkceSession, ROBLOX_PKCE_STORAGE_KEY } from '../../lib/pkce';

type OAuthStatus =
  | { kind: 'success'; code: string; state: string; codeVerifier: string; redirectUri: string }
  | { kind: 'error'; error: string; description: string | null }
  | { kind: 'waiting' };

type ExchangeStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; username: string }
  | { kind: 'error'; message: string };

type RobloxConfig = {
  client_id?: string;
  scopes?: string;
};

export default function AuthRedirectPage() {
  const [exchangeStatus, setExchangeStatus] = useState<ExchangeStatus>({ kind: 'idle' });
  const status = useMemo<OAuthStatus>(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      return {
        kind: 'error',
        error,
        description: params.get('error_description')
      };
    }

    const code = params.get('code');
    if (code) {
      const state = params.get('state');
      const pkce = getStoredPkceSession();
      if (!pkce || !state || pkce.state !== state) {
        return {
          kind: 'error',
          error: 'invalid_state',
          description: 'The OAuth state did not match the saved PKCE session. Please start the Roblox login again.'
        };
      }

      return {
        kind: 'success',
        code,
        state,
        codeVerifier: pkce.codeVerifier,
        redirectUri: pkce.redirectUri
      };
    }

    return { kind: 'waiting' };
  }, []);

  useEffect(() => {
    document.title = 'Logging In - OFL Network';
  }, []);

  useEffect(() => {
    if (status.kind !== 'success') return;

    let cancelled = false;
    async function exchangeCode() {
      setExchangeStatus({ kind: 'loading' });
      try {
        const configResponse = await fetch('/api/auth/roblox/config');
        const config = (configResponse.ok ? await configResponse.json() : null) as RobloxConfig | null;
        const clientId = String(config?.client_id || import.meta.env.VITE_ROBLOX_CLIENT_ID || import.meta.env.VITE_oAuth_client_id || '').trim();
        if (!clientId) throw new Error('Roblox OAuth client id is not configured.');

        const tokenParams = new URLSearchParams({
          grant_type: 'authorization_code',
          code: status.code,
          redirect_uri: status.redirectUri,
          client_id: clientId,
          code_verifier: status.codeVerifier
        });
        const robloxResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenParams
        });
        const robloxText = await robloxResponse.text();
        let tokenData: Record<string, unknown> | null = null;
        try { tokenData = robloxText ? JSON.parse(robloxText) : {}; } catch {}
        if (!robloxResponse.ok || !tokenData) {
          throw new Error(
            (tokenData && String(tokenData.error_description || tokenData.error || ''))
            || robloxText
            || 'Roblox token exchange failed.'
          );
        }

        const response = await fetch('/api/auth/roblox/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_data: tokenData })
        });
        const text = await response.text();
        let data: { token?: string; profile?: { roblox_username?: string }; error?: string; code?: string } | null = null;
        try { data = text ? JSON.parse(text) : {}; } catch {}
        if (!response.ok || !data) {
          throw new Error((data && data.error) || text || 'Could not exchange Roblox authorization code.');
        }
        if (data.token) localStorage.setItem('ofl_token', data.token);
        if (data.profile) localStorage.setItem('ofl_profile', JSON.stringify(data.profile));
        sessionStorage.removeItem(ROBLOX_PKCE_STORAGE_KEY);
        if (cancelled) return;
        setExchangeStatus({ kind: 'success', username: data.profile?.roblox_username || 'Roblox user' });
        window.setTimeout(() => {
          location.href = '/';
        }, 900);
      } catch (error) {
        if (cancelled) return;
        setExchangeStatus({ kind: 'error', message: error instanceof Error ? error.message : 'OAuth exchange failed.' });
      }
    }

    exchangeCode();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <>
      <style>{`
        *{box-sizing:border-box;}
        body{background:var(--paper);color:var(--navy);font-family:'Spectral',Georgia,serif;min-height:100vh;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");}
        .auth-redirect{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;}
        .auth-panel{width:min(100%,560px);}
        .auth-panel h1{font-family:'Oswald';font-weight:700;font-size:clamp(34px,5vw,52px);text-transform:uppercase;line-height:1;margin:0 0 14px;}
        .auth-panel p{font-size:18px;line-height:1.55;color:var(--muted);margin:0;}
      `}</style>
      <main className="auth-redirect">
        <section className="auth-panel">
          {status.kind === 'success' && (
            <>
              <h1>{exchangeStatus.kind === 'error' ? 'Login Failed' : 'Login Successful'}</h1>
              <p>
                {exchangeStatus.kind === 'error'
                  ? 'Please return to OFL Network and try logging in again.'
                  : 'Login successful. Redirecting back to OFL Network.'}
              </p>
            </>
          )}

          {status.kind === 'error' && (
            <>
              <h1>Login Failed</h1>
              <p>Please return to OFL Network and try logging in again.</p>
            </>
          )}

          {status.kind === 'waiting' && (
            <>
              <h1>Redirecting</h1>
              <p>Redirecting back to OFL Network.</p>
            </>
          )}
        </section>
      </main>
    </>
  );
}
