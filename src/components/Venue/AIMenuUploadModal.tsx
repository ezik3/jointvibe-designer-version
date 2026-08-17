import { useRef, useState } from 'react';
import { Check, FileImage, FileUp, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ParsedMenuItem {
  name: string;
  description: string;
  price: number;
  category: string;
  selected: boolean;
}

interface AIMenuUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: { name: string; description: string; price: number; category: string }[]) => boolean | void | Promise<boolean | void>;
  existingCategories: string[];
}

export default function AIMenuUploadModal({
  isOpen,
  onClose,
  onImport,
  existingCategories,
}: AIMenuUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedMenuItem[]>([]);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/') && selectedFile.type !== 'application/pdf') {
      toast.error('Please upload an image or PDF file');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => setPreview(loadEvent.target?.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleParseMenu = async () => {
    if (!file) return;

    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data, error } = await supabase.functions.invoke('parse-menu', { body: formData });

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      const items = (data.items || []).map((item: Omit<ParsedMenuItem, 'selected'>) => ({
        ...item,
        selected: true,
      }));

      if (items.length === 0) {
        toast.error('No menu items found. Please try with a clearer image.');
        return;
      }

      setParsedItems(items);
      setStep('review');
      toast.success(`Found ${items.length} menu items!`);
    } catch (error) {
      console.error('Error parsing menu:', error);
      toast.error('Failed to parse menu. Please try again.');
    } finally {
      setParsing(false);
    }
  };

  const toggleItem = (index: number) => {
    setParsedItems((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, selected: !item.selected } : item)));
  };

  const removeItem = (index: number) => {
    setParsedItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleImport = async () => {
    const selectedItems = parsedItems
      .filter((item) => item.selected)
      .map(({ name, description, price, category }) => ({ name, description, price, category }));

    if (selectedItems.length === 0) {
      toast.error('Please select at least one item to import');
      return;
    }

    try {
      const imported = await onImport(selectedItems);
      if (imported === false) {
        toast.error('Import stopped before all menu items were saved. Review your menu and try again.');
        return;
      }

      handleReset();
      onClose();
      toast.success(`Imported ${selectedItems.length} menu items!`);
    } catch (error) {
      console.error('Error importing menu:', error);
      toast.error('Import failed. Review your menu and try again.');
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setParsedItems([]);
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectedCount = parsedItems.filter((item) => item.selected).length;
  const categories = [...new Set(parsedItems.map((item) => item.category))];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="venue-menu-modal venue-menu-modal--medium max-h-[90vh] overflow-y-auto">
        <DialogHeader className="venue-menu-modal__heading">
          <DialogTitle>
            <Sparkles aria-hidden="true" />
            AI menu upload
          </DialogTitle>
          <DialogDescription>Upload a menu image or PDF to prepare your items for review.</DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="venue-menu-ai-upload">
            <button className={`venue-menu-upload-zone${file ? ' venue-menu-upload-zone--selected' : ''}`} type="button" onClick={() => fileInputRef.current?.click()}>
              {preview ? (
                <img src={preview} alt="Menu preview" />
              ) : file ? (
                <FileImage aria-hidden="true" />
              ) : (
                <FileUp aria-hidden="true" />
              )}
              <strong>{file ? file.name : 'Choose a menu file'}</strong>
              <span>{file ? 'Click to choose a different file' : 'JPG, PNG, WEBP, or PDF up to 10 MB'}</span>
              {!file && <small>No file selected</small>}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              hidden
              onChange={handleFileSelect}
            />
            <div className="venue-menu-modal__actions">
              <button className="venue-menu-button venue-menu-button--secondary" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="venue-menu-button venue-menu-button--primary" type="button" disabled={!file || parsing} onClick={() => void handleParseMenu()}>
                {parsing ? <Loader2 className="venue-menu-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                <span>{parsing ? 'Analyzing menu...' : 'Extract items'}</span>
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="venue-menu-ai-review">
            <div className="venue-menu-ai-review__summary">
              <p>Review extracted items and deselect any you do not want to import.</p>
              <b>{selectedCount} of {parsedItems.length} selected</b>
            </div>

            <div className="venue-menu-ai-review__categories">
              {categories.map((category) => {
                const count = parsedItems.filter((item) => item.category === category && item.selected).length;
                return (
                  <span key={category}>
                    {category}: {count}
                    {!existingCategories.includes(category) && <em>New</em>}
                  </span>
                );
              })}
            </div>

            <div className="venue-menu-ai-review__items">
              {parsedItems.map((item, index) => (
                <article
                  key={`${item.name}-${index}`}
                  className={`venue-menu-ai-item${item.selected ? ' venue-menu-ai-item--selected' : ''}`}
                >
                  <button
                    className="venue-menu-ai-item__select"
                    type="button"
                    aria-pressed={item.selected}
                    onClick={() => toggleItem(index)}
                  >
                    <span className="venue-menu-ai-item__check">{item.selected && <Check aria-hidden="true" />}</span>
                    <span className="venue-menu-ai-item__content">
                      <strong>{item.name}</strong>
                      <small>{item.category}</small>
                      {item.description && <em>{item.description}</em>}
                    </span>
                    <b>${item.price.toFixed(2)}</b>
                  </button>
                  <button
                    className="venue-menu-ai-item__delete"
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    title={`Remove ${item.name}`}
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>

            <div className="venue-menu-modal__actions venue-menu-ai-review__actions">
              <button className="venue-menu-button venue-menu-button--secondary" type="button" onClick={handleReset}>
                <X aria-hidden="true" />
                <span>Start over</span>
              </button>
              <div>
                <button className="venue-menu-button venue-menu-button--secondary" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button className="venue-menu-button venue-menu-button--primary" type="button" disabled={selectedCount === 0} onClick={() => void handleImport()}>
                  <Check aria-hidden="true" />
                  <span>Import {selectedCount} items</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
