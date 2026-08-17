import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import type { Database, Json } from "@/integrations/supabase/types";
import { toast } from "sonner";

export interface MenuItemSize {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  sizes: MenuItemSize[];
  imageUrl: string;
  available: boolean;
  preparationTime?: number;
}

const DEFAULT_CATEGORIES = ["Drinks", "Food", "Desserts"];
const UNCATEGORIZED_CATEGORY = "Uncategorized";

type VenueMenuItemRow = Database["public"]["Tables"]["venue_menu_items"]["Row"];

function isMenuItemSize(value: unknown): value is MenuItemSize {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const size = value as Record<string, unknown>;
  return (
    typeof size.id === "string" &&
    typeof size.name === "string" &&
    typeof size.price === "number"
  );
}

function toMenuItem(item: VenueMenuItemRow): MenuItem {
  const sizes: MenuItemSize[] = [];

  if (Array.isArray(item.sizes)) {
    item.sizes.forEach((size) => {
      if (isMenuItemSize(size)) sizes.push(size);
    });
  }

  return {
    id: item.id,
    name: item.name,
    description: item.description || "",
    category: item.category,
    basePrice: Number(item.base_price),
    sizes,
    imageUrl: item.image_url || "",
    available: item.available,
    preparationTime: item.preparation_time ?? undefined,
  };
}

