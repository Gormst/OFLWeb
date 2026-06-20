import { createRoot } from 'react-dom/client';
import { App } from './App';

const themeStyle = document.createElement('style');
themeStyle.textContent = `
  body[data-theme="dark"]{
    --paper:#111827;
    --paper-2:#182235;
    --navy:#F3F6FB;
    --red:#E36D4F;
    --red-bright:#FF815F;
    --muted:#9AA7B8;
    --green:#72C18A;
    --line:rgba(243,246,251,.14);
    --line-strong:rgba(243,246,251,.28);
    --promote:rgba(114,193,138,.16);
    --remain:rgba(243,246,251,.07);
    --demote:rgba(227,109,79,.14);
    background-image:none;
  }
  body[data-theme="dark"] input,
  body[data-theme="dark"] textarea,
  body[data-theme="dark"] select{color-scheme:dark;}
`;
document.head.appendChild(themeStyle);

function applySavedTheme() {
  try {
    const profile = JSON.parse(localStorage.getItem('ofl_profile') || 'null');
    document.body.dataset.theme = profile?.theme_preference === 'dark' ? 'dark' : 'light';
  } catch {
    document.body.dataset.theme = 'light';
  }
}

applySavedTheme();
window.addEventListener('storage', (event) => {
  if (event.key === 'ofl_profile') applySavedTheme();
});
(window as unknown as { applyOflTheme?: () => void }).applyOflTheme = applySavedTheme;

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(<App />);
