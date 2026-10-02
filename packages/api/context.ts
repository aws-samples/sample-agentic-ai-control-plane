import { ORPCError, os } from "@orpc/server";
import { auth } from "@package/auth/server";
import { isPlatformAdmin } from "./platform-admin";

export const base = os.$context<{ headers: Headers }>();

export const authMiddleware = base.middleware(async ({ context, next }) => {
  const sessionData = await auth.api.getSession({ headers: context.headers });
  if (!sessionData?.session || !sessionData?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: sessionData.session,
      user: sessionData.user,
    },
  });
});

export const authed = base.use(authMiddleware);

// Requires the signed-in user to be in the Cognito platform-admin group
// (PLATFORM_ADMIN_GROUP). Chain after authMiddleware — it needs context.user.
export const adminMiddleware = os
  .$context<{ user: { id: string } }>()
  .middleware(async ({ context, next }) => {
    if (!(await isPlatformAdmin(context.user.id))) {
      throw new ORPCError("FORBIDDEN", {
        message: "This action requires platform administrator access.",
      });
    }
    return next();
  });

export const adminAuthed = authed.use(adminMiddleware);
