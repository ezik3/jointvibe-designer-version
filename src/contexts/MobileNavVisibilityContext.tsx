import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from 'react-i18next';

interface MobileNavVisibilityContextType {
  mobileNavsVisible: boolean;
  setMobileNavsVisible: (visible: boolean) => void;
}

const MobileNavVisibilityContext = createContext<MobileNavVisibilityContextType>({
  mobileNavsVisible: true,
  setMobileNavsVisible: () => {},
});

export function MobileNavVisibilityProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  const [mobileNavsVisible, setMobileNavsVisible] = useState(true);
  return (
    <MobileNavVisibilityContext.Provider value={{ mobileNavsVisible, setMobileNavsVisible }}>
      {children}
    </MobileNavVisibilityContext.Provider>
  );
}

export function useMobileNavVisibility() {
  return useContext(MobileNavVisibilityContext);
}
