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
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-base font-bold text-white " +
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
                    <span className="truncate text-xs text-text-muted">{cfg.tag}</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.08em]">Menu</SidebarGroupLabel>
            <SidebarMenu>
              {cfg.nav.map((item) => {
                const active = isActive(pathname, item.href, cfg.home);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="text-text-muted hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-white"
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
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-background/80 px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1 text-text-muted hover:text-foreground" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="font-display text-base font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
        {/* SidebarInset is the <main> landmark; this is just the padded column. */}
        <div className="mx-auto w-full max-w-[1200px] flex-1 p-4 md:p-8">{children}</div>
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
