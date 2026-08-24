export type SuccessEnvelope<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
};

export function ok<T>(data: T, meta?: Record<string, unknown>): SuccessEnvelope<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string,
): ErrorEnvelope {
  return {
    success: false,
    error: { code, message, ...(details ? { details } : {}), ...(requestId ? { requestId } : {}) },
  };
}

export function isEnvelope(body: unknown): body is SuccessEnvelope<unknown> | ErrorEnvelope {
  return typeof body === "object" && body !== null && "success" in body;
}
