import type { PageHeroSettings } from '@/lib/validation/pages';

export const DEFAULT_HERO: PageHeroSettings = {
  backgroundColor: '#ffffff', overlayColor: '#000000', overlayOpacity: 0,
  headingAlignment: 'center', textAlignment: 'center', buttonAlignment: 'center',
  backgroundImageUrl: null, heading: null, text: null, buttonLabel: null, buttonHref: null,
  minHeight: '', maxWidth: '', padding: '', margin: '',
};

export type HeroEditorState = { settings: PageHeroSettings; mediaId: string | null; previewUrl: string | null };

export function createHeroState(settings: Partial<PageHeroSettings> = {}, mediaId: string | null = null, previewUrl: string | null = null): HeroEditorState {
  return { settings: { ...DEFAULT_HERO, ...settings, backgroundImageUrl: previewUrl ?? settings.backgroundImageUrl ?? null }, mediaId, previewUrl: previewUrl ?? settings.backgroundImageUrl ?? null };
}

export function updateHeroField<K extends keyof PageHeroSettings>(state: HeroEditorState, key: K, value: PageHeroSettings[K]): HeroEditorState {
  return { ...state, settings: { ...state.settings, [key]: value } };
}

export function serializeHeroState(state: HeroEditorState): string { return JSON.stringify(state.settings); }

export function clampAdminPage(raw: string | string[] | undefined, total: number, pageSize: number): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? '1', 10);
  const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
}

export function pageHref(page: number): string { return page <= 1 ? '/admin/pages' : `/admin/pages?page=${page}`; }
