/** reCAPTCHA v2 verification for websites you own (server-side module). */
export interface RecaptchaConfig {
  siteKey: string;
  secretKey: string;
  allowedHostnames: string[];
}
export function recaptchaFromEnvironment(env: Record<string, string | undefined>): RecaptchaConfig | undefined {
  const siteKey = env.RECAPTCHA_SITE_KEY?.trim();
  const secretKey = env.RECAPTCHA_SECRET_KEY?.trim();
  if (!siteKey && !secretKey) return undefined;
  if (!siteKey || !secretKey) throw new Error("Configure RECAPTCHA_SITE_KEY e RECAPTCHA_SECRET_KEY juntas");
  const allowedHostnames = (env.RECAPTCHA_ALLOWED_HOSTNAMES ?? "localhost,127.0.0.1")
    .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!allowedHostnames.length) throw new Error("Configure ao menos um hostname permitido para reCAPTCHA");
  return { siteKey, secretKey, allowedHostnames };
}
export async function verifyRecaptcha(
  token: unknown,
  config: RecaptchaConfig,
  fetcher: typeof fetch = fetch,
): Promise<"valid" | "invalid" | "unavailable"> {
  if (typeof token !== "string" || !token.trim() || token.length > 10000) return "invalid";
  try {
    const response = await fetcher("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: config.secretKey, response: token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return "unavailable";
    const data = await response.json() as { success?: boolean; hostname?: string } | null;
    return data?.success === true && typeof data.hostname === "string" &&
      config.allowedHostnames.includes(data.hostname.toLowerCase()) ? "valid" : "invalid";
  } catch {
    // Never expose a token, secret or upstream error to HTTP clients/logs.
    return "unavailable";
  }
}
