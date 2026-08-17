import { useEffect, useState } from "react";
import "./admin-dialogs.css";
import { UserCog, Search, Filter, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
}

const ADMIN_ROLES = [
  { value: "admin", label: "Admin", description: "General admin access" },
  { value: "owner_superadmin", label: "Owner/Superadmin", description: "Full platform access" },
  { value: "admin_manager", label: "Admin Manager", description: "Can manage other admins" },
  { value: "admin_support", label: "Support Admin", description: "Customer support access" },
  { value: "admin_finance", label: "Finance Admin", description: "Financial operations" },
  { value: "admin_compliance", label: "Compliance Admin", description: "Compliance & freezes" },
];

export default function AdminRoles() {
  const { t } = useTranslation('admin');
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialog, setAddDialog] = useState(false);
  const [formData, setFormData] = useState({
    userId: "",
    role: ""
  });

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRoles(data || []);
    } catch (error) {
      console.error("Error fetching roles:", error);
      toast.error("Failed to fetch roles");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRole = async () => {
    try {
      if (!formData.userId || !formData.role) {
        throw new Error("Please fill in all fields");
      }

      const { error } = await supabase
        .from("user_roles")
        .insert({
          user_id: formData.userId,
          role: formData.role as any
        });

      if (error) throw error;

      toast.success("Role assigned successfully");
      setAddDialog(false);
      setFormData({ userId: "", role: "" });
      fetchRoles();
    } catch (error: any) {
      toast.error(error.message || "Failed to assign role");
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;
      toast.success("Role removed");
      fetchRoles();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove role");
    }
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      owner_superadmin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      admin_manager: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      admin_support: "bg-green-500/20 text-green-400 border-green-500/30",
      admin_finance: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      admin_compliance: "bg-red-500/20 text-red-400 border-red-500/30",
      manager: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
      staff: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      kitchen: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    };
    return <Badge className={colors[role] || "bg-slate-500/20 text-slate-400 border-slate-500/30"}>{role}</Badge>;
  };

  const filteredRoles = roles.filter(role => {
    const query = searchQuery.toLowerCase();
    return (
      role.role.toLowerCase().includes(query) ||
      role.user_id.toLowerCase().includes(query)
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
          <h1 className="text-3xl font-bold text-white">Role Management</h1>
          <p className="text-slate-400 mt-1">Manage admin and staff roles</p>
        </div>
        <Button
          onClick={() => setAddDialog(true)}
          className="bg-purple-500 hover:bg-purple-600 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Assign Role
        </Button>
      </div>

      {/* Role Types */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {ADMIN_ROLES.map((role) => (
          <Card key={role.value} className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4 text-center">
              <div className="mb-2">{getRoleBadge(role.value)}</div>
              <p className="text-xs text-slate-500">{role.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search by user ID or role..."
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

      {/* Roles Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Assigned Roles</CardTitle>
          <CardDescription>All user role assignments</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-sm font-medium text-slate-400">User ID</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Role</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Assigned</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.map((role) => (
                  <tr key={role.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-4">
                      <span className="text-slate-300 font-mono text-sm">
                        {role.user_id}
                      </span>
                    </td>
                    <td className="p-4">
                      {getRoleBadge(role.role)}
                    </td>
                    <td className="p-4">
                      <span className="text-slate-400 text-sm">
                        {new Date(role.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleDeleteRole(role.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredRoles.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No roles found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Role Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle className="text-white">Assign Role</DialogTitle>
            <DialogDescription>
              Assign an admin role to a user
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">User ID</Label>
              <Input
                placeholder="Enter user UUID..."
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select role..." />
                </SelectTrigger>
                <SelectContent className="admin-select-popover">
                  {ADMIN_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialog(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddRole}
              className="admin-dialog__primary"
              disabled={!formData.userId || !formData.role}
            >
              Assign Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
