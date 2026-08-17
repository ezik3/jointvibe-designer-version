import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveVenueId } from "@/hooks/useActiveVenueId";
import { useVenueMenuDB } from "@/hooks/useVenueMenuDB";
import MenuManagementView from "@/components/Venue/MenuManagementView";

export default function VenueMenuWorkspace() {
  const { user } = useAuth();
  const activeVenue = useActiveVenueId(user?.id);
  const menu = useVenueMenuDB(activeVenue.venueId);

  if (activeVenue.loading || (activeVenue.venueId !== null && menu.loading)) {
    return (
      <div className="venue-menu-loading" aria-label="Loading menu">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!activeVenue.venueId) {
    return (
      <div className="venue-menu-missing" role="alert">
        <AlertCircle aria-hidden="true" />
        <p>{activeVenue.error?.message || "No venue found for this account."}</p>
      </div>
    );
  }

  return (
    <MenuManagementView
      venueId={activeVenue.venueId}
      menuItems={menu.menuItems}
      categories={menu.categories}
      onSaveItem={menu.saveItem}
      onDeleteItem={menu.deleteItem}
      onToggleAvailability={menu.toggleAvailability}
      onAddCategory={menu.addCategory}
      onRenameCategory={menu.renameCategory}
      onDeleteCategory={menu.deleteCategory}
    />
  );
}
