import { os } from "@orpc/server";
import { prisma } from "@package/database";
import { nanoid } from "nanoid";
import { z } from "zod";

const AgentToolSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  type: z.string(),
  metadata: z.unknown(),
  isEnabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string().nullable(),
  isPublic: z.boolean(),
  preferredModelId: z.string().nullable(),
  createdById: z.string().nullable(),
  createdByEmail: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const AgentWithToolsSchema = AgentSchema.extend({
  tools: z.array(AgentToolSchema),
});

// Lists agents visible to the caller: their own plus public ones (or only
// public agents when no userId is given).
export const listAgents = os
  .route({
    method: "GET",
    path: "/agents/list",
    tags: ["agents"],
  })
  .input(
    z
      .object({
        userId: z.string().optional(),
      })
      .optional(),
  )
  .output(z.object({ agents: z.array(AgentSchema) }))
  .handler(async ({ input }) => {
    const userId = input?.userId;

    const agents = await prisma.agent.findMany({
      where: userId
        ? {
            OR: [{ createdById: userId }, { isPublic: true }],
          }
        : { isPublic: true },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { email: true } } },
    });

    return {
      agents: agents.map((a) => ({
        ...a,
        createdByEmail: a.createdBy?.email ?? null,
      })),
    };
  });

// Fetches a single agent by id with its tools and creator email.
export const getAgent = os
  .route({
    method: "GET",
    path: "/agents/get",
    tags: ["agents"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Agent ID is required"),
    }),
  )
  .output(z.object({ agent: AgentWithToolsSchema }))
  .handler(async ({ input }) => {
    const agent = await prisma.agent.findUniqueOrThrow({
      where: { id: input.id },
      include: {
        createdBy: { select: { email: true } },
        tools: { orderBy: { createdAt: "desc" } },
      },
    });

    return {
      agent: {
        ...agent,
        createdByEmail: agent.createdBy?.email ?? null,
      },
    };
  });

// Creates an agent owned by the given user with a generated nanoid.
export const createAgent = os
  .route({
    method: "POST",
    path: "/agents/create",
    tags: ["agents"],
  })
  .input(
    z.object({
      name: z.string().min(1, "Name is required").max(128),
      description: z.string().min(1, "Description is required"),
      isPublic: z.boolean().default(false),
      createdById: z.string().min(1, "User ID is required"),
    }),
  )
  .output(z.object({ agent: AgentSchema }))
  .handler(async ({ input }) => {
    const agent = await prisma.agent.create({
      data: {
        id: nanoid(),
        name: input.name,
        description: input.description,
        isPublic: input.isPublic,
        createdById: input.createdById,
      },
      include: { createdBy: { select: { email: true } } },
    });

    return {
      agent: {
        ...agent,
        createdByEmail: agent.createdBy?.email ?? null,
      },
    };
  });

// Updates an agent's editable fields (name, description, prompt, visibility,
// preferred model).
export const updateAgent = os
  .route({
    method: "PATCH",
    path: "/agents/update",
    tags: ["agents"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Agent ID is required"),
      name: z.string().min(1).max(128).optional(),
      description: z.string().min(1).optional(),
      systemPrompt: z.string().nullable().optional(),
      isPublic: z.boolean().optional(),
      preferredModelId: z.string().nullable().optional(),
    }),
  )
  .output(z.object({ agent: AgentSchema }))
  .handler(async ({ input }) => {
    const { id, ...data } = input;

    const agent = await prisma.agent.update({
      where: { id },
      data,
      include: { createdBy: { select: { email: true } } },
    });

    return {
      agent: {
        ...agent,
        createdByEmail: agent.createdBy?.email ?? null,
      },
    };
  });

// Deletes an agent by id.
export const deleteAgent = os
  .route({
    method: "DELETE",
    path: "/agents/delete",
    tags: ["agents"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Agent ID is required"),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
    }),
  )
  .handler(async ({ input }) => {
    await prisma.agent.delete({
      where: { id: input.id },
    });

    return { success: true };
  });

export const agentsRouter = {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
};
