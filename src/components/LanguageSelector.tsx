import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Globe, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { SUPPORTED_LANGUAGES, setUserLanguage } from '@/lib/i18n';
import { useUserLanguage } from '@/hooks/useUserLanguage';

interface LanguageSelectorProps {
  variant?: 'dropdown' | 'modal';
  trigger?: React.ReactNode;
  onLanguageChange?: (languageCode: string) => void;
  showLabel?: boolean;
  align?: 'start' | 'center' | 'end';
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = 'dropdown',
  trigger,
  onLanguageChange,
  showLabel = true,
  align = 'end',
}) => {
  const { t, i18n } = useTranslation('common');
  const { updateUserLanguage } = useUserLanguage();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Update current language when i18n language changes
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setCurrentLanguage(lng);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);

  const handleLanguageSelect = async (languageCode: string) => {
    try {
      await updateUserLanguage(languageCode as any);
      setCurrentLanguage(languageCode);
      
      if (onLanguageChange) {
        onLanguageChange(languageCode);
      }

      if (variant === 'modal') {
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error('Error changing language:', error);
    }
  };

  const getCurrentLanguage = () => {
    return SUPPORTED_LANGUAGES.find(lang => lang.code === currentLanguage) || 
           SUPPORTED_LANGUAGES.find(lang => lang.code === 'en')!;
  };

  // Custom trigger button
  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <Globe className="h-4 w-4" />
      {showLabel && (
        <>
          <span className="hidden sm:inline">
            {getCurrentLanguage().name}
          </span>
          <ChevronDown className="h-4 w-4" />
        </>
      )}
    </Button>
  );

  // Dropdown variant
  if (variant === 'dropdown') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger || defaultTrigger}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {t('language.select')}
          </div>
          {SUPPORTED_LANGUAGES.map((language) => (
            <DropdownMenuItem
              key={language.code}
              onClick={() => handleLanguageSelect(language.code)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{language.flag}</span>
                <span>{language.name}</span>
              </div>
              {currentLanguage === language.code && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Modal variant (for pre-login)
  return (
    <>
      {trigger || (
        <Button 
          variant="outline" 
          onClick={() => setIsModalOpen(true)}
          className="gap-2"
        >
          <Globe className="h-4 w-4" />
          {showLabel && getCurrentLanguage().name}
        </Button>
      )}
      
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('language.select')}</DialogTitle>
            <DialogDescription>
              {t('language.chooseExperience')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-4">
            {SUPPORTED_LANGUAGES.map((language) => (
              <Button
                key={language.code}
                variant={currentLanguage === language.code ? "default" : "outline"}
                onClick={() => handleLanguageSelect(language.code)}
                className="justify-start h-auto py-3 px-4"
              >
                <div className="flex items-center gap-3 w-full">
                  <span className="text-xl">{language.flag}</span>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{language.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {language.locale}
                    </span>
                  </div>
                  {currentLanguage === language.code && (
                    <Check className="h-4 w-4 ml-auto" />
                  )}
                </div>
              </Button>
            ))}
          </div>
          
          <DialogFooter>
            <Button 
              onClick={() => setIsModalOpen(false)}
              variant="outline"
            >
              {t('app.close')}
            </Button>
            <Button 
              onClick={() => {
                setIsModalOpen(false);
                // Auto-detect browser language
                const browserLang = navigator.language.split('-')[0];
                const supportedLang = SUPPORTED_LANGUAGES.find(
                  lang => lang.code === browserLang
                );
                if (supportedLang) {
                  handleLanguageSelect(supportedLang.code);
                }
              }}
            >
              {t('language.auto')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LanguageSelector;
