import { defineWorkflow } from "../core/registry.js";
import { assert, custom, goto } from "../core/steps.js";
import type { WorkflowContext } from "../core/types.js";

export interface GoogleSignupInput {
  firstName: string; lastName: string;
  birthDay: string; birthMonth: string; birthYear: string; gender: string;
  username: string; password: string; confirmPassword: string;
  recoveryEmail?: string; phone?: string;
  acceptTerms: boolean;
}
export interface GoogleSignupOutput {
  status: "created" | "verification_required" | "username_unavailable" | "manual_action_required";
  email?: string;
  verificationType?: "phone" | "captcha" | "unknown";
}
type Ctx = WorkflowContext<GoogleSignupInput>;
async function next(ctx: Ctx) {
  const before = { url: ctx.page.url(), text: await ctx.page.locator("body").innerText() };
  await ctx.page.getByRole("button", { name: /^(next|próxima|próximo|avançar)$/i }).click();
  await ctx.page.waitForFunction(previous => location.href !== previous.url || document.body.innerText !== previous.text, before);
}

// External UI varies. Unknown screens must never imply successful creation.
export function classifyGoogleScreen(url: string, text: string): GoogleSignupOutput | undefined {
  const parsed = new URL(url);
  if (parsed.hostname === "myaccount.google.com" && parsed.pathname === "/") return { status: "created" };
  if (/captcha|recaptcha|not a robot|não sou um robô/i.test(text) || /\/challenge\/recaptcha/.test(parsed.pathname))
    return { status: "verification_required", verificationType: "captcha" };
  if (/verify.*phone|phone.*verif|verifi.*telefone|confirm.*telefone|scan.*qr|digitaliz.*qr/i.test(text))
    return { status: "verification_required", verificationType: "phone" };
  if (/username.*taken|username.*available|nome de usuário.*(usado|disponível)|endereço.*já.*usado/i.test(text))
    return { status: "username_unavailable" };
  if (/\/challenge\//.test(parsed.pathname)) return { status: "verification_required", verificationType: "unknown" };
  return undefined;
}
async function detect(ctx: Ctx) {
  const outcome = classifyGoogleScreen(ctx.page.url(), await ctx.page.locator("body").innerText());
  if (outcome) Object.assign(ctx.state, outcome);
  return Boolean(ctx.state.status);
}
function stage(name: string, run: (ctx: Ctx) => Promise<unknown>) {
  return custom<GoogleSignupInput>(name, async ctx => {
    if (await detect(ctx)) return;
    await run(ctx);
    // Wait for navigation or a new screen before detecting the next stage.
    // Each subsequent locator also auto-waits for its own control.
    await ctx.page.waitForLoadState("domcontentloaded");
    await detect(ctx);
  });
}

export default defineWorkflow<GoogleSignupInput, GoogleSignupOutput>({
  name: "google-signup",
  description: "Cadastro Google com detecção de verificações e etapas manuais",
  defaults: { baseUrl: "https://accounts.google.com" },
  buildInput(overrides) {
    const input: GoogleSignupInput = {
      firstName: "", lastName: "", birthDay: "", birthMonth: "", birthYear: "",
      gender: "", username: "", password: "", confirmPassword: overrides.password ?? "",
      acceptTerms: false, ...overrides,
    };
    for (const key of ["firstName", "birthDay", "birthMonth", "birthYear", "gender", "username", "password"] as const)
      if (!input[key]?.trim()) throw new Error(`Campo obrigatório: ${key}`);
    if (input.password !== input.confirmPassword) throw new Error("As senhas não conferem");
    if (!/^[a-zA-Z0-9.]+$/.test(input.username)) throw new Error("Informe username sem @gmail.com");
    return input;
  },
  steps: [
    goto("/signup?hl=en"),
    stage("preencher nome", async ctx => {
      await ctx.page.getByRole("textbox", { name: /^first name|^nome$/i }).fill(ctx.input.firstName);
      if (ctx.input.lastName) await ctx.page.getByRole("textbox", { name: /last name|sobrenome/i }).fill(ctx.input.lastName);
      await next(ctx);
    }),
    stage("preencher nascimento e gênero", async ctx => {
      await ctx.page.getByRole("textbox", { name: /^day$|^dia$/i }).fill(ctx.input.birthDay);
      const month = ctx.page.getByRole("combobox", { name: /month|mês/i });
      if (await month.evaluate(el => el.tagName === "SELECT")) await month.selectOption(ctx.input.birthMonth);
      else { await month.click(); await ctx.page.getByRole("option", { name: ctx.input.birthMonth, exact: true }).click(); }
      await ctx.page.getByRole("textbox", { name: /year|ano/i }).fill(ctx.input.birthYear);
      const gender = ctx.page.getByRole("combobox", { name: /gender|gênero/i });
      if (await gender.evaluate(el => el.tagName === "SELECT")) await gender.selectOption(ctx.input.gender);
      else { await gender.click(); await ctx.page.getByRole("option", { name: ctx.input.gender, exact: true }).click(); }
      await next(ctx);
    }),
    stage("escolher endereço Gmail", async ctx => {
      const own = ctx.page.getByText(/create your own gmail address|criar seu próprio endereço/i);
      // The address screen may show suggestions before the custom textbox.
      await ctx.page.getByRole("textbox").or(own).first().waitFor({ state: "visible" });
      if (await own.isVisible()) await own.click();
      await ctx.page.getByRole("textbox").fill(ctx.input.username);
      await next(ctx);
    }),
    stage("definir senha", async ctx => {
      await ctx.page.locator('input[name="Passwd"]').fill(ctx.input.password);
      await ctx.page.locator('input[name="PasswdAgain"]').fill(ctx.input.confirmPassword);
      await next(ctx);
    }),
    custom<GoogleSignupInput>("detectar resultado ou ação manual", async ctx => {
      // No automatic acceptance of legal terms or handling of phone/CAPTCHA.
      // Recovery, review and terms screens return a truthful incomplete status.
      if (!(await detect(ctx))) ctx.state.status = "manual_action_required";
    }),
    assert("estado conhecido", ctx => ["created", "verification_required", "username_unavailable", "manual_action_required"].includes(String(ctx.state.status))),
  ],
  result(ctx) {
    return {
      status: ctx.state.status as GoogleSignupOutput["status"],
      ...(ctx.state.status === "created" ? { email: `${ctx.input.username}@gmail.com` } : {}),
      ...(ctx.state.verificationType ? { verificationType: ctx.state.verificationType as GoogleSignupOutput["verificationType"] } : {}),
    };
  },
});
