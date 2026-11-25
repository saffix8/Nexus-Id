"use client";

// AppShell — shadcn sidebar (sidebar-07 style: collapsible to icons, user menu in the footer)
// + 56 px top bar. Shared by the End User (/dashboard) and Service Provider (/verifier) areas.
// Nav config lives here (icons are components and can't cross the server→client boundary).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ChevronsUpDown,
  CodeXml,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Smartphone,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export type AppArea = "user" | "provider";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Top-bar title when it differs from the nav label. */
  title?: string;
}

interface AreaConfig {
  name: string;
  tag: string;
  home: string;
  nav: NavItem[];
  switchTo: { label: string; href: string };
  logoutAction: string;
  afterLogout: string;
}

const AREAS: Record<AppArea, AreaConfig> = {
  user: {
    name: "NexusID",
    tag: "Wallet",
    home: "/dashboard",
    nav: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Credentials", href: "/dashboard/credentials", icon: WalletCards, title: "My credentials" },
      { label: "Requests", href: "/dashboard/requests", icon: Inbox },
      { label: "History", href: "/dashboard/history", icon: History, title: "Verification history" },
      { label: "Devices", href: "/dashboard/devices", icon: Smartphone },
    ],
    switchTo: { label: "Service Provider portal", href: "/verifier/dashboard" },
    logoutAction: "logout",
    afterLogout: "/auth/login",
  },
  provider: {
    name: "NexusID",
    tag: "Provider",
    home: "/verifier/dashboard",
    nav: [
      { label: "Dashboard", href: "/verifier/dashboard", icon: LayoutDashboard },
      { label: "Requirements", href: "/verifier/requirements", icon: ListChecks, title: "Verification requirements" },
      { label: "API keys", href: "/verifier/api-keys", icon: KeyRound },
      { label: "Integration", href: "/verifier/integration", icon: CodeXml },
    ],
    switchTo: { label: "End User wallet", href: "/dashboard" },
    logoutAction: "verifier-logout",
    afterLogout: "/auth/provider-login",
  },
};

export interface AppShellUser {
  name: string;
  /** Email (End User) or domain (Service Provider). */
  subtitle?: string;
}

interface AppShellProps {
  area: AppArea;
  user: AppShellUser;
  /** Top-bar title; defaults to the active nav item's title. */
  title?: string;
  /** Right side of the top bar. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string, home: string) {
  return href === home ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-base font-bold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] " +
        (className ?? "")
      }
      aria-hidden="true"
    >
      N
    </span>
  );
}

export function AppShell({ area, user, title: titleOverride, actions, children }: AppShellProps) {
  const cfg = AREAS[area];
  const pathname = usePathname() ?? "";
  const current = cfg.nav.find((n) => isActive(pathname, n.href, cfg.home));
  const title = titleOverride ?? (current ? current.title ?? current.label : cfg.tag);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={cfg.name}>
                <Link href={cfg.home}>
                  <LogoMark />
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-display text-sm font-semibold">{cfg.name}</span>
                    <span className="truncate text-xs text-text-muted">{cfg.tag} portal</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="pt-1">
            <SidebarGroupLabel className="sr-only">Navigation</SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {cfg.nav.map((item) => {
                const active = isActive(pathname, item.href, cfg.home);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="h-9 text-text-muted transition-colors hover:bg-overlay hover:text-foreground data-[active=true]:bg-overlay data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_hsl(var(--border))] [&>svg]:size-[18px] data-[active=true]:[&>svg]:text-accent-text"
                    >
                      <Link href={item.href} aria-current={active ? "page" : undefined}>
                        <item.icon strokeWidth={1.75} aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <NavUser cfg={cfg} user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <SidebarTrigger className="-ml-1.5 size-8 text-text-muted hover:text-foreground" />
          <Link href={cfg.home} className="flex items-center md:hidden" aria-label={`${cfg.name} home`}>
            <LogoMark className="size-7 text-sm" />
          </Link>
          <Separator orientation="vertical" className="h-4 bg-border" />
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-text-muted sm:inline">{cfg.tag}</span>
            <span className="hidden text-text-faint sm:inline" aria-hidden="true">/</span>
            <span className="truncate font-medium text-foreground" aria-current="page">{title}</span>
          </nav>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
        {/* SidebarInset is the <main> landmark; this is just the padded column. */}
        <div className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 2xl:max-w-[1360px]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

function NavUser({ cfg, user }: { cfg: AreaConfig; user: AppShellUser }) {
  const router = useRouter();
  const { isMobile } = useSidebar();

  async function signOut() {
    // Session cookies are httpOnly — only the server route can clear them.
    await fetch(`/api/auth?action=${cfg.logoutAction}`, { method: "POST" });
    router.push(cfg.afterLogout);
    router.refresh();
  }

  const avatar = (
    <Avatar className="size-8 rounded-lg">
      <AvatarFallback className="rounded-lg bg-overlay text-xs font-semibold text-foreground">
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {avatar}
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                {user.subtitle && <span className="truncate text-xs text-text-muted">{user.subtitle}</span>}
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                {avatar}
                <span className="grid flex-1 leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  {user.subtitle && <span className="truncate font-mono text-xs text-text-muted">{user.subtitle}</span>}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={cfg.switchTo.href}>
                <ArrowLeftRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {cfg.switchTo.label}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} className="text-danger focus:text-danger">
              <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
