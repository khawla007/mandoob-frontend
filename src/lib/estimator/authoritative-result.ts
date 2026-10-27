import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  calculateEstimate,
  EstimateError,
  type CostDataRow,
  type EstimateInput,
  type EstimateOutput,
} from './calculate';

export type VersionedCostDataRow = CostDataRow & {
  sourceId: string;
  catalogVersionId: string;
  catalogVersion: string;
};

export type AuthoritativeEstimate = EstimateOutput & {
  sourceId: string;
  catalogVersionId: string;
  catalogVersion: string;
};

type EstimateTokenPayload = {
  reference: string;
  catalogVersionId: string;
  input: EstimateInput;
  expiresAt: string;
};

const TOKEN_TTL_MS = 15 * 60 * 1000;

export function calculateAuthoritativeEstimate(
  input: EstimateInput,
  rows: VersionedCostDataRow[],
  now = new Date(),
): AuthoritativeEstimate {
  if (rows.length === 0) {
    throw new EstimateError('MISSING_COST_DATA', 'Estimator pricing data is unavailable');
  }
  const versions = new Set(rows.map((row) => `${row.sourceId}:${row.catalogVersionId}`));
  if (versions.size !== 1) {
    throw new EstimateError('MISSING_COST_DATA', 'Estimator requires a single catalog version');
  }
  const [{ sourceId, catalogVersionId, catalogVersion }] = rows;
  if (!sourceId || !catalogVersionId || !catalogVersion) {
    throw new EstimateError('MISSING_COST_DATA', 'Estimator catalog version is unavailable');
  }
  return {
    ...calculateEstimate(input, rows, now),
    sourceId,
    catalogVersionId,
    catalogVersion,
  };
}

export function createEstimateResultToken(
  estimate: AuthoritativeEstimate,
  secret: string,
  now = new Date(),
): string {
  requireSecret(secret);
  const payload: EstimateTokenPayload = {
    reference: estimate.reference,
    catalogVersionId: estimate.catalogVersionId,
    input: estimate.input,
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyEstimateResultToken(
  token: string,
  secret: string,
  now = new Date(),
): EstimateTokenPayload {
  requireSecret(secret);
  if (token.length > 8192) throw new Error('Invalid estimate result token');
  const [encoded, supplied, extra] = token.split('.');
  if (!encoded || !supplied?.match(/^[a-f0-9]{64}$/) || extra) {
    throw new Error('Invalid estimate result token');
  }
  const expected = signature(encoded, secret);
  const suppliedBytes = Buffer.from(supplied, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new Error('Invalid estimate result token');
  }
  let payload: EstimateTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as EstimateTokenPayload;
  } catch {
    throw new Error('Invalid estimate result token');
  }
  if (
    !payload.reference?.match(/^EST-[A-Z0-9]{10}$/) ||
    !payload.catalogVersionId?.match(/^[0-9a-f-]{36}$/i) ||
    !payload.input ||
    !Number.isFinite(Date.parse(payload.expiresAt))
  ) {
    throw new Error('Invalid estimate result token');
  }
  if (Date.parse(payload.expiresAt) <= now.getTime())
    throw new Error('Estimate result token expired');
  return payload;
}

function signature(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(`p3.05:estimate:${encoded}`).digest('hex');
}

function requireSecret(secret: string): void {
  if (secret.length < 32) throw new Error('Estimate signing secret is misconfigured');
}
