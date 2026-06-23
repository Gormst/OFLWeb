import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type RedzoneMessage = {
  id: string;
  roblox_username: string;
  avatar_url: string | null;
  message: string;
  created_at: string;
};

type RedzoneChatProps = {
  pathname: string;
};

function authHeaders() {
  const token = localStorage.getItem('ofl_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function RedzoneChat({ pathname }: RedzoneChatProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [messages, setMessages] = useState<RedzoneMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const isHome = pathname === '/' || pathname === '/index';
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  useEffect(() => {
    if (!isHome || !isLocalhost) {
      setTarget(null);
      return;
    }

    function syncTarget() {
      setTarget(document.getElementById('redzoneChatMount'));
    }

    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isHome, isLocalhost]);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;

    async function loadMessages() {
      try {
        const response = await fetch('/api/redzone-chat?limit=80');
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Could not load chat');
        if (!cancelled) {
          setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
          setStatus('');
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Could not load chat');
      }
    }

    loadMessages();
    const timer = window.setInterval(loadMessages, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [target]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const canSend = useMemo(() => draft.trim().length > 0 && draft.length <= 240 && !sending, [draft, sending]);

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setStatus('');

    try {
      const response = await fetch('/api/redzone-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({ message })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Could not send message');
      if (payload?.message) {
        setMessages(prev => [...prev.slice(-79), payload.message]);
      }
      setDraft('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  if (!target || !isLocalhost) return null;

  return createPortal(
    <aside className="redzone-chat" aria-label="OFL Redzone Chat">
      <style>{`
        .redzone-chat{display:flex;flex-direction:column;min-width:0;min-height:420px;height:100%;max-height:760px;background:#0f172a;color:#f8fafc;border-left:1px solid rgba(148,163,184,.26);}
        .redzone-chat__head{padding:18px 18px 14px;border-bottom:1px solid rgba(148,163,184,.22);font-family:'Oswald',sans-serif;font-weight:700;font-size:22px;line-height:1;text-transform:uppercase;letter-spacing:.7px;}
        .redzone-chat__messages{flex:1;min-height:240px;overflow:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin;}
        .redzone-chat__message{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;align-items:start;}
        .redzone-chat__avatar{width:34px;height:34px;border-radius:50%;object-fit:cover;background:#1e293b;flex:0 0 auto;}
        .redzone-chat__avatar--blank{width:34px;height:34px;border-radius:50%;background:#1e293b;border:1px solid rgba(148,163,184,.22);}
        .redzone-chat__row{min-width:0;}
        .redzone-chat__meta{display:flex;align-items:baseline;gap:8px;min-width:0;}
        .redzone-chat__name{font-family:'Oswald',sans-serif;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}
        .redzone-chat__time{font-family:'Space Mono',monospace;font-size:10px;color:rgba(248,250,252,.48);white-space:nowrap;}
        .redzone-chat__text{font-family:'Spectral',Georgia,serif;font-size:14px;line-height:1.35;color:rgba(248,250,252,.9);overflow-wrap:anywhere;white-space:pre-wrap;}
        .redzone-chat__status{min-height:18px;padding:0 14px 8px;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:#ffb4a6;}
        .redzone-chat__form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:12px 14px 14px;border-top:1px solid rgba(148,163,184,.22);background:#111827;}
        .redzone-chat__input{width:100%;height:44px;resize:none;border:1px solid rgba(148,163,184,.35);background:#182235;color:#fff;padding:12px;font:600 13px/1.25 'Oswald',sans-serif;letter-spacing:.4px;outline:none;}
        .redzone-chat__input:focus{border-color:#f26a4f;box-shadow:0 0 0 1px rgba(242,106,79,.25);}
        .redzone-chat__send{appearance:none;border:1px solid #f26a4f;background:#f26a4f;color:#fff;font-family:'Oswald',sans-serif;font-weight:700;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;padding:0 16px;cursor:pointer;}
        .redzone-chat__send:disabled{cursor:not-allowed;opacity:.45;}
        .live-game-spot.on.is-docked #redzoneChatMount{display:none;}
        @media(max-width:1200px){.redzone-chat{min-height:360px;border-left:0;border-top:1px solid rgba(148,163,184,.26);}.redzone-chat__messages{min-height:190px;}}
      `}</style>
      <div className="redzone-chat__head">OFL Redzone Chat</div>
      <div ref={listRef} className="redzone-chat__messages">
        {messages.map(message => (
          <article className="redzone-chat__message" key={message.id}>
            {message.avatar_url ? (
              <img className="redzone-chat__avatar" src={message.avatar_url} alt="" />
            ) : (
              <span className="redzone-chat__avatar--blank" aria-hidden="true" />
            )}
            <div className="redzone-chat__row">
              <div className="redzone-chat__meta">
                <span className="redzone-chat__name">{message.roblox_username}</span>
                <time className="redzone-chat__time">{messageTime(message.created_at)}</time>
              </div>
              <p className="redzone-chat__text">{message.message}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="redzone-chat__status" role="status">{status}</div>
      <form className="redzone-chat__form" onSubmit={submitMessage}>
        <textarea
          className="redzone-chat__input"
          value={draft}
          maxLength={240}
          placeholder="Message Redzone"
          onChange={event => setDraft(event.currentTarget.value)}
        />
        <button className="redzone-chat__send" type="submit" disabled={!canSend}>
          Send
        </button>
      </form>
    </aside>,
    target
  );
}
