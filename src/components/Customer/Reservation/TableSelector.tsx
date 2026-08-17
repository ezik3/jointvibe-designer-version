import { motion } from "framer-motion";
import { Users, Table2 } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface TableInfo {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string | null;
}

interface TableSelectorProps {
  tables: TableInfo[];
  selectedTableId: string | null;
  onTableSelect: (tableId: string) => void;
  partySize: number;
}

export function TableSelector({
  tables,
  selectedTableId,
  onTableSelect,
  partySize,
}: TableSelectorProps) {
  const { t } = useTranslation('common');
  // Sort tables by capacity to show most suitable first
  const sortedTables = [...tables].sort((a, b) => a.capacity - b.capacity);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col"
    >
      <h3 className="text-lg font-semibold text-[var(--customer-modal-text)] mb-4 flex items-center gap-2">
        <Table2 className="w-5 h-5 text-primary" />
        {t('reservation.select_table')}
      </h3>

      {sortedTables.length === 0 ? (
        <div className="text-center py-8 text-[var(--customer-modal-muted)]">
          {t('reservation.no_tables', { count: partySize })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
          {sortedTables.map((table) => (
            <motion.button
              key={table.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTableSelect(table.id)}
              className={`
                p-4 rounded-[6px] text-left transition-all border
                ${selectedTableId === table.id
                  ? "bg-[var(--customer-modal-cyan-soft)] border-[var(--customer-modal-cyan)] text-[var(--customer-modal-text)]"
                  : "bg-[var(--customer-modal-canvas)] border-[var(--customer-modal-line)] text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)] hover:border-[var(--customer-modal-faint)]"
                }
              `}
            >
              <div className="font-bold text-lg">{t('reservation.table_label', { number: table.tableNumber })}</div>
              <div className="flex items-center gap-2 text-sm mt-1">
                <Users className="w-4 h-4" />
                <span>{t('reservation.up_to_guests', { count: table.capacity })}</span>
              </div>
              {table.section && (
                <div className="text-xs mt-1 opacity-50">{table.section}</div>
              )}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
