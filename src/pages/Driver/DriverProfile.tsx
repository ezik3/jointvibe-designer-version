import { useState } from "react";
import { motion } from "framer-motion";
import { User, Car, Star, Package, DollarSign, Shield, Edit, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverSystem } from "@/hooks/useDriverSystem";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';

const DriverProfile = () => {
  const { t } = useTranslation('common');
  const { user, signOut } = useAuth();
  const { driverProfile, isDriver } = useDriverSystem();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (!isDriver || !driverProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border p-6 pb-12">
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-12 h-12 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{user?.email?.split('@')[0]}</h1>
          <p className="text-muted-foreground">{user?.email}</p>
          
          <div className="flex items-center justify-center gap-2 mt-3">
            {driverProfile.license_verified ? (
              <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
                <Shield className="w-3 h-3 mr-1" /> Verified Driver
              </Badge>
            ) : (
              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                Pending Verification
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 -mt-6 space-y-4">
        {/* Stats */}
        <Card className="bg-card border-border p-4">
          <h3 className="text-foreground font-semibold mb-4">Performance</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-green-500/20 flex items-center justify-center">
                <Package className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-xl font-bold text-foreground">{driverProfile.total_deliveries}</p>
              <p className="text-muted-foreground text-xs">Deliveries</p>
            </div>
            <div>
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <Star className="w-6 h-6 text-yellow-400" />
              </div>
              <p className="text-xl font-bold text-foreground">{Number(driverProfile.average_rating).toFixed(1)}</p>
              <p className="text-muted-foreground text-xs">Rating</p>
            </div>
            <div>
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Car className="w-6 h-6 text-blue-400" />
              </div>
              <p className="text-xl font-bold text-foreground">{driverProfile.total_rides}</p>
              <p className="text-muted-foreground text-xs">Rides</p>
            </div>
          </div>
        </Card>

        {/* Vehicle Info */}
        <Card className="bg-card border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold">Vehicle Details</h3>
            <Button variant="ghost" size="sm" className="text-primary">
              <Edit className="w-4 h-4 mr-1" /> Edit
            </Button>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="text-foreground capitalize">{driverProfile.vehicle_type || 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Make</span>
              <span className="text-foreground">{driverProfile.vehicle_make || 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model</span>
              <span className="text-foreground">{driverProfile.vehicle_model || 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plate</span>
              <span className="text-foreground">{driverProfile.vehicle_plate || 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">License ID</span>
              <span className="text-foreground">{driverProfile.drivers_license_id || 'Not set'}</span>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <Card className="bg-card border-border p-4 space-y-3">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => navigate('/driver/earnings')}>
            <DollarSign className="w-5 h-5 mr-3" /> Earnings & Payouts
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
            <Shield className="w-5 h-5 mr-3" /> Documents & Verification
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-red-400 hover:text-red-300"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5 mr-3" /> Sign Out
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default DriverProfile;
