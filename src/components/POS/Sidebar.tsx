import { useEffect, useMemo, useState, type ComponentType } from "react";
import { NavLink } from "@/components/NavLink";
import {
  Armchair,
  ArrowLeft,
  BarChart3,
  Boxes,
  ChefHat,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  NotebookTabs,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  ReceiptText,
  Settings2,
  ShoppingCart,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLocation, useNavigate } from "react-router-dom";
import { useVenueModulesOptional } from "@/hooks/useVenueModules";
import { useVenueWallet } from "@/hooks/useVenueWallet";
import { useTranslation } from "react-i18next";

type POSNavGroup = "workspace" | "manage" | "footer";

export type POSSidebarChrome = "standard" | "reference";

interface POSNavItem {
  key: string;
  url: string;
  icon: ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
  module: string | null;
  permKey: string | null;
  group: POSNavGroup;
}

const posSidebarStorageKey = "jointvibe-pos-sidebar-collapsed";

const allNavItems: POSNavItem[] = [
  { key: "dashboard", url: "/venue/pos/dashboard", icon: LayoutDashboard, module: null, permKey: null, group: "workspace" },
  { key: "new_order", url: "/venue/pos/new-order", icon: ShoppingCart, module: null, permKey: "pos", group: "workspace" },
  { key: "orders", url: "/venue/pos/orders", icon: ReceiptText, module: "orders", permKey: "orders", group: "workspace" },
  { key: "kitchen", url: "/venue/pos/kitchen", icon: ChefHat, module: "kitchen", permKey: "kitchen", group: "workspace" },
  { key: "menu", url: "/venue/pos/menu", icon: NotebookTabs, module: "menu", permKey: "menu", group: "manage" },
  { key: "tables", url: "/venue/pos/tables", icon: Armchair, module: "tables", permKey: "tables", group: "manage" },
  { key: "floorplan", url: "/venue/pos/floorplan", icon: PanelsTopLeft, module: "floorplan", permKey: "floorplan", group: "manage" },
  { key: "inventory", url: "/venue/pos/inventory", icon: Boxes, module: "inventory", permKey: "inventory", group: "manage" },
  { key: "staff", url: "/venue/pos/staff", icon: UsersRound, module: "staff", permKey: "staff", group: "manage" },
  { key: "analytics", url: "/venue/pos/analytics", icon: BarChart3, module: null, permKey: "analytics", group: "manage" },
  { key: "settings", url: "/venue/pos/settings", icon: Settings2, module: null, permKey: "settings", group: "footer" },
];

interface SidebarContentProps {
  collapsed: boolean;
  employeeName: string;
  employeeRole: string;
  isWorkMode: boolean;
  navItems: POSNavItem[];
  onNavigate: () => void;
  onToggleCollapsed: () => void;
  venueId: string | null;
  showIdentity: boolean;
  activeNavKey?: string;
}

interface SidebarProps {
  chrome?: POSSidebarChrome;
  activeNavKey?: string;
}

