/**
 * The marketing site is a static export, so there is no server of ours between
 * the form and the API — the browser calls it directly. The API allows this
 * origin through `APP_BASE_URL` in its CORS list.
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // A school on a school connection, not a developer on fibre. Say what to
    // do, not what failed.
    throw new ApiError(0, 'We could not reach School All Ways. Check your connection and try again.');
  }

  if (!res.ok) {
    let message = 'Something went wrong. Please try again.';
    let code: string | undefined;
    try {
      const err = (await res.json()) as {
        message?: string | string[];
        code?: string;
        error?: { message?: string | string[]; code?: string };
      };
      const payload = err.error ?? err;
      if (payload.message) {
        message = Array.isArray(payload.message)
          ? payload.message.join(', ')
          : payload.message;
      }
      code = payload.code;
    } catch {
      /* keep the default */
    }
    throw new ApiError(res.status, message, code);
  }

  return (await res.json()) as T;
}
