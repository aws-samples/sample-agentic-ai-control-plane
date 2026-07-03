import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { router } from "@packages/api";

const link = new RPCLink({
  url: `${
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000"
  }/rpc`,
  headers: async () => {
    if (typeof window !== "undefined") {
      return {};
    }

    const { headers } = await import("next/headers");
    return await headers();
  },
});

export const $orpc: RouterClient<typeof router> = createORPCClient(link);
export const $api = createTanstackQueryUtils($orpc);
