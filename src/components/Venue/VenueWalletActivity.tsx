import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useWalletTransactions, type WalletTransaction } from "@/hooks/useWalletTransactions";

type ActivityFilter = "all" | "income" | "spend";

const PAGE_SIZE = 10;

function isIncomingTransaction(transaction: WalletTransaction, venueId: string) {
  return (
    transaction.to_wallet_id === venueId ||
    transaction.to_wallet_type === "venue" ||
    transaction.transaction_type === "deposit"
  );
}

function formatTransactionType(transactionType: string) {
  return transactionType
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function downloadCsv(filename: string, rows: string[][]) {
  const contents = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface VenueWalletActivityProps {
  venueId: string;
}

export default function VenueWalletActivity({ venueId }: VenueWalletActivityProps) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [page, setPage] = useState(0);
  const { formatCurrency, jvcToLocal } = useCurrency();
  const { transactions, loading, refresh } = useWalletTransactions({ venueId });

  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    if (filter === "all") return true;
    const incoming = isIncomingTransaction(transaction, venueId);
    return filter === "income" ? incoming : !incoming;
  }), [filter, transactions, venueId]);

  useEffect(() => {
    setPage(0);
  }, [filter, transactions]);

  const visibleTransactions = filteredTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasPreviousPage = page > 0;
  const hasNextPage = (page + 1) * PAGE_SIZE < filteredTransactions.length;

  const exportTransactions = () => {
    const rows = filteredTransactions.map((transaction) => {
      const incoming = isIncomingTransaction(transaction, venueId);
      const amount = formatCurrency(jvcToLocal(transaction.amount_jvc));
      return [
        format(new Date(transaction.created_at), "yyyy-MM-dd HH:mm"),
        transaction.description || formatTransactionType(transaction.transaction_type),
        incoming ? "Income" : "Spending",
        `${incoming ? "+" : "-"}${amount}`,
        transaction.status,
      ];
    });

    downloadCsv("jointvibe-wallet-activity.csv", [["Date", "Description", "Type", "Amount", "Status"], ...rows]);
  };

  return (
    <section className="venue-wallet-activity venue-wallet-activity--transactions" aria-labelledby="venue-wallet-activity-title">
      <header className="venue-wallet-activity__heading">
        <div>
          <p className="venue-wallet-eyebrow">ACTIVITY</p>
          <h2 id="venue-wallet-activity-title">Transaction history</h2>
        </div>
        <button
          className="venue-wallet-icon-button"
          type="button"
          onClick={refresh}
          aria-label="Refresh transactions"
          title="Refresh transactions"
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </header>

      <div className="venue-wallet-activity__tools">
        <div className="venue-wallet-filter-tabs" role="tablist" aria-label="Transaction filters">
          {([
            ["all", "All activity"],
            ["income", "Income"],
            ["spend", "Spending"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={`venue-wallet-tab${filter === value ? " venue-wallet-tab--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="venue-wallet-button venue-wallet-button--secondary venue-wallet-export-button" type="button" onClick={exportTransactions}>
          <Download aria-hidden="true" />
          <span>Export</span>
        </button>
      </div>

      {loading ? (
        <div className="venue-wallet-transaction-loading" aria-label="Loading transactions">
          {[0, 1, 2].map((index) => <span key={index} />)}
        </div>
      ) : visibleTransactions.length === 0 ? (
        <div className="venue-wallet-empty">
          <Search aria-hidden="true" />
          <p>No {filter === "all" ? "transactions" : filter === "income" ? "income" : "spending"} activity yet.</p>
        </div>
      ) : (
        <>
          <div className="venue-wallet-transaction-list">
            {visibleTransactions.map((transaction) => {
              const incoming = isIncomingTransaction(transaction, venueId);
              const title = transaction.description || formatTransactionType(transaction.transaction_type);
              const amount = formatCurrency(jvcToLocal(transaction.amount_jvc));

              return (
                <article className="venue-wallet-transaction-row" key={transaction.id}>
                  <span className={`venue-wallet-transaction-row__icon${incoming ? " venue-wallet-transaction-row__icon--income" : ""}`}>
                    {incoming ? <ArrowDownLeft aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
                  </span>
                  <div className="venue-wallet-transaction-row__copy">
                    <strong>{title}</strong>
                    <small>{format(new Date(transaction.created_at), "MMM d, yyyy")} - {formatTransactionType(transaction.transaction_type)}</small>
                  </div>
                  <span className="venue-wallet-transaction-row__type">{incoming ? "Income" : "Spending"}</span>
                  <strong className={`venue-wallet-transaction-row__amount${incoming ? " venue-wallet-transaction-row__amount--income" : ""}`}>
                    {incoming ? "+" : "-"}{amount}
                  </strong>
                </article>
              );
            })}
          </div>

          {filteredTransactions.length > PAGE_SIZE && (
            <footer className="venue-wallet-pagination">
              <span>Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredTransactions.length)} of {filteredTransactions.length}</span>
              <div>
                <button className="venue-wallet-icon-button" type="button" disabled={!hasPreviousPage} onClick={() => setPage((current) => current - 1)} aria-label="Previous transactions">
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button className="venue-wallet-icon-button" type="button" disabled={!hasNextPage} onClick={() => setPage((current) => current + 1)} aria-label="Next transactions">
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </footer>
          )}
        </>
      )}
    </section>
  );
}
