import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Clock, TrendingUp, Calendar, Pencil, Trash2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRosterData, getRoleColor, getRoleGlow } from "@/hooks/useRosterData";
import { usePOS } from "@/contexts/POSContext";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

export default function StaffRoster() {
  const { t } = useTranslation('pos');
  const { venueId } = usePOS();
  const { employees, loading, updateShift, deleteShift, addShift, DAYS, DAY_SHORT, DAY_LABEL, formatTime12 } = useRosterData(venueId || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingShift, setEditingShift] = useState<{
    rosterId: string | null;
    employeeUserId: string;
    day: string;
    startTime: string;
    endTime: string;
    isNew: boolean;
  } | null>(null);

  const filteredEmployees = employees.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || member.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const uniqueRoles = [...new Set(employees.map(e => e.role))];

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">Staff Management</h1>
          <p className="text-muted-foreground">Manage your team and schedules</p>
        </div>
        <Button className="neon-glow">
          <Plus className="h-4 w-4 mr-2" />
          Add New Staff
        </Button>
      </div>

      <Tabs defaultValue="roster" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="list">Staff List</TabsTrigger>
          <TabsTrigger value="roster">Weekly Roster</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {uniqueRoles.map(role => (
                <SelectItem key={role} value={role}>{role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Staff List Tab */}
        <TabsContent value="list" className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading staff...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEmployees.map((member) => (
                <Card key={member.id} className="glass glass-hover border-border">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
                          {member.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <CardTitle className="text-xl mb-1">{member.name}</CardTitle>
                          <Badge className={`${getRoleColor(member.role)} border text-xs`}>{member.role}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span className="text-xs">Hours/Week</span>
                        </div>
                        <p className="text-2xl font-bold">{member.totalHours}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <TrendingUp className="h-4 w-4" />
                          <span className="text-xs">Shifts</span>
                        </div>
                        <p className="text-2xl font-bold">{member.shifts.length}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">This Week's Shifts:</p>
                      {member.shifts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No shifts scheduled</p>
                      ) : (
                        member.shifts.map((shift) => (
                          <div key={shift.id} className="flex justify-between text-sm">
                            <span className="font-medium">{DAY_SHORT[shift.day_of_week] || shift.day_of_week}</span>
                            <span className="text-muted-foreground">
                              {formatTime12(shift.start_time)} - {formatTime12(shift.end_time)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Weekly Roster Tab - LIVE DATA */}
        <TabsContent value="roster" className="space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Weekly Roster
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading roster...</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No staff rostered yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-4">Staff Member</th>
                        {DAYS.map(day => (
                          <th key={day} className="text-center p-4">{DAY_SHORT[day]}</th>
                        ))}
                        <th className="text-center p-4">Total Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((emp) => (
                        <tr key={emp.id} className="border-b border-border/50">
                          <td className="p-4">
                            <div>
                              <p className="font-semibold">{emp.name}</p>
                              <Badge className={`${getRoleColor(emp.role)} border text-xs mt-1`}>{emp.role}</Badge>
                            </div>
                          </td>
                          {DAYS.map((day) => {
                            const shift = emp.shifts.find(s => s.day_of_week === day);
                            return (
                              <td
                                key={day}
                                className="p-2 text-center cursor-pointer hover:bg-secondary/30 rounded transition-colors"
                                onClick={() => {
                                  if (shift) {
                                    setEditingShift({
                                      rosterId: shift.roster_id,
                                      employeeUserId: emp.user_id,
                                      day,
                                      startTime: shift.start_time,
                                      endTime: shift.end_time,
                                      isNew: false,
                                    });
                                  } else {
                                    setEditingShift({
                                      rosterId: null,
                                      employeeUserId: emp.user_id,
                                      day,
                                      startTime: "09:00",
                                      endTime: "17:00",
                                      isNew: true,
                                    });
                                  }
                                }}
                              >
                                {shift ? (
                                  <Badge
                                    className={`${getRoleColor(emp.role)} border text-xs whitespace-nowrap shadow-md ${getRoleGlow(emp.role)}`}
                                  >
                                    {formatTime12(shift.start_time)}-{formatTime12(shift.end_time)}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground hover:text-foreground transition-colors">
                                    <Plus className="h-4 w-4 mx-auto" />
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-4 text-center font-bold">{emp.totalHours}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Shift Popup */}
          {editingShift && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => setEditingShift(null)}>
              <div className="bg-card border border-border rounded-2xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">
                    {editingShift.isNew ? "Add Shift" : "Edit Shift"}
                  </h3>
                  <button onClick={() => setEditingShift(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">{DAY_LABEL[editingShift.day] || editingShift.day}</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Start Time</label>
                    <Input
                      type="time"
                      value={editingShift.startTime}
                      onChange={e => setEditingShift({ ...editingShift, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">End Time</label>
                    <Input
                      type="time"
                      value={editingShift.endTime}
                      onChange={e => setEditingShift({ ...editingShift, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      if (editingShift.isNew) {
                        const err = await addShift(editingShift.employeeUserId, editingShift.day, editingShift.startTime, editingShift.endTime);
                        if (err) toast.error("Failed to add shift");
                        else toast.success("Shift added");
                      } else if (editingShift.rosterId) {
                        const err = await updateShift(editingShift.rosterId, editingShift.startTime, editingShift.endTime);
                        if (err) toast.error("Failed to update shift");
                        else toast.success("Shift updated");
                      }
                      setEditingShift(null);
                    }}
                    className="flex-1 neon-glow"
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                  {!editingShift.isNew && (
                    <Button
                      onClick={async () => {
                        if (editingShift.rosterId) {
                          const err = await deleteShift(editingShift.rosterId);
                          if (err) toast.error("Failed to delete");
                          else toast.success("Shift deleted");
                        }
                        setEditingShift(null);
                      }}
                      variant="destructive"
                      className="flex-1"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">{t("common:app.loading")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {filteredEmployees.map((member) => (
                <Card key={member.id} className="glass">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">
                        {member.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{member.name}</CardTitle>
                        <Badge className={`${getRoleColor(member.role)} border text-xs`}>{member.role}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Hours This Week</p>
                        <p className="text-2xl font-bold">{member.totalHours}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Shifts</p>
                        <p className="text-2xl font-bold">{member.shifts.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
