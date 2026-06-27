import { createRouter } from "@tanstack/react-router";
import { assertResourceEnv } from "@/lib/data/source";
import { makeQueryClient } from "@/lib/data/query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  assertResourceEnv();
  const queryClient = makeQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
