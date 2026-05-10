import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';
import {
  completeMeetingAiSummary,
  failMeetingAiSummary,
  listPendingMeetingAiSummaries,
  type MeetingAiSummaryFailureCode,
  type MeetingSummaryOutput,
  type PendingMeetingAiSummary,
} from '@/lib/data/meeting-ai-summaries';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

const OPENAI_API_URL = 'https://api.openai.com/v1';
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const DEFAULT_SUMMARY_MODEL = 'gpt-4.1-mini';
const DEFAULT_MAX_RECORDING_BYTES = 25 * 1024 * 1024;

const providerPayloadSchema = z.object({
  summary: z.string().trim().min(1).max(10_000),
  decisions: z.array(z.string().trim().min(1).max(500)).max(25).default([]),
  action_items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(180),
        owner_label: z.string().trim().min(1).max(120).nullable().default(null),
        due_date: z.string().trim().min(1).max(40).nullable().default(null),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
        source_quote: z.string().trim().max(240).nullable().default(null),
      }),
    )
    .max(50)
    .default([]),
  risks_or_followups: z.array(z.string().trim().min(1).max(500)).max(25).default([]),
  language: z.string().trim().min(2).max(32),
});

export type MeetingSummaryProvider = {
  processRecording(input: { recordingUrl: string | null }): Promise<MeetingSummaryOutput>;
};

export class MeetingAiProviderError extends Error {
  code: MeetingAiSummaryFailureCode;

  constructor(code: MeetingAiSummaryFailureCode, message: string) {
    super(message);
    this.name = 'MeetingAiProviderError';
    this.code = code;
  }
}

export function validateMeetingSummaryPayload(
  payload: unknown,
  meta: {
    transcriptText?: string;
    provider?: string;
    model?: string;
  } = {},
): { ok: true; output: MeetingSummaryOutput } | { ok: false; code: 'INVALID_PROVIDER_OUTPUT' } {
  const parsed = providerPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, code: 'INVALID_PROVIDER_OUTPUT' };
  return {
    ok: true,
    output: {
      transcriptText: meta.transcriptText ?? 'Transcript unavailable.',
      summaryText: parsed.data.summary,
      decisions: parsed.data.decisions,
      actionItems: parsed.data.action_items,
      risksOrFollowups: parsed.data.risks_or_followups,
      language: parsed.data.language,
      provider: meta.provider ?? 'openai',
      model: meta.model ?? DEFAULT_SUMMARY_MODEL,
    },
  };
}

function parseMaxRecordingBytes(value: string | undefined): number {
  if (!value) return DEFAULT_MAX_RECORDING_BYTES;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_RECORDING_BYTES;
}

function extractTextFromResponsesPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText === 'string') return outputText;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = (item as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = (part as { text?: unknown })?.text;
      if (typeof text === 'string') return text;
    }
  }
  return null;
}

