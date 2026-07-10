'use client';

import type { PageHeroSettings as HeroSettings } from '@/lib/validation/pages';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeroMediaPicker } from './PageHeroMediaPicker';
import { serializeHeroState, updateHeroField, type HeroEditorState } from './admin-page-state';
export { createHeroState, serializeHeroState, updateHeroField } from './admin-page-state';

const alignments = ['left', 'center', 'right'] as const;
export function PageHeroSettings({ state, onChange }: { state: HeroEditorState; onChange: (state: HeroEditorState) => void }) {
  const field = <K extends keyof HeroSettings>(key: K, value: HeroSettings[K]) => onChange(updateHeroField(state, key, value));
  return <fieldset className="space-y-5"><legend className="sr-only">Hero section settings</legend>
    <input type="hidden" name="heroSettings" value={serializeHeroState(state)} readOnly />
    <input type="hidden" name="backgroundImageMediaId" value={state.mediaId ?? ''} readOnly />
    <div className="grid gap-4 sm:grid-cols-2"><F label="Heading" id="hero-heading"><Input id="hero-heading" value={state.settings.heading ?? ''} maxLength={180} onChange={e => field('heading', e.currentTarget.value || null)} /></F><F label="Text" id="hero-text"><Textarea id="hero-text" value={state.settings.text ?? ''} maxLength={1000} onChange={e => field('text', e.currentTarget.value || null)} /></F></div>
    <div className="grid gap-4 sm:grid-cols-2"><F label="Button label" id="hero-button-label"><Input id="hero-button-label" value={state.settings.buttonLabel ?? ''} onChange={e => field('buttonLabel', e.currentTarget.value || null)} /></F><F label="Button URL" id="hero-button-href"><Input id="hero-button-href" value={state.settings.buttonHref ?? ''} onChange={e => field('buttonHref', e.currentTarget.value || null)} /></F></div>
    <div className="grid gap-4 sm:grid-cols-3">{(['headingAlignment','textAlignment','buttonAlignment'] as const).map(key => <F key={key} label={key.replace('Alignment',' alignment')} id={`hero-${key}`}><select id={`hero-${key}`} value={state.settings[key]} onChange={e => field(key, e.currentTarget.value as typeof alignments[number])} className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm">{alignments.map(a => <option key={a}>{a}</option>)}</select></F>)}</div>
    <div className="grid gap-4 sm:grid-cols-3"><F label="Background color" id="hero-bg"><Input id="hero-bg" type="color" value={state.settings.backgroundColor} onChange={e => field('backgroundColor', e.currentTarget.value)} /></F><F label="Overlay color" id="hero-overlay"><Input id="hero-overlay" type="color" value={state.settings.overlayColor} onChange={e => field('overlayColor', e.currentTarget.value)} /></F><F label="Overlay opacity" id="hero-opacity"><Input id="hero-opacity" type="number" min="0" max="1" step="0.05" value={state.settings.overlayOpacity} onChange={e => field('overlayOpacity', Number(e.currentTarget.value))} /></F></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(['minHeight','maxWidth','padding','margin'] as const).map(key => <F key={key} label={key.replace(/([A-Z])/g,' $1')} id={`hero-${key}`}><Input id={`hero-${key}`} value={state.settings[key] ?? ''} placeholder={key === 'padding' || key === 'margin' ? '0 1rem' : 'auto'} onChange={e => field(key, e.currentTarget.value)} /></F>)}</div>
    <PageHeroMediaPicker media={{ id: state.mediaId, previewUrl: state.previewUrl }} onChange={media => onChange({ ...state, mediaId: media.id, previewUrl: media.previewUrl, settings: { ...state.settings, backgroundImageUrl: media.previewUrl } })} />
  </fieldset>;
}
function F({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div className="space-y-2"><Label htmlFor={id} className="capitalize">{label}</Label>{children}</div>; }
