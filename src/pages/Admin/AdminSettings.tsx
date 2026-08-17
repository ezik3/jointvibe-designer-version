import { useState } from "react";
import { Settings, Shield, Bell, Database, Globe, Key } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

export default function AdminSettings() {
  const { t } = useTranslation('admin');
  const [settings, setSettings] = useState({
    platformName: "Joint Vibe",
    supportEmail: "support@jointvibe.com",
    autoApproveDeposits: true,
    autoApproveWithdrawals: false,
    requireKYC: true,
    transactionFee: "0.10",
    minWithdrawal: "10",
    maxWithdrawal: "10000",
    enableNotifications: true,
    enableAuditLog: true,
  });

  const handleSave = () => {
    // In real implementation, this would save to backend
    toast.success("Settings saved successfully");
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">{t("common:navigation.settings")}</h1>
        <p className="text-slate-400 mt-1">Configure platform settings</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-slate-900/50 border border-slate-800">
          <TabsTrigger value="general" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
            General
          </TabsTrigger>
          <TabsTrigger value="security" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
            Security
          </TabsTrigger>
          <TabsTrigger value="payments" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
            Payments
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Globe className="h-5 w-5 text-purple-400" />
                General Settings
              </CardTitle>
              <CardDescription>Basic platform configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-slate-300">Platform Name</Label>
                  <Input
                    value={settings.platformName}
                    onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Support Email</Label>
                  <Input
                    type="email"
                    value={settings.supportEmail}
                    onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-cyan-400" />
                Security Settings
              </CardTitle>
              <CardDescription>Security and compliance options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50">
                <div>
                  <p className="text-white font-medium">Require KYC Verification</p>
                  <p className="text-sm text-slate-400">Users must complete ID verification</p>
                </div>
                <Switch
                  checked={settings.requireKYC}
                  onCheckedChange={(checked) => setSettings({ ...settings, requireKYC: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50">
                <div>
                  <p className="text-white font-medium">Enable Audit Log</p>
                  <p className="text-sm text-slate-400">Log all admin actions</p>
                </div>
                <Switch
                  checked={settings.enableAuditLog}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableAuditLog: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Settings */}
        <TabsContent value="payments">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Database className="h-5 w-5 text-green-400" />
                Payment Settings
              </CardTitle>
              <CardDescription>Transaction and fee configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-slate-300">Transaction Fee (USD)</Label>
                  <Input
                    value={settings.transactionFee}
                    onChange={(e) => setSettings({ ...settings, transactionFee: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Min Withdrawal (USD)</Label>
                  <Input
                    value={settings.minWithdrawal}
                    onChange={(e) => setSettings({ ...settings, minWithdrawal: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Max Withdrawal (USD)</Label>
                  <Input
                    value={settings.maxWithdrawal}
                    onChange={(e) => setSettings({ ...settings, maxWithdrawal: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50">
                <div>
                  <p className="text-white font-medium">Auto-approve Deposits</p>
                  <p className="text-sm text-slate-400">Automatically approve and credit deposits</p>
                </div>
                <Switch
                  checked={settings.autoApproveDeposits}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoApproveDeposits: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50">
                <div>
                  <p className="text-white font-medium">Auto-approve Withdrawals</p>
                  <p className="text-sm text-slate-400">Automatically approve withdrawal requests</p>
                </div>
                <Switch
                  checked={settings.autoApproveWithdrawals}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoApproveWithdrawals: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Bell className="h-5 w-5 text-yellow-400" />
                Notification Settings
              </CardTitle>
              <CardDescription>Configure admin notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50">
                <div>
                  <p className="text-white font-medium">Enable Notifications</p>
                  <p className="text-sm text-slate-400">Receive alerts for important events</p>
                </div>
                <Switch
                  checked={settings.enableNotifications}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableNotifications: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          className="bg-purple-500 hover:bg-purple-600 text-white px-8"
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
