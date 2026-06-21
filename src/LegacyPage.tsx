import { useEffect } from 'react';
import type { LegacyPageData, LegacyScript } from './pages/types';

type LegacyPageProps = {
  page: LegacyPageData;
};

function runScript(script: LegacyScript) {
  return new Promise<HTMLScriptElement>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.async = false;

    if (script.src) {
      tag.src = script.src;
      tag.onload = () => resolve(tag);
      tag.onerror = () => reject(new Error(`Failed to load script: ${script.src}`));
    } else {
      tag.text = script.code;
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

  if (!(window as any).__oflSharedHeaderClickBound) {
    (window as any).__oflSharedHeaderClickBound = true;
    document.addEventListener('click', (event) => {
      const target = event.target as Element | null;
      const pill = target?.closest?.('#accountPill');
      if (pill) {
        event.preventDefault();
        event.stopPropagation();
        if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
        const wrap = pill.closest('#accountWrap') || document.getElementById('accountWrap');
        wrap?.classList.toggle('open');
        return;
      }
      document.querySelectorAll('#accountWrap.open').forEach((wrap) => wrap.classList.remove('open'));
    }, true);
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn && !logoutBtn.dataset.sharedHeaderBound) {
    logoutBtn.dataset.sharedHeaderBound = '1';
    logoutBtn.addEventListener('click', (event) => {
      event.preventDefault();
      localStorage.removeItem('ofl_profile');
      localStorage.removeItem('ofl_token');
      localStorage.removeItem('ofl_session');
      document.cookie = 'ofl_token=; path=/; max-age=0; SameSite=Lax';
      location.href = '/';
    });
  }

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

  fetch(apiUrl('/api/coach/me'), { headers, credentials: 'include' })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => {
      if (!data?.coach || !data?.team?.slug) return;
      const coachesLink = document.getElementById('coachesLink') as HTMLAnchorElement | null;
      if (coachesLink) {
        coachesLink.href = `/coaches/${data.team.slug}`;
        coachesLink.style.display = 'block';
      }
    })
    .catch(() => undefined);
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char] || char));
}

