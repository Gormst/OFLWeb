import { useEffect } from 'react';

export default function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = 'Privacy Policy - OFL Network';
  }, []);

  return (
    <>
      <style>{`
        :root{--paper:#ECE4CF;--paper-2:#E4DAC0;--navy:#15233E;--red:#9F3622;--muted:#6B6253;--line:rgba(21,35,62,.16);--line-strong:rgba(21,35,62,.32);}
        *{box-sizing:border-box;}
        body{background:var(--paper);color:var(--navy);font-family:'Spectral',Georgia,serif;min-height:100vh;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");}
        .legal-page{width:min(980px,calc(100% - clamp(28px,4vw,80px)));margin:0 auto;padding:70px 0 86px;}
        .legal-eyebrow{font-family:'Space Mono';font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:12px;}
        .legal-page h1{font-family:'Oswald';font-weight:700;font-size:clamp(40px,6vw,68px);text-transform:uppercase;line-height:.95;margin:0 0 12px;}
        .legal-updated{font-family:'Space Mono';font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:38px;}
        .legal-intro{font-size:19px;line-height:1.65;color:var(--navy);max-width:780px;margin:0 0 36px;}
        .legal-section{border-top:1px solid var(--line-strong);padding:28px 0;}
        .legal-section h2{font-family:'Oswald';font-weight:700;font-size:25px;text-transform:uppercase;line-height:1;margin:0 0 12px;}
        .legal-section p,.legal-section li{font-size:17px;line-height:1.65;color:var(--navy);}
        .legal-section p{margin:0 0 12px;}
        .legal-section ul{margin:0;padding-left:22px;}
        .legal-section li{margin-bottom:8px;}
        .legal-contact{background:var(--paper-2);border:1px solid var(--line-strong);padding:22px 24px;margin-top:10px;}
        .legal-contact p{margin:0;}
        .legal-contact a{color:var(--red);text-decoration:none;border-bottom:1px solid currentColor;}
      `}</style>
      <main className="legal-page">
        <div className="legal-eyebrow">// Legal</div>
        <h1>Privacy Policy</h1>
        <div className="legal-updated">Last updated June 22, 2026</div>
        <p className="legal-intro">
          OFL Network provides league coverage, stats, media, account tools, and administrative features for the
          Old Football League community. This policy explains what information we collect and how we use it.
        </p>

        <section className="legal-section">
          <h2>Information We Collect</h2>
          <ul>
            <li>Account details you provide or verify, including Roblox usernames, profile identifiers, avatars, and verification status.</li>
            <li>League activity data, including team assignments, roster moves, stats, standings, game information, articles, and media submissions.</li>
            <li>Basic technical information needed to operate the site, such as requests, browser information, device data, and approximate timestamps.</li>
            <li>Administrative or support messages you send through league tools or connected community channels.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>How We Use Information</h2>
          <p>We use information to run the site, verify accounts, display league records, publish media, prevent abuse, troubleshoot errors, and support commissioner or staff workflows.</p>
          <p>We may also use aggregated or non-identifying information to understand site performance and improve league tools.</p>
        </section>

        <section className="legal-section">
          <h2>Sharing</h2>
          <p>Public league information may appear on OFL Network pages, including player names, team affiliation, statistics, transactions, media credits, and article bylines.</p>
          <p>We do not sell personal information. We may share information when needed to operate hosting, databases, analytics, moderation, security, or when required by law.</p>
        </section>

        <section className="legal-section">
          <h2>Cookies And Storage</h2>
          <p>The site may use browser storage, authentication tokens, cookies, and similar technologies to keep you signed in, remember settings, and protect account features.</p>
        </section>

        <section className="legal-section">
          <h2>Data Choices</h2>
          <p>You can disconnect or update your account information through available profile tools where supported. For league records that are part of official competition history, we may retain public archival information.</p>
        </section>

        <section className="legal-section">
          <h2>Children And Community Platforms</h2>
          <p>OFL Network is connected to community activity on third-party platforms such as Roblox and Discord. Those platforms have their own privacy practices and account rules.</p>
        </section>

        <section className="legal-section">
          <h2>Changes</h2>
          <p>We may update this policy as the site and league tools evolve. The updated date above will change when material revisions are made.</p>
        </section>

        <section className="legal-contact">
          <p>Questions about this policy can be directed to OFL staff through the official Discord server linked in the footer.</p>
        </section>
      </main>
    </>
  );
}
