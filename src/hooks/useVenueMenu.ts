import { useState, useEffect, useCallback } from "react";
import { MenuItem } from "@/components/Venue/MenuItemModal";

const MENU_STORAGE_KEY = "venue_menu_items";
const CATEGORIES_STORAGE_KEY = "venue_menu_categories";

const DEFAULT_CATEGORIES = ["Drinks", "Food", "Desserts"];

export function useVenueMenu() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    const loadData = () => {
      try {
        const savedItems = localStorage.getItem(MENU_STORAGE_KEY);
        const savedCategories = localStorage.getItem(CATEGORIES_STORAGE_KEY);
        
        if (savedItems) {
          setMenuItems(JSON.parse(savedItems));
        }
        if (savedCategories) {
          setCategories(JSON.parse(savedCategories));
        }
      } catch (error) {
        console.error("Error loading menu data:", error);
      }
      setLoading(false);
    };

    loadData();
  }, []);

  // Save menu items to localStorage
  const saveMenuItems = useCallback((items: MenuItem[]) => {
    setMenuItems(items);
    localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(items));
    // Dispatch event for POS context to pick up
    window.dispatchEvent(new CustomEvent("menu-updated", { detail: items }));
  }, []);

  // Save categories to localStorage
  const saveCategories = useCallback((cats: string[]) => {
    setCategories(cats);
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(cats));
  }, []);

  const addItem = useCallback((item: MenuItem) => {
    const updated = [...menuItems, item];
    saveMenuItems(updated);
  }, [menuItems, saveMenuItems]);

  const updateItem = useCallback((item: MenuItem) => {
    const updated = menuItems.map(m => m.id === item.id ? item : m);
    saveMenuItems(updated);
  }, [menuItems, saveMenuItems]);

  const deleteItem = useCallback((id: string) => {
    const updated = menuItems.filter(m => m.id !== id);
    saveMenuItems(updated);
  }, [menuItems, saveMenuItems]);

  const toggleAvailability = useCallback((id: string) => {
    const updated = menuItems.map(m => 
      m.id === id ? { ...m, available: !m.available } : m
    );
    saveMenuItems(updated);
  }, [menuItems, saveMenuItems]);

  const addCategory = useCallback((category: string) => {
    if (!categories.includes(category)) {
      saveCategories([...categories, category]);
    }
  }, [categories, saveCategories]);

  const removeCategory = useCallback((category: string) => {
    saveCategories(categories.filter(c => c !== category));
  }, [categories, saveCategories]);

  const setAllCategories = useCallback((cats: string[]) => {
    saveCategories(cats);
  }, [saveCategories]);

  return {
    menuItems,
    categories,
    loading,
    addItem,
    updateItem,
    deleteItem,
    toggleAvailability,
    addCategory,
    removeCategory,
    setAllCategories,
    saveItem: (item: MenuItem) => {
      const exists = menuItems.find(m => m.id === item.id);
      if (exists) {
        updateItem(item);
      } else {
        addItem(item);
      }
    }
  };
}
