import { useEffect } from 'react';

export default function TermsOfServicePage() {
  useEffect(() => {
    document.title = 'Terms of Service - OFL Network';
  }, []);

  return (
    <>
      <style>{`
        *{box-sizing:border-box;}
        body{background:var(--paper);color:var(--navy);font-family:'Spectral',Georgia,serif;min-height:100vh;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");}
        .legal-page{width:min(980px,calc(100% - clamp(28px,4vw,80px)));margin:0 auto;padding:70px 0 86px;}
        .legal-eyebrow{font-family:'Space Mono';font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:12px;}
        .legal-page h1{font-family:'Oswald';font-weight:700;font-size:clamp(40px,6vw,68px);text-transform:uppercase;line-height:.95;margin:0 0 12px;}
        .legal-updated{font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:38px;}
        .legal-intro{font-size:19px;line-height:1.65;color:var(--navy);max-width:780px;margin:0 0 36px;}
        .legal-section{border-top:1px solid var(--line-strong);padding:28px 0;}
        .legal-section h2{font-family:'Oswald';font-weight:700;font-size:25px;text-transform:uppercase;line-height:1;margin:0 0 12px;}
        .legal-section p,.legal-section li{font-size:17px;line-height:1.65;color:var(--navy);}
        .legal-section p{margin:0 0 12px;}
        .legal-section ul{margin:0;padding-left:22px;}
        .legal-section li{margin-bottom:8px;}
        .legal-contact{background:var(--paper-2);border:1px solid var(--line-strong);padding:22px 24px;margin-top:10px;}
        .legal-contact p{margin:0;}
      `}</style>
      <main className="legal-page">
        <div className="legal-eyebrow">// Legal</div>
        <h1>Terms Of Service</h1>
        <div className="legal-updated">Last updated June 22, 2026</div>
        <p className="legal-intro">
          These terms govern access to and use of OFL Network. By using the site, you agree to follow these terms
          and the rules of the Old Football League community.
        </p>

        <section className="legal-section">
          <h2>Use Of The Site</h2>
          <p>OFL Network is provided for league information, media, statistics, account verification, and administrative workflows. You agree to use the site only for lawful and league-appropriate purposes.</p>
        </section>

        <section className="legal-section">
          <h2>Accounts</h2>
          <ul>
            <li>You are responsible for activity tied to your verified account and for keeping access tokens and devices secure.</li>
            <li>You may not impersonate another player, staff member, team, or community member.</li>
            <li>Staff may limit, suspend, or revoke access to account or admin features when needed to protect the league or site.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>League Content</h2>
          <p>Stats, standings, schedules, transactions, articles, videos, logos, and similar materials may be edited, corrected, removed, or archived by league staff.</p>
          <p>If you submit media, articles, images, links, or other content, you confirm you have the right to share it and allow OFL Network to display it in connection with league coverage.</p>
        </section>

        <section className="legal-section">
          <h2>Prohibited Conduct</h2>
          <ul>
            <li>Do not attempt to bypass authentication, access admin tools without permission, scrape private endpoints, or disrupt site operations.</li>
            <li>Do not upload or submit malicious code, spam, abusive content, or content that violates another platform's rules.</li>
            <li>Do not manipulate league records or submit false information through roster, schedule, media, or stats tools.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Third-Party Services</h2>
          <p>OFL Network may link to or integrate with third-party services such as Roblox, Discord, Twitch, YouTube, hosting providers, and database providers. Their own terms and policies apply to those services.</p>
        </section>

        <section className="legal-section">
          <h2>Availability And Accuracy</h2>
          <p>The site is provided as-is. We work to keep information accurate and available, but league data, media, and tools may contain mistakes, delays, outages, or changes.</p>
        </section>

        <section className="legal-section">
          <h2>Changes To Terms</h2>
          <p>We may update these terms as the site and league needs change. Continued use after updates means you accept the revised terms.</p>
        </section>

        <section className="legal-contact">
          <p>Questions about these terms can be directed to OFL staff through the official Discord server linked in the footer.</p>
        </section>
      </main>
    </>
  );
}