export function useVenueMenuDB(venueId: string | null) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);

  // Fetch menu items from database
  const fetchMenuItems = useCallback(async () => {
    if (!venueId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("venue_menu_items")
        .select("*")
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const items = (data || []).map(toMenuItem);

      setMenuItems(items);
    } catch (error) {
      console.error("Error fetching menu items:", error);
      toast.error("Failed to load menu items");
    }

    setLoading(false);
  }, [venueId]);

  // Fetch categories from database
  const fetchCategories = useCallback(async () => {
    if (!venueId) return;

    try {
      const { data, error } = await supabase
        .from("venue_menu_categories")
        .select("name")
        .eq("venue_id", venueId)
        .order("sort_order");

      if (error) throw error;

      if (data && data.length > 0) {
        setCategories(data.map((category) => category.name));
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [venueId]);

  // Load on mount
  useEffect(() => {
    fetchMenuItems();
    fetchCategories();
  }, [fetchMenuItems, fetchCategories]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!venueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`menu-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_menu_items",
          filter: `venue_id=eq.${venueId}`,
        },
        () => {
          fetchMenuItems();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_menu_categories",
          filter: `venue_id=eq.${venueId}`,
        },
        () => {
          fetchCategories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, fetchMenuItems, fetchCategories]);

  // Add or update item
  const saveItem = useCallback(
    async (item: MenuItem) => {
      if (!venueId) return false;

      const exists = menuItems.find((m) => m.id === item.id);

      const dbItem = {
        venue_id: venueId,
        name: item.name,
        description: item.description,
        category: item.category,
        base_price: item.basePrice,
        sizes: item.sizes.map((size) => ({
          id: size.id,
          name: size.name,
          price: size.price,
        })) as Json,
        image_url: item.imageUrl,
        available: item.available,
        preparation_time: item.preparationTime,
      };

      try {
        if (exists) {
          const { error } = await supabase
            .from("venue_menu_items")
            .update(dbItem)
            .eq("id", item.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("venue_menu_items")
            .insert([{ ...dbItem, id: item.id }]);
          if (error) throw error;
        }
        fetchMenuItems();
        return true;
      } catch (error) {
        console.error("Error saving menu item:", error);
        toast.error("Failed to save menu item");
        return false;
      }
    },
    [venueId, menuItems, fetchMenuItems]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from("venue_menu_items")
          .delete()
          .eq("id", id);
        if (error) throw error;
        fetchMenuItems();
        return true;
      } catch (error) {
        console.error("Error deleting menu item:", error);
        toast.error("Failed to delete menu item");
        return false;
      }
    },
    [fetchMenuItems]
  );

  const toggleAvailability = useCallback(
    async (id: string) => {
      const item = menuItems.find((m) => m.id === id);
      if (!item) return false;

      try {
        const { error } = await supabase
          .from("venue_menu_items")
          .update({ available: !item.available })
          .eq("id", id);
        if (error) throw error;
        fetchMenuItems();
        return true;
      } catch (error) {
        console.error("Error toggling availability:", error);
        toast.error("Failed to update availability");
        return false;
      }
    },
    [menuItems, fetchMenuItems]
  );

  const addCategory = useCallback(
    async (category: string) => {
      if (!venueId) return false;
      const name = category.trim();
      if (!name) return false;
      if (categories.some((existingCategory) => existingCategory.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        return true;
      }

      try {
        const { error } = await supabase
          .from("venue_menu_categories")
          .insert({ venue_id: venueId, name });
        if (error) throw error;
        setCategories((currentCategories) => (
          currentCategories.some((existingCategory) => existingCategory.toLocaleLowerCase() === name.toLocaleLowerCase())
            ? currentCategories
            : [...currentCategories, name]
        ));
        return true;
      } catch (error) {
        console.error("Error adding category:", error);
        toast.error("Failed to add category");
        return false;
      }
    },
    [venueId, categories]
  );

  const renameCategory = useCallback(
    async (currentName: string, nextName: string) => {
      if (!venueId) return false;

      const category = nextName.trim();
      if (!category) {
        toast.error("Enter a category name");
        return false;
      }

      if (category === currentName) return true;

      const hasDuplicate = categories.some(
        (existingCategory) =>
          existingCategory !== currentName &&
          existingCategory.toLocaleLowerCase() === category.toLocaleLowerCase()
      );

      if (hasDuplicate) {
        toast.error("Category already exists");
        return false;
      }

      try {
        const { data, error } = await supabase.rpc(
          "rename_venue_menu_category",
          {
            p_venue_id: venueId,
            p_current_name: currentName,
            p_next_name: category,
          }
        );

        if (error) throw error;
        if (data !== true) {
          toast.error("Failed to rename category");
          return false;
        }

        setCategories((currentCategories) =>
          currentCategories.map((existingCategory) =>
            existingCategory === currentName ? category : existingCategory
          )
        );
        setMenuItems((currentItems) =>
          currentItems.map((item) =>
            item.category === currentName ? { ...item, category } : item
          )
        );
        return true;
      } catch (error) {
        console.error("Error renaming category:", error);
        toast.error("Failed to rename category");
        return false;
      }
    },
    [venueId, categories]
  );

  const deleteCategory = useCallback(
    async (category: string) => {
      if (!venueId) return false;

      if (category.toLocaleLowerCase() === UNCATEGORIZED_CATEGORY.toLocaleLowerCase()) {
        toast.error("The Uncategorized category cannot be deleted");
        return false;
      }

      try {
        const { data, error } = await supabase.rpc(
          "delete_venue_menu_category",
          {
            p_venue_id: venueId,
            p_category: category,
          }
        );

        if (error) throw error;
        if (data !== true) {
          toast.error("Failed to delete category");
          return false;
        }

        setCategories((currentCategories) => {
          const remainingCategories = currentCategories.filter(
            (existingCategory) => existingCategory !== category
          );

          return remainingCategories.some(
            (existingCategory) =>
              existingCategory.toLocaleLowerCase() === UNCATEGORIZED_CATEGORY.toLocaleLowerCase()
          )
            ? remainingCategories
            : [...remainingCategories, UNCATEGORIZED_CATEGORY];
        });
        setMenuItems((currentItems) =>
          currentItems.map((item) =>
            item.category === category
              ? { ...item, category: UNCATEGORIZED_CATEGORY }
              : item
          )
        );
        return true;
      } catch (error) {
        console.error("Error deleting category:", error);
        toast.error("Failed to delete category");
        return false;
      }
    },
    [venueId]
  );

  const setAllCategories = useCallback(
    async (cats: string[]) => {
      if (!venueId) return;

      // Delete existing and re-insert
      try {
        await supabase
          .from("venue_menu_categories")
          .delete()
          .eq("venue_id", venueId);

        if (cats.length > 0) {
          const inserts = cats.map((name, i) => ({
            venue_id: venueId,
            name,
            sort_order: i,
          }));
          await supabase.from("venue_menu_categories").insert(inserts);
        }
        setCategories(cats);
      } catch (error) {
        console.error("Error updating categories:", error);
      }
    },
    [venueId]
  );

  return {
    menuItems,
    categories,
    loading,
    saveItem,
    deleteItem,
    toggleAvailability,
    addCategory,
    renameCategory,
    deleteCategory,
    setAllCategories,
    refreshMenu: fetchMenuItems,
  };
}
