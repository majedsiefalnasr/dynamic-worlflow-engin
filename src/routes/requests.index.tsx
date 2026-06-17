import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/requests/")({
  component: () => <Navigate to="/workflows" replace />,
});
