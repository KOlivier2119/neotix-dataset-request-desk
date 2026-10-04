export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiOptions = RequestInit & { skipAuthRedirect?: boolean };

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipAuthRedirect, ...init } = options;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });

  if (res.status === 401 && !skipAuthRedirect) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Not authenticated");
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") {
        message = data.detail;
      }
    } catch {
      // keep the default message
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const fetcher = <T,>(url: string): Promise<T> => api<T>(url);
