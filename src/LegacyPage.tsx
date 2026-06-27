import { useEffect } from 'react';
import type { LegacyPageData, LegacyScript } from './pages/types';

type LegacyPageProps = {
  page: LegacyPageData;
};

function inlineHandlerNames(html: string) {
  const names = new Set<string>();
  html.replace(/\son[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi, (_match, _quote, code) => {
    String(code).replace(/\b([A-Za-z_$][\w$]*)\s*\(/g, (_call, name) => {
      if (!['if', 'for', 'while', 'switch', 'return', 'function'].includes(name)) names.add(name);
      return '';
    });
    return '';
  });
  return [...names];
}

function scopedInlineScript(code: string, exposedNames: string[]) {
  const exposedJson = JSON.stringify(exposedNames);
  return `(() => {
    const __oflExpose = ${exposedJson};
${code}
    for (const __oflName of __oflExpose) {
      try {
        const __oflValue = eval(__oflName);
        if (typeof __oflValue === 'function') window[__oflName] = __oflValue;
      } catch {}
    }
  })();`;
}

function runScript(script: LegacyScript, exposedNames: string[]) {
  return new Promise<HTMLScriptElement>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.async = false;

    if (script.src) {
      tag.src = script.src;
      tag.onload = () => resolve(tag);
      tag.onerror = () => reject(new Error(`Failed to load script: ${script.src}`));
    } else {
      tag.text = scopedInlineScript(script.code, exposedNames);
      resolve(tag);
    }

    document.body.appendChild(tag);
  });
}

function cookieValue(name: string) {
  const parts = document.cookie ? document.cookie.split('; ') : [];
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) return part.split('=').slice(1).join('=');
  }
  return '';
}

function apiUrl(url: string) {
  const localWeb = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && location.port
    && location.port !== '3000';
  return localWeb && url.startsWith('/api/') ? `http://localhost:3000${url}` : url;
}

function getStoredToken() {
  const direct = localStorage.getItem('ofl_token') || decodeURIComponent(cookieValue('ofl_token') || '');
  if (direct) return direct;
  try {
    const session = JSON.parse(localStorage.getItem('ofl_session') || 'null');
    return session?.token || session?.access_token || session?.ofl_token || '';
  } catch {
    return '';
  }
}

function showHeaderProfile(profile: { roblox_username?: string; avatar_url?: string } | null, token: string) {
  const connectBtn = document.getElementById('connectBtn') as HTMLElement | null;
  const accountWrap = document.getElementById('accountWrap') as HTMLElement | null;
  const accountName = document.getElementById('accountName');
  const accountAvatar = document.getElementById('accountAvatar') as HTMLImageElement | null;

  if (!connectBtn || !accountWrap || !accountName) return;
  if (!profile?.roblox_username && !token) return;

  connectBtn.style.display = 'none';
  accountWrap.style.display = 'block';
  accountName.textContent = profile?.roblox_username || 'Account';
  if (profile?.avatar_url && accountAvatar) accountAvatar.src = profile.avatar_url;
}

function bindSharedHeader() {
  let profile: { roblox_username?: string; avatar_url?: string; is_admin?: boolean; admin_tabs?: string[] } | null = null;
  const token = getStoredToken();

  try {
    profile = JSON.parse(localStorage.getItem('ofl_profile') || 'null');
  } catch {
    profile = null;
  }

  showHeaderProfile(profile, token);

  if (!token && !cookieValue('ofl_token')) return;

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  fetch(apiUrl('/api/me'), { headers, credentials: 'include' })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => {
      if (!data?.profile) return;
      localStorage.setItem('ofl_profile', JSON.stringify(data.profile));
      showHeaderProfile(data.profile, token || cookieValue('ofl_token'));
      const adminLink = document.getElementById('adminLink') as HTMLElement | null;
      const mediaEditorLink = document.getElementById('mediaEditorLink') as HTMLElement | null;
      if (data.profile.is_admin && adminLink) adminLink.style.display = 'block';
      if ((data.profile.admin_tabs || []).includes('media') && mediaEditorLink) mediaEditorLink.style.display = 'block';
    })
    .catch(() => undefined);

}

function stripLegacyHeader(html: string) {
  return html
    .replace(/^\s*<!--\s*HEADER\s*-->\s*/i, '')
    .replace(/^\s*<header\b[\s\S]*?<\/header>\s*/i, '');
}

export function LegacyPage({ page }: LegacyPageProps) {
  useEffect(() => {
    let cancelled = false;
    const mountedScripts: HTMLScriptElement[] = [];
    const exposedNames = inlineHandlerNames(page.body);

    document.title = page.title;
    bindSharedHeader();

    async function runScripts() {
      for (const script of page.scripts) {
        if (cancelled) return;
        const mounted = await runScript(script, exposedNames);
        mountedScripts.push(mounted);
      }
      if (!cancelled) {
        bindSharedHeader();
      }
    }

    runScripts().catch((error) => {
      console.error(error);
    });

    return () => {
      cancelled = true;
      document.body.style.overflow = '';
      for (const script of mountedScripts) {
        script.remove();
      }
    };
  }, [page]);

  return (
    <>
      <style>{page.styles}</style>
      <div dangerouslySetInnerHTML={{ __html: stripLegacyHeader(page.body) }} />
    </>
  );
}
