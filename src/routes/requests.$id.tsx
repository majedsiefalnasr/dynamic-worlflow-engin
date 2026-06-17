import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/requests/$id")({
  component: () => <Navigate to="/workflows" replace />,
});
