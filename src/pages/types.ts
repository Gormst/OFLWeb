import type { ComponentType } from 'react';

export type LegacyScript = { src: string | null; code: string };

export type LegacyPageData = {
  file: string;
  title: string;
  styles: string;
  body: string;
  scripts: LegacyScript[];
};

export type PageModule = ComponentType | LegacyPageData;

export function isLegacyPageData(value: PageModule): value is LegacyPageData {
  return typeof value === 'object' && value !== null && 'body' in value && 'scripts' in value;
}
