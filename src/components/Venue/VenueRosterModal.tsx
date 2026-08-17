import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Loader2, Pencil, Trash2, Plus, X } from "lucide-react";
import { useRosterData, getRoleColor, getRoleGlow, type RosterEmployee } from "@/hooks/useRosterData";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface VenueRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string | null | undefined;
}

interface EditingShift {
  rosterId: string | null;
  employeeUserId: string;
  day: string;
  startTime: string;
  endTime: string;
  isNew: boolean;
}

export default function VenueRosterModal({ isOpen, onClose, venueId }: VenueRosterModalProps) {
  const { t } = useTranslation('venue');
  const { employees, loading, updateShift, deleteShift, addShift, DAYS, DAY_SHORT, DAY_LABEL, formatTime12 } = useRosterData(venueId);
  const [editing, setEditing] = useState<EditingShift | null>(null);

  const handleCellClick = (emp: RosterEmployee, day: string) => {
    const shift = emp.shifts.find(s => s.day_of_week === day);
    if (shift) {
      setEditing({
        rosterId: shift.roster_id,
        employeeUserId: emp.user_id,
        day,
        startTime: shift.start_time,
        endTime: shift.end_time,
        isNew: false,
      });
    } else {
      setEditing({
        rosterId: null,
        employeeUserId: emp.user_id,
        day,
        startTime: "09:00",
        endTime: "17:00",
        isNew: true,
      });
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    if (editing.isNew) {
      const err = await addShift(editing.employeeUserId, editing.day, editing.startTime, editing.endTime);
      if (err) toast.error("Failed to add shift");
      else toast.success("Shift added");
    } else if (editing.rosterId) {
      const err = await updateShift(editing.rosterId, editing.startTime, editing.endTime);
      if (err) toast.error("Failed to update shift");
      else toast.success("Shift updated");
    }
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!editing?.rosterId) return;
    const err = await deleteShift(editing.rosterId);
    if (err) toast.error("Failed to delete shift");
    else toast.success("Shift deleted");
    setEditing(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="venue-dialog-surface venue-dialog-surface--scroll max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white text-xl">
            <Calendar className="h-5 w-5 text-primary" />
            Weekly Roster
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : employees.length === 0 ? (
          <p className="text-zinc-400 text-center py-16">No staff members yet. Invite employees first.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left p-3 text-zinc-400 font-medium">Staff</th>
                  {DAYS.map(day => (
                    <th key={day} className="text-center p-3 text-zinc-400 font-medium">{DAY_SHORT[day]}</th>
                  ))}
                  <th className="text-center p-3 text-zinc-400 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3">
                      <p className="font-semibold text-white">{emp.name}</p>
                      <Badge className={`${getRoleColor(emp.role)} border text-xs mt-1`}>{emp.role}</Badge>
                    </td>
                    {DAYS.map(day => {
                      const shift = emp.shifts.find(s => s.day_of_week === day);
                      return (
                        <td
                          key={day}
                          className="p-2 text-center cursor-pointer hover:bg-zinc-700/30 rounded transition-colors"
                          onClick={() => handleCellClick(emp, day)}
                        >
                          {shift ? (
                            <Badge
                              className={`${getRoleColor(emp.role)} border text-xs whitespace-nowrap shadow-md ${getRoleGlow(emp.role)}`}
                            >
                              {formatTime12(shift.start_time)}-{formatTime12(shift.end_time)}
                            </Badge>
                          ) : (
                            <span className="text-zinc-600 hover:text-zinc-400 transition-colors">
                              <Plus className="h-4 w-4 mx-auto" />
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-3 text-center font-bold text-white">{emp.totalHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit Shift Popup */}
        {editing && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => setEditing(null)}>
            <div className="bg-[#171d23] border border-[#2a323a] rounded-lg p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">
                  {editing.isNew ? "Add Shift" : "Edit Shift"}
                </h3>
                <button onClick={() => setEditing(null)} className="text-zinc-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-sm text-zinc-400">{DAY_LABEL[editing.day] || editing.day}</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Start Time</label>
                  <Input
                    type="time"
                    value={editing.startTime}
                    onChange={e => setEditing({ ...editing, startTime: e.target.value })}
                    className="bg-zinc-700 border-zinc-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">End Time</label>
                  <Input
                    type="time"
                    value={editing.endTime}
                    onChange={e => setEditing({ ...editing, endTime: e.target.value })}
                    className="bg-zinc-700 border-zinc-600 text-white"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} className="venue-dialog-primary-action flex-1">
                  <Pencil className="h-4 w-4 mr-1" />
                  Save
                </Button>
                {!editing.isNew && (
                  <Button onClick={handleDelete} variant="destructive" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
