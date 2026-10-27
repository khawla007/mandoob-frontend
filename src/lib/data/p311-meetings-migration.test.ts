import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260922110000_0109_p3_11_meetings_calendar.sql',
    import.meta.url,
  ),
  'utf8',
);

test('P3.11 migration owns concurrency, replay, consent, media and calendar contracts', () => {
  for (const required of [
    'exclude using gist',
    'p311_operation_receipts',
    'meeting_participants',
    'meeting_consents',
    'meeting_recording_versions',
    'meeting_notes',
    'meeting_action_items',
    'calendar_provider_connections',
    'p311_book_meeting',
    'p311_reschedule_meeting',
    'p311_cancel_meeting',
    'expected_version',
    'publish_domain_event',
    'meeting.ai.requested',
  ]) {
    assert.match(sql.toLowerCase(), new RegExp(required.replaceAll(' ', '\\s+'), 'u'));
  }
});

test('P3.11 migration keeps provider and private data out of event payload declarations', () => {
  const registrations =
    sql.match(/insert into public\.event_contract_registrations[\s\S]*?on conflict/giu) ?? [];
  assert.ok(registrations.length > 0);
  for (const registration of registrations) {
    assert.doesNotMatch(
      registration,
      /meeting_url|recording_storage_path|transcript|summary_text|email|phone|token|provider_error/iu,
    );
  }
});
