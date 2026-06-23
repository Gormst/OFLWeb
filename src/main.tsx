import { createRoot } from 'react-dom/client';
import { App } from './App';

const themeStyle = document.createElement('style');
themeStyle.textContent = `
  html,
  body,
  #root{
    min-height:100%;
  }
  body{
    min-height:100vh;
  }
  body[data-theme="light"]{
    --paper:#ECE4CF;
    --paper-2:#E4DAC0;
    --navy:#15233E;
    --red:#9F3622;
    --red-bright:#B23E26;
    --muted:#6B6253;
    --green:#3c7a4e;
    --line:rgba(21,35,62,.16);
    --line-strong:rgba(21,35,62,.32);
    --promote:rgba(60,122,78,.13);
    --remain:rgba(21,35,62,.06);
    --demote:rgba(159,54,34,.10);
    color:#15233E;
    color-scheme:light;
  }
  #root{
    display:flex;
    flex-direction:column;
    min-height:100vh;
  }
  .ofl-app-shell{
    display:flex;
    flex-direction:column;
    min-height:100vh;
    min-width:0;
  }
  .ofl-page-shell{
    flex:1 0 auto;
    min-width:0;
  }
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
  body[data-theme="light"] input,
  body[data-theme="light"] textarea,
  body[data-theme="light"] select{color-scheme:light;}
`;
document.head.appendChild(themeStyle);

function applySavedTheme() {
  let theme = localStorage.getItem('ofl_theme');
  if (!theme) {
    try {
      const profile = JSON.parse(localStorage.getItem('ofl_profile') || 'null');
      if (profile?.theme_preference === 'dark') {
        theme = 'dark';
        localStorage.setItem('ofl_theme', theme);
      }
    } catch {
      theme = null;
    }
  }
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = resolvedTheme;
  document.body.classList.toggle('theme-dark', resolvedTheme === 'dark');
  document.body.classList.toggle('theme-light', resolvedTheme === 'light');
}

applySavedTheme();
window.addEventListener('storage', (event) => {
  if (event.key === 'ofl_theme') applySavedTheme();
});
(window as unknown as { applyOflTheme?: () => void }).applyOflTheme = applySavedTheme;

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(<App />);
