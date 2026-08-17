import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users, Table2, UtensilsCrossed, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';
import { extractVenueFloorplanTables, readVenueTablesSync } from "@/lib/venueFloorplanStorage";
import "./vibe-modal.css";

interface MyTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
}

interface TableInfo {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string | null;
}

interface CheckInInfo {
  tableNumber: string | null;
  checkedInAt: string;
}

const MyTableModal = ({ isOpen, onClose, venueId, venueName }: MyTableModalProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [checkInInfo, setCheckInInfo] = useState<CheckInInfo | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningTable, setAssigningTable] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user || !venueId) return;
    
    setLoading(true);
    setCheckInInfo(null);
    setTables([]);
    try {
      // Fetch current check-in info
      const { data: checkIn } = await supabase
        .from("check_ins")
        .select("table_number, checked_in_at")
        .eq("user_id", user.id)
        .eq("venue_id", venueId)
        .is("checked_out_at", null)
        .single();

      if (checkIn) {
        setCheckInInfo({
          tableNumber: checkIn.table_number,
          checkedInAt: checkIn.checked_in_at,
        });
      }

      // Fetch tables from the current venue's floorplan.
      const { data: floorplan } = await supabase
        .from("floorplans")
        .select("items")
        .eq("venue_id", venueId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cloudTables = extractVenueFloorplanTables(floorplan?.items);
      if (cloudTables.length > 0) {
        setTables(cloudTables);
        return;
      }

      const localTables = extractVenueFloorplanTables({
        tables: readVenueTablesSync<unknown[]>(venueId),
      });
      setTables(localTables);
    } catch (error) {
      console.error("Error fetching table data:", error);
    } finally {
      setLoading(false);
    }
  }, [user, venueId]);

  useEffect(() => {
    if (isOpen) {
      void fetchData();
    }
  }, [fetchData, isOpen]);

  const handleSelectTable = async (table: TableInfo) => {
    if (!user || !venueId) return;
    
    setAssigningTable(table.id);
    try {
      const { error } = await supabase
        .from("check_ins")
        .update({ table_number: table.tableNumber })
        .eq("user_id", user.id)
        .eq("venue_id", venueId)
        .is("checked_out_at", null);

      if (error) throw error;

      setCheckInInfo(prev => prev ? { ...prev, tableNumber: table.tableNumber } : null);
    } catch (error) {
      console.error("Error assigning table:", error);
    } finally {
      setAssigningTable(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div 
          className="vibe-modal-backdrop absolute inset-0" 
          onClick={onClose} 
        />

        <motion.div
          className="vibe-modal vibe-modal--table relative w-full flex flex-col"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="vibe-modal__header flex items-center justify-between p-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="vibe-modal__option-icon">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">My Table</h2>
                <p className="text-sm text-white/50">{venueName}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="vibe-menu-modal__icon-button"
              onClick={onClose}
            >
              <X className="w-5 h-5 text-white/70" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : checkInInfo?.tableNumber ? (
              /* Already seated at a table */
              <div className="space-y-6">
                <div className="vibe-modal__panel p-6 text-center">
                  <div className="vibe-modal__icon">
                    <Table2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-1">Table {checkInInfo.tableNumber}</h3>
                  <p className="text-white/60">You're seated at this table</p>
                </div>

                <div className="space-y-3">
                  <Button 
                    className="w-full"
                    onClick={onClose}
                  >
                    <UtensilsCrossed className="w-5 h-5 mr-2" />
                    Order Food & Drinks
                  </Button>
                </div>

                {/* Change table option */}
                {tables.length > 1 && (
                  <div className="border-t border-border pt-4">
                    <p className="mb-3 text-sm text-muted-foreground">Need to move? Select a different table:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {tables
                        .filter(t => t.tableNumber !== checkInInfo.tableNumber)
                        .slice(0, 4)
                        .map(table => (
                          <button
                            key={table.id}
                            onClick={() => handleSelectTable(table)}
                            disabled={assigningTable === table.id}
                            className="vibe-modal__item p-3 text-left disabled:opacity-50"
                          >
                            <div className="font-medium text-white">Table {table.tableNumber}</div>
                            <div className="text-xs text-white/50">{table.capacity} seats</div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : tables.length > 0 ? (
              /* Not seated - show available tables */
              <div className="space-y-4">
                <div className="text-center py-4">
                  <h3 className="text-lg font-semibold text-white mb-1">Select Your Table</h3>
                  <p className="text-white/50 text-sm">Choose where you're seated</p>
                </div>

                <div className="space-y-2">
                  {tables.map(table => (
                    <button
                      key={table.id}
                      onClick={() => handleSelectTable(table)}
                      disabled={assigningTable === table.id}
                    className="vibe-modal__item flex w-full items-center justify-between p-4 disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="vibe-modal__option-icon">
                          <Table2 className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-white">Table {table.tableNumber}</div>
                          <div className="text-xs text-white/50">
                            {table.capacity} seats {table.section && `• ${table.section}`}
                          </div>
                        </div>
                      </div>
                      {assigningTable === table.id ? (
                        <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-white/40" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* No tables available */
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <Table2 className="w-8 h-8 text-white/40" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Tables Set Up</h3>
                <p className="text-white/50 text-sm">
                  This venue hasn't configured their table layout yet.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MyTableModal;
