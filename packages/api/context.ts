import { ORPCError, os } from "@orpc/server";
import { auth } from "@package/auth/server";

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
