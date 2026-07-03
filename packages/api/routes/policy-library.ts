import { ORPCError } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";
import { authed } from "../context";

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const PolicyStatusSchema = z.enum(["draft", "in_review", "published", "archived"]);
const PolicyTypeSchema = z.enum(["permit", "forbid"]);

const ActivityEventTypeSchema = z.enum([
  "created",
  "edited",
  "version_created",
  "status_changed",
  "linked_policy_created",
  "linked_policy_updated",
  "linked_policy_failed",
  "renamed",
  "tag_added",
  "tag_removed",
  "exported",
  "duplicated",
]);

const PolicyCreatorSchema = z.object({
  name: z.string(),
  email: z.string(),
});

const PolicyItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  cedarCode: z.string(),
  type: PolicyTypeSchema,
  status: PolicyStatusSchema,
  isTemplate: z.boolean(),
  parentTemplateId: z.string().nullable().optional(),
  createdBy: PolicyCreatorSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  tags: z.array(z.string()),
  archivedAt: z.coerce.date().nullable().optional(),
  exportCount: z.number().optional(),
});

const PolicyVersionSchema = z.object({
  version: z.number().int(),
  cedarCode: z.string(),
  changeNote: z.string(),
  createdBy: PolicyCreatorSchema,
  createdAt: z.coerce.date(),
});

const ActivityEventSchema = z.object({
  id: z.string(),
  policyId: z.string(),
  type: ActivityEventTypeSchema,
  actor: PolicyCreatorSchema,
  description: z.string(),
  timestamp: z.coerce.date(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const LinkedPolicyStatusSchema = z.enum(["ACTIVE", "CREATING", "UPDATE_FAILED"]);

const LinkedPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  policyEngineId: z.string(),
  policyEngineArn: z.string(),
  principal: z.object({ entityType: z.string(), entityId: z.string() }),
  resource: z.object({ entityType: z.string(), entityId: z.string() }),
  status: LinkedPolicyStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const FALLBACK_CREATOR = { name: "Unknown", email: "unknown@example.com" };

type PrismaUser = {
  name: string;
  email: string;
} | null;

// Maps a Prisma user to a {name,email} creator, falling back to a placeholder
// when the user is null.
function creatorFromUser(user: PrismaUser): z.infer<typeof PolicyCreatorSchema> {
  if (!user) return FALLBACK_CREATOR;
  return { name: user.name, email: user.email };
}

type PrismaPolicy = Awaited<ReturnType<typeof prisma.policy.findFirstOrThrow>> & {
  createdBy: PrismaUser;
};

// Maps a Prisma policy row to the API PolicyItem shape.
function serializePolicy(p: PrismaPolicy): z.infer<typeof PolicyItemSchema> {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    cedarCode: p.cedarCode,
    type: p.type as z.infer<typeof PolicyTypeSchema>,
    status: p.status as z.infer<typeof PolicyStatusSchema>,
    isTemplate: p.isTemplate,
    parentTemplateId: p.parentTemplateId,
    createdBy: creatorFromUser(p.createdBy),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    tags: p.tags,
    archivedAt: p.archivedAt,
    exportCount: p.exportCount,
  };
}

// ── List Policies ────────────────────────────────────────────────────────────

export const listPolicies = authed
  .route({
    method: "GET",
    path: "/policy-library/list",
    tags: ["policy-library"],
  })
  .input(
    z
      .object({
        status: PolicyStatusSchema.optional(),
        type: PolicyTypeSchema.optional(),
        isTemplate: z.boolean().optional(),
        parentTemplateId: z.string().optional(),
        search: z.string().optional(),
      })
      .optional(),
  )
  .output(z.object({ policies: z.array(PolicyItemSchema) }))
  .handler(async ({ input }) => {
    const where: Record<string, unknown> = { archivedAt: null };
    if (input?.status) where.status = input.status;
    if (input?.type) where.type = input.type;
    if (input?.isTemplate !== undefined) where.isTemplate = input.isTemplate;
    if (input?.parentTemplateId)
      where.parentTemplateId = input.parentTemplateId;
    if (input?.search?.trim()) {
      const q = input.search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ];
    }

    const policies = await prisma.policy.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true, email: true } } },
    });

    return { policies: policies.map(serializePolicy) };
  });

// ── Get Policy ───────────────────────────────────────────────────────────────

