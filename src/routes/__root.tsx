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
import { useEffect, useState } from "react";
import appCss from "../styles.css?url";
import { AppShell } from "@/components/layout/AppShell";
import { auth, useAuth } from "@/lib/mock";
import { Toaster } from "@/components/ui/sonner";
import { seedIfEmpty } from "@/lib/workflow-engine";
import { tokenStore, hasApiBase, api } from "@/lib/api/client";
import { mapApiUserToAppUser, type ApiUser } from "@/lib/api/auth";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "منصة إدارة وتمويل الواردات | اللجنة الوطنية لتمويل الواردات" },
      {
        name: "description",
        content: "منصة رقمية لإدارة ومراجعة طلبات تمويل الواردات للجنة الوطنية لتمويل الواردات",
      },
      { property: "og:title", content: "منصة إدارة وتمويل الواردات | اللجنة الوطنية لتمويل الواردات" },
      { name: "twitter:title", content: "منصة إدارة وتمويل الواردات | اللجنة الوطنية لتمويل الواردات" },
      {
        property: "og:description",
        content: "منصة رقمية لإدارة ومراجعة طلبات تمويل الواردات للجنة الوطنية لتمويل الواردات",
      },
      {
        name: "twitter:description",
        content: "منصة رقمية لإدارة ومراجعة طلبات تمويل الواردات للجنة الوطنية لتمويل الواردات",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/uCWYibmUVBhcjtCCADDdZqetr0F2/social-images/social-1778277825171-logo.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/uCWYibmUVBhcjtCCADDdZqetr0F2/social-images/social-1778277825171-logo.webp",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div
      dir="rtl"
      className="min-h-screen grid place-items-center p-6 bg-background text-foreground"
    >
      <div className="text-center">
        <div className="text-sm font-medium text-primary">خطأ 404</div>
        <h1 className="mt-2 text-3xl font-semibold">تعذر العثور على الصفحة</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          قد يكون الرابط غير صحيح أو نُقلت الصفحة إلى عنوان آخر.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          العودة إلى اللوحة الرئيسية
        </a>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    seedIfEmpty();
  }, []);
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
  const [restoring, setRestoring] = useState(() => !user && hasApiBase() && !!tokenStore.get());

  useEffect(() => {
    if (!restoring) return;
    let cancelled = false;
    api.get<ApiUser>("/auth/me").then((data) => {
      if (cancelled) return;
      auth.login(mapApiUserToAppUser(data));
    }).catch(() => {
      tokenStore.clear();
    }).finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => { cancelled = true; };
  }, [restoring]);

  useEffect(() => {
    if (restoring) return;
    if (!user && path !== "/login") nav({ to: "/login" });
    if (user && path === "/login") nav({ to: "/" });
  }, [user, path, nav, restoring]);

  if (restoring) return null;
  if (!user || path === "/login") return <Outlet />;
  return <AppShell />;
}
