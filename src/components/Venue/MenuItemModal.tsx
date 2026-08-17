import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Check,
  DollarSign,
  Image as ImageIcon,
  Layers3,
  Link as LinkIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { updateVenueScoreCounter } from '@/hooks/useVenueTier';
import type { MenuItem, MenuItemSize } from '@/hooks/useVenueMenuDB';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';

export type { MenuItem, MenuItemSize } from '@/hooks/useVenueMenuDB';

interface MenuItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: MenuItem | null;
  categories: string[];
  onSave: (item: MenuItem) => boolean | void | Promise<boolean | void>;
  onAddCategory: (category: string) => boolean | void | Promise<boolean | void>;
  venueId: string;
}

export default function MenuItemModal({
  isOpen,
  onClose,
  item,
  categories,
  onSave,
  onAddCategory,
  venueId,
}: MenuItemModalProps) {
  const { t } = useTranslation('venue');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [sizes, setSizes] = useState<MenuItemSize[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [available, setAvailable] = useState(true);
  const [prepTime, setPrepTime] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [newSizePrice, setNewSizePrice] = useState('');
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [imageFileName, setImageFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName('');
    setDescription('');
    setCategory(categories[0] || '');
    setBasePrice('');
    setSizes([]);
    setImageUrl('');
    setAvailable(true);
    setPrepTime('');
    setNewCategory('');
    setShowNewCategory(false);
    setNewSizeName('');
    setNewSizePrice('');
    setImageMode('upload');
    setImageFileName('');
  };

  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || '');
      setCategory(item.category);
      setBasePrice(item.basePrice.toString());
      setSizes(item.sizes || []);
      setImageUrl(item.imageUrl || '');
      setAvailable(item.available);
      setPrepTime(item.preparationTime?.toString() || '');
      setImageFileName(item.imageUrl ? 'Current image' : '');
      return;
    }

    setName('');
    setDescription('');
    setCategory(categories[0] || '');
    setBasePrice('');
    setSizes([]);
    setImageUrl('');
    setAvailable(true);
    setPrepTime('');
    setNewCategory('');
    setShowNewCategory(false);
    setNewSizeName('');
    setNewSizePrice('');
    setImageMode('upload');
    setImageFileName('');
  }, [categories, item, isOpen]);

  const addSize = () => {
    if (!newSizeName.trim() || !newSizePrice) {
      toast.error(t('menu_item_modal.errors.size_required'));
      return;
    }

    setSizes((currentSizes) => [
      ...currentSizes,
      {
        id: `size-${Date.now()}`,
        name: newSizeName.trim(),
        price: Number.parseFloat(newSizePrice),
      },
    ]);
    setNewSizeName('');
    setNewSizePrice('');
  };

  const removeSize = (id: string) => {
    setSizes((currentSizes) => currentSizes.filter((size) => size.id !== id));
  };

  const handleAddCategory = async () => {
    const value = newCategory.trim();
    if (!value) return;
    if (categories.some((existingCategory) => existingCategory.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      toast.error(t('category_modal.errors.duplicate'));
      return;
    }

    const added = await onAddCategory(value);
    if (added === false) return;

    setCategory(value);
    setNewCategory('');
    setShowNewCategory(false);
    toast.success(t('menu_item_modal.success.category_added', { name: value }));
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('menu_item_modal.errors.image_too_large'));
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `${venueId}/menu-items/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('venue-assets').upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('venue-assets').getPublicUrl(filePath);

      setImageUrl(publicUrl);
      setImageFileName(file.name);
      toast.success(t('menu_item_modal.success.image_uploaded'));
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t('menu_item_modal.errors.upload_failed'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error(t('menu_item_modal.errors.name_required'));
      return;
    }
    if (!category) {
      toast.error(t('menu_item_modal.errors.category_required'));
      return;
    }
    if (!basePrice && sizes.length === 0) {
      toast.error(t('menu_item_modal.errors.price_required'));
      return;
    }

    const menuItem: MenuItem = {
      id: item?.id || uuidv4(),
      name: name.trim(),
      description: description.trim(),
      category,
      basePrice: Number.parseFloat(basePrice) || 0,
      sizes,
      imageUrl,
      available,
      preparationTime: prepTime ? Number.parseInt(prepTime, 10) : undefined,
    };

    const saved = await onSave(menuItem);
    if (saved === false) return;

    onClose();
    resetForm();
    toast.success(item ? t('menu_item_modal.success.item_updated') : t('menu_item_modal.success.item_added'));

    updateVenueScoreCounter(venueId, 'menu_updated');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="venue-menu-modal venue-menu-modal--wide max-h-[90vh] overflow-y-auto">
        <DialogHeader className="venue-menu-modal__heading">
          <DialogTitle>{item ? t('menu_item_modal.edit_title') : t('menu_item_modal.add_title')}</DialogTitle>
          <DialogDescription>{item ? t('menu_item_modal.edit_description') : t('menu_item_modal.add_description')}</DialogDescription>
        </DialogHeader>

        <form className="venue-menu-item-form" onSubmit={handleSave}>
          <label className="venue-menu-field venue-menu-field--wide" htmlFor="venue-menu-item-name">
            <span>{t('menu_item_modal.item_name_label')}</span>
            <input
              id="venue-menu-item-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('menu_item_modal.item_name_placeholder')}
              autoFocus
            />
          </label>

          <label className="venue-menu-field venue-menu-field--wide" htmlFor="venue-menu-item-description">
            <span>{t('menu_item_modal.description_label')}</span>
            <textarea
              id="venue-menu-item-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('menu_item_modal.description_placeholder')}
              rows={2}
            />
          </label>

          <label className="venue-menu-field" htmlFor="venue-menu-item-category">
            <span>{t('menu_item_modal.category_label')}</span>
            <select id="venue-menu-item-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">{t('menu_item_modal.select_category')}</option>
              {categories.map((itemCategory) => (
                <option key={itemCategory} value={itemCategory}>
                  {itemCategory}
                </option>
              ))}
            </select>
            <button
              className="venue-menu-text-action"
              type="button"
              onClick={() => setShowNewCategory((show) => !show)}
            >
              <Plus aria-hidden="true" />
              {t('menu_item_modal.new_category')}
            </button>
          </label>

          <label className="venue-menu-field" htmlFor="venue-menu-item-price">
            <span>{t('menu_item_modal.base_price')}</span>
            <span className="venue-menu-currency-field">
              <DollarSign aria-hidden="true" />
              <input
                id="venue-menu-item-price"
                type="number"
                min="0"
                step="0.01"
                value={basePrice}
                onChange={(event) => setBasePrice(event.target.value)}
                placeholder="0.00"
              />
            </span>
          </label>

          {showNewCategory && (
            <div className="venue-menu-inline-add venue-menu-field--wide">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder={t('menu_item_modal.new_category_placeholder')}
              />
              <button className="venue-menu-button venue-menu-button--primary" type="button" onClick={() => void handleAddCategory()}>
                <Check aria-hidden="true" />
                <span>{t('common.add')}</span>
              </button>
            </div>
          )}

          <fieldset className="venue-menu-size-options venue-menu-field--wide">
            <legend>
              <Layers3 aria-hidden="true" />
              {t('menu_item_modal.size_options')}
              <span>{t('menu_item_modal.size_hint')}</span>
            </legend>
            {sizes.length > 0 && (
              <div className="venue-menu-size-list">
                {sizes.map((size) => (
                  <div key={size.id} className="venue-menu-size-row">
                    <span>{size.name}</span>
                    <strong>${size.price.toFixed(2)}</strong>
                    <button type="button" aria-label={`Remove ${size.name}`} title={`Remove ${size.name}`} onClick={() => removeSize(size.id)}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="venue-menu-size-add">
              <input
                value={newSizeName}
                onChange={(event) => setNewSizeName(event.target.value)}
                placeholder={t('menu_item_modal.size_name_placeholder')}
              />
              <span className="venue-menu-currency-field">
                <DollarSign aria-hidden="true" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newSizePrice}
                  onChange={(event) => setNewSizePrice(event.target.value)}
                  placeholder="0.00"
                />
              </span>
              <button className="venue-menu-icon-button" type="button" aria-label="Add size option" title="Add size option" onClick={addSize}>
                <Plus aria-hidden="true" />
              </button>
            </div>
          </fieldset>

          <section className="venue-menu-image-field venue-menu-field--wide" aria-label={t('menu_item_modal.item_image')}>
            <div className="venue-menu-image-field__preview">
              {imageUrl ? <img src={imageUrl} alt={t('menu_item_modal.preview_alt')} /> : <ImageIcon aria-hidden="true" />}
            </div>
            <div className="venue-menu-image-field__copy">
              <strong>
                <ImageIcon aria-hidden="true" />
                {t('menu_item_modal.item_image')}
              </strong>
              <span>Optional, but recommended.</span>
              <small>{imageFileName || 'No image selected'}</small>
            </div>
            <div className="venue-menu-image-field__actions">
              <button
                className={`venue-menu-button venue-menu-button--secondary${imageMode === 'upload' ? ' venue-menu-button--selected' : ''}`}
                type="button"
                onClick={() => {
                  setImageMode('upload');
                  fileInputRef.current?.click();
                }}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="venue-menu-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                <span>{uploading ? t('common.uploading') : t('menu_item_modal.upload_image')}</span>
              </button>
              <button
                className={`venue-menu-button venue-menu-button--secondary${imageMode === 'url' ? ' venue-menu-button--selected' : ''}`}
                type="button"
                onClick={() => setImageMode('url')}
              >
                <LinkIcon aria-hidden="true" />
                <span>{t('menu_item_modal.use_url')}</span>
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleImageUpload(event)} />
            {imageMode === 'url' && (
              <label className="venue-menu-image-url" htmlFor="venue-menu-item-image-url">
                <span className="sr-only">{t('menu_item_modal.image_url_placeholder')}</span>
                <input
                  id="venue-menu-item-image-url"
                  value={imageUrl}
                  onChange={(event) => {
                    setImageUrl(event.target.value);
                    setImageFileName(event.target.value ? 'Image URL' : '');
                  }}
                  placeholder={t('menu_item_modal.image_url_placeholder')}
                />
              </label>
            )}
            {imageUrl && (
              <button
                className="venue-menu-image-field__remove"
                type="button"
                aria-label="Remove item image"
                title="Remove item image"
                onClick={() => {
                  setImageUrl('');
                  setImageFileName('');
                }}
              >
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </section>

          <label className="venue-menu-field" htmlFor="venue-menu-item-prep-time">
            <span>{t('menu_item_modal.prep_time_label')}</span>
            <input
              id="venue-menu-item-prep-time"
              type="number"
              min="0"
              value={prepTime}
              onChange={(event) => setPrepTime(event.target.value)}
              placeholder={t('menu_item_modal.prep_time_placeholder')}
            />
          </label>

          <div className="venue-menu-availability-field">
            <div>
              <strong>{t('menu_item_modal.available_for_order')}</strong>
              <p>{t('menu_item_modal.turn_off_hint')}</p>
            </div>
            <Switch className="venue-menu-switch" checked={available} onCheckedChange={setAvailable} aria-label={t('menu_item_modal.available_for_order')} />
          </div>

          <div className="venue-menu-modal__actions venue-menu-item-form__actions venue-menu-field--wide">
            <button className="venue-menu-button venue-menu-button--secondary" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="venue-menu-button venue-menu-button--primary" type="submit">
              <Plus aria-hidden="true" />
              <span>{item ? t('menu_item_modal.update_item') : t('menu_item_modal.add_item')}</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