export const getPolicy = authed
  .route({
    method: "GET",
    path: "/policy-library/get",
    tags: ["policy-library"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(
    z.object({
      policy: PolicyItemSchema,
      versionCount: z.number().int(),
      linkedPolicyCount: z.number().int(),
    }),
  )
  .handler(async ({ input }) => {
    const policy = await prisma.policy.findUnique({
      where: { id: input.id },
      include: {
        createdBy: { select: { name: true, email: true } },
        _count: { select: { versions: true, linkedPolicies: true } },
      },
    });

    if (!policy) {
      throw new ORPCError("NOT_FOUND", { message: "Policy not found" });
    }

    return {
      policy: serializePolicy(policy),
      versionCount: policy._count.versions,
      linkedPolicyCount: policy._count.linkedPolicies,
    };
  });

// ── Create Policy ────────────────────────────────────────────────────────────

export const createPolicy = authed
  .route({
    method: "POST",
    path: "/policy-library/create",
    tags: ["policy-library"],
  })
  .input(
    z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(2048).default(""),
      cedarCode: z.string().default(""),
      type: PolicyTypeSchema,
      status: PolicyStatusSchema.default("draft"),
      tags: z.array(z.string()).default([]),
      isTemplate: z.boolean().default(false),
      parentTemplateId: z.string().optional(),
      changeNote: z.string().default("Initial draft"),
    }),
  )
  .output(z.object({ policy: PolicyItemSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;

    let parentTemplateName: string | null = null;
    if (input.parentTemplateId) {
      const parent = await prisma.policy.findUnique({
        where: { id: input.parentTemplateId },
        select: { isTemplate: true, name: true },
      });
      if (!parent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Parent template not found",
        });
      }
      if (!parent.isTemplate) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Parent is not a template",
        });
      }
      parentTemplateName = parent.name;
    }

    const created = await prisma.$transaction(async (tx: PrismaTx) => {
      const policy = await tx.policy.create({
        data: {
          name: input.name,
          description: input.description,
          cedarCode: input.cedarCode,
          type: input.type,
          status: input.status,
          tags: input.tags,
          isTemplate: input.isTemplate,
          parentTemplateId: input.parentTemplateId ?? null,
          createdById: userId,
        },
        include: { createdBy: { select: { name: true, email: true } } },
      });

      await tx.policyVersion.create({
        data: {
          policyId: policy.id,
          version: 1,
          cedarCode: input.cedarCode,
          changeNote: input.changeNote,
          createdById: userId,
        },
      });

      const activityDescription = input.parentTemplateId
        ? `Policy instantiated from template "${parentTemplateName}"`
        : input.isTemplate
          ? "Template created"
          : "Policy created as initial draft";

      await tx.policyActivityEvent.create({
        data: {
          policyId: policy.id,
          type: "created",
          description: activityDescription,
          actorId: userId,
          metadata: input.parentTemplateId
            ? { parentTemplateId: input.parentTemplateId }
            : {},
        },
      });

      return policy;
    });

    return { policy: serializePolicy(created) };
  });

// ── Update Policy (metadata only — name/description/tags/status) ─────────────

