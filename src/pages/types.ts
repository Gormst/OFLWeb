export type LegacyScript = { src: string | null; code: string };

export type LegacyPageData = {
  file: string;
  title: string;
  styles: string;
  body: string;
  scripts: LegacyScript[];
};
