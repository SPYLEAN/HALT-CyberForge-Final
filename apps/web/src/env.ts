import { z } from "zod";

// Public configuration, validated once. Next.js inlines NEXT_PUBLIC_* only when read literally.
const schema = z.object({
  NEXT_PUBLIC_API_ORIGIN: z.url().default("http://localhost:8000"),
  NEXT_PUBLIC_WS_ORIGIN: z
    .string()
    .regex(/^wss?:\/\/[^/]+$/, "must be ws(s)://host[:port] with no path")
    .default("ws://localhost:8000"),
  NEXT_PUBLIC_DEMO_MODE: z.literal("simulated").default("simulated"),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse({
    NEXT_PUBLIC_API_ORIGIN: source.NEXT_PUBLIC_API_ORIGIN || undefined,
    NEXT_PUBLIC_WS_ORIGIN: source.NEXT_PUBLIC_WS_ORIGIN || undefined,
    NEXT_PUBLIC_DEMO_MODE: source.NEXT_PUBLIC_DEMO_MODE || undefined,
  });
}

export const env = parseEnv({
  NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN,
  NEXT_PUBLIC_WS_ORIGIN: process.env.NEXT_PUBLIC_WS_ORIGIN,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
});
