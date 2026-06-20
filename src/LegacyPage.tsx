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

export function LegacyPage({ page }: LegacyPageProps) {
  useEffect(() => {
    let cancelled = false;
    const mountedScripts: HTMLScriptElement[] = [];

    document.title = page.title;

    async function runScripts() {
      for (const script of page.scripts) {
        if (cancelled) return;
        const mounted = await runScript(script);
        mountedScripts.push(mounted);
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
      <div dangerouslySetInnerHTML={{ __html: page.body }} />
    </>
  );
}
