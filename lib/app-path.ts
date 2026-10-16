function normalizeBasePath(value: string | undefined): string {
  const path = (value ?? "").trim().replace(/\/+$/, "");
  if (path && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) {
    throw new Error("NEXT_PUBLIC_CAREERPILOT_BASE_PATH must be empty or a path such as /careercopilot.");
  }
  return path;
}

// Direct NEXT_PUBLIC_ references let the framework inline both values at build time.
export const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_CAREERPILOT_BASE_PATH);
export const authMode = process.env.NEXT_PUBLIC_CAREERPILOT_AUTH_MODE === "cloudflare" ? "cloudflare" : "sites";

/** Prefix a path inside this application, including any query string. */
export function appPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("appPath expects an application-relative path starting with one slash.");
  }
  return `${appBasePath}${path}`;
}

export function signInUrl(): string {
  // Access starts authentication when the browser opens a protected application URL.
  if (authMode === "cloudflare") return appPath("/");
  // Sites owns these authentication routes at the hostname root.
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(appPath("/"))}`;
}

export function signOutUrl(): string {
  if (authMode === "cloudflare") return "/cdn-cgi/access/logout";
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(appPath("/"))}`;
}
