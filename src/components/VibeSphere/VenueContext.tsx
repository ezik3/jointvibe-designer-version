import React, { createContext, useContext, useState, ReactNode } from "react";
import { useTranslation } from 'react-i18next';

interface VenueData {
  id: string;
  name: string;
  type?: string;
  vibeLevel?: string;
  priceLevel?: string;
  hours?: string;
  image_url?: string;
}

interface VenueContextType {
  isCheckedIn: boolean;
  venueId: string | null;
  venueData: VenueData | null;
  uiMode: "NORMAL" | "IMMERSIVE";
  isTransitioning: boolean;
  checkIn: (venueId: string, venueData: VenueData) => void;
  checkOut: () => void;
  setIsTransitioning: (value: boolean) => void;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

export const VenueProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation('venue');
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueData, setVenueData] = useState<VenueData | null>(null);
  const [uiMode, setUiMode] = useState<"NORMAL" | "IMMERSIVE">("NORMAL");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const checkIn = (id: string, data: VenueData) => {
    setIsTransitioning(true);
    setVenueId(id);
    setVenueData(data);
    
    // After transition, set checked in state
    setTimeout(() => {
      setIsCheckedIn(true);
      setUiMode("IMMERSIVE");
      setIsTransitioning(false);
    }, 3000);
  };

  const checkOut = () => {
    setIsCheckedIn(false);
    setVenueId(null);
    setVenueData(null);
    setUiMode("NORMAL");
    setIsTransitioning(false);
  };

  return (
    <VenueContext.Provider
      value={{
        isCheckedIn,
        venueId,
        venueData,
        uiMode,
        isTransitioning,
        checkIn,
        checkOut,
        setIsTransitioning,
      }}
    >
      {children}
    </VenueContext.Provider>
  );
};

export const useVenue = () => {
  const context = useContext(VenueContext);
  if (!context) {
    throw new Error("useVenue must be used within a VenueProvider");
  }
  return context;
};
