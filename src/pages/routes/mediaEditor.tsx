import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Draggable, { type DraggableData, type DraggableEvent } from 'react-draggable';
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
  x: number;
  y: number;
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

function articleBodyHtml(text: string, images: ArticleImage[]) {
  const textHtml = discordMarkupToHtml(text.trim());
  if (!images.length) return textHtml;
  const maxY = images.reduce((max, img) => Math.max(max, img.y + img.height + 28), 420);
  const imageHtml = images
    .filter(img => isSafeArticleUrl(img.src))
    .map(img => `<img class="article-free-image" src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt || 'Article image')}" style="position:absolute;left:${Math.max(0, Math.round(img.x))}px;top:${Math.max(0, Math.round(img.y))}px;width:${Math.max(40, Math.round(img.width))}px;height:${Math.max(40, Math.round(img.height))}px;object-fit:contain;" data-x="${Math.max(0, Math.round(img.x))}" data-y="${Math.max(0, Math.round(img.y))}" data-w="${Math.max(40, Math.round(img.width))}" data-h="${Math.max(40, Math.round(img.height))}">`)
    .join('');
  return `<div class="article-free-layout" style="position:relative;min-height:${Math.round(maxY)}px;">${textHtml}${imageHtml}</div>`;
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

  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoWeek, setVideoWeek] = useState('');
  const [videoGame, setVideoGame] = useState('');
  const [postingVideo, setPostingVideo] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const articlePreviewHtml = useMemo(() => discordMarkupToHtml(articleText), [articleText]);
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
      const url = await uploadImage(file, articleTitle || file.name);
      const next: ArticleImage = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        src: url,
        alt: file.name.replace(/\.[^.]+$/, '') || 'Article image',
        x: 24,
        y: 80 + articleImages.length * 24,
        width: 260,
        height: 160
      };
      setArticleImages(prev => [...prev, next]);
      setSelectedImageId(next.id);
      showMessage('Image inserted', true);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Article image upload failed');
    } finally {
      event.target.value = '';
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
    const body = articleBodyHtml(articleText, articleImages);
    if (!articleTitle.trim()) {
      showMessage('Title is required');
      return;
    }
    if (!articleText.trim() && !articleImages.length) {
      showMessage('Article body is required');
      return;
    }
    setPostingArticle(true);
    try {
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
        showMessage((json.code ? `[${json.code}] ` : '') + (json.error || 'Could not post article'));
        return;
      }
      setArticleTitle('');
      setArticleAuthor('');
      setArticleText('');
      setArticleThumb('');
      setArticleImages([]);
      setSelectedImageId(null);
      showMessage('Article posted!', true);
      await loadArticles();
    } catch {
      showMessage('Network error');
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
            <p className="desc">Write the article text, then place images directly on the preview canvas.</p>
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
                placeholder="Write your article here..."
              />
              <div className="article-stage" ref={stageRef} onMouseDown={() => setSelectedImageId(null)}>
                <div className="article-stage-text" dangerouslySetInnerHTML={{ __html: articlePreviewHtml || '<p></p>' }} />
                {articleImages.map(image => (
                  <ArticleImageBox
                    key={image.id}
                    image={image}
                    selected={selectedImageId === image.id}
                    onSelect={() => setSelectedImageId(image.id)}
                    onChange={patch => updateImage(image.id, patch)}
                    onRemove={() => setArticleImages(prev => prev.filter(img => img.id !== image.id))}
                  />
                ))}
              </div>
            </div>

            {selectedImage ? (
              <div className="image-inspector">
                <span>Selected image</span>
                <label>Alt <input value={selectedImage.alt} onChange={event => updateImage(selectedImage.id, { alt: event.target.value })} /></label>
                <button type="button" onClick={() => setArticleImages(prev => prev.filter(img => img.id !== selectedImage.id))}>Remove</button>
              </div>
            ) : null}

            <button className="btn btn-solid" type="button" disabled={postingArticle} onClick={postArticle}>
              {postingArticle ? 'Posting...' : 'Post Article'}
            </button>
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
  onSelect,
  onChange,
  onRemove
}: {
  image: ArticleImage;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<ArticleImage>) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onDrag = (_event: DraggableEvent, data: DraggableData) => {
    onChange({ x: Math.max(0, data.x), y: Math.max(0, data.y) });
  };
  const onResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    onChange({
      width: Math.max(40, image.width + delta.width),
      height: Math.max(40, image.height + delta.height)
    });
  };

  return (
    <Draggable nodeRef={ref} bounds="parent" position={{ x: image.x, y: image.y }} onDrag={onDrag}>
      <div
        ref={ref}
        className={`article-image-box ${selected ? 'selected' : ''}`}
        onMouseDown={event => {
          event.stopPropagation();
          onSelect();
        }}
      >
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
      </div>
    </Draggable>
  );
}

