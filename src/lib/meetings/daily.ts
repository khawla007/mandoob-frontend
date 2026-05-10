import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/errors';

const DAILY_API_URL = 'https://api.daily.co/v1';

export type DailyRoom = {
  name: string;
  url: string;
};

export type DailyRecording = {
  id: string;
  downloadUrl: string;
  mimeType: string;
};

export type DailyWebhookEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export type CreateDailyRoomInput = {
  meetingId: string;
  startsAt: string;
  durationMinutes: number;
  fetchImpl?: typeof fetch;
};

function requireDailyApiKey(): string {
  const key = process.env.DAILY_API_KEY?.trim();
  if (!key) {
    throw new ApiError(
      'DAILY_NOT_CONFIGURED',
      'Daily.co is not configured for meeting rooms.',
      503,
    );
  }
  return key;
}

function roomNameForMeeting(meetingId: string): string {
  return `mandoob-${meetingId}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
}

export async function createDailyRoom(input: CreateDailyRoomInput): Promise<DailyRoom> {
  const apiKey = requireDailyApiKey();
  const fetcher = input.fetchImpl ?? fetch;
  const starts = Math.floor(new Date(input.startsAt).getTime() / 1000);
  const expires = starts + input.durationMinutes * 60 + 30 * 60;
  const response = await fetcher(`${DAILY_API_URL}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: roomNameForMeeting(input.meetingId),
      privacy: 'private',
      properties: {
        enable_recording: 'cloud',
        enable_prejoin_ui: true,
        exp: expires,
        nbf: starts - 15 * 60,
        start_audio_off: true,
        start_video_off: false,
      },
    }),
  });

  if (!response.ok) {
    throw new ApiError('DAILY_ROOM_FAILED', 'Could not create Daily.co room.', 502, {
      status: response.status,
    });
  }

  const data = (await response.json()) as { name?: string; url?: string };
  if (!data.name || !data.url) {
    throw new ApiError('DAILY_ROOM_FAILED', 'Daily.co returned an invalid room response.', 502);
  }
  return { name: data.name, url: data.url };
}

export async function verifyDailyWebhook(request: Request): Promise<DailyWebhookEvent | null> {
  const secret = process.env.DAILY_WEBHOOK_SECRET?.trim();
  if (!secret) return null;

  const body = await request.text();
  const signature = request.headers.get('x-daily-signature') ?? request.headers.get('daily-signature');
  if (!signature) return null;

  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return null;
  }

  const parsed = JSON.parse(body) as DailyWebhookEvent;
  if (!parsed || typeof parsed.type !== 'string' || typeof parsed.payload !== 'object' || !parsed.payload) {
    return null;
  }
  return parsed;
}

export async function downloadDailyRecording(
  recordingId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DailyRecording> {
  const apiKey = requireDailyApiKey();
  const response = await fetchImpl(`${DAILY_API_URL}/recordings/${recordingId}/access-link`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new ApiError('DAILY_RECORDING_FAILED', 'Could not fetch Daily.co recording.', 502, {
      status: response.status,
    });
  }
  const data = (await response.json()) as { download_link?: string };
  if (!data.download_link) {
    throw new ApiError('DAILY_RECORDING_FAILED', 'Daily.co returned an invalid recording response.', 502);
  }
  return { id: recordingId, downloadUrl: data.download_link, mimeType: 'video/mp4' };
}
