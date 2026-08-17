import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, MapPin, ChevronRight, Edit2, Eye, Maximize2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Immersive360Viewer from "./Immersive360Viewer";
import { useTranslation } from 'react-i18next';
import {
  readVenueFloorplan,
  readVenueFloorplan360,
  readVenueTablesSync,
} from "@/lib/venueFloorplanStorage";

interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  status: "available" | "occupied" | "reserved";
  x: number;
  y: number;
  currentGuests?: number;
  duration?: string;
  reservationTime?: string;
  sceneName?: string;
}

interface TablesPopupProps {
  isOpen: boolean;
  onClose: () => void;
  venueId?: string | null;
}

export default function TablesPopup({ isOpen, onClose, venueId }: TablesPopupProps) {
  const { t } = useTranslation('venue');
  const navigate = useNavigate();
  const activeVenueId = venueId || (typeof window === "undefined" ? null : localStorage.getItem("jv_current_venue_id"));
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [floorplanMedia, setFloorplanMedia] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'immersive'>('grid');
  const [showImmersiveViewer, setShowImmersiveViewer] = useState(false);
  const [has360Floorplan, setHas360Floorplan] = useState(false);

  useEffect(() => {
    // First try to load from 360 floorplan
    const data = readVenueFloorplan360<{ scenes?: Array<{ panoramaUrl?: string }>; }>(activeVenueId);
    if (data) {
      setHas360Floorplan(true);
      
      // Get first scene panorama as background
      if (data.scenes?.length > 0) {
        setFloorplanMedia(data.scenes[0].panoramaUrl || null);
      }
      
      // Load tables from synced tables
      const syncedTables = readVenueTablesSync<unknown[]>(activeVenueId);
      if (Array.isArray(syncedTables)) {
        const loadedTables = syncedTables.map((table) => {
          const t = table as Record<string, unknown>;
          return {
          id: String(t.id || ""),
          tableNumber: t.number ? `T${String(t.number)}` : String(t.tableNumber || "Table"),
          capacity: Number(t.capacity) || 4,
          status: t.status as "available" | "occupied" | "reserved",
          x: Number(t.x) || 50,
          y: Number(t.y) || 50,
          sceneName: typeof t.section === "string" ? t.section : undefined,
          currentGuests: t.status === 'occupied' ? Math.floor(Math.random() * (Number(t.capacity) || 4)) + 1 : undefined,
          duration: t.status === 'occupied' ? `${Math.floor(Math.random() * 60) + 10}m` : undefined,
          reservationTime: t.status === 'reserved' ? "8:30 PM" : undefined,
          };
        });
        setTables(loadedTables);
        return;
      }
    } else {
      setHas360Floorplan(false);
    }

    // Fallback to old floorplan format
    const savedFloorplan = readVenueFloorplan<{
      mediaURL?: string;
      tables?: Array<{
        id?: string;
        meta?: { tableNumber?: string; capacity?: number; status?: "available" | "occupied" | "reserved" };
        x?: number;
        y?: number;
      }>;
    }>(activeVenueId);
    if (savedFloorplan) {
      const data = savedFloorplan;
      setFloorplanMedia(data.mediaURL || null);
      
      const loadedTables = (data.tables || []).map((t, i) => ({
        id: t.id || `table-${i}`,
        tableNumber: t.meta?.tableNumber || `T${i + 1}`,
        capacity: t.meta?.capacity || 4,
        status: (t.meta?.status || ["available", "occupied", "reserved"][Math.floor(Math.random() * 3)]) as Table["status"],
        x: t.x,
        y: t.y,
        currentGuests: Math.floor(Math.random() * 4) + 1,
        duration: `${Math.floor(Math.random() * 60) + 10}m`,
        reservationTime: "8:30 PM"
      }));
      setTables(loadedTables);
    } else {
      // Default mock tables
      setTables([
        { id: "1", tableNumber: "T1", capacity: 4, status: "available", x: 20, y: 30 },
        { id: "2", tableNumber: "T2", capacity: 2, status: "occupied", x: 40, y: 30, currentGuests: 2, duration: "45m" },
        { id: "3", tableNumber: "T3", capacity: 6, status: "reserved", x: 60, y: 30, reservationTime: "8:00 PM" },
        { id: "4", tableNumber: "T4", capacity: 4, status: "occupied", x: 80, y: 30, currentGuests: 4, duration: "20m" },
        { id: "5", tableNumber: "T5", capacity: 8, status: "available", x: 20, y: 60 },
        { id: "6", tableNumber: "T6", capacity: 2, status: "occupied", x: 40, y: 60, currentGuests: 2, duration: "15m" },
        { id: "7", tableNumber: "T7", capacity: 4, status: "available", x: 60, y: 60 },
        { id: "8", tableNumber: "T8", capacity: 6, status: "reserved", x: 80, y: 60, reservationTime: "9:30 PM" },
      ]);
    }
  }, [activeVenueId, isOpen]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-500";
      case "occupied": return "bg-red-500";
      case "reserved": return "bg-yellow-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "occupied": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "reserved": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default: return "bg-gray-500/20 text-gray-400";
    }
  };

  const stats = {
    total: tables.length,
    available: tables.filter(t => t.status === "available").length,
    occupied: tables.filter(t => t.status === "occupied").length,
    reserved: tables.filter(t => t.status === "reserved").length,
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="venue-dialog-surface venue-dialog-surface--scroll sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> Table Overview
            </span>
            <Button variant="outline" size="sm" onClick={() => { onClose(); navigate("/venue/pos/floorplan"); }}>
              <Edit2 className="w-4 h-4 mr-2" /> Edit Floorplan
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-white">{stats.total}</p>
              <p className="text-xs text-slate-400">Total</p>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/30">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{stats.available}</p>
              <p className="text-xs text-green-400">Available</p>
            </CardContent>
          </Card>
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{stats.occupied}</p>
              <p className="text-xs text-red-400">Occupied</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-yellow-400">{stats.reserved}</p>
              <p className="text-xs text-yellow-400">Reserved</p>
            </CardContent>
          </Card>
        </div>

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'immersive')} className="mb-4">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="grid">Grid View</TabsTrigger>
            <TabsTrigger value="immersive" className="flex items-center gap-2">
              <Maximize2 className="w-3 h-3" /> Immersive View
            </TabsTrigger>
          </TabsList>
          {viewMode === 'immersive' && has360Floorplan && (
            <Button 
              size="sm" 
              className="venue-dialog-primary-action ml-4"
              onClick={() => setShowImmersiveViewer(true)}
            >
              <Eye className="w-4 h-4 mr-2" /> Open Fullscreen 360°
            </Button>
          )}
        </Tabs>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500" /> Available</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500" /> Occupied</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500" /> Reserved</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Visual Map or Grid */}
          <div className="lg:col-span-2">
            {viewMode === 'grid' ? (
              // Grid View
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {tables.map((table) => (
                      <Card
                        key={table.id}
                        className={`bg-slate-700 cursor-pointer transition-all hover:scale-105 ${
                          selectedTable?.id === table.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => setSelectedTable(table)}
                      >
                        <CardContent className="p-3 text-center">
                          <div className="text-2xl font-bold mb-1">{table.tableNumber}</div>
                          <Badge className={getStatusBadgeColor(table.status)}>
                            {table.status}
                          </Badge>
                          <div className="flex items-center justify-center gap-1 mt-2 text-sm text-slate-400">
                            <Users className="h-3 w-3" />
                            <span>{table.capacity}</span>
                          </div>
                          {table.status === "occupied" && table.duration && (
                            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-primary">
                              <Clock className="h-3 w-3" />
                              <span>{table.duration}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              // Immersive View
              <Card className="bg-slate-800 border-slate-700 overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative aspect-video min-h-[300px]">
                    {/* Background */}
                    {floorplanMedia ? (
                      <img 
                        src={floorplanMedia} 
                        alt="Venue Floorplan" 
                        className="absolute inset-0 w-full h-full object-cover opacity-40"
                      />
                    ) : (
                      <div 
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `
                            linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)
                          `,
                          backgroundSize: '40px 40px'
                        }}
                      />
                    )}

                    {/* Table Hotspots */}
                    {tables.map((table) => (
                      <div
                        key={table.id}
                        className={`absolute cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-110 ${
                          selectedTable?.id === table.id ? "scale-110 z-10" : ""
                        }`}
                        style={{ left: `${table.x}%`, top: `${table.y}%` }}
                        onClick={() => setSelectedTable(table)}
                      >
                        <div className={`relative w-14 h-14 rounded-full ${getStatusColor(table.status)} 
                          bg-opacity-80 border-4 border-white shadow-xl flex items-center justify-center
                          ${selectedTable?.id === table.id ? "ring-4 ring-primary" : ""}`}
                        >
                          <div className="text-center text-white">
                            <div className="font-bold text-sm">{table.tableNumber}</div>
                            <div className="text-xs flex items-center justify-center">
                              <Users className="w-3 h-3 mr-0.5" />
                              {table.capacity}
                            </div>
                          </div>
                        </div>
                        {table.status === "occupied" && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center animate-pulse border-2 border-white">
                            <Clock className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Selected Table Info */}
          <div>
            {selectedTable ? (
              <Card className="bg-slate-800 border-slate-700 h-full">
                <CardContent className="p-4 space-y-4">
                  <div className="text-center pb-4 border-b border-slate-700">
                    <div className={`w-20 h-20 mx-auto rounded-full ${getStatusColor(selectedTable.status)} 
                      flex items-center justify-center text-white text-2xl font-bold mb-3`}
                    >
                      {selectedTable.tableNumber}
                    </div>
                    <Badge className={getStatusBadgeColor(selectedTable.status)}>
                      {selectedTable.status.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Capacity</span>
                      <span className="font-medium flex items-center gap-1">
                        <Users className="w-4 h-4" /> {selectedTable.capacity} seats
                      </span>
                    </div>

                    {selectedTable.sceneName && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Area</span>
                        <span className="font-medium">{selectedTable.sceneName}</span>
                      </div>
                    )}

                    {selectedTable.status === "occupied" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Guests</span>
                          <span className="font-medium">{selectedTable.currentGuests}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Duration</span>
                          <span className="font-medium text-primary">{selectedTable.duration}</span>
                        </div>
                      </>
                    )}

                    {selectedTable.status === "reserved" && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Reservation</span>
                        <span className="font-medium text-yellow-400">{selectedTable.reservationTime}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 space-y-2">
                    {selectedTable.status === "available" && (
                      <Button className="w-full bg-green-500 hover:bg-green-600">Seat Guests</Button>
                    )}
                    {selectedTable.status === "occupied" && (
                      <>
                        <Button className="w-full" variant="outline">View Order</Button>
                        <Button className="w-full bg-primary">Process Payment</Button>
                      </>
                    )}
                    <Button 
                      variant="outline" 
                      className="w-full border-slate-600"
                      onClick={() => { onClose(); navigate("/venue/pos/tables"); }}
                    >
                      Full Table View <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-slate-800 border-slate-700 h-full flex items-center justify-center">
                <CardContent className="text-center p-8">
                  <MapPin className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400">Click a table to view details</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-slate-700">
          <Button variant="ghost" onClick={onClose}>{t("common:app.close")}</Button>
          <Button onClick={() => { onClose(); navigate("/venue/pos/tables"); }}>
            Open Full Tables Page <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </DialogContent>

      {/* Fullscreen 360° Immersive Viewer */}
      <Immersive360Viewer 
        isOpen={showImmersiveViewer} 
        onClose={() => setShowImmersiveViewer(false)}
        isVenueOwner={true}
        venueId={activeVenueId}
      />
    </Dialog>
  );
}
