import { useEffect, useState } from "react";
import "./admin-dialogs.css";
import { FileText, Search, Filter, Eye, User, Building2, Wallet, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface AuditLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  details: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export default function AdminAuditLog() {
  const { t } = useTranslation('admin');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast.error("Failed to fetch audit logs");
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      login: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      logout: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      freeze_wallet: "bg-red-500/20 text-red-400 border-red-500/30",
      unfreeze_wallet: "bg-green-500/20 text-green-400 border-green-500/30",
      approve_withdrawal: "bg-green-500/20 text-green-400 border-green-500/30",
      reject_withdrawal: "bg-red-500/20 text-red-400 border-red-500/30",
      mint: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      burn: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      update_role: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    return <Badge className={colors[action] || "bg-slate-500/20 text-slate-400 border-slate-500/30"}>{action}</Badge>;
  };

  const getTargetIcon = (type: string | null) => {
    switch (type) {
      case "user":
        return <User className="h-4 w-4" />;
      case "venue":
        return <Building2 className="h-4 w-4" />;
      case "wallet":
        return <Wallet className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const filteredLogs = logs.filter(log => {
    const query = searchQuery.toLowerCase();
    return (
      log.action_type.toLowerCase().includes(query) ||
      log.target_type?.toLowerCase().includes(query) ||
      log.admin_id.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="h-12 w-12 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Audit Log</h1>
          <p className="text-slate-400 mt-1">All admin actions are logged here</p>
        </div>
        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
          {logs.length} Entries
        </Badge>
      </div>

      {/* Search & Filter */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search by action or target..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <Button variant="outline" className="border-slate-700 text-slate-300">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Timestamp</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Admin</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Action</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Target</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">IP Address</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-400">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-300 font-mono text-xs">
                        {log.admin_id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="p-4">
                      {getActionBadge(log.action_type)}
                    </td>
                    <td className="p-4">
                      {log.target_type && (
                        <div className="flex items-center gap-2">
                          {getTargetIcon(log.target_type)}
                          <span className="text-slate-400 text-sm">
                            {log.target_type}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="text-slate-500 text-sm font-mono">
                        {log.ip_address || "—"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-white"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLogs.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No audit logs found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="admin-dialog max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Log ID</p>
                  <p className="text-white font-mono text-sm">{selectedLog.id}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Timestamp</p>
                  <p className="text-white">{new Date(selectedLog.created_at).toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Admin ID</p>
                  <p className="text-white font-mono text-sm">{selectedLog.admin_id}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">Action</p>
                  <div className="mt-1">{getActionBadge(selectedLog.action_type)}</div>
                </div>
              </div>
              {selectedLog.target_type && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-800/50">
                    <p className="text-sm text-slate-400">Target Type</p>
                    <p className="text-white capitalize">{selectedLog.target_type}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-800/50">
                    <p className="text-sm text-slate-400">Target ID</p>
                    <p className="text-white font-mono text-sm">{selectedLog.target_id || "—"}</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">IP Address</p>
                  <p className="text-white font-mono">{selectedLog.ip_address || "—"}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400">User Agent</p>
                  <p className="text-white text-xs truncate">{selectedLog.user_agent || "—"}</p>
                </div>
              </div>
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400 mb-2">Details</p>
                  <pre className="text-white text-sm bg-slate-900 p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
