import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, CheckCircle, Car } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';
import { cn } from "@/lib/utils";

type Vertical = "real_estate" | "auto";

export default function AdvertiserOnboarding() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [vertical, setVertical] = useState<Vertical>("real_estate");
  const [formData, setFormData] = useState({
    company_name: "",
    contact_email: user?.email || "",
    contact_phone: "",
    license_number: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("advertisers")
        .insert({
          user_id: user.id,
          company_name: formData.company_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone || null,
          license_number: formData.license_number || null,
          advertiser_type: vertical,
        } as any);

      if (error) throw error;

      toast.success("Advertiser profile created successfully!");
      navigate("/advertiser");
    } catch (error: any) {
      toast.error(error.message || "Failed to create profile");
    } finally {
      setLoading(false);
    }
  };

  const isAuto = vertical === "auto";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Card className="border-border/50 shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              {isAuto ? <Car className="w-8 h-8 text-primary" /> : <Building2 className="w-8 h-8 text-primary" />}
            </div>
            <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
            <CardDescription>
              Tell us about your business to start advertising
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Vertical picker */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setVertical("real_estate")}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition",
                  vertical === "real_estate" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <Building2 className="w-5 h-5 mb-2 text-primary" />
                <div className="font-semibold text-sm">Real Estate</div>
                <div className="text-xs text-muted-foreground">Properties for sale, lease or rent</div>
              </button>
              <button
                type="button"
                onClick={() => setVertical("auto")}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition",
                  vertical === "auto" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <Car className="w-5 h-5 mb-2 text-primary" />
                <div className="font-semibold text-sm">Auto / Vehicles</div>
                <div className="text-xs text-muted-foreground">Cars for sale, lease or rent-to-own</div>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="company_name">{isAuto ? "Dealership / Seller Name *" : "Company / Agency Name *"}</Label>
                <Input
                  id="company_name"
                  placeholder={isAuto ? "e.g., North Lakes Auto" : "e.g., Prestige Real Estate"}
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
                  placeholder="contact@company.com"
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
                  placeholder="+61 400 000 000"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="license_number">
                  {isAuto ? "Dealer License Number (Optional)" : "Real Estate License Number (Optional)"}
                </Label>
                <Input
                  id="license_number"
                  placeholder="e.g., 12345678"
                  value={formData.license_number}
                  onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Verified accounts get faster approval and premium placement options
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating Profile..." : "Create Advertiser Profile"}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-sm font-medium text-foreground mb-3">What happens next?</p>
              <ul className="text-sm text-muted-foreground space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>Access your advertiser dashboard</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>Create your first {isAuto ? "vehicle listing" : "property campaign"}</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>Choose placements and schedule your ads</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>Track performance with real-time analytics</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
