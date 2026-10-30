'use client';

import { useActionState, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type ActionResult = { ok: true; data: void } | { ok: false; error: string; code: string };
type Action = (formData: FormData) => Promise<ActionResult>;

export type DefinitionVersionView = {
  version: number;
  state: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
};

export type QuestionnaireEditorProps = {
  definitionKey: string;
  definitionId: string | null;
  title: string;
  rowVersion: number;
  draftJson: string;
  versions: DefinitionVersionView[];
  saveAction: Action;
  publishAction: Action;
  archiveAction: Action;
  labels: {
    key: string;
    title: string;
    definition: string;
    preview: string;
    save: string;
    publish: string;
    archive: string;
    versions: string;
    invalidJson: string;
    savedHint: string;
  };
};

const STATE_VARIANT = {
  draft: 'secondary',
  published: 'default',
  archived: 'outline',
} as const;

export function QuestionnaireDefinitionEditor(props: QuestionnaireEditorProps) {
  const [json, setJson] = useState(props.draftJson);
  const [saveState, saveFormAction, saving] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => props.saveAction(formData),
    null,
  );

  const preview = useMemo(() => parsePreview(json), [json]);

  const publish = async (formData: FormData) => {
    await props.publishAction(formData);
  };
  const archive = async (formData: FormData) => {
    await props.archiveAction(formData);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{props.labels.definition}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveFormAction} className="space-y-4">
            <input type="hidden" name="key" value={props.definitionKey} />
            <input type="hidden" name="expectedVersion" value={props.rowVersion} />
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="q-title">
                {props.labels.title}
              </label>
              <Input id="q-title" name="title" defaultValue={props.title} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="q-definition">
                {props.labels.definition}
              </label>
              <Textarea
                id="q-definition"
                name="definition"
                value={json}
                onChange={(event) => setJson(event.target.value)}
                rows={22}
                spellCheck={false}
                className="font-mono text-xs"
                aria-describedby="q-definition-status"
              />
            </div>
            <div id="q-definition-status" aria-live="polite" className="text-sm">
              {!preview.ok ? <p className="text-destructive">{props.labels.invalidJson}</p> : null}
              {saveState && !saveState.ok ? (
                <p className="text-destructive">{saveState.error}</p>
              ) : null}
              {saveState && saveState.ok ? (
                <p className="text-muted-foreground">{props.labels.savedHint}</p>
              ) : null}
            </div>
            <Button type="submit" disabled={saving || !preview.ok}>
              {props.labels.save}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{props.labels.preview}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {preview.ok ? (
              preview.sections.map((section) => (
                <div key={section.id}>
                  <p className="font-medium">{section.title}</p>
                  <ul className="text-muted-foreground list-disc pl-5">
                    {section.fields.map((field) => (
                      <li key={field.id}>
                        {field.label}{' '}
                        <span className="text-xs">
                          ({field.type}
                          {field.required ? ', required' : ''}
                          {field.conditional ? ', conditional' : ''})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">{props.labels.invalidJson}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{props.labels.versions}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {props.versions.map((version) => (
              <div key={version.version} className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  v{version.version}{' '}
                  <Badge variant={STATE_VARIANT[version.state]}>{version.state}</Badge>
                </span>
                {props.definitionId && version.state === 'draft' ? (
                  <form action={publish}>
                    <input type="hidden" name="definitionId" value={props.definitionId} />
                    <input type="hidden" name="version" value={version.version} />
                    <input type="hidden" name="expectedVersion" value={props.rowVersion} />
                    <Button type="submit" size="sm">
                      {props.labels.publish}
                    </Button>
                  </form>
                ) : null}
                {props.definitionId && version.state === 'published' ? (
                  <form action={archive}>
                    <input type="hidden" name="definitionId" value={props.definitionId} />
                    <input type="hidden" name="version" value={version.version} />
                    <input type="hidden" name="expectedVersion" value={props.rowVersion} />
                    <Button type="submit" size="sm" variant="outline">
                      {props.labels.archive}
                    </Button>
                  </form>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type PreviewField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  conditional: boolean;
};
type PreviewSection = { id: string; title: string; fields: PreviewField[] };
type PreviewResult = { ok: true; sections: PreviewSection[] } | { ok: false };

function parsePreview(json: string): PreviewResult {
  try {
    const parsed = JSON.parse(json) as {
      sections?: Array<{
        id?: string;
        title?: string;
        fields?: Array<{
          id?: string;
          label?: string;
          type?: string;
          required?: boolean;
          visibleWhen?: unknown;
        }>;
      }>;
    };
    if (!Array.isArray(parsed.sections)) return { ok: false };
    return {
      ok: true,
      sections: parsed.sections.map((section, sectionIndex) => ({
        id: section.id ?? `section-${sectionIndex}`,
        title: section.title ?? `Section ${sectionIndex + 1}`,
        fields: (section.fields ?? []).map((field, fieldIndex) => ({
          id: field.id ?? `field-${sectionIndex}-${fieldIndex}`,
          label: field.label ?? field.id ?? `Field ${fieldIndex + 1}`,
          type: field.type ?? 'text',
          required: Boolean(field.required),
          conditional: field.visibleWhen != null,
        })),
      })),
    };
  } catch {
    return { ok: false };
  }
}
