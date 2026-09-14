import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { AsyncLocalStorage } from 'node:async_hooks';
import { syncBuiltinESMExports } from 'node:module';
import {
  isP112BlockedNextDevelopmentVersionCheck,
  matchP112ServerEgressRule,
} from './server-egress-policy.mjs';

const evidencePath = process.env.P112_EGRESS_LOG_PATH;
const profile = process.env.P112_EVIDENCE_PROFILE;
const stateId = process.env.P112_EVIDENCE_STATE_ID;
const initiator = process.env.P112_EGRESS_INITIATOR;
const reviewedHttpTransport = new AsyncLocalStorage();

if (process.env.P112_ACCEPTANCE_LOCAL_ONLY === '1') {
  if (!evidencePath || !profile || !stateId || !initiator)
    throw new Error('P1.12 server egress observer unavailable');
  const existing = fs.existsSync(evidencePath) ? fs.readFileSync(evidencePath, 'utf8') : '';
  if (!existing.includes('"category":"observer-ready"'))
    fs.appendFileSync(
      evidencePath,
      `${JSON.stringify({ profile, stateId, category: 'observer-ready' })}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
}

function classify(method, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, category: 'unreviewed', path: '(invalid)' };
  }
  const isDatabase =
    url.protocol === 'tcp:' &&
    url.hostname === '127.0.0.1' &&
    url.port === '56322' &&
    url.pathname === '/postgres';
  const isApi = url.origin === 'http://127.0.0.1:56321';
  const path = isDatabase ? '/postgres' : isApi ? url.pathname : '(non-loopback)';
  method = method.toUpperCase();
  if (!isDatabase && !isApi) return { allowed: false, category: 'unreviewed', path };
  const rule = matchP112ServerEgressRule({
    stateId,
    profile,
    initiator,
    method,
    path,
    query: url.searchParams.toString(),
  });
  if (!rule) return { allowed: false, category: 'unreviewed', path };
  const expectedCategory = isDatabase
    ? 'database'
    : url.pathname.startsWith('/auth/v1/')
      ? 'auth'
      : url.pathname.startsWith('/rest/v1/')
        ? 'postgrest'
        : 'unreviewed';
  if (rule.category !== expectedCategory) return { allowed: false, category: 'unreviewed', path };
  return { allowed: true, category: rule.category, path, statuses: rule.statuses };
}

function authorize(method, value) {
  if (!evidencePath || !profile || !stateId || !initiator)
    throw new Error('P1.12 server egress observer unavailable');
  const decision = classify(method, value);
  if (!decision.allowed) {
    record(method, decision.path, 'policy-denied', 'policy-denied');
    throw new Error('P1.12 server egress policy denied');
  }
  return decision;
}

function record(method, path, category, status) {
  fs.appendFileSync(
    evidencePath,
    `${JSON.stringify({ method: method.toUpperCase(), path, profile, stateId, initiator, status, category })}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
}

if (process.env.P112_ACCEPTANCE_LOCAL_ONLY === '1') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const method =
      init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (isP112BlockedNextDevelopmentVersionCheck(method, value, process.env.NODE_ENV)) {
      return Promise.reject(new Error('P1.12 Next development version check disabled'));
    }
    let decision;
    try {
      decision = authorize(method, value);
    } catch (error) {
      return Promise.reject(error);
    }
    let responded = false;
    return reviewedHttpTransport
      .run(true, () => originalFetch(input, init))
      .then((response) => {
        responded = true;
        record(method, decision.path, decision.category, response.status);
        if (!decision.statuses.includes(response.status))
          throw new Error('P1.12 server egress response status denied');
        return response;
      })
      .catch((error) => {
        if (!responded) record(method, decision.path, decision.category, 'transport-failure');
        throw error;
      });
  };
  for (const transportModule of [http, https]) {
    const originalRequest = transportModule.request.bind(transportModule);
    transportModule.request = function guardedRequest(input, options, callback) {
      const protocol = transportModule === https ? 'https:' : 'http:';
      const value =
        typeof input === 'string' || input instanceof URL
          ? String(input)
          : `${input?.protocol ?? protocol}//${input?.hostname ?? input?.host}:${input?.port ?? (protocol === 'https:' ? 443 : 80)}${input?.path ?? '/'}`;
      const method = options?.method ?? input?.method ?? 'GET';
      const decision = authorize(method, value);
      const request = reviewedHttpTransport.run(true, () =>
        originalRequest(input, options, callback),
      );
      let observed = false;
      request.once('response', (response) => {
        observed = true;
        const status = response.statusCode ?? 0;
        record(method, decision.path, decision.category, status);
        if (!decision.statuses.includes(status))
          response.destroy(new Error('P1.12 server egress response status denied'));
      });
      request.once('error', () => {
        if (!observed) record(method, decision.path, decision.category, 'transport-failure');
      });
      return request;
    };
    transportModule.get = function guardedGet(input, options, callback) {
      const request = transportModule.request(input, options, callback);
      request.end();
      return request;
    };
  }
  const originalConnect = net.connect.bind(net);
  net.connect = net.createConnection = function guardedConnect(...args) {
    if (reviewedHttpTransport.getStore() === true) return originalConnect(...args);
    const options = typeof args[0] === 'object' ? args[0] : { port: args[0], host: args[1] };
    if (typeof options.path === 'string') {
      record('CONNECT', '(unix-socket)', 'policy-denied', 'policy-denied');
      throw new Error('P1.12 server Unix socket denied');
    }
    const decision = authorize(
      'CONNECT',
      `tcp://${options.host ?? '127.0.0.1'}:${options.port}/postgres`,
    );
    const socket = originalConnect(...args);
    let observed = false;
    socket.once('connect', () => {
      observed = true;
      record('CONNECT', decision.path, decision.category, 'connected');
    });
    socket.once('error', () => {
      if (!observed) record('CONNECT', decision.path, decision.category, 'transport-failure');
    });
    return socket;
  };
  const originalLookup = dns.lookup.bind(dns);
  dns.lookup = function guardedLookup(hostname, ...args) {
    if (hostname !== '127.0.0.1') throw new Error('P1.12 server DNS denied');
    return originalLookup(hostname, ...args);
  };
  for (const name of ['resolve', 'resolve4', 'resolve6', 'resolveAny'])
    dns[name] = function deniedResolve() {
      throw new Error('P1.12 server DNS denied');
    };
  syncBuiltinESMExports();
}