export const updatePolicy = authed
  .route({
    method: "PATCH",
    path: "/policy-library/update",
    tags: ["policy-library"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(2048).optional(),
      tags: z.array(z.string()).optional(),
      status: PolicyStatusSchema.optional(),
      isTemplate: z.boolean().optional(),
    }),
  )
  .output(z.object({ policy: PolicyItemSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.policy.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Policy not found" });
    }

    const updated = await prisma.$transaction(async (tx: PrismaTx) => {
      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.tags !== undefined) updateData.tags = input.tags;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.isTemplate !== undefined) updateData.isTemplate = input.isTemplate;

      const policy = await tx.policy.update({
        where: { id: input.id },
        data: updateData,
        include: { createdBy: { select: { name: true, email: true } } },
      });

      if (input.name !== undefined && input.name !== existing.name) {
        await tx.policyActivityEvent.create({
          data: {
            policyId: policy.id,
            type: "renamed",
            description: `Renamed from "${existing.name}" to "${input.name}"`,
            actorId: userId,
            metadata: { from: existing.name, to: input.name },
          },
        });
      }

      if (input.description !== undefined && input.description !== existing.description) {
        await tx.policyActivityEvent.create({
          data: {
            policyId: policy.id,
            type: "edited",
            description: "Description updated",
            actorId: userId,
            metadata: {},
          },
        });
      }

      if (input.status !== undefined && input.status !== existing.status) {
        await tx.policyActivityEvent.create({
          data: {
            policyId: policy.id,
            type: "status_changed",
            description: `Status changed from ${existing.status} to ${input.status}`,
            actorId: userId,
            metadata: { from: existing.status, to: input.status },
          },
        });
      }

      if (
        input.isTemplate !== undefined &&
        input.isTemplate !== existing.isTemplate
      ) {
        await tx.policyActivityEvent.create({
          data: {
            policyId: policy.id,
            type: "edited",
            description: input.isTemplate
              ? "Converted to template"
              : "Converted to standalone policy",
            actorId: userId,
            metadata: {
              from: String(existing.isTemplate),
              to: String(input.isTemplate),
            },
          },
        });
      }

      if (input.tags !== undefined) {
        const existingTagsList = (existing.tags ?? []) as string[];
        const existingTags = new Set<string>(existingTagsList);
        const newTags = new Set<string>(input.tags);
        const added = [...newTags].filter((t) => !existingTags.has(t));
        const removed = [...existingTags].filter((t) => !newTags.has(t));
        for (const tag of added) {
          await tx.policyActivityEvent.create({
            data: {
              policyId: policy.id,
              type: "tag_added",
              description: `Tag "${tag}" added`,
              actorId: userId,
              metadata: { tag },
            },
          });
        }
        for (const tag of removed) {
          await tx.policyActivityEvent.create({
            data: {
              policyId: policy.id,
              type: "tag_removed",
              description: `Tag "${tag}" removed`,
              actorId: userId,
              metadata: { tag },
            },
          });
        }
      }

      return policy;
    });

    return { policy: serializePolicy(updated) };
  });

// ── Save New Version ─────────────────────────────────────────────────────────

