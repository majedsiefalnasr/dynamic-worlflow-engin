import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/customs/$id/print")({
  component: () => <Navigate to="/workflows" replace />,
});
