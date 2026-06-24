import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react';
import { Resizable, type ResizeCallback } from 're-resizable';

type Profile = {
  roblox_username?: string;
  avatar_url?: string | null;
  admin_tabs?: string[];
  is_admin?: boolean;
  is_superuser?: boolean;
};

type GameTeam = { name?: string; abbreviation?: string };
type HighlightGame = {
  id: string;
  week?: string | number | null;
  home_score?: number | null;
  away_score?: number | null;
  home_team?: GameTeam | null;
  away_team?: GameTeam | null;
};

type Video = {
  id: string;
  title: string;
  youtube_id?: string;
  youtube_url?: string;
  week_tag?: string | null;
  published_at: string;
  posted_by?: string | null;
  game?: HighlightGame | null;
};

type Article = {
  id: string;
  title: string;
  author?: string | null;
  thumbnail_url?: string | null;
  published_at: string;
  posted_by?: string | null;
};

type ArticleImage = {
  id: string;
  src: string;
  alt: string;
  lineIndex: number;
  width: number;
  height: number;
};

const emptyArticleImage: ArticleImage[] = [];

function token() {
  return localStorage.getItem('ofl_token') || '';
}

async function readJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function apiFetch(url: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  return fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch] || ch));
}

function isSafeArticleUrl(url: string) {
  return /^(https?:\/\/|\/)/i.test(String(url || ''));
}

function youtubeId(url: string) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function youtubeThumb(id?: string) {
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
}

