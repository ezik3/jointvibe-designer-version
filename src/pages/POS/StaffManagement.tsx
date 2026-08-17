import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Search, Plus, Users, Clock, TrendingUp, Edit, Trash2, 
  Mail, Phone, ShieldCheck, Calendar, MoreVertical 
} from "lucide-react";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import StaffInviteModal from "@/components/Venue/StaffInviteModal";
import { useTranslation } from 'react-i18next';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: string;
  status: "active" | "off-duty" | "on-break";
  permissions: string[];
  hiredDate: string;
  todayShift: string | null;
  weeklyHours: number;
  ordersThisWeek: number;
  salesThisWeek: number;
}

const mockStaff: StaffMember[] = [
  {
    id: "1",
    name: "Sarah Johnson",
    email: "sarah.j@example.com",
    phone: "+1 555-0123",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100",
    role: "waiter",
    status: "active",
    permissions: ["pos", "orders", "tables"],
    hiredDate: "2024-01-15",
    todayShift: "6PM - 2AM",
    weeklyHours: 32,
    ordersThisWeek: 145,
    salesThisWeek: 4250,
  },
  {
    id: "2",
    name: "Mike Wilson",
    email: "mike.w@example.com",
    phone: "+1 555-0124",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
    role: "bartender",
    status: "active",
    permissions: ["pos", "orders"],
    hiredDate: "2024-02-20",
    todayShift: "8PM - 4AM",
    weeklyHours: 40,
    ordersThisWeek: 210,
    salesThisWeek: 6800,
  },
  {
    id: "3",
    name: "Emma Chen",
    email: "emma.c@example.com",
    phone: "+1 555-0125",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100",
    role: "kitchen",
    status: "off-duty",
    permissions: ["kitchen", "orders"],
    hiredDate: "2023-11-10",
    todayShift: null,
    weeklyHours: 28,
    ordersThisWeek: 0,
    salesThisWeek: 0,
  },
  {
    id: "4",
    name: "James Brown",
    email: "james.b@example.com",
    phone: "+1 555-0126",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100",
    role: "host",
    status: "on-break",
    permissions: ["tables"],
    hiredDate: "2024-03-01",
    todayShift: "5PM - 11PM",
    weeklyHours: 24,
    ordersThisWeek: 0,
    salesThisWeek: 0,
  },
];

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const mockRoster = [
  { id: "1", name: "Sarah Johnson", role: "Waiter", shifts: ["6PM-2AM", "-", "6PM-2AM", "-", "6PM-2AM", "6PM-2AM", "-"] },
  { id: "2", name: "Mike Wilson", role: "Bartender", shifts: ["-", "8PM-4AM", "8PM-4AM", "8PM-4AM", "8PM-4AM", "8PM-4AM", "-"] },
  { id: "3", name: "Emma Chen", role: "Kitchen", shifts: ["4PM-12AM", "4PM-12AM", "-", "4PM-12AM", "4PM-12AM", "-", "-"] },
  { id: "4", name: "James Brown", role: "Host", shifts: ["5PM-11PM", "-", "5PM-11PM", "-", "5PM-11PM", "5PM-11PM", "5PM-11PM"] },
];

export default function StaffManagement() {
  const { t } = useTranslation('pos');
  const [searchQuery, setSearchQuery] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState("staff");

  const filteredStaff = mockStaff.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500";
      case "on-break": return "bg-yellow-500";
      default: return "bg-slate-500";
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "waiter": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "bartender": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "kitchen": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "host": return "bg-pink-500/20 text-pink-400 border-pink-500/30";
      case "manager": return "bg-green-500/20 text-green-400 border-green-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <StaffInviteModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Staff Management</h1>
          <p className="text-muted-foreground">Manage employees, shifts, and permissions</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)} className="bg-primary">
          <Plus className="mr-2 h-4 w-4" /> Invite Employee
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Users className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mockStaff.filter(s => s.status === "active").length}</p>
                <p className="text-sm text-muted-foreground">On Shift Now</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mockStaff.length}</p>
                <p className="text-sm text-muted-foreground">Total Staff</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Clock className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">124</p>
                <p className="text-sm text-muted-foreground">Hours This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">$11,050</p>
                <p className="text-sm text-muted-foreground">Staff Sales This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="staff">Staff List</TabsTrigger>
          <TabsTrigger value="roster">Weekly Roster</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
        </TabsList>

        {/* Staff List Tab */}
        <TabsContent value="staff" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStaff.map((staff) => (
              <Card key={staff.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={staff.avatar} />
                          <AvatarFallback>{staff.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800 ${getStatusColor(staff.status)}`} />
                      </div>
                      <div>
                        <p className="font-bold">{staff.name}</p>
                        <Badge variant="outline" className={getRoleBadgeColor(staff.role)}>
                          {staff.role}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-slate-800 border-slate-700">
                        <DropdownMenuItem><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem><ShieldCheck className="mr-2 h-4 w-4" /> Permissions</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-400"><Trash2 className="mr-2 h-4 w-4" /> Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{staff.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{staff.phone}</span>
                    </div>
                    {staff.todayShift && (
                      <div className="flex items-center gap-2 text-green-400">
                        <Clock className="h-4 w-4" />
                        <span>Today: {staff.todayShift}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-700">
                    <div className="text-center">
                      <p className="text-lg font-bold">{staff.weeklyHours}h</p>
                      <p className="text-xs text-muted-foreground">This Week</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-400">${staff.salesThisWeek}</p>
                      <p className="text-xs text-muted-foreground">Sales</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Roster Tab */}
        <TabsContent value="roster">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Weekly Schedule</CardTitle>
                <Button size="sm" className="bg-primary">
                  <Calendar className="mr-2 h-4 w-4" /> Edit Schedule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-3">Employee</th>
                      {weekDays.map(day => (
                        <th key={day} className="text-center p-3 min-w-[100px]">{day}</th>
                      ))}
                      <th className="text-center p-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockRoster.map((row) => (
                      <tr key={row.id} className="border-b border-slate-700/50">
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">{row.role}</p>
                          </div>
                        </td>
                        {row.shifts.map((shift, i) => (
                          <td key={i} className="text-center p-3">
                            {shift !== "-" ? (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                                {shift}
                              </Badge>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                        ))}
                        <td className="text-center p-3 font-bold">
                          {row.shifts.filter(s => s !== "-").length * 8}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockStaff.map((staff) => (
              <Card key={staff.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={staff.avatar} />
                      <AvatarFallback>{staff.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold text-lg">{staff.name}</p>
                      <Badge variant="outline" className={getRoleBadgeColor(staff.role)}>
                        {staff.role}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-lg bg-slate-700/50">
                      <p className="text-2xl font-bold">{staff.weeklyHours}</p>
                      <p className="text-xs text-muted-foreground">Hours</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-700/50">
                      <p className="text-2xl font-bold">{staff.ordersThisWeek}</p>
                      <p className="text-xs text-muted-foreground">Orders</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-700/50">
                      <p className="text-2xl font-bold text-green-400">${staff.salesThisWeek}</p>
                      <p className="text-xs text-muted-foreground">Sales</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-bold text-lg mb-2">No Pending Invitations</h3>
              <p className="text-muted-foreground mb-4">
                Invite new employees to join your venue
              </p>
              <Button onClick={() => setShowInviteModal(true)} className="bg-primary">
                <Plus className="mr-2 h-4 w-4" /> Invite Employee
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}