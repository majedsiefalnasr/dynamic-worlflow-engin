import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/mock";
import { Toaster } from "@/components/ui/sonner";
import { seedIfEmpty } from "@/lib/workflow-engine";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "منصة إدارة وتمويل الواردات — البنك المركزي اليمني" },
      { name: "description", content: "منصة رقمية لإدارة ومراجعة طلبات تمويل الواردات للبنك المركزي اليمني" },
      { property: "og:title", content: "منصة إدارة وتمويل الواردات — البنك المركزي اليمني" },
      { name: "twitter:title", content: "منصة إدارة وتمويل الواردات — البنك المركزي اليمني" },
      { property: "og:description", content: "منصة رقمية لإدارة ومراجعة طلبات تمويل الواردات للبنك المركزي اليمني" },
      { name: "twitter:description", content: "منصة رقمية لإدارة ومراجعة طلبات تمويل الواردات للبنك المركزي اليمني" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/uCWYibmUVBhcjtCCADDdZqetr0F2/social-images/social-1778277825171-logo.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/uCWYibmUVBhcjtCCADDdZqetr0F2/social-images/social-1778277825171-logo.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Tajawal:wght@500;700;800&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div dir="rtl" className="min-h-screen grid place-items-center p-6 bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">الصفحة غير موجودة</p>
        <a href="/" className="inline-block mt-6 px-4 py-2 rounded-md bg-primary text-primary-foreground">العودة للرئيسية</a>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => { seedIfEmpty(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir="rtl">
        <AuthGate />
        <Toaster position="top-center" dir="rtl" />
      </DirectionProvider>
    </QueryClientProvider>
  );
}

function AuthGate() {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();

  useEffect(() => {
    if (!user && path !== "/login") nav({ to: "/login" });
    if (user && path === "/login") nav({ to: "/" });
  }, [user, path, nav]);

  if (!user || path === "/login") return <Outlet />;
  return <AppShell />;
}
