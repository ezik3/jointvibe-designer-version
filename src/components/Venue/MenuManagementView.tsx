import { useMemo, useState } from 'react';
import {
  CakeSlice,
  Coffee,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  SearchX,
  Sparkles,
  Tag,
  Trash2,
  Utensils,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import MenuItemModal from '@/components/Venue/MenuItemModal';
import CategoryModal from '@/components/Venue/CategoryModal';
import AIMenuUploadModal from '@/components/Venue/AIMenuUploadModal';
import MenuItemImageUpload from '@/components/Venue/MenuItemImageUpload';
import type { MenuItem } from '@/hooks/useVenueMenuDB';
import './menu-management-view.css';

type MenuMutationResult = boolean | void | Promise<boolean | void>;

interface MenuManagementViewProps {
  venueId: string;
  menuItems: MenuItem[];
  categories: string[];
  onSaveItem: (item: MenuItem) => MenuMutationResult;
  onDeleteItem: (id: string) => MenuMutationResult;
  onToggleAvailability: (id: string) => MenuMutationResult;
  onAddCategory: (category: string) => MenuMutationResult;
  onRenameCategory: (currentName: string, nextName: string) => boolean | void | Promise<boolean | void>;
  onDeleteCategory: (category: string) => boolean | void | Promise<boolean | void>;
}

export default function MenuManagementView({
  venueId,
  menuItems,
  categories,
  onSaveItem,
  onDeleteItem,
  onToggleAvailability,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
}: MenuManagementViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showItemModal, setShowItemModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAIUploadModal, setShowAIUploadModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [categoryToEdit, setCategoryToEdit] = useState<string | null>(null);
  const [categoryDeleteConfirm, setCategoryDeleteConfirm] = useState<string | null>(null);
  const [failedImageItemIds, setFailedImageItemIds] = useState<Set<string>>(() => new Set());

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const searchableText = `${item.name} ${item.category} ${item.basePrice} ${item.available ? 'available' : 'sold out'}`.toLowerCase();
      return matchesCategory && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [menuItems, searchQuery, selectedCategory]);

  const openNewItem = () => {
    setEditingItem(null);
    setShowItemModal(true);
  };

  const clearFailedImage = (itemId: string) => {
    setFailedImageItemIds((currentIds) => {
      if (!currentIds.has(itemId)) return currentIds;
      const nextIds = new Set(currentIds);
      nextIds.delete(itemId);
      return nextIds;
    });
  };

  const handleSaveItem = async (item: MenuItem) => {
    const saved = await onSaveItem(item);
    if (saved !== false) {
      setEditingItem(null);
      clearFailedImage(item.id);
    }
    return saved !== false;
  };

  const handleAddCategory = async (category: string) => {
    const added = await onAddCategory(category);
    return added !== false;
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const deleted = await onDeleteItem(deleteConfirm);
    if (deleted === false) return;
    setDeleteConfirm(null);
    toast.success('Item deleted');
  };

  const openCategoryModal = (category?: string) => {
    setCategoryToEdit(category || null);
    setShowCategoryModal(true);
  };

  const handleRenameCategory = async (currentName: string, nextName: string) => {
    const category = nextName.trim();
    const result = await onRenameCategory(currentName, category);

    if (result === false) return false;

    if (selectedCategory === currentName) {
      setSelectedCategory(category);
    }
    setCategoryToEdit(null);
    toast.success('Category renamed');
    return true;
  };

  const handleDeleteCategory = async () => {
    if (!categoryDeleteConfirm) return;

    const category = categoryDeleteConfirm;
    const result = await onDeleteCategory(category);

    if (result === false) return;

    if (selectedCategory === category) {
      setSelectedCategory('All');
    }
    setCategoryToEdit(null);
    setCategoryDeleteConfirm(null);
    toast.success('Category deleted. Its items are now Uncategorized.');
  };

  const handleAIImport = async (items: { name: string; description: string; price: number; category: string }[]) => {
    const categoryNamesByNormalizedName = new Map(
      categories.map((category) => [category.toLocaleLowerCase(), category])
    );
    const importedItems = items.map((item) => {
      const importedCategory = item.category.trim();
      const normalizedCategory = importedCategory.toLocaleLowerCase();
      const category = categoryNamesByNormalizedName.get(normalizedCategory) || importedCategory;
      categoryNamesByNormalizedName.set(normalizedCategory, category);
      return { ...item, category };
    });
    const newCategories = [...new Set(importedItems.map((item) => item.category))].filter((category) => !categories.some(
      (existingCategory) => existingCategory.toLocaleLowerCase() === category.toLocaleLowerCase()
    ));
    for (const category of newCategories) {
      const added = await onAddCategory(category);
      if (added === false) return false;
    }

    for (const item of importedItems) {
      const saved = await onSaveItem({
        id: uuidv4(),
        name: item.name,
        description: item.description,
        category: item.category,
        basePrice: item.price,
        sizes: [],
        imageUrl: '',
        available: true,
      });
      if (saved === false) return false;
    }

    return true;
  };

  const handleImageUpdated = async (item: MenuItem, imageUrl: string) => {
    try {
      const saved = await onSaveItem({ ...item, imageUrl });
      if (saved !== false) {
        clearFailedImage(item.id);
        toast.success('Image updated');
      }
    } catch (error) {
      console.error('Failed to update menu item image:', error);
      toast.error('Failed to update image');
    }
  };

  const handleToggleAvailability = async (id: string) => {
    try {
      const updated = await onToggleAvailability(id);
      if (updated === false) {
        toast.error('Failed to update availability');
      }
    } catch (error) {
      console.error('Failed to update menu item availability:', error);
      toast.error('Failed to update availability');
    }
  };

  const getCategoryIcon = (category: string) => {
    const normalizedCategory = category.toLowerCase();
    if (normalizedCategory.includes('drink')) return Coffee;
    if (normalizedCategory.includes('sweet') || normalizedCategory.includes('dessert')) return CakeSlice;
    if (normalizedCategory.includes('food')) return Utensils;
    return Tag;
  };

  const renderCategoryRow = (category: string) => {
    const itemCount = menuItems.filter((item) => item.category === category).length;
    const CategoryIcon = getCategoryIcon(category);
    return (
      <div
        key={category}
        className="venue-menu-category-row venue-menu-category-row--managed"
        role="listitem"
      >
        <span>
          <CategoryIcon aria-hidden="true" />
          <strong>{category}</strong>
        </span>
        <b>{itemCount}</b>
        <div className="venue-menu-category-row__actions">
          <button
            className="venue-menu-category-action"
            type="button"
            aria-label={`Edit ${category} category`}
            title="Edit category"
            onClick={() => openCategoryModal(category)}
          >
            <Pencil aria-hidden="true" />
          </button>
          <button
            className="venue-menu-category-action venue-menu-category-action--danger"
            type="button"
            aria-label={`Delete ${category} category`}
            title="Delete category"
            onClick={() => setCategoryDeleteConfirm(category)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="venue-menu-page">
      <header className="venue-menu-heading">
        <div>
          <h1>Menu management</h1>
          <p aria-live="polite">{filteredItems.length} items across {categories.length} categories</p>
        </div>
        <div className="venue-menu-heading__actions">
          <button className="venue-menu-button venue-menu-button--secondary" type="button" onClick={() => setShowAIUploadModal(true)}>
            <Sparkles aria-hidden="true" />
            <span>AI Upload</span>
          </button>
          <button className="venue-menu-button venue-menu-button--secondary" type="button" onClick={() => openCategoryModal()}>
            <Tag aria-hidden="true" />
            <span>Categories</span>
          </button>
          <button className="venue-menu-button venue-menu-button--primary" type="button" onClick={openNewItem}>
            <Plus aria-hidden="true" />
            <span>Add item</span>
          </button>
        </div>
      </header>

      <section className="venue-menu-toolbar" aria-label="Menu filters">
        <label className="venue-menu-search" htmlFor="venue-menu-search">
          <Search aria-hidden="true" />
          <input
            id="venue-menu-search"
            type="search"
            placeholder="Search menu items"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <div className="venue-menu-tabs" role="tablist" aria-label="Menu categories">
          {['All', ...categories].map((category) => {
            const isActive = selectedCategory === category;
            return (
              <button
                key={category}
                className={`venue-menu-tab${isActive ? ' venue-menu-tab--active' : ''}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="venue-menu-category-panel"
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            );
          })}
        </div>
      </section>

      <section className="venue-menu-content">
        <aside className="venue-menu-categories" aria-labelledby="venue-menu-categories-title">
          <div className="venue-menu-categories__heading">
            <div>
              <h2 id="venue-menu-categories-title">Categories</h2>
              <p>Organize your menu</p>
            </div>
          </div>
          <div className="venue-menu-category-list" role="list">
            {categories.map(renderCategoryRow)}
          </div>
        </aside>

        <section
          className="venue-menu-items-panel"
          id="venue-menu-category-panel"
          role="tabpanel"
          aria-label="Menu items"
        >
          {filteredItems.length > 0 && (
            <div className="venue-menu-grid">
              {filteredItems.map((item) => (
                <article key={item.id} className="venue-menu-card">
                  <div className="venue-menu-card__image group">
                    {item.imageUrl && !failedImageItemIds.has(item.id) ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        onError={() => {
                          setFailedImageItemIds((currentIds) => {
                            if (currentIds.has(item.id)) return currentIds;
                            return new Set(currentIds).add(item.id);
                          });
                        }}
                      />
                    ) : (
                      <span className="venue-menu-card__fallback"><ImagePlus aria-hidden="true" /></span>
                    )}
                    <MenuItemImageUpload
                      venueId={venueId}
                      itemName={item.name}
                      category={item.category}
                      description={item.description}
                      onImageUploaded={(imageUrl) => {
                        void handleImageUpdated(item, imageUrl);
                      }}
                    />
                  </div>
                  <div className="venue-menu-card__body">
                    <div className="venue-menu-card__title">
                      <h2>{item.name}</h2>
                      <span className={`venue-menu-availability${item.available ? '' : ' venue-menu-availability--off'}`}>
                        {item.available ? 'Available' : 'Sold out'}
                      </span>
                    </div>
                    <span className="venue-menu-card__category">{item.category}</span>
                    <strong>${item.basePrice.toFixed(2)}</strong>
                    <div className="venue-menu-card__actions">
                      <button className="venue-menu-button venue-menu-button--secondary" type="button" onClick={() => {
                        setEditingItem(item);
                        setShowItemModal(true);
                      }}>
                        <Pencil aria-hidden="true" />
                        <span>Edit</span>
                      </button>
                      <button
                        className="venue-menu-icon-button"
                        type="button"
                        aria-label={item.available ? `Mark ${item.name} as sold out` : `Make ${item.name} available`}
                        title={item.available ? 'Mark sold out' : 'Make available'}
                        onClick={() => void handleToggleAvailability(item.id)}
                      >
                        {item.available ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </button>
                      <button className="venue-menu-icon-button venue-menu-icon-button--danger" type="button" aria-label={`Delete ${item.name}`} title="Delete item" onClick={() => setDeleteConfirm(item.id)}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {filteredItems.length === 0 && (
            <p className="venue-menu-empty">
              <SearchX aria-hidden="true" />
              No menu items match this filter.
            </p>
          )}
        </section>
      </section>

      <MenuItemModal
        isOpen={showItemModal}
        onClose={() => {
          setShowItemModal(false);
          setEditingItem(null);
        }}
        item={editingItem}
        categories={categories}
        onSave={handleSaveItem}
        onAddCategory={handleAddCategory}
        venueId={venueId}
      />
      <AIMenuUploadModal
        isOpen={showAIUploadModal}
        onClose={() => setShowAIUploadModal(false)}
        onImport={handleAIImport}
        existingCategories={categories}
      />
      <CategoryModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setCategoryToEdit(null);
        }}
        categories={categories}
        onAddCategory={handleAddCategory}
        onRenameCategory={handleRenameCategory}
        onDeleteCategory={setCategoryDeleteConfirm}
        onEditCategory={openCategoryModal}
        initialCategoryToEdit={categoryToEdit}
      />
      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="venue-menu-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete menu item?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this item from your menu.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="venue-menu-delete-dialog__confirm" onClick={() => void handleDelete()}>
              <Trash2 aria-hidden="true" />
              Delete item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(categoryDeleteConfirm)} onOpenChange={() => setCategoryDeleteConfirm(null)}>
        <AlertDialogContent className="venue-menu-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {categoryDeleteConfirm}? Its menu items will move to Uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="venue-menu-delete-dialog__confirm" onClick={() => void handleDeleteCategory()}>
              <Trash2 aria-hidden="true" />
              Delete category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
