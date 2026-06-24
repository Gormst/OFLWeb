const navItems = [
  ['/', 'Home'],
  ['/schedule', 'Schedule'],
  ['/standings', 'Standings'],
  ['/stats', 'Stats'],
  ['/teams', 'Teams'],
  ['/players', 'Players'],
  ['/media', 'Media']
] as const;

const legalItems = [
  ['/privacy-policy', 'Privacy Policy'],
  ['/terms-of-service', 'Terms of Service']
] as const;

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function SharedFooter() {
  return (
    <>
      <style>{`
        .ofl-shared-footer{flex:0 0 auto;background:var(--paper-2,#E4DAC0);color:var(--navy,#15233E);border-top:1px solid var(--line-strong);padding:46px 0 34px;margin-top:34px;}
        .ofl-shared-footer .wrap.footer-inner{width:min(1800px,calc(100% - clamp(28px,4vw,80px)));max-width:1800px;min-width:0;margin:0 auto;padding:0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:center;}
        .ofl-shared-footer .footer-brand{display:flex;align-items:center;gap:16px;min-width:0;}
        .ofl-shared-footer .footer-brand img{width:44px;height:44px;object-fit:contain;flex:0 0 auto;}
        .ofl-shared-footer .footer-title{font-family:'Oswald';font-weight:700;font-size:20px;text-transform:uppercase;letter-spacing:.8px;line-height:1;}
        .ofl-shared-footer .footer-copy{font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:7px;}
        .ofl-shared-footer .footer-social{display:flex;align-items:center;justify-content:flex-end;gap:14px;flex-wrap:wrap;}
        .ofl-shared-footer .footer-social-link{width:44px;height:44px;border:1px solid var(--line-strong);display:flex;align-items:center;justify-content:center;color:var(--navy);background:transparent;transition:background .16s,border-color .16s,color .16s;}
        .ofl-shared-footer .footer-social-link:hover{background:var(--red,#9F3622);border-color:var(--red,#9F3622);color:#fff;}
        .ofl-shared-footer .footer-social-link svg{width:23px;height:23px;}
        .ofl-shared-footer .footer-social-link img{width:24px;height:24px;object-fit:contain;display:block;}
        .ofl-shared-footer .footer-links{grid-column:1/-1;display:flex;gap:18px;flex-wrap:wrap;padding-top:18px;border-top:1px solid var(--line);font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
        .ofl-shared-footer .footer-links a{color:inherit;text-decoration:none;}
        .ofl-shared-footer .footer-links a:hover{color:var(--red);}
        @media(max-width:700px){.ofl-shared-footer .wrap.footer-inner{grid-template-columns:1fr;}.ofl-shared-footer .footer-social{justify-content:flex-start;}.ofl-shared-footer .footer-links{gap:12px;}}
      `}</style>
      <footer className="ofl-shared-footer">
        <div className="wrap footer-inner">
          <div className="footer-brand">
            <img src="/logos/league.png" alt="OFL" />
            <div>
              <div className="footer-title">OFL Network</div>
              <div className="footer-copy">Season 48 coverage, stats, media, and league tools.</div>
            </div>
          </div>
          <div className="footer-social" aria-label="OFL social links">
            <a className="footer-social-link" href="https://discord.gg/8sktYMawP" target="_blank" rel="noopener" aria-label="Discord Server">
              <DiscordIcon />
            </a>
            <a className="footer-social-link roblox-social-link" href="https://www.roblox.com/communities/988829/OFL-Old-Football-League#!/about" target="_blank" rel="noopener" aria-label="Roblox Group">
              <img src="/logos/roblox-logo.png" alt="Roblox" />
            </a>
          </div>
          <div className="footer-links">
            {navItems.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
            {legalItems.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
