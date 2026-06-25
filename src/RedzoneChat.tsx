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
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);
  const sendTimestampsRef = useRef<number[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const isHome = pathname === '/' || pathname === '/index';

  useEffect(() => {
    if (!isHome) {
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
  }, [isHome]);

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

  useEffect(() => {
    if (cooldownEndsAt == null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
      setCooldownSecondsLeft(remaining);
      if (remaining <= 0) setCooldownEndsAt(null);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [cooldownEndsAt]);

  const onCooldown = cooldownEndsAt != null && Date.now() < cooldownEndsAt;
  const canSend = useMemo(() => draft.trim().length > 0 && draft.length <= 240 && !onCooldown, [draft, onCooldown]);

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || onCooldown) return;
    setDraft('');
    setStatus('');

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let profile: { roblox_username?: string; avatar_url?: string } | null = null;
    try {
      profile = JSON.parse(localStorage.getItem('ofl_profile') || 'null');
    } catch {
      profile = null;
    }
    const optimisticMessage: RedzoneMessage = {
      id: tempId,
      roblox_username: profile?.roblox_username || 'You',
      avatar_url: profile?.avatar_url || null,
      message,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev.slice(-79), optimisticMessage]);

    const now = Date.now();
    sendTimestampsRef.current.push(now);
    if (sendTimestampsRef.current.length >= 10) {
      sendTimestampsRef.current = [];
      setCooldownEndsAt(now + 15000);
    }

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
        setMessages(prev => prev.map(m => (m.id === tempId ? payload.message : m)));
      }
    } catch (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setStatus(error instanceof Error ? error.message : 'Could not send message');
    }
  }

  if (!target) return null;

  return createPortal(
    <aside className="redzone-chat" aria-label="OFL Redzone Chat">
      <style>{`
        .redzone-chat{display:flex;flex-direction:column;min-width:0;height:100%;overflow:hidden;background:#000;color:#F8FAFC;border-left:1px solid rgba(224,21,26,.4);}
        .redzone-chat__head{flex:0 0 auto;padding:18px 18px 14px;border-bottom:1px solid rgba(224,21,26,.3);font-family:'Oswald',sans-serif;font-weight:700;font-size:22px;line-height:1;text-transform:uppercase;letter-spacing:.7px;color:#fff;}
        .redzone-chat__messages{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:14px 14px 8px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin;scrollbar-color:#E0151A #0a0a0a;}
        .redzone-chat__messages::-webkit-scrollbar{width:8px;}
        .redzone-chat__messages::-webkit-scrollbar-track{background:#0a0a0a;}
        .redzone-chat__messages::-webkit-scrollbar-thumb{background:#E0151A;border-radius:4px;}
        .redzone-chat__message{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;align-items:start;}
        .redzone-chat__avatar{width:34px;height:34px;border-radius:50%;object-fit:cover;background:#0a0a0a;flex:0 0 auto;}
        .redzone-chat__avatar--blank{width:34px;height:34px;border-radius:50%;background:#0a0a0a;border:1px solid rgba(224,21,26,.4);}
        .redzone-chat__row{min-width:0;}
        .redzone-chat__meta{display:flex;align-items:baseline;gap:8px;min-width:0;}
        .redzone-chat__name{font-family:'Oswald',sans-serif;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}
        .redzone-chat__time{font-family:'Space Mono',monospace;font-size:12px;color:rgba(255,255,255,.55);white-space:nowrap;}
        .redzone-chat__text{font-family:'Spectral',Georgia,serif;font-size:16px;line-height:1.4;color:#F1F1F1;overflow-wrap:anywhere;white-space:pre-wrap;}
        .redzone-chat__status{flex:0 0 auto;min-height:18px;padding:0 14px 8px;font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#FF3B3B;}
        .redzone-chat__form{flex:0 0 auto;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:12px 14px 14px;border-top:1px solid rgba(224,21,26,.3);background:#0a0a0a;}
        .redzone-chat__input{width:100%;height:44px;resize:none;border:1px solid rgba(224,21,26,.4);background:#000;color:#F8FAFC;padding:12px;font:600 14px/1.25 'Oswald',sans-serif;letter-spacing:.4px;outline:none;}
        .redzone-chat__input:focus{border-color:#FF3B3B;box-shadow:0 0 0 1px rgba(224,21,26,.3);}
        .redzone-chat__send{appearance:none;border:1px solid #E0151A;background:#E0151A;color:#fff;font-family:'Oswald',sans-serif;font-weight:700;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;padding:0 16px;cursor:pointer;}
        .redzone-chat__send:disabled{cursor:not-allowed;opacity:.45;}
        .live-game-spot.on.is-docked #redzoneChatMount{display:none;}
        @media(max-width:1200px){.redzone-chat{min-height:360px;border-left:0;border-top:1px solid rgba(224,21,26,.3);}.redzone-chat__messages{min-height:190px;}}
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
      <div className="redzone-chat__status" role="status">
        {onCooldown ? `Slow down — ${cooldownSecondsLeft}s cooldown` : status}
      </div>
      <form className="redzone-chat__form" onSubmit={submitMessage}>
        <textarea
          className="redzone-chat__input"
          value={draft}
          maxLength={240}
          disabled={onCooldown}
          placeholder={onCooldown ? `Wait ${cooldownSecondsLeft}s...` : 'Message Redzone'}
          onChange={event => setDraft(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (canSend) event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="redzone-chat__send" type="submit" disabled={!canSend}>
          Send
        </button>
      </form>
    </aside>,
    target
  );
}
