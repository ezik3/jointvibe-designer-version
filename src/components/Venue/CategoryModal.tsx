import { useEffect, useState } from 'react';
import { Check, Info, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onAddCategory: (category: string) => boolean | void | Promise<boolean | void>;
  onRenameCategory: (currentName: string, nextName: string) => boolean | void | Promise<boolean | void>;
  onDeleteCategory: (category: string) => void;
  onEditCategory?: (category: string) => void;
  initialCategoryToEdit?: string | null;
}

export default function CategoryModal({
  isOpen,
  onClose,
  categories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onEditCategory,
  initialCategoryToEdit,
}: CategoryModalProps) {
  const { t } = useTranslation('venue');
  const [localCategories, setLocalCategories] = useState<string[]>(categories);
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLocalCategories(categories);
      setNewCategory('');
      const categoryToEdit = initialCategoryToEdit && categories.includes(initialCategoryToEdit)
        ? initialCategoryToEdit
        : null;
      setEditingCategory(categoryToEdit);
      setEditedName(categoryToEdit || '');
    }
  }, [categories, initialCategoryToEdit, isOpen]);

  const addCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const category = newCategory.trim();

    if (!category) {
      toast.error(t('category_modal.errors.name_required'));
      return;
    }
    if (localCategories.some((value) => value.toLowerCase() === category.toLowerCase())) {
      toast.error(t('category_modal.errors.duplicate'));
      return;
    }

    const added = await onAddCategory(category);
    if (added === false) return;

    setLocalCategories((currentCategories) => [...currentCategories, category]);
    setNewCategory('');
    toast.success(t('menu_item_modal.success.category_added', { name: category }));
  };

  const startEditingCategory = (category: string) => {
    setEditingCategory(category);
    setEditedName(category);
  };

  const renameCategory = async (event: React.FormEvent<HTMLFormElement>, closeAfterSave = false) => {
    event.preventDefault();
    if (!editingCategory) return;

    const category = editedName.trim();
    if (!category) {
      toast.error(t('category_modal.errors.name_required'));
      return;
    }
    if (localCategories.some(
      (value) => value !== editingCategory && value.toLowerCase() === category.toLowerCase()
    )) {
      toast.error(t('category_modal.errors.duplicate'));
      return;
    }

    const result = await onRenameCategory(editingCategory, category);
    if (result === false) return;

    setLocalCategories((currentCategories) => currentCategories.map(
      (value) => value === editingCategory ? category : value
    ));
    if (closeAfterSave) {
      onClose();
      return;
    }

    setEditingCategory(null);
    setEditedName('');
  };

  const isEditingSingleCategory = Boolean(
    initialCategoryToEdit && categories.includes(initialCategoryToEdit)
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="venue-menu-modal venue-menu-modal--medium">
        {isEditingSingleCategory ? (
          <>
            <DialogHeader className="venue-menu-modal__heading">
              <DialogTitle>Edit category</DialogTitle>
              <DialogDescription>Update the category name.</DialogDescription>
            </DialogHeader>
            <form className="venue-menu-category-edit-dialog" onSubmit={(event) => void renameCategory(event, true)}>
              <label htmlFor="venue-edit-category-name">
                <span>Name</span>
                <input
                  id="venue-edit-category-name"
                  value={editedName}
                  onChange={(event) => setEditedName(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="venue-menu-modal__actions">
                <button className="venue-menu-button venue-menu-button--secondary" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button className="venue-menu-button venue-menu-button--primary" type="submit">
                  <Check aria-hidden="true" />
                  <span>Save category</span>
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader className="venue-menu-modal__heading">
              <DialogTitle>
                <Tag aria-hidden="true" />
                {t('category_modal.title')}
              </DialogTitle>
              <DialogDescription>{t('category_modal.description')}</DialogDescription>
            </DialogHeader>

            <form className="venue-menu-category-add" onSubmit={(event) => void addCategory(event)}>
              <label className="sr-only" htmlFor="venue-new-category">
                {t('category_modal.new_placeholder')}
              </label>
              <input
                id="venue-new-category"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder={t('category_modal.new_placeholder')}
              />
              <button className="venue-menu-icon-button venue-menu-icon-button--primary" type="submit" aria-label="Add category" title="Add category">
                <Plus aria-hidden="true" />
              </button>
            </form>

            <div className="venue-menu-category-modal-list" aria-live="polite">
              {localCategories.length === 0 ? (
                <p className="venue-menu-category-modal-empty">{t('category_modal.empty')}</p>
              ) : (
                localCategories.map((category) => (
                  <div key={category} className="venue-menu-category-modal-row">
                    {editingCategory === category ? (
                      <form className="venue-menu-category-modal-edit" onSubmit={(event) => void renameCategory(event)}>
                        <input
                          value={editedName}
                          onChange={(event) => setEditedName(event.target.value)}
                          aria-label={`Rename ${category} category`}
                          autoFocus
                        />
                        <button className="venue-menu-category-action" type="submit" aria-label="Save category" title="Save category">
                          <Check aria-hidden="true" />
                        </button>
                        <button
                          className="venue-menu-category-action"
                          type="button"
                          aria-label="Cancel category rename"
                          title="Cancel"
                          onClick={() => {
                            setEditingCategory(null);
                            setEditedName('');
                          }}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <Tag aria-hidden="true" />
                        <span>{category}</span>
                        <div className="venue-menu-category-modal-row__actions">
                          <button
                            className="venue-menu-category-action"
                            type="button"
                            aria-label={`Edit ${category} category`}
                            title="Edit category"
                            onClick={() => onEditCategory ? onEditCategory(category) : startEditingCategory(category)}
                          >
                            <Pencil aria-hidden="true" />
                          </button>
                          <button
                            className="venue-menu-category-action venue-menu-category-action--danger"
                            type="button"
                            aria-label={`Delete ${category} category`}
                            title="Delete category"
                            onClick={() => onDeleteCategory(category)}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="venue-menu-category-guidance">
              <Info aria-hidden="true" />
              <p>{t('category_modal.help_intro')}</p>
            </div>

            <div className="venue-menu-modal__actions">
              <button className="venue-menu-button venue-menu-button--primary" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
