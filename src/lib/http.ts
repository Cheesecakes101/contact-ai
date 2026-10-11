import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { AIUnavailableError } from "./ai";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** Turn thrown errors (incl. Anthropic API errors) into a friendly JSON response. */
export function handleError(e: unknown) {
  if (e instanceof AIUnavailableError) return error(e.message, 503);
  if (e instanceof Anthropic.AuthenticationError) return error("The Anthropic API key was rejected.", 502);
  if (e instanceof Anthropic.RateLimitError) return error("AI is rate limited — try again in a moment.", 429);
  if (e instanceof Anthropic.APIError) return error(`AI request failed (${e.status ?? "network"}).`, 502);
  console.error(e);
  return error("Something went wrong.", 500);
}

export const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.slice(0, max) : "");
