export type ExpiryState = {
  value: string;
  pending: boolean;
  submittedValue: string | null;
};

export function createExpiryState(value: string): ExpiryState {
  return { value, pending: false, submittedValue: null };
}

export function syncExpiryProp(state: ExpiryState, value: string): ExpiryState {
  return state.pending ? state : createExpiryState(value);
}

export function beginExpirySubmission(
  state: ExpiryState,
  submittedValue: string,
): { accepted: boolean; state: ExpiryState } {
  if (state.pending) return { accepted: false, state };
  return {
    accepted: true,
    state: { ...state, pending: true, submittedValue },
  };
}

export function settleExpirySubmission(state: ExpiryState, succeeded: boolean): ExpiryState {
  return {
    value: succeeded && state.submittedValue !== null ? state.submittedValue : state.value,
    pending: false,
    submittedValue: null,
  };
}
