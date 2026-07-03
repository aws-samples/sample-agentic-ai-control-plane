#!/usr/bin/env -S npx tsx

import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 7;

const ENV_PATH = path.join("apps", "web", ".env.local");
const DB_ENV_PATH = path.join("packages", "database", ".env");

const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/agentic_ai_platform";

// Respect the caller's AWS region from the environment; fall back to us-east-1
// only when neither variable is set.
const DEFAULT_REGION =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const c = {
  blue: "\x1b[94m",
  cyan: "\x1b[96m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  red: "\x1b[91m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
} as const;

function printBanner(): void {
  console.log(`
${c.blue}${c.bold}
     █████╗  ██████╗ ███████╗███╗   ██╗████████╗██╗ ██████╗     █████╗ ██╗
    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██║██╔════╝    ██╔══██╗██║
    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██║██║         ███████║██║
    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║██║         ██╔══██║██║
    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ██║╚██████╗    ██║  ██║██║
    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝ ╚═════╝    ╚═╝  ╚═╝╚═╝

     ██████╗ ██████╗ ███╗   ██╗████████╗██████╗  ██████╗ ██╗
    ██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝██╔══██╗██╔═══██╗██║
    ██║     ██║   ██║██╔██╗ ██║   ██║   ██████╔╝██║   ██║██║
    ██║     ██║   ██║██║╚██╗██║   ██║   ██╔══██╗██║   ██║██║
    ╚██████╗╚██████╔╝██║ ╚████║   ██║   ██║  ██║╚██████╔╝███████╗
     ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝

    Project Setup Wizard
${c.reset}
`);
}

function step(n: number, name: string): void {
  console.log(
    `\n${c.blue}${c.bold}Step ${n}/${TOTAL_STEPS}: ${name}${c.reset}`,
  );
  console.log(`${c.cyan}${"=".repeat(50)}${c.reset}\n`);
}

const info = (msg: string) => console.log(`${c.cyan}  i  ${msg}${c.reset}`);
const ok = (msg: string) => console.log(`${c.green}  +  ${msg}${c.reset}`);
const warn = (msg: string) => console.log(`${c.yellow}  !  ${msg}${c.reset}`);
const fail = (msg: string) => console.log(`${c.red}  x  ${msg}${c.reset}`);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function generateSecret(length = 64): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

function commandExists(cmd: string): boolean {
  const result = spawnSync(cmd, ["--version"], { stdio: "pipe" });
  return !result.error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prompt with an optional default value shown in green brackets. Empty input returns the default. */
async function prompt(
  rl: readline.Interface,
  label: string,
  fallback?: string,
): Promise<string> {
  const suffix = fallback ? ` [${c.green}${fallback}${c.reset}]` : "";
  const answer = await rl.question(`  ${label}${suffix}: `);
  const value = answer.trim() || fallback || "";
  if (!value) {
    warn(`${label} is required.`);
    return prompt(rl, label, fallback);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function welcomeStep(): Promise<void> {
  step(1, "Welcome");
  info("Agentic AI Platform — Project Setup");
  info(
    "This wizard will create the environment file needed to run the web app.",
  );
  ok("Let's get started!");
  await sleep(500);
}

// Verifies Node version, pnpm, and that we're running from the project root.
function checkEnvironment(): void {
  step(2, "Checking Environment");

  // Node.js
  info("Checking Node.js version...");
  const nodeVersion = process.versions.node;
  const major = Number(nodeVersion.split(".")[0]);
  if (major >= 18) {
    ok(`Node.js v${nodeVersion} — compatible`);
  } else {
    warn(`Node.js v${nodeVersion} — v18+ recommended`);
  }

  // pnpm
  info("Checking pnpm...");
  if (commandExists("pnpm")) {
    const ver = spawnSync("pnpm", ["--version"], { stdio: "pipe" })
      .stdout?.toString()
      .trim();
    ok(`pnpm ${ver ? `v${ver}` : "detected"}`);
  } else {
    warn("pnpm not found — install with: npm install -g pnpm");
  }

  // Project structure
  info("Checking project structure...");
  if (fs.existsSync("apps/web")) {
    ok("apps/web directory found");
  } else {
    fail("apps/web not found — please run this script from the project root");
    process.exit(1);
  }
}

// Detects AWS credentials via env vars, ~/.aws files, or CLI auth.
function checkAwsCredentials(): boolean {
  step(3, "AWS Credentials Check");
  info("Checking for AWS credentials...");

  const hasEnvVars =
    !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;

  const home = process.env.HOME ?? "~";
  const hasAwsFiles =
    fs.existsSync(path.join(home, ".aws", "credentials")) ||
    fs.existsSync(path.join(home, ".aws", "config"));

  let cliOk = false;
  try {
    const r = spawnSync("aws", ["sts", "get-caller-identity"], {
      stdio: "pipe",
      timeout: 10_000,
    });
    cliOk = r.status === 0;
  } catch {
    /* aws cli unavailable */
  }

  if (hasEnvVars) {
    ok("AWS credentials found in environment variables");
    return true;
  }
  if (hasAwsFiles && cliOk) {
    ok("AWS credentials found in ~/.aws/ and authenticated");
    return true;
  }
  if (cliOk) {
    ok("AWS CLI is configured and authenticated");
    return true;
  }
  if (hasAwsFiles) {
    warn("AWS credential files exist but authentication could not be verified");
  }

  fail("No valid AWS credentials found!");
  info("");
  info("To configure AWS credentials:");
  info("  1. export AWS_ACCESS_KEY_ID=<key>");
  info("     export AWS_SECRET_ACCESS_KEY=<secret>");
  info("  2. Or run: aws configure");
  info("  3. Or create ~/.aws/credentials");
  fail("Please configure AWS credentials and try again.");
  return false;
}

interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  clientSecret: string;
  domain: string;
}

interface UserPoolSummary {
  Id: string;
  Name: string;
}

interface UserPoolClientSummary {
  ClientId: string;
  ClientName: string;
}

/** Run an AWS CLI command and parse JSON output. Returns null on failure. */
function awsCli<T>(args: string[], region: string): T | null {
  const result = spawnSync(
    "aws",
    [...args, "--region", region, "--output", "json"],
    { stdio: "pipe", timeout: 30_000 },
  );
  if (result.error || result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout.toString()) as T;
  } catch {
    return null;
  }
}

/** Display a numbered list and return the 0-based index the user picks. */
async function choose(
  rl: readline.Interface,
  items: string[],
): Promise<number> {
  for (let i = 0; i < items.length; i++) {
    console.log(`  ${c.cyan}${i + 1})${c.reset} ${items[i]}`);
  }
  console.log();
  while (true) {
    const answer = await rl.question(`  Select [1-${items.length}]: `);
    const n = Number(answer.trim());
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return n - 1;
    warn(`Please enter a number between 1 and ${items.length}.`);
  }
}

// Interactively selects a Cognito user pool and app client, returning its config.
async function setupCognito(rl: readline.Interface): Promise<CognitoConfig> {
  step(4, "AWS Cognito Configuration");

  const region = DEFAULT_REGION;
  info(`Using region: ${c.green}${region}${c.reset}\n`);

  // --- User Pools ----------------------------------------------------------
  info("Fetching Cognito User Pools...");
  const poolsData = awsCli<{ UserPools: UserPoolSummary[] }>(
    ["cognito-idp", "list-user-pools", "--max-results", "60"],
    region,
  );

  if (!poolsData?.UserPools?.length) {
    fail("No Cognito User Pools found in this account / region.");
    process.exit(1);
  }

  const pools = poolsData.UserPools;
  ok(`Found ${pools.length} User Pool(s):\n`);

  const poolIdx = await choose(
    rl,
    pools.map((p) => `${p.Name} ${c.dim}(${p.Id})${c.reset}`),
  );
  const selectedPool = pools[poolIdx];
  ok(`Selected: ${selectedPool.Name}\n`);

  // --- App Clients ---------------------------------------------------------
  info("Fetching App Clients...");
  const clientsData = awsCli<{ UserPoolClients: UserPoolClientSummary[] }>(
    [
      "cognito-idp",
      "list-user-pool-clients",
      "--user-pool-id",
      selectedPool.Id,
      "--max-results",
      "60",
    ],
    region,
  );

  if (!clientsData?.UserPoolClients?.length) {
    fail(`No App Clients found for User Pool "${selectedPool.Name}".`);
    process.exit(1);
  }

  const clients = clientsData.UserPoolClients;
  let selectedClient: UserPoolClientSummary;

  if (clients.length === 1) {
    selectedClient = clients[0];
    ok(
      `App Client: ${selectedClient.ClientName} ${c.dim}(${selectedClient.ClientId})${c.reset}`,
    );
  } else {
    ok(`Found ${clients.length} App Client(s):\n`);
    const clientIdx = await choose(
      rl,
      clients.map(
        (cl) => `${cl.ClientName} ${c.dim}(${cl.ClientId})${c.reset}`,
      ),
    );
    selectedClient = clients[clientIdx];
    ok(`Selected: ${selectedClient.ClientName}`);
  }

  // --- Client Secret -------------------------------------------------------
  info("Retrieving App Client Secret...");
  const clientDetail = awsCli<{
    UserPoolClient: { ClientSecret?: string };
  }>(
    [
      "cognito-idp",
      "describe-user-pool-client",
      "--user-pool-id",
      selectedPool.Id,
      "--client-id",
      selectedClient.ClientId,
    ],
    region,
  );

  const clientSecret = clientDetail?.UserPoolClient?.ClientSecret ?? "";
  if (clientSecret) {
    ok("App Client Secret retrieved.");
  } else {
    warn("No client secret configured for this App Client.");
  }

  // --- Domain --------------------------------------------------------------
  info("Retrieving Cognito Domain...");
  const poolDetail = awsCli<{
    UserPool: { Domain?: string; CustomDomain?: string };
  }>(
    ["cognito-idp", "describe-user-pool", "--user-pool-id", selectedPool.Id],
    region,
  );

  const rawDomain =
    poolDetail?.UserPool?.CustomDomain || poolDetail?.UserPool?.Domain || "";
  const domain = rawDomain.includes(".")
    ? rawDomain
    : rawDomain
      ? `${rawDomain}.auth.${region}.amazoncognito.com`
      : "";

  if (domain) {
    ok(`Cognito Domain: ${domain}`);
  } else {
    warn("No domain configured for this User Pool.");
  }

  // --- Summary -------------------------------------------------------------
  const config: CognitoConfig = {
    region,
    userPoolId: selectedPool.Id,
    clientId: selectedClient.ClientId,
    clientSecret,
    domain,
  };

  console.log();
  ok("Cognito configuration:");
  info(`  Region:        ${config.region}`);
  info(`  User Pool:     ${selectedPool.Name}`);
  info(`  User Pool ID:  ${config.userPoolId}`);
  info(`  Client:        ${selectedClient.ClientName}`);
  info(`  Client ID:     ${config.clientId}`);
  info(`  Domain:        ${config.domain}`);

  return config;
}

// Writes the web .env.local and database .env files from the Cognito config.
function generateEnvFile(cognito: CognitoConfig): boolean {
  step(5, "Generate Environment File");

  if (!fs.existsSync(path.dirname(ENV_PATH))) {
    fail(`Directory ${path.dirname(ENV_PATH)} does not exist!`);
    return false;
  }

  if (fs.existsSync(ENV_PATH)) {
    warn(`Existing ${ENV_PATH} will be overwritten.`);
  }

  const authSecret = generateSecret(64);
  info("Generated BETTER_AUTH_SECRET");

  const content = [
    `BETTER_AUTH_SECRET=${authSecret}`,
    `BETTER_AUTH_URL=http://localhost:3000`,
    ``,
    `COGNITO_CLIENT_ID=${cognito.clientId}`,
    `COGNITO_CLIENT_SECRET=${cognito.clientSecret}`,
    `COGNITO_DOMAIN=${cognito.domain}`,
    `COGNITO_REGION=${cognito.region}`,
    `COGNITO_USER_POOL_ID=${cognito.userPoolId}`,
    ``,
    `DATABASE_URL=${LOCAL_DATABASE_URL}`,
    ``, // trailing newline
  ].join("\n");

  try {
    fs.writeFileSync(ENV_PATH, content, "utf-8");
    ok(`Environment file created: ${ENV_PATH}`);
  } catch (err) {
    fail(`Failed to write ${ENV_PATH}: ${err}`);
    return false;
  }

  // Write DATABASE_URL to packages/database/.env for Prisma CLI usage
  const dbEnvContent = [
    `# Local PostgreSQL via docker-compose (agentic-ai-postgres container)`,
    `DATABASE_URL="${LOCAL_DATABASE_URL}"`,
    ``, // trailing newline
  ].join("\n");

  try {
    fs.writeFileSync(DB_ENV_PATH, dbEnvContent, "utf-8");
    ok(`Database env file created: ${DB_ENV_PATH}`);
  } catch (err) {
    fail(`Failed to write ${DB_ENV_PATH}: ${err}`);
    return false;
  }

  return true;
}

/** Ask a yes/no question; returns true for yes. Default shown when Enter is pressed. */
async function confirm(
  rl: readline.Interface,
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const hint = defaultYes ? `[${c.green}Y${c.reset}/n]` : `[y/${c.green}N${c.reset}]`;
  const answer = await rl.question(`  ${question} ${hint}: `);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) return defaultYes;
  return trimmed === "y" || trimmed === "yes";
}

// Polls the Postgres container with pg_isready until ready or attempts run out.
async function waitForPostgres(maxAttempts = 15): Promise<boolean> {
  for (let i = 1; i <= maxAttempts; i++) {
    const r = spawnSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "agentic-ai-postgres",
        "pg_isready",
        "-U",
        "postgres",
        "-d",
        "agentic_ai_platform",
      ],
      { stdio: "pipe", timeout: 5_000 },
    );
    if (r.status === 0) {
      process.stdout.write("\n");
      return true;
    }
    process.stdout.write(
      `  ${c.dim}Waiting for PostgreSQL... (${i}/${maxAttempts})${c.reset}\r`,
    );
    await sleep(2_000);
  }
  process.stdout.write("\n");
  return false;
}

