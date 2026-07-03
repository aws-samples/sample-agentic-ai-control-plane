import { createAuthClient } from "better-auth/react";

// Browser-side Better Auth client and its React hooks/helpers.
export const authClient = createAuthClient();

export const { signIn, signUp, useSession } = authClient;
