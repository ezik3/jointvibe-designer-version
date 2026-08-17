import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import "./inventory.css";

type InventoryCategory = "Bar" | "Kitchen" | "Supplies";
type InventoryFilter = "all" | "low" | InventoryCategory;

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: InventoryCategory;
  stock: number;
  reorder: number;
  cost: number;
}

interface InventoryDraft {
  name: string;
  sku: string;
  category: InventoryCategory | "";
  stock: string;
  reorder: string;
  cost: string;
}

const initialInventory: InventoryItem[] = [
  { id: "bar-001", name: "London dry gin", sku: "BAR-001", category: "Bar", stock: 18, reorder: 12, cost: 22.5 },
  { id: "bar-014", name: "Premium tonic water", sku: "BAR-014", category: "Bar", stock: 9, reorder: 12, cost: 1.8 },
  { id: "bar-002", name: "House vodka", sku: "BAR-002", category: "Bar", stock: 24, reorder: 10, cost: 18 },
  { id: "kit-031", name: "Chicken breast", sku: "KIT-031", category: "Kitchen", stock: 6, reorder: 8, cost: 5.2 },
  { id: "kit-044", name: "Truffle fries", sku: "KIT-044", category: "Kitchen", stock: 22, reorder: 10, cost: 3.4 },
  { id: "sup-008", name: "Paper napkins", sku: "SUP-008", category: "Supplies", stock: 4, reorder: 6, cost: 3.1 },
  { id: "bar-025", name: "Fresh lime", sku: "BAR-025", category: "Bar", stock: 30, reorder: 15, cost: 0.45 },
];

const emptyDraft: InventoryDraft = {
  name: "",
  sku: "",
  category: "",
  stock: "0",
  reorder: "0",
  cost: "0.00",
};

function isLowStock(item: InventoryItem) {
  return item.stock <= item.reorder;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function buildPageItems(currentPage: number, pageCount: number) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages: Array<number | "ellipsis-start" | "ellipsis-end"> = [1];
  if (currentPage > 3) pages.push("ellipsis-start");

  for (let page = Math.max(2, currentPage - 1); page <= Math.min(pageCount - 1, currentPage + 1); page += 1) {
    pages.push(page);
  }

  if (currentPage < pageCount - 2) pages.push("ellipsis-end");
  pages.push(pageCount);
  return pages;
}

