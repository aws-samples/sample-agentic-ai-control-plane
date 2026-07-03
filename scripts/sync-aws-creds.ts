#!/usr/bin/env -S npx tsx

import * as fs from "node:fs";
import * as path from "node:path";

const ENV_PATHS = [
  path.join("apps", "web", ".env.local"),
  path.join("apps", "agent", ".env"),
];

const AWS_VARS = [
  "AWS_SESSION_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
] as const;

const missing = AWS_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing exported env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const values = Object.fromEntries(AWS_VARS.map((v) => [v, process.env[v]!]));

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/agentic_ai_platform";

// Reads DATABASE_URL from the database package's .env, falling back to the
// process env or the local default.
function readDatabaseUrl(): string {
  const dbEnvPath = path.join("packages", "database", ".env");
  if (fs.existsSync(dbEnvPath)) {
    const content = fs.readFileSync(dbEnvPath, "utf-8");
    const match = content.match(/^DATABASE_URL="?([^"\n]+)"?/m);
    if (match) return match[1];
  }
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

// Appends DATABASE_URL to the agent .env if absent; leaves any existing value
// untouched.
function ensureDatabaseUrl(envPath: string, content: string): string {
  if (!envPath.includes(path.join("apps", "agent"))) return content;
  const pattern = /^DATABASE_URL=.*$/m;
  const line = `DATABASE_URL="${readDatabaseUrl()}"`;
  if (pattern.test(content)) return content;
  return content.trimEnd() + "\n" + line + "\n";
}

for (const envPath of ENV_PATHS) {
  const dir = path.dirname(envPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(envPath)) {
    let content = AWS_VARS.map((v) => `${v}="${values[v]}"`).join("\n") + "\n";
    content = ensureDatabaseUrl(envPath, content);
    fs.writeFileSync(envPath, content, "utf-8");
    console.log(`Created ${envPath}`);
  } else {
    let content = fs.readFileSync(envPath, "utf-8");

    for (const varName of AWS_VARS) {
      const pattern = new RegExp(`^${varName}=.*$`, "m");
      const line = `${varName}="${values[varName]}"`;

      if (pattern.test(content)) {
        content = content.replace(pattern, line);
      } else {
        content = content.trimEnd() + "\n" + line + "\n";
      }
    }

    content = ensureDatabaseUrl(envPath, content);
    fs.writeFileSync(envPath, content, "utf-8");
    console.log(`Updated ${envPath}`);
  }
}
