// Talking to the console API (/api/admin/*). A 401 means the session ended: the app shows sign-in.
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

export async function api(path, { method = "GET", body, signal } = {}) {
  const opts = { method, credentials: "same-origin", headers: { Accept: "application/json" }, signal };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api/admin${path}`, opts);
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("You seem to be offline. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login" && path !== "/setup") {
    document.dispatchEvent(new CustomEvent("console:signed-out"));
    throw new ApiError("Your session has ended. Please sign in again.", 401, data);
  }
  if (!res.ok) throw new ApiError(data.error || `Something went wrong (${res.status}). Please try again.`, res.status, data);
  return data;
}

/** Multipart upload with progress (fetch can't report upload progress). */
export function upload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status === 401) document.dispatchEvent(new CustomEvent("console:signed-out"));
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data.error || `Upload failed (${xhr.status}).`, xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError("The upload failed. Check your connection and try again.", 0));
    xhr.send(form);
  });
}

/** Shared state: the signed-in person, status flags and badge counts. */
export const session = {
  user: null,
  status: {},
  counts: { pendingReports: 0, unreadMessages: 0 },
  listeners: new Set(),
  set(patch) {
    Object.assign(this, patch);
    this.listeners.forEach((fn) => fn(this));
  },
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
};

export async function refreshSession() {
  const s = await api("/session");
  if (s.user) session.set({ user: s.user, status: s.status || {}, counts: s.counts || session.counts });
  return s;
}

/** Tell every open view that data changed (e.g. a donation was recorded). */
export const changed = (what) => document.dispatchEvent(new CustomEvent("console:changed", { detail: what }));
export const onChanged = (fn) => {
  const h = (e) => fn(e.detail);
  document.addEventListener("console:changed", h);
  return () => document.removeEventListener("console:changed", h);
};
