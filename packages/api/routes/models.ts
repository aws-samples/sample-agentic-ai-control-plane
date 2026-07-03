import { os } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";

const ModelSchema = z.object({
  id: z.string(),
  server: z.string(),
  provider: z.string(),
  name: z.string(),
  profile: z.string(),
  modelId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Lists all configured models ordered by name.
export const listModels = os
  .route({
    method: "GET",
    path: "/models/list",
    tags: ["models"],
  })
  .output(z.object({ models: z.array(ModelSchema) }))
  .handler(async () => {
    const models = await prisma.model.findMany({
      orderBy: { name: "asc" },
    });

    return { models };
  });

// Fetches a single model by id.
export const getModel = os
  .route({
    method: "GET",
    path: "/models/get",
    tags: ["models"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Model ID is required"),
    }),
  )
  .output(z.object({ model: ModelSchema }))
  .handler(async ({ input }) => {
    const model = await prisma.model.findUniqueOrThrow({
      where: { id: input.id },
    });

    return { model };
  });

// Creates a model record.
export const createModel = os
  .route({
    method: "POST",
    path: "/models/create",
    tags: ["models"],
  })
  .input(
    z.object({
      server: z.string().min(1, "Server is required"),
      provider: z.string().min(1, "Provider is required"),
      name: z.string().min(1, "Name is required").max(128),
      profile: z.string().min(1, "Profile is required"),
      modelId: z.string().min(1, "Model ID is required"),
    }),
  )
  .output(z.object({ model: ModelSchema }))
  .handler(async ({ input }) => {
    const model = await prisma.model.create({
      data: input,
    });

    return { model };
  });

// Updates a model's editable fields by id.
export const updateModel = os
  .route({
    method: "PATCH",
    path: "/models/update",
    tags: ["models"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Model ID is required"),
      server: z.string().min(1).optional(),
      provider: z.string().min(1).optional(),
      name: z.string().min(1).max(128).optional(),
      profile: z.string().min(1).optional(),
      modelId: z.string().min(1).optional(),
    }),
  )
  .output(z.object({ model: ModelSchema }))
  .handler(async ({ input }) => {
    const { id, ...data } = input;

    const model = await prisma.model.update({
      where: { id },
      data,
    });

    return { model };
  });

// Deletes a model by id.
export const deleteModel = os
  .route({
    method: "DELETE",
    path: "/models/delete",
    tags: ["models"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Model ID is required"),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
    }),
  )
  .handler(async ({ input }) => {
    await prisma.model.delete({
      where: { id: input.id },
    });

    return { success: true };
  });

export const modelsRouter = {
  listModels,
  getModel,
  createModel,
  updateModel,
  deleteModel,
};
