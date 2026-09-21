export type BatchRequestState = { operationId: string | null };

export function createBatchRequestState(): BatchRequestState {
  return { operationId: null };
}

export function beginBatchRequest(state: BatchRequestState, nextId: string): BatchRequestState {
  return state.operationId ? state : { operationId: nextId };
}

export function changeBatchRequest(state: BatchRequestState): BatchRequestState {
  void state;
  return { operationId: null };
}

export function completeBatchRequest(state: BatchRequestState): BatchRequestState {
  void state;
  return { operationId: null };
}