const styles = `
  :root{--paper:#ECE4CF;--paper-2:#E4DAC0;--navy:#15233E;--red:#9F3622;--muted:#6B6253;--green:#3c7a4e;--line:rgba(21,35,62,.16);--line-strong:rgba(21,35,62,.32);}
  body{background:#111827;color:#F3F6FB;}
  .media-editor-page{width:min(1800px,calc(100% - clamp(28px,4vw,80px)));margin:0 auto;padding:56px 0 90px;color:#F3F6FB;font-family:'Spectral',Georgia,serif;}
  .media-editor-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:32px;flex-wrap:wrap;}
  .media-editor-page .eyebrow{font-family:'Space Mono';font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:10px;}
  .media-editor-page h1{font-family:'Anton';font-size:clamp(40px,6vw,72px);text-transform:uppercase;line-height:.9;margin:0 0 10px;color:#F3F6FB;}
  .media-editor-page .subtitle,.media-editor-page .desc{font-family:'Space Mono';font-size:12px;letter-spacing:1px;color:#8EA4C9;text-transform:uppercase;}
  .media-editor-toggle{display:flex;border:1px solid rgba(232,237,247,.8);}
  .media-editor-toggle button{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1.5px;padding:12px 24px;border:0;background:transparent;color:#AFC0DA;cursor:pointer;}
  .media-editor-toggle button.active{background:#F3F6FB;color:#111827;}
  .media-editor-panel{background:#15233E!important;border:1px solid rgba(232,237,247,.22)!important;padding:28px;margin-bottom:24px;color:#F3F6FB;box-shadow:0 16px 36px rgba(0,0,0,.22);}
  .media-editor-panel h2{font-family:'Oswald';font-weight:700;font-size:22px;text-transform:uppercase;margin:0 0 6px;color:#F3F6FB;}
  .media-editor-panel .desc{color:#8EA4C9;}
  .media-editor-page .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0;}
  .form-grid .full{grid-column:1/-1;}
  .media-editor-page label{font-family:'Space Mono';font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8EA4C9;display:flex;flex-direction:column;gap:7px;}
  .media-editor-page input,.media-editor-page select,.media-editor-page textarea{width:100%;background:#111827;border:1px solid rgba(142,164,201,.42);color:#F3F6FB;font-family:'Oswald';font-weight:500;font-size:15px;padding:11px 14px;box-sizing:border-box;}
  .media-editor-page textarea{min-height:520px;font-family:'Spectral',Georgia,serif;font-size:16px;line-height:1.6;resize:vertical;}
  .media-editor-page input:focus,.media-editor-page select:focus,.media-editor-page textarea:focus{outline:none;border-color:#F3F6FB;}
  .thumb-preview{width:240px;max-width:100%;height:auto;max-height:150px;object-fit:contain;border:1px solid var(--line-strong);display:block;margin:14px 0;}
  .composer-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:22px 0 12px;}
  .composer-toolbar button,.image-upload-button{appearance:none;border:0;background:transparent;color:#8EA4C9;font-family:'Space Mono';font-size:11px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;padding:3px 0;border-bottom:1px solid transparent;}
  .composer-toolbar button:hover,.image-upload-button:hover{color:#F3F6FB;border-bottom-color:#F3F6FB;}
  .image-upload-button input{display:none;}
  .media-editor-page .composer-grid{display:grid;grid-template-columns:minmax(420px,0.92fr) minmax(560px,1.08fr);gap:18px;align-items:start;margin-bottom:20px;}
  .media-editor-page .article-stage{position:relative;min-height:620px;background:#111827;border:1px solid rgba(142,164,201,.42);padding:20px;overflow:hidden;}
  .article-stage-text{font-size:17px;line-height:1.7;pointer-events:none;}
  .article-stage-text p{margin:0 0 18px;}
  .article-image-box{position:absolute;line-height:0;cursor:move;z-index:5;}
  .article-image-box.selected{outline:2px solid #D85A3A;outline-offset:3px;}
  .article-image-box img{display:block;width:100%;height:100%;object-fit:contain;border:1px solid rgba(142,164,201,.42);background:rgba(255,255,255,.04);user-select:none;pointer-events:none;}
  .image-remove{position:absolute;right:-10px;top:-10px;width:22px;height:22px;border:2px solid #111827;background:var(--red);color:var(--paper);font-family:'Space Mono';font-size:12px;line-height:16px;cursor:pointer;z-index:8;}
  .image-inspector{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:0 0 20px;font-family:'Space Mono';font-size:11px;text-transform:uppercase;color:var(--muted);}
  .image-inspector label{min-width:260px;}
  .btn{font-family:'Oswald';font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:2px;padding:13px 26px;cursor:pointer;border:2px solid var(--navy);transition:all .2s;text-decoration:none;display:inline-flex;}
  .btn-solid{background:var(--navy);color:var(--paper);}
  .btn-solid:hover{background:var(--red);border-color:var(--red);}
  .btn-danger{background:none;color:var(--red);border-color:var(--red);font-family:'Space Mono';font-size:11px;letter-spacing:1px;padding:7px 14px;}
  .btn-danger:hover{background:var(--red);color:var(--paper);}
  .btn:disabled{opacity:.4;cursor:not-allowed;}
  .msg{font-family:'Space Mono';font-size:12px;padding:10px 14px;margin-bottom:16px;}
  .msg.ok{background:rgba(60,122,78,.14);color:var(--green);}
  .msg.err{background:rgba(159,54,34,.12);color:var(--red);}
  .item-list{display:flex;flex-direction:column;gap:0;}
  .item-row{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid rgba(142,164,201,.22);}
  .item-thumb,.item-thumb-placeholder{width:80px;height:46px;object-fit:cover;flex-shrink:0;border:1px solid var(--line);}
  .item-thumb-placeholder{background:var(--navy);display:flex;align-items:center;justify-content:center;font-family:'Anton';font-size:13px;color:rgba(255,255,255,.35);}
  .item-info{flex:1;display:grid;gap:6px;}
  .it{font-family:'Oswald';font-weight:700;font-size:15px;text-transform:uppercase;line-height:1.2;color:#F3F6FB;}
  .im,.game-link-pill{font-family:'Space Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
  .game-link-pill{color:var(--green);text-decoration:none;}
  .empty{font-style:italic;color:var(--muted);padding:20px 0;}
  .gate{text-align:center;}
  @media(max-width:900px){.form-grid,.composer-grid{grid-template-columns:1fr;}.article-stage{min-height:520px;}}
`;