export function createOpenAiMeetingSummaryProvider(opts: {
  fetchImpl?: typeof fetch;
  maxRecordingBytes?: number;
  transcriptionModel?: string;
  summaryModel?: string;
} = {}): MeetingSummaryProvider {
  const fetcher = opts.fetchImpl ?? fetch;
  const transcriptionModel = opts.transcriptionModel ?? env.OPENAI_TRANSCRIPTION_MODEL ?? DEFAULT_TRANSCRIPTION_MODEL;
  const summaryModel = opts.summaryModel ?? env.OPENAI_SUMMARY_MODEL ?? DEFAULT_SUMMARY_MODEL;
  const maxRecordingBytes = opts.maxRecordingBytes ?? parseMaxRecordingBytes(env.MEETING_AI_MAX_RECORDING_BYTES);

  return {
    async processRecording(input) {
      const apiKey = process.env.OPENAI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        throw new MeetingAiProviderError('PROVIDER_NOT_CONFIGURED', 'OpenAI is not configured for meeting summaries.');
      }
      if (!input.recordingUrl) {
        throw new MeetingAiProviderError('RECORDING_NOT_FOUND', 'Recording is not available for transcription.');
      }

      const recording = await fetcher(input.recordingUrl);
      if (!recording.ok) {
        throw new MeetingAiProviderError('RECORDING_NOT_FOUND', 'Recording could not be downloaded.');
      }
      const bytes = new Uint8Array(await recording.arrayBuffer());
      if (bytes.byteLength > maxRecordingBytes) {
        throw new MeetingAiProviderError('RECORDING_TOO_LARGE', 'Recording exceeds the configured AI transcription limit.');
      }

      const form = new FormData();
      form.append('model', transcriptionModel);
      form.append('file', new Blob([bytes], { type: recording.headers.get('content-type') ?? 'video/mp4' }), 'recording.mp4');
      const transcriptionResponse = await fetcher(`${OPENAI_API_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!transcriptionResponse.ok) {
        throw new MeetingAiProviderError('TRANSCRIPTION_FAILED', 'Recording transcription failed.');
      }
      const transcription = (await transcriptionResponse.json()) as { text?: unknown };
      if (typeof transcription.text !== 'string' || !transcription.text.trim()) {
        throw new MeetingAiProviderError('TRANSCRIPTION_FAILED', 'Transcription response was empty.');
      }

      const summaryResponse = await fetcher(`${OPENAI_API_URL}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: summaryModel,
          input: [
            {
              role: 'system',
              content:
                'Summarize UAE PRO consultation transcripts into concise operational notes. Return only JSON matching the schema.',
            },
            { role: 'user', content: transcription.text },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'meeting_summary',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['summary', 'decisions', 'action_items', 'risks_or_followups', 'language'],
                properties: {
                  summary: { type: 'string' },
                  decisions: { type: 'array', items: { type: 'string' } },
                  action_items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['title', 'owner_label', 'due_date', 'priority', 'source_quote'],
                      properties: {
                        title: { type: 'string' },
                        owner_label: { type: ['string', 'null'] },
                        due_date: { type: ['string', 'null'] },
                        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                        source_quote: { type: ['string', 'null'] },
                      },
                    },
                  },
                  risks_or_followups: { type: 'array', items: { type: 'string' } },
                  language: { type: 'string' },
                },
              },
            },
          },
        }),
      });
      if (!summaryResponse.ok) {
        throw new MeetingAiProviderError('SUMMARY_FAILED', 'Transcript summarization failed.');
      }

      const rawText = extractTextFromResponsesPayload(await summaryResponse.json());
      if (!rawText) {
        throw new MeetingAiProviderError('INVALID_PROVIDER_OUTPUT', 'Summary response was empty.');
      }
      const parsedJson = JSON.parse(rawText) as unknown;
      const validated = validateMeetingSummaryPayload(parsedJson, {
        transcriptText: transcription.text,
        provider: 'openai',
        model: summaryModel,
      });
      if (!validated.ok) {
        throw new MeetingAiProviderError('INVALID_PROVIDER_OUTPUT', 'Summary response did not match schema.');
      }
      return validated.output;
    },
  };
}

async function signedRecordingUrl(job: PendingMeetingAiSummary): Promise<string | null> {
  if (job.recordingUrl) return job.recordingUrl;
  if (!job.recordingStoragePath) return null;
  const { data, error } = await createSupabaseServiceRoleClient()
    .storage
    .from('tenant-meetings')
    .createSignedUrl(job.recordingStoragePath, 300);
  if (error) return null;
  return data.signedUrl;
}

export async function processPendingMeetingAiSummaries(opts: {
  batchSize?: number;
  provider?: MeetingSummaryProvider;
  listPending?: typeof listPendingMeetingAiSummaries;
  complete?: typeof completeMeetingAiSummary;
  fail?: typeof failMeetingAiSummary;
} = {}): Promise<{ processed: number; completed: number; failed: number }> {
  const listPending = opts.listPending ?? listPendingMeetingAiSummaries;
  const complete = opts.complete ?? completeMeetingAiSummary;
  const fail = opts.fail ?? failMeetingAiSummary;
  const provider = opts.provider ?? createOpenAiMeetingSummaryProvider();
  const jobs = await listPending(opts.batchSize ?? 5);
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const output = await provider.processRecording({
        recordingUrl: await signedRecordingUrl(job),
      });
      await complete(job.id, output);
      completed++;
    } catch (error) {
      const code =
        error instanceof MeetingAiProviderError
          ? error.code
          : error instanceof SyntaxError
            ? 'INVALID_PROVIDER_OUTPUT'
            : 'INTERNAL';
      await fail(job.id, code);
      failed++;
    }
  }

  return { processed: jobs.length, completed, failed };
}
