import { type ReactNode } from "react";
import { POSProvider } from "@/contexts/POSContext";
import { VenueModulesProvider } from "@/contexts/VenueModulesContext";
import VenueNotificationToast from "@/components/Venue/VenueNotificationToast";
import Sidebar, { type POSSidebarChrome } from "./Sidebar";
import "./pos-layout.css";

interface POSLayoutProps {
  children: ReactNode;
  sidebarChrome?: POSSidebarChrome;
}

export default function POSLayout({ children, sidebarChrome = "reference" }: POSLayoutProps) {
  return (
    <VenueModulesProvider>
      <POSProvider>
        <div className="pos-shell">
          <Sidebar chrome={sidebarChrome} />
          <main className="pos-shell-workspace">{children}</main>
        </div>
        <VenueNotificationToast />
      </POSProvider>
    </VenueModulesProvider>
  );
}
