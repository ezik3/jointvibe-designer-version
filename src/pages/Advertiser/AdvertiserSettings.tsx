import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Building2, CheckCircle, Shield } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

export default function AdvertiserSettings() {
  const { t } = useTranslation('common');
  const { advertiser, setAdvertiser } = useOutletContext<{ advertiser: any; setAdvertiser: (a: any) => void }>();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: advertiser?.company_name || "",
    contact_email: advertiser?.contact_email || "",
    contact_phone: advertiser?.contact_phone || "",
    license_number: advertiser?.license_number || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advertiser) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("advertisers")
        .update({
          company_name: formData.company_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone || null,
          license_number: formData.license_number || null,
        })
        .eq("id", advertiser.id)
        .select()
        .single();

      if (error) throw error;

      setAdvertiser(data);
      toast.success("Profile updated successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("common:navigation.settings")}</h1>
        <p className="text-muted-foreground mt-1">
          Manage your advertiser profile
        </p>
      </div>

      {/* Verification Status */}
      <Card className={advertiser?.is_verified ? "border-green-500/20 bg-green-500/5" : "border-primary/20 bg-primary/5"}>
        <CardContent className="flex items-center gap-4 py-6">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            advertiser?.is_verified ? "bg-green-500/20" : "bg-primary/20"
          }`}>
            {advertiser?.is_verified ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : (
              <Shield className="w-6 h-6 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground">Verification Status</h3>
              {advertiser?.is_verified ? (
                <Badge className="bg-green-500">Verified</Badge>
              ) : (
                <Badge variant="outline">Unverified</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {advertiser?.is_verified 
                ? "Your account is verified. You have access to all features."
                : "Add your real estate license number to get verified and unlock premium features."
              }
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Profile Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Business Profile
          </CardTitle>
          <CardDescription>
            Update your business information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company / Agency Name *</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact Email *</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input
                id="contact_phone"
                type="tel"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="license_number">Real Estate License Number</Label>
              <Input
                id="license_number"
                value={formData.license_number}
                onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Adding a valid license number will help us verify your account faster
              </p>
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Account ID</span>
            <span className="font-mono text-sm">{advertiser?.id?.slice(0, 8)}...</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Account Status</span>
            <Badge variant={advertiser?.is_active ? "default" : "secondary"}>
              {advertiser?.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Member Since</span>
            <span>{new Date(advertiser?.created_at).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
