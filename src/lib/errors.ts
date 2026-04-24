/**
 * Error shape per CLAUDE.md §6 API conventions: { error, code, details? }
 */
export type ApiErrorPayload = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toResponse(): Response {
    const body: ApiErrorPayload = {
      error: this.message,
      code: this.code,
      ...(this.details ? { details: this.details } : {}),
    };
    return new Response(JSON.stringify(body), {
      status: this.status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  }
}

export const errorResponse = (
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): Response => new ApiError(code, message, status, details).toResponse();

export const jsonOk = <T>(data: T, init?: ResponseInit): Response =>
  new Response(JSON.stringify(data), {
    ...init,
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...init?.headers,
    },
  });