// Pushes the Prisma schema to the local database, guiding the user if it fails.
function runPrismaDbPush(): void {
  const prismaBin = path.join(
    "packages",
    "database",
    "node_modules",
    ".bin",
    "prisma",
  );

  if (!fs.existsSync(prismaBin)) {
    warn("Prisma CLI not found in node_modules — run pnpm install first, then:");
    info(
      `  ${c.cyan}pnpm --filter @package/database exec prisma db push${c.reset}`,
    );
    return;
  }

  info("Pushing Prisma schema to database...");
  const result = spawnSync(
    "pnpm",
    ["--filter", "@package/database", "exec", "prisma", "db", "push"],
    { stdio: "inherit", timeout: 60_000 },
  );

  if (result.error || result.status !== 0) {
    fail("prisma db push failed. Try running it manually:");
    info(
      `  ${c.cyan}pnpm --filter @package/database exec prisma db push${c.reset}`,
    );
  } else {
    ok("Database schema pushed successfully.");
  }
}

// Optionally starts the local Postgres container and pushes the schema.
async function startDockerCompose(rl: readline.Interface): Promise<void> {
  step(6, "Local Database (Docker Compose)");

  info("The project includes a docker-compose.yml that starts a local PostgreSQL instance.");

  if (!commandExists("docker")) {
    warn("Docker not found — skipping. Install Docker Desktop to use docker-compose.");
    return;
  }

  // Verify compose subcommand is available
  const composeCheck = spawnSync("docker", ["compose", "version"], { stdio: "pipe" });
  if (composeCheck.error || composeCheck.status !== 0) {
    warn("'docker compose' subcommand not available — skipping.");
    return;
  }

  const run = await confirm(rl, "Start the local PostgreSQL container now?", true);

  if (!run) {
    info("Skipped. You can start it later with:");
    info(`  ${c.cyan}docker compose up -d${c.reset}`);
    return;
  }

  info("Running docker compose up -d ...");
  const upResult = spawnSync("docker", ["compose", "up", "-d"], {
    stdio: "inherit",
    timeout: 60_000,
  });

  if (upResult.error || upResult.status !== 0) {
    fail("docker compose up failed. Check Docker is running and try again:");
    info(`  ${c.cyan}docker compose up -d${c.reset}`);
    return;
  }

  ok("PostgreSQL container started (agentic-ai-postgres on port 5432).");
  info(`Stop it later with: ${c.cyan}docker compose down${c.reset}`);

  const dbReady = await waitForPostgres();
  if (!dbReady) {
    warn("PostgreSQL did not become ready in time. Push the schema manually once it starts:");
    info(
      `  ${c.cyan}pnpm --filter @package/database exec prisma db push${c.reset}`,
    );
    return;
  }

  runPrismaDbPush();
}

