import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/requests/$id/swift")({
  component: () => <Navigate to="/workflows" replace />,
});