function gameLabel(game?: HighlightGame | null) {
  if (!game) return 'Connected game';
  const away = game.away_team?.abbreviation || game.away_team?.name || 'TBD';
  const home = game.home_team?.abbreviation || game.home_team?.name || 'TBD';
  const week = game.week ? `Week ${game.week}` : 'Game';
  const score = game.away_score != null && game.home_score != null ? ` · ${game.away_score}-${game.home_score}` : '';
  return `${week} · ${away} @ ${home}${score}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

function imageExtensionFromMime(type: string) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/svg+xml') return 'svg';
  return 'png';
}

function normalizedImageFile(file: File, fallbackName: string) {
  if (file.name) return file;
  const ext = imageExtensionFromMime(file.type);
  return new File([file], `${fallbackName}.${ext}`, { type: file.type });
}

function discordMarkupToHtml(text: string) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
}

function discordInlineMarkupToHtml(text: string) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
}

function textLineHeight(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return 18;
  return Math.max(34, Math.ceil(trimmed.length / 62) * 30 + 10);
}

function articleTextBlocks(text: string) {
  const lines = String(text || '').split('\n');
  const source = lines.length ? lines : [''];
  return source.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return { html: '<div class="article-line-gap"></div>', height: textLineHeight(line) };
    if (/^##\s+/.test(trimmed)) return { html: `<h2>${discordInlineMarkupToHtml(trimmed.replace(/^##\s+/, ''))}</h2>`, height: 48 };
    if (/^>\s?/.test(trimmed)) return { html: `<blockquote>${discordInlineMarkupToHtml(trimmed.replace(/^>\s?/, ''))}</blockquote>`, height: textLineHeight(trimmed) + 14 };
    return { html: `<p>${discordInlineMarkupToHtml(line)}</p>`, height: textLineHeight(line) };
  });
}

function imageRowHtml(image: ArticleImage) {
  const width = Math.max(40, Math.round(image.width));
  const height = Math.max(40, Math.round(image.height));
  if (!isSafeArticleUrl(image.src)) return '';
  return `<figure class="article-inline-image" data-image-id="${escapeHtml(image.id)}" data-line="${Math.max(0, Math.round(image.lineIndex || 0))}"><img class="article-free-image" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || 'Article image')}" style="width:${width}px;height:${height}px;object-fit:contain;" data-w="${width}" data-h="${height}"></figure>`;
}

function articleFlowHtml(text: string, images: ArticleImage[]) {
  const blocks = articleTextBlocks(text);
  const html: string[] = [];
  const maxLine = blocks.length;
  const sortedImages = [...images].sort((a, b) => Math.max(0, a.lineIndex || 0) - Math.max(0, b.lineIndex || 0));
  blocks.forEach((block, index) => {
    sortedImages
      .filter(image => Math.min(maxLine, Math.max(0, image.lineIndex || 0)) === index)
      .forEach(image => {
        const row = imageRowHtml(image);
        if (row) html.push(row);
      });
    html.push(block.html);
  });
  sortedImages
    .filter(image => Math.min(maxLine, Math.max(0, image.lineIndex || 0)) === maxLine)
    .forEach(image => {
      const row = imageRowHtml(image);
      if (row) html.push(row);
    });
  return {
    html: html.join('') || '<p></p>',
    height: Math.max(620, blocks.reduce((sum, block) => sum + block.height, 0) + images.reduce((sum, img) => sum + Math.max(40, img.height) + 34, 0) + 60)
  };
}

function articleBodyHtml(text: string, images: ArticleImage[]) {
  if (!images.length) return discordMarkupToHtml(text.trim());
  const flow = articleFlowHtml(text, images);
  return `<div class="article-free-layout">${flow.html}</div>`;
}

function insertFormat(text: string, selectionStart: number, selectionEnd: number, open: string, close = open) {
  const selected = text.slice(selectionStart, selectionEnd) || 'text';
  const next = `${text.slice(0, selectionStart)}${open}${selected}${close}${text.slice(selectionEnd)}`;
  const caret = selectionStart + open.length + selected.length + close.length;
  return { next, caret };
}

function hydrateSharedHeader(profile: Profile | null) {
  const connect = document.getElementById('connectBtn') as HTMLElement | null;
  const accountWrap = document.getElementById('accountWrap') as HTMLElement | null;
  const accountName = document.getElementById('accountName');
  const accountAvatar = document.getElementById('accountAvatar') as HTMLImageElement | null;
  const mediaEditorLink = document.getElementById('mediaEditorLink') as HTMLElement | null;
  const adminLink = document.getElementById('adminLink') as HTMLElement | null;

  if (!profile?.roblox_username) return;

  if (connect) connect.style.display = 'none';
  if (accountWrap) accountWrap.style.display = 'block';
  if (accountName) accountName.textContent = profile.roblox_username;
  if (accountAvatar && profile.avatar_url) accountAvatar.src = profile.avatar_url;
  if (mediaEditorLink && (profile.admin_tabs || []).includes('media')) mediaEditorLink.style.display = 'block';
  if (adminLink && profile.is_admin) adminLink.style.display = 'block';
}

export default function MediaEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gate, setGate] = useState<'loading' | 'login' | 'denied' | 'ok'>('loading');
  const [view, setView] = useState<'articles' | 'videos'>('articles');
  const [message, setMessage] = useState<{ text: string; ok?: boolean } | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [games, setGames] = useState<HighlightGame[]>([]);
  const [canDeleteMedia, setCanDeleteMedia] = useState(false);

  const [articleTitle, setArticleTitle] = useState('');
  const [articleAuthor, setArticleAuthor] = useState('');
  const [articleText, setArticleText] = useState('');
  const [articleThumb, setArticleThumb] = useState('');
  const [articleImages, setArticleImages] = useState<ArticleImage[]>(emptyArticleImage);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [postingArticle, setPostingArticle] = useState(false);
  const [articleSubmitStatus, setArticleSubmitStatus] = useState<{ text: string; ok?: boolean } | null>(null);

  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoWeek, setVideoWeek] = useState('');
  const [videoGame, setVideoGame] = useState('');
  const [postingVideo, setPostingVideo] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const articlePreviewBlocks = useMemo(() => articleTextBlocks(articleText), [articleText]);
  const articlePreviewFlow = useMemo(() => articleFlowHtml(articleText, articleImages), [articleText, articleImages]);
  const selectedImage = articleImages.find(img => img.id === selectedImageId) || null;

  function showMessage(text: string, ok = false) {
    setMessage({ text, ok });
    window.setTimeout(() => setMessage(null), 3500);
  }

  async function loadHighlightGames() {
    try {
      const response = await apiFetch('/api/media/highlight-games');
      const json = await readJsonSafe(response);
      setGames(json.games || []);
    } catch {
      setGames([]);
    }
  }

  async function loadVideos() {
    try {
      const response = await fetch('/api/media/videos');
      const json = await response.json();
      setVideos(json.videos || []);
    } catch {
      setVideos([]);
    }
  }

  async function loadArticles() {
    try {
      const response = await fetch('/api/media/articles');
      const json = await response.json();
      setArticles(json.articles || []);
    } catch {
      setArticles([]);
    }
  }

  useEffect(() => {
    async function boot() {
      let cached: Profile | null = null;
      try {
        cached = JSON.parse(localStorage.getItem('ofl_profile') || 'null');
      } catch {
        cached = null;
      }
      if (!token()) {
        setGate('login');
        return;
      }
      if (cached?.roblox_username) hydrateSharedHeader(cached);
      try {
        const response = await apiFetch('/api/me');
        const json = await response.json();
        if (!json.profile) {
          setGate('login');
          return;
        }
        const tabs: string[] = json.profile.admin_tabs || [];
        if (!tabs.includes('media') && !json.profile.is_admin) {
          setGate('denied');
          return;
        }
        setProfile(json.profile);
        hydrateSharedHeader(json.profile);
        setCanDeleteMedia(!!json.profile.is_superuser || tabs.includes('access') || tabs.includes('teams'));
        setGate('ok');
        await Promise.all([loadHighlightGames(), loadVideos(), loadArticles()]);
      } catch {
        setGate('denied');
      }
    }
    void boot();
  }, []);

  useEffect(() => {
    let opened = false;
    const wrap = document.getElementById('accountWrap');
    const pill = document.getElementById('accountPill');
    const logout = document.getElementById('logoutBtn');
    const menu = document.querySelector('.ofl-shared-header .menu-toggle');
    const links = document.querySelector('.ofl-shared-header nav.links') as HTMLElement | null;

    function toggleAccount(event: Event) {
      event.stopPropagation();
      opened = !opened;
      wrap?.classList.toggle('open', opened);
    }
    function closeAccount() {
      opened = false;
      wrap?.classList.remove('open');
    }
    function logoutUser(event: Event) {
      event.preventDefault();
      localStorage.removeItem('ofl_profile');
      localStorage.removeItem('ofl_token');
      localStorage.removeItem('ofl_session');
      window.location.href = '/';
    }
    function toggleMenu() {
      if (!links) return;
      const isOpen = links.style.display === 'flex';
      links.style.cssText = isOpen ? '' : 'display:flex;position:absolute;top:78px;left:0;right:0;background:var(--paper);flex-direction:column;padding:20px 22px;gap:18px;border-bottom:1px solid var(--navy);';
    }

    pill?.addEventListener('click', toggleAccount);
    document.addEventListener('click', closeAccount);
    logout?.addEventListener('click', logoutUser);
    menu?.addEventListener('click', toggleMenu);

    return () => {
      pill?.removeEventListener('click', toggleAccount);
      document.removeEventListener('click', closeAccount);
      logout?.removeEventListener('click', logoutUser);
      menu?.removeEventListener('click', toggleMenu);
    };
  }, []);

  async function uploadImage(file: File, title: string) {
    if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5MB or smaller');
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('Use a PNG, JPG, WEBP, or SVG image');
    const dataUrl = await fileToDataUrl(file);
    const response = await apiFetch('/api/media/articles/thumbnail-upload', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, title, data_url: dataUrl })
    });
    const json = await readJsonSafe(response);
    if (!response.ok || !json.url) throw new Error(json.error || 'Image upload failed');
    return String(json.url);
  }

  function articleInsertionLine(offset = 0) {
    const caret = textAreaRef.current?.selectionStart ?? articleText.length;
    const beforeCaret = articleText.slice(0, caret);
    const linesBeforeCaret = beforeCaret.match(/\n/g)?.length || 0;
    return linesBeforeCaret + (caret > 0 && articleText[caret - 1] !== '\n' ? 1 : 0) + offset;
  }

  async function insertArticleImageFile(file: File, offset = 0) {
    const namedFile = normalizedImageFile(file, `article-image-${Date.now()}`);
    const url = await uploadImage(namedFile, articleTitle || namedFile.name);
    const next: ArticleImage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      src: url,
      alt: namedFile.name.replace(/\.[^.]+$/, '') || 'Article image',
      lineIndex: articleInsertionLine(offset),
      width: 260,
      height: 160
    };
    setArticleImages(prev => [...prev, next]);
    setSelectedImageId(next.id);
  }

  async function handleThumbFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      showMessage('Uploading thumbnail...', true);
      const url = await uploadImage(file, articleTitle || file.name);
      setArticleThumb(url);
      showMessage('Thumbnail uploaded', true);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Image upload failed');
    } finally {
      event.target.value = '';
    }
  }

  async function handleArticleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      showMessage('Uploading article image...', true);
      await insertArticleImageFile(file);
      showMessage('Image inserted', true);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Article image upload failed');
    } finally {
      event.target.value = '';
    }
  }

  async function handleArticlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData?.items || [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault();
    try {
      showMessage(files.length === 1 ? 'Uploading pasted image...' : `Uploading ${files.length} pasted images...`, true);
      for (let index = 0; index < files.length; index += 1) {
        await insertArticleImageFile(files[index], index);
      }
      showMessage(files.length === 1 ? 'Pasted image inserted' : 'Pasted images inserted', true);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Pasted image upload failed');
    }
  }

  function formatArticle(open: string, close = open) {
    const area = textAreaRef.current;
    if (!area) return;
    const { next, caret } = insertFormat(articleText, area.selectionStart, area.selectionEnd, open, close);
    setArticleText(next);
    window.requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(caret, caret);
    });
  }

  async function postArticle() {
    if (postingArticle) return;
    setArticleSubmitStatus(null);
    if (!articleTitle.trim()) {
      setArticleSubmitStatus({ text: 'Title is required' });
      showMessage('Title is required');
      return;
    }
    if (!articleText.trim() && !articleImages.length) {
      setArticleSubmitStatus({ text: 'Article body is required' });
      showMessage('Article body is required');
      return;
    }
    setPostingArticle(true);
    setArticleSubmitStatus({ text: 'Posting article...', ok: true });
    showMessage('Posting article...', true);
    try {
      const body = articleBodyHtml(articleText, articleImages);
      const response = await apiFetch('/api/media/articles', {
        method: 'POST',
        body: JSON.stringify({
          title: articleTitle.trim(),
          body,
          author: articleAuthor.trim() || null,
          thumbnail_url: articleThumb.trim() || null
        })
      });
      const json = await readJsonSafe(response);
      if (!response.ok) {
        const text = (json.code ? `[${json.code}] ` : '') + (json.error || 'Could not post article');
        setArticleSubmitStatus({ text });
        showMessage(text);
        return;
      }
      setArticleTitle('');
      setArticleAuthor('');
      setArticleText('');
      setArticleThumb('');
      setArticleImages([]);
      setSelectedImageId(null);
      setArticleSubmitStatus({ text: 'Article posted!', ok: true });
      showMessage('Article posted!', true);
      await loadArticles();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Network error';
      setArticleSubmitStatus({ text });
      showMessage(text);
    } finally {
      setPostingArticle(false);
    }
  }

  async function postVideo() {
    if (!videoTitle.trim()) {
      showMessage('Title is required');
      return;
    }
    if (!videoUrl.trim() || !youtubeId(videoUrl)) {
      showMessage('Enter a valid YouTube URL');
      return;
    }
    setPostingVideo(true);
    try {
      const response = await apiFetch('/api/media/videos', {
        method: 'POST',
        body: JSON.stringify({
          title: videoTitle.trim(),
          youtube_url: videoUrl.trim(),
          description: videoDescription.trim() || null,
          week_tag: videoWeek.trim() || null,
          game_id: videoGame || null
        })
      });
      const json = await readJsonSafe(response);
      if (!response.ok) {
        showMessage((json.code ? `[${json.code}] ` : '') + (json.error || 'Could not post highlight'));
        return;
      }
      setVideoTitle('');
      setVideoUrl('');
      setVideoDescription('');
      setVideoWeek('');
      setVideoGame('');
      showMessage('Highlight posted!', true);
      await Promise.all([loadHighlightGames(), loadVideos()]);
    } catch {
      showMessage('Network error');
    } finally {
      setPostingVideo(false);
    }
  }

  async function deleteVideo(id: string) {
    if (!window.confirm('Delete this highlight?')) return;
    try {
      const response = await apiFetch(`/api/media/videos/${id}`, { method: 'DELETE' });
      const json = await readJsonSafe(response);
      if (!response.ok) {
        showMessage(json.error || 'Could not delete that highlight');
        return;
      }
      showMessage('Highlight deleted.', true);
      await loadVideos();
    } catch {
      showMessage('Could not delete that highlight. Check the API connection.');
    }
  }

  async function deleteArticle(id: string) {
    if (!window.confirm('Delete this article?')) return;
    try {
      const response = await apiFetch(`/api/media/articles/${id}`, { method: 'DELETE' });
      const json = await readJsonSafe(response);
      if (!response.ok) {
        showMessage(json.error || 'Could not delete that article');
        return;
      }
      showMessage('Article deleted.', true);
      await loadArticles();
    } catch {
      showMessage('Could not delete that article. Check the API connection.');
    }
  }

  async function connectVideoGame(id: string, gameId: string) {
    try {
      const response = await apiFetch(`/api/media/videos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ game_id: gameId || null })
      });
      const json = await readJsonSafe(response);
      if (!response.ok) {
        showMessage(json.error || 'Could not connect that game.');
        return;
      }
      showMessage('Highlight game connection saved.', true);
      await Promise.all([loadHighlightGames(), loadVideos()]);
    } catch {
      showMessage('Could not connect that game. Check the API connection.');
    }
  }

  function updateImage(id: string, patch: Partial<ArticleImage>) {
    setArticleImages(prev => prev.map(img => (img.id === id ? { ...img, ...patch } : img)));
  }

  function clampImageLine(lineIndex: number) {
    return Math.max(0, Math.min(articlePreviewBlocks.length, lineIndex));
  }

  function renderInlineImages(lineIndex: number) {
    return articleImages
      .filter(image => clampImageLine(image.lineIndex) === lineIndex)
      .map(image => (
        <ArticleImageBox
          key={image.id}
          image={{ ...image, lineIndex: clampImageLine(image.lineIndex) }}
          selected={selectedImageId === image.id}
          maxLineIndex={articlePreviewBlocks.length}
          onSelect={() => setSelectedImageId(image.id)}
          onChange={patch => updateImage(image.id, patch)}
          onRemove={() => setArticleImages(prev => prev.filter(img => img.id !== image.id))}
        />
      ));
  }

  if (gate === 'loading') return <main className="media-editor-page"><p className="empty">Loading...</p></main>;
  if (gate === 'login') return <Gate title="Connect Required" copy="Log in before opening the media editor." href="/connect" label="Connect Account" />;
  if (gate === 'denied') return <Gate title="No Media Access" copy="Your account does not have access to this editor." href="/media" label="Back to Media" />;

  return (
    <main className="media-editor-page">
      <style>{styles}</style>
      <div className="media-editor-head">
        <div>
          <div className="eyebrow">// Media Desk</div>
          <h1>Media Editor</h1>
          <p className="subtitle">{profile?.roblox_username || 'OFL'} · Articles and highlights</p>
        </div>
        <div className="media-editor-toggle">
          <button className={view === 'articles' ? 'active' : ''} type="button" onClick={() => setView('articles')}>Articles</button>
          <button className={view === 'videos' ? 'active' : ''} type="button" onClick={() => setView('videos')}>Highlights</button>
        </div>
      </div>

      {message ? <div className={`msg ${message.ok ? 'ok' : 'err'}`}>{message.text}</div> : null}

      {view === 'articles' ? (
        <>
          <section className="media-editor-panel">
            <h2>Post Article</h2>
            <p className="desc">Place your cursor between article lines before uploading an image. Use the image controls to resize or move it between lines.</p>
            <div className="form-grid">
              <label>
                Title
                <input value={articleTitle} onChange={event => setArticleTitle(event.target.value)} />
              </label>
              <label>
                Author
                <input value={articleAuthor} onChange={event => setArticleAuthor(event.target.value)} placeholder={profile?.roblox_username || 'OFL Staff'} />
              </label>
              <label className="full">
                Thumbnail image
                <input value={articleThumb} onChange={event => setArticleThumb(event.target.value)} placeholder="/media/uploads/example.png" />
              </label>
              <label className="full">
                Upload thumbnail
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleThumbFile} />
              </label>
            </div>
            {articleThumb ? <img className="thumb-preview" src={articleThumb} alt="Thumbnail preview" /> : null}

            <div className="composer-toolbar">
              <button type="button" onClick={() => formatArticle('**')}>B</button>
              <button type="button" onClick={() => formatArticle('*')}>I</button>
              <button type="button" onClick={() => formatArticle('__')}>U</button>
              <button type="button" onClick={() => formatArticle('~~')}>S</button>
              <button type="button" onClick={() => formatArticle('## ', '')}>H2</button>
              <button type="button" onClick={() => formatArticle('> ', '')}>Quote</button>
              <label className="image-upload-button">
                Image
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleArticleImageFile} />
              </label>
            </div>

            <div className="composer-grid">
              <textarea
                ref={textAreaRef}
                value={articleText}
                onChange={event => setArticleText(event.target.value)}
                onPaste={event => void handleArticlePaste(event)}
                placeholder="Write your article here..."
              />
              <div
                className="article-stage"
                style={{ minHeight: articlePreviewFlow.height }}
                onMouseDown={() => setSelectedImageId(null)}
              >
                <div className="article-stage-text">
                  {articlePreviewBlocks.map((block, index) => (
                    <div className="article-flow-slot" key={`line-${index}`}>
                      {renderInlineImages(index)}
                      <div dangerouslySetInnerHTML={{ __html: block.html }} />
                    </div>
                  ))}
                  {renderInlineImages(articlePreviewBlocks.length)}
                </div>
              </div>
            </div>

            {selectedImage ? (
              <div className="image-inspector">
                <span>Selected image</span>
                <label>Line
                  <select value={clampImageLine(selectedImage.lineIndex)} onChange={event => updateImage(selectedImage.id, { lineIndex: Number(event.target.value) })}>
                    {Array.from({ length: articlePreviewBlocks.length + 1 }, (_value, index) => (
                      <option key={index} value={index}>{index === 0 ? 'Before line 1' : index === articlePreviewBlocks.length ? 'End of article' : `After line ${index}`}</option>
                    ))}
                  </select>
                </label>
                <label>Alt <input value={selectedImage.alt} onChange={event => updateImage(selectedImage.id, { alt: event.target.value })} /></label>
                <button type="button" onClick={() => setArticleImages(prev => prev.filter(img => img.id !== selectedImage.id))}>Remove</button>
              </div>
            ) : null}

            <div className="submit-row">
              <button className="btn btn-solid" type="button" disabled={postingArticle} onClick={() => void postArticle()}>
                {postingArticle ? 'Posting...' : 'Post Article'}
              </button>
              {articleSubmitStatus ? <span className={`submit-status ${articleSubmitStatus.ok ? 'ok' : 'err'}`}>{articleSubmitStatus.text}</span> : null}
            </div>
          </section>

          <section className="media-editor-panel">
            <h2>Posted Articles</h2>
            <p className="desc">{articles.length} article{articles.length === 1 ? '' : 's'} posted</p>
            <div className="item-list">
              {articles.length ? articles.map(article => {
                const mine = profile?.roblox_username && article.posted_by?.toLowerCase() === profile.roblox_username.toLowerCase();
                return (
                  <div className="item-row" key={article.id}>
                    {article.thumbnail_url ? <img className="item-thumb" src={article.thumbnail_url} alt="" /> : <div className="item-thumb-placeholder">OFL</div>}
                    <div className="item-info">
                      <div className="it">{article.title}</div>
                      <div className="im">{article.author || 'OFL Staff'} · {new Date(article.published_at).toLocaleDateString()}</div>
                    </div>
                    {(canDeleteMedia || mine) ? <button className="btn btn-danger" type="button" onClick={() => void deleteArticle(article.id)}>Delete</button> : null}
                  </div>
                );
              }) : <p className="empty">No articles posted yet.</p>}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="media-editor-panel">
            <h2>Post Highlight</h2>
            <p className="desc">Paste a YouTube URL and optionally connect it to a completed game.</p>
            <div className="form-grid">
              <label>Title<input value={videoTitle} onChange={event => setVideoTitle(event.target.value)} /></label>
              <label>YouTube URL<input value={videoUrl} onChange={event => setVideoUrl(event.target.value)} /></label>
              <label>Week Tag<input value={videoWeek} onChange={event => setVideoWeek(event.target.value)} placeholder="Week 3" /></label>
              <label>
                Connected game
                <select value={videoGame} onChange={event => setVideoGame(event.target.value)}>
                  <option value="">No connected game</option>
                  {games.map(game => <option key={game.id} value={game.id}>{gameLabel(game)}</option>)}
                </select>
              </label>
              <label className="full">Description<textarea value={videoDescription} onChange={event => setVideoDescription(event.target.value)} /></label>
            </div>
            {youtubeId(videoUrl) ? <img className="thumb-preview" src={youtubeThumb(youtubeId(videoUrl) || '')} alt="YouTube preview" /> : null}
            <button className="btn btn-solid" type="button" disabled={postingVideo} onClick={postVideo}>
              {postingVideo ? 'Posting...' : 'Post Highlight'}
            </button>
          </section>

          <section className="media-editor-panel">
            <h2>Posted Highlights</h2>
            <p className="desc">{videos.length} highlight{videos.length === 1 ? '' : 's'} posted</p>
            <div className="item-list">
              {videos.length ? videos.map(video => {
                const mine = profile?.roblox_username && video.posted_by?.toLowerCase() === profile.roblox_username.toLowerCase();
                return (
                  <div className="item-row" key={video.id}>
                    {video.youtube_id ? <img className="item-thumb" src={youtubeThumb(video.youtube_id)} alt="" /> : <div className="item-thumb-placeholder">OFL</div>}
                    <div className="item-info">
                      <div className="it">{video.title}</div>
                      <div className="im">{video.week_tag || 'No tags'} · {new Date(video.published_at).toLocaleDateString()}</div>
                      {video.game ? <a className="game-link-pill" href={`/box-score/${video.game.id}`}>Box Score: {gameLabel(video.game)}</a> : null}
                      <select value={video.game?.id || ''} onChange={event => void connectVideoGame(video.id, event.target.value)}>
                        <option value="">No connected game</option>
                        {video.game ? <option value={video.game.id}>{gameLabel(video.game)}</option> : null}
                        {games.filter(game => game.id !== video.game?.id).map(game => <option key={game.id} value={game.id}>{gameLabel(game)}</option>)}
                      </select>
                    </div>
                    {(canDeleteMedia || mine) ? <button className="btn btn-danger" type="button" onClick={() => void deleteVideo(video.id)}>Delete</button> : null}
                  </div>
                );
              }) : <p className="empty">No highlights posted yet.</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Gate({ title, copy, href, label }: { title: string; copy: string; href: string; label: string }) {
  return (
    <main className="media-editor-page gate">
      <style>{styles}</style>
      <h1>{title}</h1>
      <p>{copy}</p>
      <a className="btn btn-solid" href={href}>{label}</a>
    </main>
  );
}

function ArticleImageBox({
  image,
  selected,
  maxLineIndex,
  onSelect,
  onChange,
  onRemove
}: {
  image: ArticleImage;
  selected: boolean;
  maxLineIndex: number;
  onSelect: () => void;
  onChange: (patch: Partial<ArticleImage>) => void;
  onRemove: () => void;
}) {
  const onResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    onChange({
      width: Math.max(40, image.width + delta.width),
      height: Math.max(40, image.height + delta.height)
    });
  };

  return (
    <figure
      className={`article-image-box ${selected ? 'selected' : ''}`}
      onMouseDown={event => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <div className="image-flow-controls">
        <button
          type="button"
          disabled={image.lineIndex <= 0}
          onClick={() => onChange({ lineIndex: Math.max(0, image.lineIndex - 1) })}
        >
          Up
        </button>
        <button
          type="button"
          disabled={image.lineIndex >= maxLineIndex}
          onClick={() => onChange({ lineIndex: Math.min(maxLineIndex, image.lineIndex + 1) })}
        >
          Down
        </button>
      </div>
      <Resizable
        size={{ width: image.width, height: image.height }}
        minWidth={40}
        minHeight={40}
        lockAspectRatio
        onResizeStop={onResizeStop}
        enable={{ bottomRight: true }}
      >
        <img src={image.src} alt={image.alt} draggable={false} />
      </Resizable>
      <button type="button" className="image-remove" onClick={onRemove}>X</button>
    </figure>
  );
}

const styles = `
  body{background:var(--paper);color:var(--navy);}
  .media-editor-page{width:min(1800px,calc(100% - clamp(28px,4vw,80px)));margin:0 auto;padding:56px 0 90px;color:var(--navy);font-family:'Spectral',Georgia,serif;}
  .media-editor-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:32px;flex-wrap:wrap;}
  .media-editor-page .eyebrow{font-family:'Space Mono';font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:10px;}
  .media-editor-page h1{font-family:'Anton';font-size:clamp(40px,6vw,72px);text-transform:uppercase;line-height:.9;margin:0 0 10px;color:var(--navy);}
  .media-editor-page .subtitle,.media-editor-page .desc{font-family:'Space Mono';font-size:12px;letter-spacing:1px;color:var(--muted);text-transform:uppercase;}
  .media-editor-toggle{display:flex;border:1px solid var(--line-strong);}
  .media-editor-toggle button{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1.5px;padding:12px 24px;border:0;background:transparent;color:var(--muted);cursor:pointer;}
  .media-editor-toggle button.active{background:var(--navy);color:var(--paper);}
  .media-editor-panel{background:var(--paper-2)!important;border:1px solid var(--line-strong)!important;padding:28px;margin-bottom:24px;color:var(--navy);box-shadow:0 16px 36px rgba(0,0,0,.22);}
  .media-editor-panel h2{font-family:'Oswald';font-weight:700;font-size:22px;text-transform:uppercase;margin:0 0 6px;color:var(--navy);}
  .media-editor-panel .desc{color:var(--muted);}
  .media-editor-page .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0;}
  .form-grid .full{grid-column:1/-1;}
  .media-editor-page label{font-family:'Space Mono';font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);display:flex;flex-direction:column;gap:7px;}
  .media-editor-page input,.media-editor-page select,.media-editor-page textarea{width:100%;background:var(--paper);border:1px solid var(--line-strong);color:var(--navy);font-family:'Oswald';font-weight:500;font-size:15px;padding:11px 14px;box-sizing:border-box;}
  .media-editor-page textarea{min-height:520px;font-family:'Spectral',Georgia,serif;font-size:16px;line-height:1.6;resize:vertical;}
  .media-editor-page input:focus,.media-editor-page select:focus,.media-editor-page textarea:focus{outline:none;border-color:var(--navy);}
  .thumb-preview{width:240px;max-width:100%;height:auto;max-height:150px;object-fit:contain;border:1px solid var(--line-strong);display:block;margin:14px 0;}
  .composer-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:22px 0 12px;}
  .composer-toolbar button,.image-upload-button{appearance:none;border:0;background:transparent;color:var(--muted);font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;padding:3px 0;border-bottom:1px solid transparent;}
  .composer-toolbar button:hover,.image-upload-button:hover{color:var(--navy);border-bottom-color:var(--navy);}
  .image-upload-button input{display:none;}
  .media-editor-page .composer-grid{display:grid;grid-template-columns:minmax(420px,0.92fr) minmax(560px,1.08fr);gap:18px;align-items:start;margin-bottom:20px;}
  .media-editor-page .article-stage{position:relative;min-height:620px;background:var(--paper);border:1px solid var(--line-strong);padding:20px;overflow:auto;}
  .article-stage-text{font-size:17px;line-height:1.7;}
  .article-stage-text p{margin:0 0 18px;}
  .article-stage-text h2{font-family:'Oswald';font-size:28px;line-height:1.1;text-transform:uppercase;margin:16px 0 12px;color:var(--navy);}
  .article-stage-text blockquote{border-left:3px solid var(--red);margin:0 0 18px;padding-left:14px;color:var(--muted);font-style:italic;}
  .article-line-gap{height:18px;}
  .article-flow-slot{min-width:0;}
  .article-inline-image,.article-image-box{display:inline-flex;position:relative;line-height:0;margin:10px 0 22px;max-width:100%;vertical-align:top;}
  .article-inline-image img,.article-image-box img{display:block;max-width:100%;object-fit:contain;border:0;background:transparent;user-select:none;}
  .article-image-box{align-items:flex-start;cursor:pointer;z-index:5;}
  .article-image-box.selected{outline:2px solid #D85A3A;outline-offset:5px;}
  .article-image-box img{display:block;width:100%;height:100%;object-fit:contain;border:0;background:transparent;user-select:none;pointer-events:none;}
  .image-flow-controls{position:absolute;left:0;top:-28px;display:flex;gap:6px;line-height:1;z-index:9;opacity:0;transition:opacity .15s;}
  .article-image-box.selected .image-flow-controls,.article-image-box:hover .image-flow-controls{opacity:1;}
  .image-flow-controls button{background:var(--navy);color:var(--paper);border:0;font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:5px 8px;cursor:pointer;}
  .image-flow-controls button:disabled{opacity:.35;cursor:not-allowed;}
  .image-remove{position:absolute;right:-10px;top:-10px;width:22px;height:22px;border:2px solid var(--paper);background:var(--red);color:var(--paper);font-family:'Space Mono';font-size:12px;line-height:16px;cursor:pointer;z-index:8;}
  .image-inspector{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:0 0 20px;font-family:'Space Mono';font-size:12px;text-transform:uppercase;color:var(--muted);}
  .image-inspector label{min-width:260px;}
  .btn{font-family:'Oswald';font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:2px;padding:13px 26px;cursor:pointer;border:2px solid var(--navy);transition:all .2s;text-decoration:none;display:inline-flex;}
  .btn-solid{background:var(--navy);color:var(--paper);}
  .btn-solid:hover{background:var(--red);border-color:var(--red);}
  .btn-danger{background:none;color:var(--red);border-color:var(--red);font-family:'Space Mono';font-size:12px;letter-spacing:1px;padding:7px 14px;}
  .btn-danger:hover{background:var(--red);color:var(--paper);}
  .btn:disabled{opacity:.4;cursor:not-allowed;}
  .submit-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
  .submit-status{font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
  .submit-status.ok{color:var(--green);}
  .submit-status.err{color:var(--red);}
  .msg{font-family:'Space Mono';font-size:12px;padding:10px 14px;margin-bottom:16px;}
  .msg.ok{background:rgba(60,122,78,.14);color:var(--green);}
  .msg.err{background:rgba(159,54,34,.12);color:var(--red);}
  .item-list{display:flex;flex-direction:column;gap:0;}
  .item-row{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--line);}
  .item-thumb,.item-thumb-placeholder{width:80px;height:46px;object-fit:cover;flex-shrink:0;border:1px solid var(--line);}
  .item-thumb-placeholder{background:var(--navy);display:flex;align-items:center;justify-content:center;font-family:'Anton';font-size:13px;color:rgba(255,255,255,.35);}
  .item-info{flex:1;display:grid;gap:6px;}
  .it{font-family:'Oswald';font-weight:700;font-size:15px;text-transform:uppercase;line-height:1.2;color:var(--navy);}
  .im,.game-link-pill{font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
  .game-link-pill{color:var(--green);text-decoration:none;}
  .empty{font-style:italic;color:var(--muted);padding:20px 0;}
  .gate{text-align:center;}
  @media(max-width:900px){.form-grid,.composer-grid{grid-template-columns:1fr;}.article-stage{min-height:520px;}}
`;