function playerSlug(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatCap(value: unknown) {
  const cap = Number(value || 0);
  if (cap >= 1000000) return `$${(cap / 1000000).toFixed(1).replace('.0', '')}M`;
  if (cap >= 1000) return `$${(cap / 1000).toFixed(0)}K`;
  return `$${cap}`;
}

function renderTeamCell(team: any) {
  if (!team) return '<span class="fa-label">Free Agent</span>';
  const color = team.primary_color || '#15233E';
  const init = String(team.abbreviation || team.name || '?').slice(0, 2).toUpperCase();
  const logo = team.logo_url
    ? `<img src="${escapeHtml(team.logo_url)}" onerror="this.parentNode.textContent=this.parentNode.dataset.init">`
    : escapeHtml(init);
  return `<div class="team-cell"><span class="team-logo-mini" data-init="${escapeHtml(init)}" style="background:${escapeHtml(color)}">${logo}</span>${escapeHtml(team.name)}</div>`;
}

function renderPlayersRows(players: any[], total: number, hasMore: boolean) {
  const resultCount = document.getElementById('resultCount');
  const playerOutput = document.getElementById('playerOutput');
  if (!resultCount || !playerOutput) return;

  resultCount.textContent = '';
  if (!players.length) {
    playerOutput.innerHTML = '<p class="empty">No players match your search.</p>';
    return;
  }

  const groups = new Map<number, any[]>();
  for (const player of players) {
    const cap = Number(player.cap_value || 0);
    const group = groups.get(cap) || [];
    group.push(player);
    groups.set(cap, group);
  }

  const tiers = Array.from(groups.keys()).sort((a, b) => b - a);
  playerOutput.innerHTML = tiers.map((tier) => {
    const group = groups.get(tier) || [];
    const rows = group.map((player) => {
      const eligibility = player.eligibility || 'DPP-Eligible';
      const eligibilityClass = eligibility === 'ESTABLISHED' ? 'est' : 'dpp';
      const pos = player.position_tag ? `<span class="pl-pos">(${escapeHtml(player.position_tag)})</span>` : '';
      return `<tr><td><a class="pl-link" href="/players/${encodeURIComponent(playerSlug(player.roblox_username))}">${escapeHtml(player.roblox_username)}</a>${pos}</td><td>${renderTeamCell(player.team)}</td><td><span class="elig ${eligibilityClass}">${escapeHtml(eligibility === 'ESTABLISHED' ? 'Established' : eligibility)}</span></td></tr>`;
    }).join('');
    return `<div class="tier-group"><div class="tier-head"><span class="tier-label">${escapeHtml(formatCap(tier))}</span><span class="tier-count">${group.length} player${group.length === 1 ? '' : 's'}</span></div><div class="table-wrap"><table><thead><tr><th>Username</th><th>Team</th><th>Eligibility</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join('');
}

function bootstrapPlayersPage() {
  if (!location.pathname.replace(/\/+$/, '').startsWith('/players')) return;
  const playerOutput = document.getElementById('playerOutput');
  const resultCount = document.getElementById('resultCount');
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  const btnAll = document.getElementById('btnAll');
  const btnDpp = document.getElementById('btnDPP');
  const btnEst = document.getElementById('btnEst');
  const btnFa = document.getElementById('btnFA');
  if (!playerOutput || !resultCount) return;

  let players: any[] = [];
  let total = 0;
  let offset = 0;
  let hasMore = true;
  let loading = false;
  let searchTimer: number | null = null;
  let eligibilityFilter = 'all';
  let freeAgentOnly = false;
  const pageSize = 60;

  function setButtonStates() {
    if (btnAll) btnAll.className = `filter-btn${eligibilityFilter === 'all' && !freeAgentOnly ? ' active' : ''}`;
    if (btnDpp) btnDpp.className = `filter-btn${eligibilityFilter === 'DPP-ELIGIBLE' ? ' dpp-active' : ''}`;
    if (btnEst) btnEst.className = `filter-btn${eligibilityFilter === 'ESTABLISHED' ? ' est-active' : ''}`;
    if (btnFa) btnFa.className = `filter-btn${freeAgentOnly ? ' active' : ''}`;
  }

  function filteredPlayers() {
    return players.filter((player) => {
      if (eligibilityFilter !== 'all' && player.eligibility !== eligibilityFilter) return false;
      if (freeAgentOnly && player.team) return false;
      return true;
    });
  }

  function renderFilteredPlayers() {
    setButtonStates();
    const filtered = filteredPlayers();
    const filteredTotal = eligibilityFilter === 'all' && !freeAgentOnly ? total : filtered.length;
    renderPlayersRows(filtered, filteredTotal, hasMore);
  }

  async function load(reset = false) {
    if (loading) return;
    if (reset) {
      players = [];
      offset = 0;
      total = 0;
      hasMore = true;
      playerOutput.innerHTML = '<p class="empty">Loading players...</p>';
    }
    if (!hasMore && !reset) return;
    loading = true;
    resultCount.textContent = '';
    try {
      const q = searchInput?.value.trim() || '';
      const data = await fetch(apiUrl(`/api/players?limit=${pageSize}&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`), { credentials: 'include' }).then((response) => response.json());
      const rows = Array.isArray(data.players) ? data.players : [];
      players = reset ? rows : players.concat(rows);
      total = Number(data.total || players.length);
      hasMore = Boolean(data.has_more);
      offset += rows.length;
      renderFilteredPlayers();
    } catch (error) {
      resultCount.textContent = '';
      playerOutput.innerHTML = `<p class="empty">[PLAYERS_LOAD_FAILED] ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    } finally {
      loading = false;
    }
  }

  btnAll?.addEventListener('click', () => {
    eligibilityFilter = 'all';
    freeAgentOnly = false;
    renderFilteredPlayers();
  });

  btnDpp?.addEventListener('click', () => {
    eligibilityFilter = 'DPP-ELIGIBLE';
    freeAgentOnly = false;
    renderFilteredPlayers();
  });

  btnEst?.addEventListener('click', () => {
    eligibilityFilter = 'ESTABLISHED';
    freeAgentOnly = false;
    renderFilteredPlayers();
  });

  btnFa?.addEventListener('click', () => {
    eligibilityFilter = 'all';
    freeAgentOnly = true;
    renderFilteredPlayers();
  });

  searchInput?.addEventListener('input', () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => load(true), 250);
  });

  window.addEventListener('scroll', () => {
    if (loading || !hasMore) return;
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 700) load(false);
  });

  window.setTimeout(() => {
    if (playerOutput.textContent?.includes('Loading players')) load(true);
  }, 50);
}

export function LegacyPage({ page }: LegacyPageProps) {
  useEffect(() => {
    let cancelled = false;
    const mountedScripts: HTMLScriptElement[] = [];

    document.title = page.title;
    bindSharedHeader();
    bootstrapPlayersPage();

    async function runScripts() {
      for (const script of page.scripts) {
        if (cancelled) return;
        const mounted = await runScript(script);
        mountedScripts.push(mounted);
      }
      if (!cancelled) bindSharedHeader();
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
      <div dangerouslySetInnerHTML={{ __html: page.body }} />
    </>
  );
}
