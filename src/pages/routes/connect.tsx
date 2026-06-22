import { useEffect, useState } from 'react';
import { buildRobloxAuthorizeUrl } from '../../lib/pkce';

type Message = {
  text: string;
  ok?: boolean;
};

function RobloxWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <img className={compact ? 'roblox-wordmark compact' : 'roblox-wordmark'} src="/logos/roblox-wordmark-clean.png" alt="Roblox" />
  );
}

export default function ConnectPage() {
  const envRobloxClientId = String(import.meta.env.VITE_ROBLOX_CLIENT_ID || import.meta.env.VITE_oAuth_client_id || '').trim();
  const envRobloxScopes = String(import.meta.env.VITE_ROBLOX_OAUTH_SCOPES || 'openid profile').trim();
  const [robloxClientId, setRobloxClientId] = useState(envRobloxClientId);
  const [robloxScopes, setRobloxScopes] = useState(envRobloxScopes);
  const [username, setUsername] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');
  const [code, setCode] = useState('OFL-XXXX');
  const [step, setStep] = useState<1 | 2>(1);
  const [message, setMessage] = useState<Message | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = 'Login - OFL';
  }, []);

  useEffect(() => {
    if (envRobloxClientId) return;
    let cancelled = false;
    fetch('/api/auth/roblox/config')
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        if (data.client_id) setRobloxClientId(String(data.client_id));
        if (data.scopes) setRobloxScopes(String(data.scopes));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [envRobloxClientId]);

  async function createRobloxAuthorizationUrl() {
    if (!robloxClientId) {
      setMessage({ text: 'Roblox OAuth is not configured yet. Set oAuth_client_id or ROBLOX_CLIENT_ID first, then restart the server.' });
      return null;
    }

    const redirectUri = `${window.location.origin}/auth/redirect`;
    const { url } = await buildRobloxAuthorizeUrl({
      clientId: robloxClientId,
      redirectUri,
      scope: robloxScopes
    });
    return url;
  }

  async function startRobloxOAuth() {
    setMessage(null);
    setOauthLoading(true);
    try {
      const url = await createRobloxAuthorizationUrl();
      if (!url) return;
      window.location.assign(url);
    } catch {
      setMessage({ text: 'Could not start Roblox OAuth. Try again.' });
    } finally {
      setOauthLoading(false);
    }
  }

  async function startVerification() {
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setMessage({ text: 'Enter your Roblox username first.' });
      return;
    }

    setMessage(null);
    setStartLoading(true);
    try {
      const response = await fetch('/api/connect/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ text: data.error || 'Could not start verification.' });
        return;
      }
      setCurrentUsername(data.robloxUsername);
      setCode(data.code);
      setStep(2);
    } catch {
      setMessage({ text: 'Network error - try again.' });
    } finally {
      setStartLoading(false);
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function verifyAccount() {
    setMessage(null);
    setVerifyLoading(true);
    try {
      const response = await fetch('/api/connect/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUsername })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ text: data.error || 'Verification failed.' });
        return;
      }
      if (data.token) localStorage.setItem('ofl_token', data.token);
      if (data.profile) localStorage.setItem('ofl_profile', JSON.stringify(data.profile));
      setMessage({ text: 'Connected! Redirecting...', ok: true });
      window.setTimeout(() => {
        location.href = '/';
      }, 1200);
    } catch {
      setMessage({ text: 'Network error - try again.' });
    } finally {
      setVerifyLoading(false);
    }
  }

  function backToUsername() {
    setStep(1);
    setMessage(null);
  }

  return (
    <>
      <style>{`
        :root{--paper:#ECE4CF;--paper-2:#E4DAC0;--navy:#15233E;--red:#9F3622;--muted:#6B6253;--line:rgba(21,35,62,.16);--line-strong:rgba(21,35,62,.32);}
        *{box-sizing:border-box;}
        html,body{max-width:100%;overflow-x:hidden;}
        body{background:var(--paper);color:var(--navy);font-family:'Spectral',Georgia,serif;min-height:100vh;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");}
        body[data-theme="dark"]{--paper:#0F1726;--paper-2:#182235;--navy:#F3F6FB;--muted:#AFC0DA;--line:rgba(142,164,201,.18);--line-strong:rgba(142,164,201,.34);background:#0F1726;color:#F3F6FB;}
        .connect-stage{display:flex;justify-content:center;padding:70px 20px 90px;}
        .connect-card{width:100%;max-width:520px;background:var(--paper-2);border:1px solid var(--line-strong);padding:38px;}
        .login-brand{display:none;}
        .roblox-wordmark{width:min(100%,285px);height:auto;display:block;object-fit:contain;}
        body[data-theme="dark"] .login-brand .roblox-wordmark{filter:invert(1);}
        .roblox-wordmark.compact{width:196px;height:auto;max-height:56px;flex:0 0 auto;}
        body[data-theme="dark"] .oauth-btn .roblox-wordmark{filter:none;}
        .login-title{display:flex;align-items:center;justify-content:center;gap:18px;font-family:'Arial Black','Arial Narrow',Arial,sans-serif;font-size:20px;font-weight:900;letter-spacing:.4px;text-transform:uppercase;color:var(--navy);text-align:center;margin-bottom:34px;}
        .login-title img{width:96px;height:96px;object-fit:contain;display:block;}
        .login-title-fallback{width:96px;height:96px;border:1px solid var(--line-strong);display:inline-flex;align-items:center;justify-content:center;font-family:'Anton';font-size:24px;letter-spacing:0;color:var(--navy);}
        .auth-divider{display:flex;align-items:center;gap:12px;margin:24px 0;color:var(--muted);font-family:'Space Mono';font-size:10px;letter-spacing:2px;text-transform:uppercase;}
        .auth-divider::before,.auth-divider::after{content:'';height:1px;background:var(--line-strong);flex:1;}
        .auth-divider:first-child{margin-top:0;}
        .oauth-section{margin-bottom:24px;}
        .oauth-box{margin-bottom:0;}
        .oauth-btn{min-height:66px;display:flex;align-items:center;justify-content:center;gap:16px;font-family:'Oswald';font-weight:700;font-size:15px;text-transform:uppercase;letter-spacing:1.5px;padding:4px 22px;border:2px solid #5E6673;cursor:pointer;transition:all .2s;width:100%;margin-top:0;background:#5E6673;color:#fff;}
        .oauth-btn .roblox-wordmark{filter:invert(1);opacity:.98;}
        .oauth-btn:hover{background:#444B55;border-color:#444B55;color:#fff;}
        .oauth-btn:disabled{opacity:.5;cursor:not-allowed;}
        body[data-theme="dark"] .oauth-btn{background:#64748B;color:#fff;border-color:#64748B;}
        body[data-theme="dark"] .oauth-btn:hover{background:#4B5563;border-color:#4B5563;color:#fff;}
        .connect-card label{font-family:'Space Mono';font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px;}
        .connect-card input[type=text]{width:100%;background:var(--paper);border:1px solid var(--line-strong);color:var(--navy);font-family:'Oswald';font-weight:500;font-size:17px;padding:14px 16px;}
        .connect-card input[type=text]:focus{outline:none;border-color:var(--navy);}
        .connect-btn-main{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:2px;padding:15px 28px;border:2px solid var(--navy);cursor:pointer;transition:all .2s;width:100%;margin-top:22px;background:var(--navy);color:var(--paper);}
        body[data-theme="dark"] .connect-btn-main{background:#F3F6FB;color:#111827;border-color:#F3F6FB;}
        .connect-btn-main:hover{background:var(--red);border-color:var(--red);color:var(--paper);}
        .connect-btn-main:disabled{opacity:.5;cursor:not-allowed;}
        .codebox{background:#15233E;color:#ECE4CF;text-align:center;padding:24px;margin:8px 0 22px;font-family:'Anton';font-size:38px;letter-spacing:4px;position:relative;}
        .copy{position:absolute;top:12px;right:14px;font-family:'Space Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#E8C9B0;cursor:pointer;border:1px solid #E8C9B0;padding:5px 9px;background:transparent;}
        .steps{font-size:16px;line-height:1.7;color:var(--navy);margin-bottom:8px;}
        .steps ol{margin:14px 0 0 20px;}
        .steps li{margin-bottom:10px;}
        .msg{font-family:'Space Mono';font-size:13px;margin-top:16px;padding:12px 14px;}
        .msg.err{background:rgba(159,54,34,.12);color:var(--red);}
        .msg.ok{background:rgba(60,122,78,.14);color:#3c7a4e;}
        .backlink{font-family:'Space Mono';font-size:12px;letter-spacing:1px;color:var(--muted);margin-top:18px;display:inline-block;cursor:pointer;background:none;border:0;padding:0;}
        .backlink:hover{color:var(--red);}
        @media(max-width:560px){.connect-card{padding:28px 22px;}.roblox-wordmark{width:min(100%,235px);}.roblox-wordmark.compact{width:174px;max-height:50px;}}
      `}</style>
      <main className="connect-stage">
        <section className="connect-card">
          <div className="login-title">
            <img src="/logos/league.png" alt="OFL" onError={(event) => { event.currentTarget.outerHTML = '<span class="login-title-fallback">OFL</span>'; }} />
            <span>Login</span>
          </div>
          {step === 1 ? (
            <div>
              <div className="auth-divider">OAuth Login</div>
              <div className="oauth-section">
                <div className="oauth-box">
                  <button className="oauth-btn" type="button" disabled={oauthLoading} onClick={startRobloxOAuth}>
                    <RobloxWordmark compact />
                    {oauthLoading && <span>Redirecting...</span>}
                  </button>
                </div>
              </div>
              <div className="auth-divider">Legacy verification</div>

              <label htmlFor="username">Roblox Username</label>
              <input
                type="text"
                id="username"
                placeholder="e.g. famouskai12"
                autoComplete="off"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') startVerification();
                }}
              />
              <button className="connect-btn-main" type="button" disabled={startLoading} onClick={startVerification}>
                {startLoading ? 'Checking...' : 'Get Verification Code'}
              </button>
            </div>
          ) : (
            <div>
              <label>Your Verification Code</label>
              <div className="codebox">
                <span>{code}</span>
                <button className="copy" type="button" onClick={copyCode}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
              <div className="steps">
                <ol>
                  <li>Open your Roblox profile and click the pencil to edit your <strong>About / Bio</strong>.</li>
                  <li>Paste the code above anywhere in your bio and save.</li>
                  <li>Come back here and click <strong>Verify</strong> below.</li>
                </ol>
              </div>
              <button className="connect-btn-main" type="button" disabled={verifyLoading} onClick={verifyAccount}>
                {verifyLoading ? 'Verifying...' : 'Verify & Connect'}
              </button>
              <button className="backlink" type="button" onClick={backToUsername}>Use a different username</button>
            </div>
          )}

          {message && <div className={`msg ${message.ok ? 'ok' : 'err'}`}>{message.text}</div>}
        </section>
      </main>
    </>
  );
}
