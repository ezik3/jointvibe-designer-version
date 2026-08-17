import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ChevronDown, 
  Users, 
  Clock, 
  Check, 
  User,
  AlertCircle 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';
import "./pos-popovers.css";

interface TableInfo {
  id: string;
  tableNumber: string;
  capacity: number;
  section?: string;
  status: "available" | "occupied" | "reserved";
  customer?: {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl?: string;
    tableNumber?: string;
    checkedInAt: string;
  };
}

interface POSTableSelectorProps {
  tables: TableInfo[];
  selectedTable: string | null;
  onTableSelect: (tableNumber: string | null, customerId?: string) => void;
  loading?: boolean;
}

export function POSTableSelector({
  tables,
  selectedTable,
  onTableSelect,
  loading = false,
}: POSTableSelectorProps) {
  const { t } = useTranslation('pos');
  const [open, setOpen] = useState(false);

  const availableTables = tables.filter((t) => t.status === "available");
  const occupiedTables = tables.filter((t) => t.status === "occupied");
  const reservedTables = tables.filter((t) => t.status === "reserved");

  const selectedTableData = tables.find((t) => t.tableNumber === selectedTable);

  const handleTableClick = (table: TableInfo) => {
    if (table.status === "reserved") {
      // Can't select reserved tables
      return;
    }
    
    onTableSelect(table.tableNumber, table.customer?.userId);
    setOpen(false);
  };

  const getStatusColor = (status: TableInfo["status"]) => {
    switch (status) {
      case "available":
        return "pos-table-selector__status--available";
      case "occupied":
        return "pos-table-selector__status--occupied";
      case "reserved":
        return "pos-table-selector__status--reserved";
    }
  };

  if (loading) {
    return (
      <Button variant="outline" className="w-full justify-between h-10" disabled>
        <span className="text-muted-foreground">Loading tables...</span>
      </Button>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 rounded-lg bg-muted/30">
        <AlertCircle className="h-4 w-4" />
        <span>No tables configured. Add tables in Floorplan.</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="pos-table-selector__trigger w-full justify-between"
        >
          {selectedTable ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">{selectedTable}</span>
              {selectedTableData?.customer && (
                <Badge variant="outline" className="pos-table-selector__guest">
                  <User className="h-3 w-3 mr-1" />
                  {selectedTableData.customer.displayName}
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">Select a table...</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="pos-table-selector-popover" align="start">
        <ScrollArea className="max-h-80">
          <div className="pos-table-selector__list">
            {/* Available Tables */}
            {availableTables.length > 0 && (
              <div className="pos-table-selector__group">
                <div className="pos-table-selector__group-title">
                  Available ({availableTables.length})
                </div>
                <div>
                  {availableTables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={cn(
                        "pos-table-selector__row",
                        selectedTable === table.tableNumber && "is-selected"
                      )}
                    >
                      <Badge variant="outline" className={cn("pos-table-selector__status", getStatusColor(table.status))}>
                        {table.tableNumber}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span>Seats {table.capacity}</span>
                        </div>
                        {table.section && (
                          <span className="text-xs text-muted-foreground">{table.section}</span>
                        )}
                      </div>
                      {selectedTable === table.tableNumber && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Occupied Tables (with customers) */}
            {occupiedTables.length > 0 && (
              <div className="pos-table-selector__group">
                <div className="pos-table-selector__group-title">
                  Occupied - Assign Order ({occupiedTables.length})
                </div>
                <div>
                  {occupiedTables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={cn(
                        "pos-table-selector__row",
                        selectedTable === table.tableNumber && "is-selected"
                      )}
                    >
                      <Badge variant="outline" className={cn("pos-table-selector__status", getStatusColor(table.status))}>
                        {table.tableNumber}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        {table.customer ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={table.customer.avatarUrl} />
                              <AvatarFallback className="text-xs">
                                {table.customer.displayName.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium">{table.customer.displayName}</div>
                              <div className="text-xs text-muted-foreground">Checked in</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">In use</div>
                        )}
                      </div>
                      {selectedTable === table.tableNumber && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reserved Tables (coming up) */}
            {reservedTables.length > 0 && (
              <div className="pos-table-selector__group">
                <div className="pos-table-selector__group-title">
                  Reserved Soon ({reservedTables.length})
                </div>
                <div>
                  {reservedTables.map((table) => (
                    <div
                      key={table.id}
                      className="pos-table-selector__row is-unavailable"
                    >
                      <Badge variant="outline" className={cn("pos-table-selector__status", getStatusColor(table.status))}>
                        {table.tableNumber}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>Reserved - unavailable</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clear Selection */}
            {selectedTable && (
              <div className="pos-table-selector__clear-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  className="pos-table-selector__clear w-full justify-center"
                  onClick={() => {
                    onTableSelect(null);
                    setOpen(false);
                  }}
                >
                  Clear selection
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