function getVenueLabel() {
  return (localStorage.getItem("jv_current_venue_name") || "Venue").toUpperCase();
}

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>(initialInventory);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InventoryDraft>(emptyDraft);
  const [venueLabel] = useState(getVenueLabel);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      const matchesQuery = !normalizedQuery
        || `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(normalizedQuery);
      const matchesFilter = filter === "all"
        || (filter === "low" ? isLowStock(item) : item.category === filter);

      return matchesQuery && matchesFilter;
    });
  }, [filter, items, query]);

  const totalInventoryValue = useMemo(
    () => items.reduce((total, item) => total + item.stock * item.cost, 0),
    [items],
  );
  const lowStockCount = useMemo(() => items.filter(isLowStock).length, [items]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageItems = buildPageItems(currentPage, pageCount);
  const isEditing = Boolean(editingItemId);

  useEffect(() => {
    setPage(1);
  }, [filter, pageSize, query]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const updateDraft = (field: keyof InventoryDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingItemId(null);
    setDraft(emptyDraft);
  };

  const openAddItem = () => {
    setEditingItemId(null);
    setDraft(emptyDraft);
    setDialogOpen(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setDraft({
      name: item.name,
      sku: item.sku,
      category: item.category,
      stock: String(item.stock),
      reorder: String(item.reorder),
      cost: item.cost.toFixed(2),
    });
    setDialogOpen(true);
  };

  const handleSaveItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const stock = Number(draft.stock);
    const reorder = Number(draft.reorder);
    const cost = Number(draft.cost);
    const name = draft.name.trim();

    if (!name || !draft.category || !Number.isFinite(stock) || !Number.isFinite(reorder) || !Number.isFinite(cost)) {
      toast.error("Complete all required inventory fields.");
      return;
    }

    if (stock < 0 || reorder < 0 || cost < 0) {
      toast.error("Stock, reorder point, and cost must be zero or greater.");
      return;
    }

    const savedItem: InventoryItem = {
      id: editingItemId || `inventory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      sku: draft.sku.trim(),
      category: draft.category,
      stock,
      reorder,
      cost,
    };

    setItems((currentItems) => (
      editingItemId
        ? currentItems.map((item) => item.id === editingItemId ? savedItem : item)
        : [savedItem, ...currentItems]
    ));
    setPage(1);
    closeDialog();
    toast.success(editingItemId ? `${savedItem.name} updated.` : `${savedItem.name} added to inventory.`);
  };

  return (
    <div className="pos-inventory-page">
      <header className="pos-inventory-topbar">
        <div>
          <span>{venueLabel}</span>
          <strong>Point of Sale</strong>
        </div>
        <p><CheckCircle2 aria-hidden="true" />Inventory synced</p>
      </header>

      <section className="pos-inventory-heading">
        <div className="pos-inventory-heading__copy">
          <div className="pos-inventory-heading__title-row">
            <h1>Inventory</h1>
            <section className="pos-inventory-summary" aria-label="Inventory summary">
              <article className="pos-inventory-summary__metric"><span>Total items</span><strong>{items.length}</strong></article>
              <article className="pos-inventory-summary__metric"><span>Low stock</span><strong>{lowStockCount}</strong></article>
              <article className="pos-inventory-summary__metric"><span>Inventory value</span><strong>{formatCurrency(totalInventoryValue)}</strong></article>
            </section>
          </div>
          <p>Track stock levels and keep the bar and kitchen ready for service.</p>
        </div>
        <button className="pos-inventory-button pos-inventory-button--primary" type="button" onClick={openAddItem}>
          <Plus aria-hidden="true" />
          <span>Add item</span>
        </button>
      </section>

      <section className="pos-inventory-workspace" aria-label="Inventory items">
        <div className="pos-inventory-table-wrap">
          <div className="pos-inventory-table-toolbar">
            <label className="pos-inventory-search" htmlFor="pos-inventory-search">
              <Search aria-hidden="true" />
              <input
                id="pos-inventory-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search inventory"
              />
            </label>
            <label className="pos-inventory-filter" htmlFor="pos-inventory-filter">
              <span className="sr-only">Filter inventory</span>
              <select
                id="pos-inventory-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value as InventoryFilter)}
              >
                <option value="all">All items</option>
                <option value="low">Low stock</option>
                <option value="Bar">Bar</option>
                <option value="Kitchen">Kitchen</option>
                <option value="Supplies">Supplies</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
          </div>

          <div className="pos-inventory-table-scroll">
            <table className="pos-inventory-table">
              <caption className="sr-only">Inventory items</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Category</th>
                  <th scope="col">Stock on hand</th>
                  <th scope="col">Reorder at</th>
                  <th scope="col">Unit cost</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 ? (
                  <tr><td className="pos-inventory-table__empty" colSpan={7}>No inventory items match this view.</td></tr>
                ) : visibleItems.map((item) => {
                  const lowStock = isLowStock(item);

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="pos-inventory-table__item">
                          <span className="pos-inventory-table__item-icon"><Package aria-hidden="true" /></span>
                          <span><strong>{item.name}</strong><small>{item.sku || "No SKU"}</small></span>
                        </div>
                      </td>
                      <td>{item.category}</td>
                      <td className={`pos-inventory-table__stock${lowStock ? " is-low" : ""}`}>{item.stock}</td>
                      <td>{item.reorder}</td>
                      <td>{formatCurrency(item.cost)}</td>
                      <td><span className={`pos-inventory-status${lowStock ? " is-low" : ""}`}>{lowStock ? "Low stock" : "In stock"}</span></td>
                      <td className="pos-inventory-table__actions">
                        <button type="button" aria-label={`Edit ${item.name}`} title={`Edit ${item.name}`} onClick={() => openEditItem(item)}>
                          <Pencil aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="pos-inventory-pagination" aria-label="Inventory table pagination">
            <label className="pos-inventory-pagination__size" htmlFor="pos-inventory-page-size">
              <span>Rows per page</span>
              <select id="pos-inventory-page-size" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <div className="pos-inventory-pagination__pages" aria-live="polite">
              <span className="pos-inventory-pagination__summary">Page {currentPage} of {pageCount}</span>
              <button type="button" disabled={currentPage === 1} aria-label="Previous page" title="Previous page" onClick={() => setPage(currentPage - 1)}><ChevronLeft aria-hidden="true" /></button>
              {pageItems.map((pageItem) => (
                typeof pageItem === "number" ? (
                  <button
                    key={pageItem}
                    className={pageItem === currentPage ? "is-active" : undefined}
                    type="button"
                    aria-current={pageItem === currentPage ? "page" : undefined}
                    aria-label={`Page ${pageItem}`}
                    onClick={() => setPage(pageItem)}
                  >
                    {pageItem}
                  </button>
                ) : <span key={pageItem} className="pos-inventory-pagination__ellipsis" aria-hidden="true">...</span>
              ))}
              <button type="button" disabled={currentPage === pageCount || filteredItems.length === 0} aria-label="Next page" title="Next page" onClick={() => setPage(currentPage + 1)}><ChevronRight aria-hidden="true" /></button>
            </div>
          </footer>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}>
        <DialogContent className="pos-inventory-dialog">
          <form className="pos-inventory-dialog__form" onSubmit={handleSaveItem}>
            <DialogHeader className="pos-inventory-dialog__header">
              <DialogTitle>{isEditing ? "Edit inventory item" : "Add inventory item"}</DialogTitle>
              <DialogDescription>{isEditing ? "Update the item details and its current stock level." : "Set the item details and its starting stock level."}</DialogDescription>
            </DialogHeader>

            <div className="pos-inventory-dialog__fields">
              <label className="pos-inventory-field pos-inventory-field--wide" htmlFor="pos-inventory-name">
                <span>Item name</span>
                <input id="pos-inventory-name" value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="e.g. Premium tonic water" required />
              </label>
              <label className="pos-inventory-field" htmlFor="pos-inventory-category">
                <span>Category</span>
                <select id="pos-inventory-category" value={draft.category} onChange={(event) => updateDraft("category", event.target.value)} required>
                  <option value="">Select a category</option>
                  <option value="Bar">Bar</option>
                  <option value="Kitchen">Kitchen</option>
                  <option value="Supplies">Supplies</option>
                </select>
              </label>
              <label className="pos-inventory-field" htmlFor="pos-inventory-sku">
                <span>SKU</span>
                <input id="pos-inventory-sku" value={draft.sku} onChange={(event) => updateDraft("sku", event.target.value)} placeholder="Optional" />
              </label>
              <label className="pos-inventory-field" htmlFor="pos-inventory-stock">
                <span>Current stock</span>
                <input id="pos-inventory-stock" type="number" min="0" step="1" value={draft.stock} onChange={(event) => updateDraft("stock", event.target.value)} required />
              </label>
              <label className="pos-inventory-field" htmlFor="pos-inventory-reorder">
                <span>Reorder point</span>
                <input id="pos-inventory-reorder" type="number" min="0" step="1" value={draft.reorder} onChange={(event) => updateDraft("reorder", event.target.value)} required />
              </label>
              <label className="pos-inventory-field pos-inventory-field--wide" htmlFor="pos-inventory-cost">
                <span>Unit cost</span>
                <span className="pos-inventory-cost-input"><b aria-hidden="true">$</b><input id="pos-inventory-cost" type="number" min="0" step="0.01" inputMode="decimal" value={draft.cost} onChange={(event) => updateDraft("cost", event.target.value)} required /></span>
              </label>
            </div>

            <DialogFooter className="pos-inventory-dialog__actions">
              <button className="pos-inventory-button pos-inventory-button--secondary" type="button" onClick={closeDialog}>Cancel</button>
              <button className="pos-inventory-button pos-inventory-button--primary" type="submit"><Plus aria-hidden="true" /><span>{isEditing ? "Save changes" : "Add item"}</span></button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
