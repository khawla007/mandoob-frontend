import { matchP112ObservedEgressRule, matchP112ServerEgressRule } from './server-egress-policy.mjs';

export type P112ServerEgressInput = {
  method: string;
  url: string;
  profile: string;
  stateId: string;
  initiator: 'app' | 'fixture';
};
export type P112ServerEgressRecord = {
  method: string;
  path: string;
  profile: string;
  stateId: string;
  initiator: 'app' | 'fixture';
  status: number | 'connected' | 'policy-denied';
  category: 'auth' | 'postgrest' | 'database' | 'policy-denied';
};

function normalizedTarget(
  url: URL,
): { path: string; category: 'auth' | 'postgrest' | 'database' } | null {
  if (
    url.protocol === 'tcp:' &&
    url.hostname === '127.0.0.1' &&
    url.port === '56322' &&
    url.pathname === '/postgres'
  )
    return { path: '/postgres', category: 'database' };
  if (url.origin !== 'http://127.0.0.1:56321') return null;
  if (url.pathname.startsWith('/auth/v1/')) return { path: url.pathname, category: 'auth' };
  if (url.pathname.startsWith('/rest/v1/')) return { path: url.pathname, category: 'postgrest' };
  return null;
}

export function classifyP112ServerEgress(input: P112ServerEgressInput): {
  allowed: boolean;
  category: P112ServerEgressRecord['category'] | 'unreviewed';
  rule?: ReturnType<typeof matchP112ServerEgressRule>;
} {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { allowed: false, category: 'unreviewed' };
  }
  const target = normalizedTarget(url);
  if (!target) return { allowed: false, category: 'unreviewed' };
  const rule = matchP112ServerEgressRule({
    ...input,
    method: input.method.toUpperCase(),
    path: target.path,
    query: url.searchParams.toString(),
  });
  if (!rule || rule.category !== target.category) return { allowed: false, category: 'unreviewed' };
  return { allowed: true, category: target.category, rule };
}

export function parseAndReconcileP112EgressLog(
  text: string,
  profile: string,
  stateId: string,
): P112ServerEgressRecord[] {
  if (!text.trim()) throw new Error('P1.12 server egress evidence missing');
  let markerCount = 0;
  const records: P112ServerEgressRecord[] = [];
  for (const line of text.trim().split('\n')) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error('P1.12 server egress evidence unreadable');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('P1.12 server egress evidence shape rejected');
    const record = value as Record<string, unknown>;
    if (record.category === 'observer-ready') {
      if (
        Object.keys(record).sort().join(',') !== 'category,profile,stateId' ||
        record.profile !== profile ||
        record.stateId !== stateId
      )
        throw new Error('P1.12 server egress marker rejected');
      markerCount += 1;
      continue;
    }
    if (
      Object.keys(record).sort().join(',') !==
      'category,initiator,method,path,profile,stateId,status'
    )
      throw new Error('P1.12 server egress evidence shape rejected');
    if (record.category === 'policy-denied' || record.status === 'policy-denied')
      throw new Error('P1.12 server egress policy denied');
    if (record.profile !== profile || record.stateId !== stateId)
      throw new Error('P1.12 server egress profile mismatch');
    if (
      record.status === 'transport-failure' ||
      (typeof record.status === 'number' && record.status >= 500)
    )
      throw new Error('P1.12 server egress response status rejected');
    const origin =
      record.category === 'database' ? 'tcp://127.0.0.1:56322' : 'http://127.0.0.1:56321';
    const targetUrl = new URL(`${origin}${String(record.path)}`);
    const category =
      targetUrl.protocol === 'tcp:'
        ? 'database'
        : targetUrl.pathname.startsWith('/auth/v1/')
          ? 'auth'
          : 'postgrest';
    const rule = matchP112ObservedEgressRule({
      method: String(record.method),
      path: targetUrl.pathname,
      profile,
      stateId,
      initiator: record.initiator as 'app' | 'fixture',
    });
    if (
      !rule ||
      rule.category !== category ||
      rule.category !== record.category ||
      !rule.statuses.includes(record.status as number | 'connected')
    )
      throw new Error('P1.12 server egress response status rejected');
    records.push(record as P112ServerEgressRecord);
  }
  if (markerCount === 0) throw new Error('P1.12 server egress observer marker missing');
  if (markerCount !== 1) throw new Error('P1.12 server egress duplicate observer marker');
  return records;
}

export function serverEgressNodeOptions(): string {
  return '--import=./scripts/p1-12-acceptance/server-egress-preload.mjs';
}
