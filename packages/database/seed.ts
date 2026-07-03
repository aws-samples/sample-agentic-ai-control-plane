import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Example seed: AnyCompany expense scenario.
// Idempotent — safe to re-run. Uses deterministic IDs so existing rows are
// updated rather than duplicated, and the persona simulation always finds the
// same expense IDs.
//
// Personas are NOT seeded here — you create them in the Personas page. The
// personas are pure JWT testing fixtures; this seed is the business data they
// reason about.
//
// All employees are in the Engineering department so the persona's
// custom:department=Engineering claim matches them via listTeamExpenses.
export async function seedExampleExpenses(): Promise<void> {
  // Build a fresh client at call time so it picks up the DATABASE_URL the
  // migrate Lambda just set on process.env. Using @package/database's
  // shared singleton wouldn't work — that singleton initializes at module
  // import time, which happens before migrate.ts populates DATABASE_URL.
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set when seedExampleExpenses ran");
  }
  const adapter = new PrismaPg(
    { connectionString: url },
    { schema: process.env.DB_SCHEMA },
  );
  const prisma = new PrismaClient({ adapter });
  try {
    await runSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runSeed(prisma: any): Promise<void> {
  const submitters = [
    { email: "jamie@anycompany.example",  name: "Jamie Singh"   },
    { email: "taylor@anycompany.example", name: "Taylor Brooks" },
    { email: "casey@anycompany.example",  name: "Casey Martinez" },
    { email: "sam@anycompany.example",    name: "Sam Wright"    },
    { email: "jordan@anycompany.example", name: "Jordan Lee"    },
  ];
  const department = "Engineering";

  // Round-robin submitter assignment for variety. Mix of amounts to drive the
  // persona-comparison demos:
  //   ~ <$5k   → Manager and Director can both approve
  //   ~$13k    → Manager (limit $5k) denied by AVP; Director ($50k) approves
  //   ~$80k    → Both denied; agent suggests escalating to CFO
  const expenses = [
    { id: "exp_001", amount: 45,     category: "meals",    description: "Team lunch with vendor" },
    { id: "exp_002", amount: 220,    category: "software", description: "JetBrains license renewal" },
    { id: "exp_003", amount: 380,    category: "travel",   description: "Taxi to client site" },
    { id: "exp_004", amount: 99,     category: "software", description: "Figma annual seat" },
    { id: "exp_005", amount: 850,    category: "travel",   description: "Domestic flight to Seattle" },
    { id: "exp_006", amount: 1500,   category: "travel",   description: "Conference travel package" },
    { id: "exp_007", amount: 2400,   category: "software", description: "Datadog Pro 6mo prepay" },
    { id: "exp_008", amount: 3000,   category: "travel",   description: "International flight + hotel" },
    { id: "exp_009", amount: 7500,   category: "software", description: "Annual GitHub Enterprise seat block" },
    { id: "exp_010", amount: 13000,  category: "travel",   description: "Offsite venue deposit" },
    { id: "exp_011", amount: 18000,  category: "software", description: "Observability platform annual" },
    { id: "exp_012", amount: 28000,  category: "software", description: "ML training budget Q3" },
    { id: "exp_013", amount: 42000,  category: "software", description: "Bedrock model evaluation budget" },
    { id: "exp_014", amount: 80000,  category: "travel",   description: "Engineering all-hands offsite" },
    { id: "exp_015", amount: 125000, category: "software", description: "Annual cloud commit increase" },
  ];

  for (let i = 0; i < expenses.length; i++) {
    const x = expenses[i];
    const s = submitters[i % submitters.length];
    await prisma.expense.upsert({
      where: { id: x.id },
      create: {
        id: x.id,
        submitterEmail: s.email,
        submitterName: s.name,
        submitterDepartment: department,
        amount: x.amount,
        category: x.category,
        description: x.description,
        status: "pending",
      },
      // Don't reset status on re-seed — you may have already approved/rejected
      // some of these. Only refresh the descriptive fields.
      update: {
        submitterEmail: s.email,
        submitterName: s.name,
        submitterDepartment: department,
        amount: x.amount,
        category: x.category,
        description: x.description,
      },
    });
  }

  console.log(
    `Example seed complete: ${expenses.length} expenses upserted across ${submitters.length} fictional submitters in '${department}'.`,
  );
}

