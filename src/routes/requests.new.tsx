import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/requests/new")({
  component: () => <Navigate to="/workflows" replace />,
});