function SidebarContent({
  collapsed,
  employeeName,
  employeeRole,
  isWorkMode,
  navItems,
  onNavigate,
  onToggleCollapsed,
  venueId,
  showIdentity,
  activeNavKey,
}: SidebarContentProps) {
  const { t } = useTranslation("pos");
  const navigate = useNavigate();
  const { balance, loading: walletLoading } = useVenueWallet(venueId);
  const workspaceItems = navItems.filter((item) => item.group === "workspace");
  const manageItems = navItems.filter((item) => item.group === "manage");
  const footerItems = navItems.filter((item) => item.group === "footer");
  const walletDisplay = walletLoading ? "..." : `$${balance.jvc.toLocaleString()}`;
  const avatarUrl = localStorage.getItem("work_mode_employee_avatar") || "";
  const employeeInitials = employeeName
    .split(" ")
    .filter(Boolean)
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "E";
  const roleLabels: Record<string, string> = {
    kitchen: t("roles.kitchen"),
    waiter: t("roles.waiter"),
    bartender: t("roles.bartender"),
    host: t("roles.host"),
    manager: t("roles.manager"),
  };

  const handleExitWorkMode = () => {
    localStorage.removeItem("work_mode");
    localStorage.removeItem("work_mode_venue_id");
    localStorage.removeItem("work_mode_role");
    localStorage.removeItem("work_mode_venue");
    localStorage.removeItem("work_mode_employee_name");
    localStorage.removeItem("work_mode_employee_avatar");
    localStorage.removeItem("work_mode_permissions");
    localStorage.removeItem("work_mode_start");
    onNavigate();
    navigate("/app/feed");
  };

  const renderNavItem = (item: POSNavItem) => {
    const Icon = item.icon;
    const label = t(`nav.${item.key}`);

    return (
      <NavLink
        key={item.url}
        to={item.url}
        onClick={onNavigate}
        className={`pos-nav__item${activeNavKey === item.key ? " is-active" : ""}`}
        activeClassName={activeNavKey ? undefined : "is-active"}
        aria-label={label}
        title={collapsed ? label : undefined}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    );
  };

  return (
    <>
      <div className="pos-rail__header">
        {isWorkMode ? (
          <button
            className="pos-return pos-return--exit"
            type="button"
            onClick={handleExitWorkMode}
            aria-label={t("sidebar.exit_work_mode")}
            title={collapsed ? t("sidebar.exit_work_mode") : undefined}
          >
            <LogOut aria-hidden="true" />
            <span>{t("sidebar.exit_work_mode")}</span>
          </button>
        ) : (
          <NavLink
            className="pos-return"
            to="/venue/home"
            onClick={onNavigate}
            aria-label={t("sidebar.back_to_venue_home")}
            title={collapsed ? t("sidebar.back_to_venue_home") : undefined}
          >
            <ArrowLeft aria-hidden="true" />
            <span>{t("sidebar.back_to_venue_home")}</span>
          </NavLink>
        )}
        <button
          className="pos-rail__toggle"
          type="button"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={onToggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </button>
      </div>

      {showIdentity && (isWorkMode ? (
        <div className="pos-rail__employee" title={collapsed ? employeeName : undefined}>
          <Avatar className="pos-rail__employee-avatar">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback>{employeeInitials}</AvatarFallback>
          </Avatar>
          <span>
            <strong>{employeeName}</strong>
            <small>{roleLabels[employeeRole] || employeeRole}</small>
          </span>
        </div>
      ) : (
        <NavLink
          className="pos-rail__wallet"
          to="/venue/wallet"
          onClick={onNavigate}
          aria-label={`Venue wallet: ${walletDisplay}`}
          title={collapsed ? `Venue wallet: ${walletDisplay}` : undefined}
        >
          <Wallet aria-hidden="true" />
          <span>
            <small>Venue wallet</small>
            <strong>{walletDisplay}</strong>
          </span>
        </NavLink>
      ))}

      <nav className="pos-nav" aria-label="Point of Sale navigation">
        {workspaceItems.length > 0 && <p className="pos-nav__label">WORKSPACE</p>}
        {workspaceItems.map(renderNavItem)}
        {manageItems.length > 0 && <p className="pos-nav__label pos-nav__label--secondary">MANAGE</p>}
        {manageItems.map(renderNavItem)}
      </nav>

      {footerItems.length > 0 && <footer className="pos-rail__footer">{footerItems.map(renderNavItem)}</footer>}
    </>
  );
}

export default function Sidebar({ chrome = "standard", activeNavKey }: SidebarProps) {
  const location = useLocation();
  const modulesContext = useVenueModulesOptional();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(posSidebarStorageKey) === "true");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isWorkMode, setIsWorkMode] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [workPermissions, setWorkPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const storedId = localStorage.getItem("jv_current_venue_id");
    if (storedId) setVenueId(storedId);

    const workModeEnabled = localStorage.getItem("work_mode") === "true";
    setIsWorkMode(workModeEnabled);

    if (!workModeEnabled) return;

    setEmployeeName(localStorage.getItem("work_mode_employee_name") || "Employee");
    setEmployeeRole(localStorage.getItem("work_mode_role") || "waiter");

    try {
      setWorkPermissions(JSON.parse(localStorage.getItem("work_mode_permissions") || "{}"));
    } catch {
      setWorkPermissions({});
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("pos-navigation-open", mobileOpen);
    return () => document.body.classList.remove("pos-navigation-open");
  }, [mobileOpen]);

  const navItems = useMemo(() => {
    let items = allNavItems;

    if (modulesContext && !modulesContext.loading) {
      items = items.filter((item) => !item.module || modulesContext.isModuleEnabled(item.module));
    }

    if (!isWorkMode) return items;

    return items.filter((item) => {
      if (item.url === "/venue/pos/dashboard") return true;
      if (!item.permKey) return false;

      return workPermissions[item.permKey] === true || (
        item.permKey === "pos" && workPermissions.accept_payments === true
      );
    });
  }, [isWorkMode, modulesContext, workPermissions]);

  const showIdentity = chrome === "standard";

  const toggleCollapsed = () => {
    setCollapsed((isCollapsed) => {
      const nextCollapsed = !isCollapsed;
      localStorage.setItem(posSidebarStorageKey, String(nextCollapsed));
      return nextCollapsed;
    });
  };

  const closeMobileMenu = () => setMobileOpen(false);

  return (
    <>
      <button
        className="pos-mobile-menu-toggle"
        type="button"
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
      >
        <MenuIcon aria-hidden="true" />
      </button>
      <button
        className={`pos-mobile-backdrop${mobileOpen ? " is-visible" : ""}`}
        type="button"
        aria-label="Close navigation"
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={closeMobileMenu}
      />
      <aside
        className={`pos-rail${collapsed ? " pos-rail--collapsed" : ""}${mobileOpen ? " pos-rail--mobile-open" : ""}`}
        aria-label="Point of Sale navigation"
      >
        <SidebarContent
          collapsed={collapsed}
          employeeName={employeeName}
          employeeRole={employeeRole}
          isWorkMode={isWorkMode}
          navItems={navItems}
          onNavigate={closeMobileMenu}
          onToggleCollapsed={toggleCollapsed}
          venueId={venueId}
          showIdentity={showIdentity}
          activeNavKey={activeNavKey}
        />
      </aside>
    </>
  );
}
