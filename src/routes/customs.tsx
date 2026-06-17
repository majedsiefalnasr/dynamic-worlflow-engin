import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/customs")({
  component: () => <Navigate to="/workflows" replace />,
});
