import { os } from "@orpc/server";
import { z } from "zod";

export const health = os
  .route({ method: "GET", path: "/health", tags: ["health"] })
  .output(z.object({ message: z.string() }))
  .handler(async () => {
    return { message: "healthy" };
  });

export const healthRouter = {
  health,
};
