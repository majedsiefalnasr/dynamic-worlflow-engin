import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/workflow-docs")({
  component: () => <Navigate to="/admin/workflows" replace />,
});
