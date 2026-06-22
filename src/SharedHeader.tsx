const navItems = [
  ['/', 'Home'],
  ['/schedule', 'Schedule'],
  ['/standings', 'Standings'],
  ['/stats', 'Stats'],
  ['/teams', 'Teams'],
  ['/players', 'Players'],
  ['/media', 'Media']
] as const;

function isActive(path: string, href: string) {
  if (href === '/') return path === '/' || path === '/index';
  return path === href || path.startsWith(`${href}/`);
}

export function SharedHeader() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  return (
    <>
      <style>{`
        .ofl-shared-header{position:sticky;top:0;z-index:1000;background:var(--paper,#ECE4CF);border-bottom:1px solid var(--navy,#15233E);}
        body[data-theme="dark"] .ofl-shared-header{background:#111827;border-bottom-color:rgba(142,164,201,.45);}
        .ofl-shared-header .wrap.nav{display:flex;align-items:center;justify-content:flex-start;gap:clamp(16px,2vw,28px);height:78px;width:100%;max-width:none;min-width:0;margin:0;padding:0 clamp(18px,2vw,28px) 0 18px;box-sizing:border-box;}
        .ofl-shared-header .brand{display:flex;align-items:center;gap:0;flex:0 0 auto;}
        .ofl-shared-header .brand img{height:44px;width:44px;object-fit:contain;display:block;}
        .ofl-shared-header .logo-fallback{height:44px;width:44px;border:2px solid var(--navy,#15233E);display:flex;align-items:center;justify-content:center;font-family:'Anton';font-size:15px;}
        .ofl-shared-header nav.links{display:flex;gap:clamp(16px,2vw,34px);margin-right:auto;align-items:center;min-width:0;}
        .ofl-shared-header nav.links a{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1.5px;padding:4px 0;position:relative;color:inherit;text-decoration:none;white-space:nowrap;}
        .ofl-shared-header nav.links a.active{color:var(--red,#9F3622);}
        .ofl-shared-header nav.links a::after{content:'';position:absolute;left:0;bottom:-2px;height:2px;width:0;background:var(--red,#9F3622);transition:width .25s;}
        .ofl-shared-header nav.links a:hover::after,.ofl-shared-header nav.links a.active::after{width:100%;}
        .ofl-shared-header .connect-btn{background:var(--navy,#15233E);color:var(--paper,#ECE4CF);font-family:'Oswald';font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:2px;padding:14px 24px;transition:background .2s;text-decoration:none;white-space:nowrap;}
        .ofl-shared-header .connect-btn:hover{background:var(--red,#9F3622);}
        .ofl-shared-header .account-wrap{position:relative;margin-left:0;margin-right:0;flex:0 0 auto;}
        .ofl-shared-header .account{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;}
        .ofl-shared-header .account img{width:38px;height:38px;border-radius:50%;border:2px solid var(--navy,#15233E);object-fit:cover;}
        body[data-theme="dark"] .ofl-shared-header .account img{border-color:#E8EDF7;}
        .ofl-shared-header .account .uname{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;}
        .ofl-shared-header .account .chev{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid currentColor;transition:transform .2s;}
        .ofl-shared-header .account-wrap.open .chev{transform:rotate(180deg);}
        .ofl-shared-header .dropdown{position:absolute;top:calc(100% + 12px);right:0;min-width:190px;background:var(--paper,#ECE4CF);border:1px solid var(--navy,#15233E);opacity:0;visibility:hidden;transform:translateY(-6px);transition:all .18s ease;box-shadow:0 14px 30px rgba(21,35,62,.16);}
        body[data-theme="dark"] .ofl-shared-header .dropdown{background:#111827;border-color:rgba(142,164,201,.55);}
        .ofl-shared-header .account-wrap.open .dropdown{opacity:1;visibility:visible;transform:none;}
        .ofl-shared-header .dropdown a{display:block;font-family:'Oswald';font-weight:500;font-size:14px;text-transform:uppercase;letter-spacing:1px;padding:14px 18px;border-bottom:1px solid rgba(21,35,62,.14);color:inherit;text-decoration:none;}
        body[data-theme="dark"] .ofl-shared-header .dropdown a{border-bottom-color:rgba(142,164,201,.22);}
        .ofl-shared-header .dropdown a:last-child{border-bottom:none;}
        .ofl-shared-header .dropdown a:hover{background:var(--navy,#15233E);color:var(--paper,#ECE4CF);}
        .ofl-shared-header .dropdown a.admin,.ofl-shared-header .dropdown a.logout{color:var(--red,#9F3622);}
        .ofl-shared-header .dropdown a.admin:hover,.ofl-shared-header .dropdown a.logout:hover{background:var(--red,#9F3622);color:var(--paper,#ECE4CF);}
        .ofl-shared-header .menu-toggle{display:none;background:none;border:none;cursor:pointer;margin-left:auto;color:inherit;}
        .ofl-shared-header .menu-toggle span{display:block;width:26px;height:2px;background:currentColor;margin:5px 0;}
        @media(max-width:1100px){.ofl-shared-header .account .uname{display:none;}.ofl-shared-header nav.links{gap:clamp(12px,1.5vw,22px);}}
        @media(max-width:940px){.ofl-shared-header nav.links,.ofl-shared-header .connect-btn,.ofl-shared-header .account-wrap{display:none;}.ofl-shared-header .menu-toggle{display:block;}}
      `}</style>
      <header className="ofl-shared-header">
        <div className="wrap nav">
          <a className="brand" href="/">
            <img
              src="/logos/league.png"
              alt="OFL"
              onError={(event) => {
                event.currentTarget.outerHTML = '<div class="logo-fallback">OFL</div>';
              }}
            />
          </a>
          <nav className="links">
            {navItems.map(([href, label]) => (
              <a key={href} href={href} className={isActive(path, href) ? 'active' : ''}>
                {label}
              </a>
            ))}
          </nav>
          <a href="/connect" className="connect-btn" id="connectBtn">Connect Account</a>
          <div className="account-wrap" id="accountWrap" style={{ display: 'none' }}>
            <div className="account" id="accountPill">
              <img id="accountAvatar" src="" alt="" />
              <span className="uname" id="accountName"></span>
              <span className="chev"></span>
            </div>
            <div className="dropdown">
              <a href="/profile">Profile</a>
              <a href="/profile?tab=settings">Settings</a>
              <a href="/media/editor" id="mediaEditorLink" style={{ display: 'none' }}>Media Editor</a>
              <a href="/admin" className="admin" id="adminLink" style={{ display: 'none' }}>Admin</a>
              <a href="#" className="logout" id="logoutBtn">Log Out</a>
            </div>
          </div>
          <button className="menu-toggle" aria-label="Menu" type="button">
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>
    </>
  );
}