export const saveNewVersion = authed
  .route({
    method: "POST",
    path: "/policy-library/save-version",
    tags: ["policy-library"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      cedarCode: z.string().min(1),
      changeNote: z.string().default(""),
    }),
  )
  .output(
    z.object({
      policy: PolicyItemSchema,
      version: PolicyVersionSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.policy.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Policy not found" });
    }

    const result = await prisma.$transaction(async (tx: PrismaTx) => {
      const latest = await tx.policyVersion.findFirst({
        where: { policyId: input.id },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const version = await tx.policyVersion.create({
        data: {
          policyId: input.id,
          version: nextVersion,
          cedarCode: input.cedarCode,
          changeNote: input.changeNote,
          createdById: userId,
        },
        include: { createdBy: { select: { name: true, email: true } } },
      });

      const policy = await tx.policy.update({
        where: { id: input.id },
        data: { cedarCode: input.cedarCode },
        include: { createdBy: { select: { name: true, email: true } } },
      });

      await tx.policyActivityEvent.create({
        data: {
          policyId: input.id,
          type: "version_created",
          description: `Version ${nextVersion}${input.changeNote ? ` — ${input.changeNote}` : ""}`,
          actorId: userId,
          metadata: { version: String(nextVersion) },
        },
      });

      return { policy, version };
    });

    return {
      policy: serializePolicy(result.policy),
      version: {
        version: result.version.version,
        cedarCode: result.version.cedarCode,
        changeNote: result.version.changeNote,
        createdBy: creatorFromUser(result.version.createdBy),
        createdAt: result.version.createdAt,
      },
    };
  });

// ── Revert To Version ────────────────────────────────────────────────────────

export const revertToVersion = authed
  .route({
    method: "POST",
    path: "/policy-library/revert",
    tags: ["policy-library"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      targetVersion: z.number().int().min(1),
    }),
  )
  .output(
    z.object({
      policy: PolicyItemSchema,
      version: PolicyVersionSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const target = await prisma.policyVersion.findUnique({
      where: {
        policyId_version: {
          policyId: input.id,
          version: input.targetVersion,
        },
      },
    });
    if (!target) {
      throw new ORPCError("NOT_FOUND", { message: "Target version not found" });
    }

    const result = await prisma.$transaction(async (tx: PrismaTx) => {
      const latest = await tx.policyVersion.findFirst({
        where: { policyId: input.id },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latest?.version ?? 0) + 1;
      const changeNote = `Reverted to v${input.targetVersion}`;

      const version = await tx.policyVersion.create({
        data: {
          policyId: input.id,
          version: nextVersion,
          cedarCode: target.cedarCode,
          changeNote,
          createdById: userId,
        },
        include: { createdBy: { select: { name: true, email: true } } },
      });

      const policy = await tx.policy.update({
        where: { id: input.id },
        data: { cedarCode: target.cedarCode },
        include: { createdBy: { select: { name: true, email: true } } },
      });

      await tx.policyActivityEvent.create({
        data: {
          policyId: input.id,
          type: "version_created",
          description: `Version ${nextVersion} — ${changeNote}`,
          actorId: userId,
          metadata: { version: String(nextVersion), revertedFrom: String(input.targetVersion) },
        },
      });

      return { policy, version };
    });

    return {
      policy: serializePolicy(result.policy),
      version: {
        version: result.version.version,
        cedarCode: result.version.cedarCode,
        changeNote: result.version.changeNote,
        createdBy: creatorFromUser(result.version.createdBy),
        createdAt: result.version.createdAt,
      },
    };
  });

// ── Delete Policy ────────────────────────────────────────────────────────────

export const deletePolicy = authed
  .route({
    method: "DELETE",
    path: "/policy-library/delete",
    tags: ["policy-library"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    try {
      await prisma.policy.delete({ where: { id: input.id } });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "P2025") {
        throw new ORPCError("NOT_FOUND", { message: "Policy not found" });
      }
      throw err;
    }
    return { success: true };
  });

// ── List Versions ────────────────────────────────────────────────────────────

export const listVersions = authed
  .route({
    method: "GET",
    path: "/policy-library/versions/list",
    tags: ["policy-library"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ versions: z.array(PolicyVersionSchema) }))
  .handler(async ({ input }) => {
    const versions = await prisma.policyVersion.findMany({
      where: { policyId: input.id },
      orderBy: { version: "desc" },
      include: { createdBy: { select: { name: true, email: true } } },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      versions: versions.map((v: any) => ({
        version: v.version,
        cedarCode: v.cedarCode,
        changeNote: v.changeNote,
        createdBy: creatorFromUser(v.createdBy),
        createdAt: v.createdAt,
      })),
    };
  });

// ── List Activity ────────────────────────────────────────────────────────────

export const listActivity = authed
  .route({
    method: "GET",
    path: "/policy-library/activity/list",
    tags: ["policy-library"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ events: z.array(ActivityEventSchema) }))
  .handler(async ({ input }) => {
    const events = await prisma.policyActivityEvent.findMany({
      where: { policyId: input.id },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true, email: true } } },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events: events.map((e: any) => ({
        id: e.id,
        policyId: e.policyId,
        type: e.type as z.infer<typeof ActivityEventTypeSchema>,
        actor: creatorFromUser(e.actor),
        description: e.description,
        timestamp: e.createdAt,
        metadata: (e.metadata ?? undefined) as Record<string, string> | undefined,
      })),
    };
  });

// ── List Linked Policies (stub — empty in Phase 1) ───────────────────────────

export const listLinkedPolicies = authed
  .route({
    method: "GET",
    path: "/policy-library/linked/list",
    tags: ["policy-library"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ linkedPolicies: z.array(LinkedPolicySchema) }))
  .handler(async ({ input }) => {
    const linked = await prisma.linkedPolicy.findMany({
      where: { policyId: input.id },
      orderBy: { createdAt: "desc" },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linkedPolicies: linked.map((lp: any) => ({
        id: lp.id,
        name: lp.name,
        policyEngineId: lp.policyEngineId,
        policyEngineArn: lp.policyEngineArn,
        principal: {
          entityType: lp.principalEntityType,
          entityId: lp.principalEntityId,
        },
        resource: {
          entityType: lp.resourceEntityType,
          entityId: lp.resourceEntityId,
        },
        status: lp.status as z.infer<typeof LinkedPolicyStatusSchema>,
        createdAt: lp.createdAt,
        updatedAt: lp.updatedAt,
      })),
    };
  });

// ── Export Policy (increments exportCount + logs activity event) ─────────────

export const exportPolicy = authed
  .route({
    method: "POST",
    path: "/policy-library/export",
    tags: ["policy-library"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ success: z.boolean(), exportCount: z.number().int() }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const result = await prisma.$transaction(async (tx: PrismaTx) => {
      const policy = await tx.policy.update({
        where: { id: input.id },
        data: { exportCount: { increment: 1 } },
      });
      await tx.policyActivityEvent.create({
        data: {
          policyId: input.id,
          type: "exported",
          description: "Policy exported as .cedar file",
          actorId: userId,
          metadata: {},
        },
      });
      return policy;
    });
    return { success: true, exportCount: result.exportCount };
  });

// ── Instantiate Template ─────────────────────────────────────────────────────

const SLOT_PRINCIPAL = "?principal";
const SLOT_RESOURCE = "?resource";

// Returns which template slots (?principal / ?resource) appear in a Cedar body.
function detectSlots(cedar: string): Array<"?principal" | "?resource"> {
  const slots: Array<"?principal" | "?resource"> = [];
  if (cedar.includes(SLOT_PRINCIPAL)) slots.push(SLOT_PRINCIPAL);
  if (cedar.includes(SLOT_RESOURCE)) slots.push(SLOT_RESOURCE);
  return slots;
}

const EntityBindingSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

export const instantiateTemplate = authed
  .route({
    method: "POST",
    path: "/policy-library/instantiate",
    tags: ["policy-library"],
  })
  .input(
    z.object({
      templateId: z.string().min(1),
      name: z.string().min(1).max(255),
      description: z.string().max(2048).default(""),
      status: PolicyStatusSchema.default("draft"),
      tags: z.array(z.string()).default([]),
      principal: EntityBindingSchema.optional(),
      resource: EntityBindingSchema.optional(),
    }),
  )
  .output(z.object({ policy: PolicyItemSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;

    const template = await prisma.policy.findUnique({
      where: { id: input.templateId },
    });
    if (!template) {
      throw new ORPCError("NOT_FOUND", { message: "Template not found" });
    }
    if (!template.isTemplate) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Source policy is not a template",
      });
    }

    const slots = detectSlots(template.cedarCode);
    let cedar = template.cedarCode;

    if (slots.includes(SLOT_PRINCIPAL)) {
      if (!input.principal) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Principal binding required for ?principal slot",
        });
      }
      cedar = cedar.split(SLOT_PRINCIPAL).join(
        `${input.principal.entityType}::"${input.principal.entityId}"`,
      );
    }
    if (slots.includes(SLOT_RESOURCE)) {
      if (!input.resource) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Resource binding required for ?resource slot",
        });
      }
      cedar = cedar.split(SLOT_RESOURCE).join(
        `${input.resource.entityType}::"${input.resource.entityId}"`,
      );
    }

    const created = await prisma.$transaction(async (tx: PrismaTx) => {
      const policy = await tx.policy.create({
        data: {
          name: input.name,
          description: input.description,
          cedarCode: cedar,
          type: template.type,
          status: input.status,
          tags: input.tags,
          isTemplate: false,
          parentTemplateId: template.id,
          createdById: userId,
        },
        include: { createdBy: { select: { name: true, email: true } } },
      });

      await tx.policyVersion.create({
        data: {
          policyId: policy.id,
          version: 1,
          cedarCode: cedar,
          changeNote: `Instantiated from template "${template.name}"`,
          createdById: userId,
        },
      });

      await tx.policyActivityEvent.create({
        data: {
          policyId: policy.id,
          type: "created",
          description: `Policy instantiated from template "${template.name}"`,
          actorId: userId,
          metadata: {
            parentTemplateId: template.id,
            parentTemplateName: template.name,
          },
        },
      });

      // Also log the instantiation on the template itself for traceability
      await tx.policyActivityEvent.create({
        data: {
          policyId: template.id,
          type: "edited",
          description: `Template instantiated as "${input.name}"`,
          actorId: userId,
          metadata: { instanceId: policy.id, instanceName: input.name },
        },
      });

      return policy;
    });

    return { policy: serializePolicy(created) };
  });

// ── Router Export ────────────────────────────────────────────────────────────

export const policyLibraryRouter = {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  saveNewVersion,
  revertToVersion,
  deletePolicy,
  exportPolicy,
  instantiateTemplate,
  listVersions,
  listActivity,
  listLinkedPolicies,
};
