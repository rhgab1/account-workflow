import { describe, expect, it } from "vitest";
import googleSignup, { classifyGoogleScreen } from "../src/workflows/google-signup.js";
import { registry } from "../src/workflows/index.js";
const valid = { firstName: "Joao", birthDay: "1", birthMonth: "January", birthYear: "1995", gender: "Male", username: "joaoteste", password: "test-password-123" };
describe("google-signup", () => {
  it("reuses registry and validates required input", () => {
    expect(registry.get("google-signup")).toBe(googleSignup);
    expect(() => googleSignup.buildInput({}, googleSignup.defaults)).toThrow(/obrigatório/);
    expect(googleSignup.buildInput(valid, googleSignup.defaults).confirmPassword).toBe(valid.password);
    expect(() => googleSignup.buildInput({ ...valid, confirmPassword: "different" }, googleSignup.defaults)).toThrow(/senhas/);
  });
  it.each([
    ["https://accounts.google.com/signup", "Verify your phone number", "verification_required"],
    ["https://accounts.google.com/signup", "I'm not a robot", "verification_required"],
    ["https://accounts.google.com/signup", "That username is taken", "username_unavailable"],
    ["https://myaccount.google.com/", "", "created"],
  ])("classifies %s %s", (url, text, expected) => {
    expect(classifyGoogleScreen(url, text)?.status).toBe(expected);
  });
  it("does not claim creation for unknown screens or deceptive domains", () => {
    expect(classifyGoogleScreen("https://accounts.google.com/signup", "Privacy and Terms")).toBeUndefined();
    expect(classifyGoogleScreen("https://myaccount.google.com.evil.test/", "")).toBeUndefined();
  });
});
