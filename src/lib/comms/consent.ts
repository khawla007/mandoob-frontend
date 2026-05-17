import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ConsentChannel = 'whatsapp' | 'sms';
export type ConsentKeywordAction = 'opt_out' | 'opt_in';
type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

const OPT_OUT_KEYWORDS = new Set(['STOP', 'UNSUBSCRIBE', 'END', 'CANCEL', 'QUIT']);
const OPT_IN_KEYWORDS = new Set(['START', 'UNSTOP', 'SUBSCRIBE', 'RESUME']);

export function normalizeConsentKeyword(body: string | null | undefined): ConsentKeywordAction | null {
  const keyword = body?.trim().toUpperCase();
  if (!keyword) return null;
  if (OPT_OUT_KEYWORDS.has(keyword)) return 'opt_out';
  if (OPT_IN_KEYWORDS.has(keyword)) return 'opt_in';
  return null;
}

export async function isRecipientOptedOut(
  phoneE164: string,
  channel: ConsentChannel,
  supabase: Supa = createSupabaseServiceRoleClient(),
): Promise<boolean> {
  const { data, error } = await supabase
    .from('consent_opt_outs')
    .select('id')
    .eq('phone_e164', phoneE164)
    .eq('channel', channel)
    .is('opted_in_at', null)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function recordInboundConsentKeyword(args: {
  supabase?: Supa;
  phoneE164: string;
  channel: ConsentChannel;
  body: string | null | undefined;
  inboundMessageId: string;
}): Promise<ConsentKeywordAction | null> {
  const action = normalizeConsentKeyword(args.body);
  if (!action) return null;

  const supabase = args.supabase ?? createSupabaseServiceRoleClient();
  if (action === 'opt_out') {
    const payload = {
      phone_e164: args.phoneE164,
      channel: args.channel,
      opted_out_at: new Date().toISOString(),
      opted_in_at: null,
      source: 'inbound_keyword',
      last_inbound_message_id: args.inboundMessageId,
    };
    const { error } = await supabase.from('consent_opt_outs').insert(payload);
    if (error?.code === '23505') {
      await supabase
        .from('consent_opt_outs')
        .update({
          opted_out_at: payload.opted_out_at,
          source: 'inbound_keyword',
          last_inbound_message_id: args.inboundMessageId,
        })
        .eq('phone_e164', args.phoneE164)
        .eq('channel', args.channel)
        .is('opted_in_at', null);
    }
    return action;
  }

  await supabase
    .from('consent_opt_outs')
    .update({
      opted_in_at: new Date().toISOString(),
      source: 'inbound_keyword',
      last_inbound_message_id: args.inboundMessageId,
    })
    .eq('phone_e164', args.phoneE164)
    .eq('channel', args.channel)
    .is('opted_in_at', null);
  return action;
}

export type ConsentState = Record<ConsentChannel, boolean>;

export async function getConsentStateForPhone(
  phoneE164: string | null | undefined,
): Promise<ConsentState> {
  if (!phoneE164) return { whatsapp: false, sms: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('consent_opt_outs')
    .select('channel')
    .eq('phone_e164', phoneE164)
    .is('opted_in_at', null);

  const channels = new Set((data ?? []).map((row) => row.channel as ConsentChannel));
  return { whatsapp: channels.has('whatsapp'), sms: channels.has('sms') };
}

export async function optInPhoneChannels(args: {
  phoneE164: string;
  channels?: ConsentChannel[];
  source?: 'inbound_keyword' | 'admin_action' | 'provider_callback';
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const channels = args.channels ?? ['whatsapp', 'sms'];
  for (const channel of channels) {
    await supabase
      .from('consent_opt_outs')
      .update({ opted_in_at: new Date().toISOString(), source: args.source ?? 'admin_action' })
      .eq('phone_e164', args.phoneE164)
      .eq('channel', channel)
      .is('opted_in_at', null);
  }
}
