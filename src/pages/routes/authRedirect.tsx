import { useEffect, useMemo } from 'react';

type OAuthStatus =
  | { kind: 'success'; code: string; state: string | null }
  | { kind: 'error'; error: string; description: string | null }
  | { kind: 'waiting' };

export default function AuthRedirectPage() {
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
      return {
        kind: 'success',
        code,
        state: params.get('state')
      };
    }

    return { kind: 'waiting' };
  }, []);

  useEffect(() => {
    document.title = 'OAuth Redirect - OFL Network';
  }, []);

  return (
    <>
      <style>{`
        :root{--paper:#ECE4CF;--paper-2:#E4DAC0;--navy:#15233E;--red:#9F3622;--muted:#6B6253;--green:#3c7a4e;--line-strong:rgba(21,35,62,.32);}
        *{box-sizing:border-box;}
        body{background:var(--paper);color:var(--navy);font-family:'Spectral',Georgia,serif;min-height:100vh;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");}
        .auth-redirect{display:flex;justify-content:center;padding:76px 20px 96px;}
        .auth-panel{width:100%;max-width:620px;background:var(--paper-2);border:1px solid var(--line-strong);padding:42px;}
        .auth-eyebrow{font-family:'Space Mono';font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:14px;}
        .auth-panel h1{font-family:'Oswald';font-weight:700;font-size:clamp(36px,5vw,52px);text-transform:uppercase;line-height:.95;margin:0 0 14px;}
        .auth-panel p{font-size:17px;line-height:1.6;color:var(--navy);margin:0 0 18px;}
        .auth-status{font-family:'Space Mono';font-size:12px;line-height:1.6;letter-spacing:.5px;background:var(--paper);border:1px solid var(--line-strong);padding:16px;margin-top:22px;overflow-wrap:anywhere;}
        .auth-status strong{font-family:'Oswald';font-size:15px;letter-spacing:1px;text-transform:uppercase;}
        .auth-status.success strong{color:var(--green);}
        .auth-status.error strong{color:var(--red);}
        .auth-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px;}
        .auth-actions a{font-family:'Oswald';font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:2px;background:var(--navy);color:var(--paper);border:2px solid var(--navy);padding:13px 22px;text-decoration:none;}
        .auth-actions a:hover{background:var(--red);border-color:var(--red);}
      `}</style>
      <main className="auth-redirect">
        <section className="auth-panel">
          <div className="auth-eyebrow">// OAuth</div>
          <h1>Authorization Redirect</h1>

          {status.kind === 'success' && (
            <>
              <p>Roblox returned an authorization code to OFL Network. The redirect URL is ready to receive OAuth 2.0 responses.</p>
              <div className="auth-status success">
                <strong>Code received</strong>
                <br />
                State: {status.state || 'none'}
              </div>
            </>
          )}

          {status.kind === 'error' && (
            <>
              <p>Roblox returned an OAuth error instead of an authorization code.</p>
              <div className="auth-status error">
                <strong>{status.error}</strong>
                {status.description && (
                  <>
                    <br />
                    {status.description}
                  </>
                )}
              </div>
            </>
          )}

          {status.kind === 'waiting' && (
            <>
              <p>This page is ready to receive OAuth 2.0 redirects from Roblox at <strong>/auth/redirect</strong>.</p>
              <div className="auth-status">
                <strong>No authorization response yet</strong>
                <br />
                Register this exact path in Roblox, then send users through the OAuth authorization flow.
              </div>
            </>
          )}

          <div className="auth-actions">
            <a href="/">Return Home</a>
            <a href="/connect">Connect Account</a>
          </div>
        </section>
      </main>
    </>
  );
}