function finalInstructions(): void {
  step(7, "Done");

  console.log(`\n${c.green}${c.bold}  Setup complete!${c.reset}\n`);

  info("Your local environment is configured.\n");
  info("Next steps:");
  info(`  ${c.cyan}pnpm install${c.reset}    Install dependencies`);
  info(`  ${c.cyan}pnpm dev${c.reset}        Start the dev server`);
  info("");
  info(`Environment file: ${c.green}${ENV_PATH}${c.reset}`);
  console.log();
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  // Graceful Ctrl-C handling
  rl.on("close", () => {
    console.log("\n\nSetup interrupted. Goodbye!");
    process.exit(1);
  });

  try {
    printBanner();
    console.log(
      "This wizard will guide you through setting up the Agentic AI Platform locally.\n",
    );

    await welcomeStep();
    checkEnvironment();

    if (!checkAwsCredentials()) {
      fail("\nSetup cannot continue without AWS credentials.");
      process.exit(1);
    }

    const cognito = await setupCognito(rl);

    if (!generateEnvFile(cognito)) {
      fail("\nFailed to create environment file.");
      process.exit(1);
    }

    await startDockerCompose(rl);

    // Remove the close listener so we don't print "interrupted" on normal exit
    rl.removeAllListeners("close");
    rl.close();

    finalInstructions();
  } catch (err) {
    // readline/promises rejects questions when the interface is closed (Ctrl-C)
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ERR_USE_AFTER_CLOSE") {
      // Already handled by the 'close' listener
      return;
    }
    fail(`An unexpected error occurred: ${err}`);
    process.exit(1);
  }
}

main();
