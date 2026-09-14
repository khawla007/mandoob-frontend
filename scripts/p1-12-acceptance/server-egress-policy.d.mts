export type P112ServerEgressPolicyRule = {
  stateId: string;
  profile: string;
  initiator: 'app' | 'fixture';
  category: 'auth' | 'postgrest' | 'database';
  method: string;
  path: string;
  query?: string;
  queryShape?: readonly (
    | { name: string; value: string }
    | { name: string; oneOf: readonly string[] }
    | { name: string; prefix: string; format: 'iso-date-time' }
  )[];
  statuses: readonly (number | 'connected')[];
};
export const P112_SERVER_EGRESS_POLICY: readonly P112ServerEgressPolicyRule[];
export function isP112BlockedNextDevelopmentVersionCheck(
  method: string,
  value: string | URL,
  nodeEnv: string | undefined,
): boolean;
export function matchP112ServerEgressRule(input: {
  stateId: string;
  profile: string;
  initiator: 'app' | 'fixture';
  method: string;
  path: string;
  query?: string;
}): P112ServerEgressPolicyRule | undefined;
export function matchP112ObservedEgressRule(input: {
  stateId: string;
  profile: string;
  initiator: 'app' | 'fixture';
  method: string;
  path: string;
}): P112ServerEgressPolicyRule | undefined;
