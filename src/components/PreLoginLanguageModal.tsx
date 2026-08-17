import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SUPPORTED_LANGUAGES, setUserLanguage, getUserLanguage } from '@/lib/i18n';

interface PreLoginLanguageModalProps {
  forceShow?: boolean;
  onLanguageSelected?: (languageCode: string) => void;
  onClose?: () => void;
}

const PreLoginLanguageModal: React.FC<PreLoginLanguageModalProps> = ({
  forceShow = false,
  onLanguageSelected,
  onClose,
}) => {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [isInitialized, setIsInitialized] = useState(false);

  // Check if user has already selected a language
  useEffect(() => {
    const checkLanguagePreference = async () => {
      try {
        const userLanguage = await getUserLanguage();
        setSelectedLanguage(userLanguage);
        
        // Only show modal if:
        // 1. forceShow is true, OR
        // 2. No language preference is saved AND it's first visit
        const hasVisitedBefore = localStorage.getItem('jv_has_visited');
        const shouldShow = forceShow || (!hasVisitedBefore && !localStorage.getItem('jv_language'));
        
        if (shouldShow) {
          setIsOpen(true);
          localStorage.setItem('jv_has_visited', 'true');
        }
      } catch (error) {
        console.error('Error checking language preference:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    checkLanguagePreference();
  }, [forceShow]);

  const handleLanguageSelect = (languageCode: string) => {
    setSelectedLanguage(languageCode);
  };

  const handleConfirm = async () => {
    try {
      await setUserLanguage(selectedLanguage as any);
      
      if (onLanguageSelected) {
        onLanguageSelected(selectedLanguage);
      }
      
      setIsOpen(false);
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error('Error setting language:', error);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
  };

  // Auto-select browser language on first open
  useEffect(() => {
    if (isOpen && !localStorage.getItem('jv_language')) {
      const browserLang = navigator.language.split('-')[0];
      const supportedLang = SUPPORTED_LANGUAGES.find(
        lang => lang.code === browserLang
      );
      if (supportedLang) {
        setSelectedLanguage(supportedLang.code);
      }
    }
  }, [isOpen]);

  // Don't render until initialized
  if (!isInitialized) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg !gap-0 !p-0 max-h-[calc(100dvh-24px)] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Globe className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t('language.select')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('language.chooseExperience')}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Language Grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2">
            {SUPPORTED_LANGUAGES.map((language) => (
              <button
                key={language.code}
                onClick={() => handleLanguageSelect(language.code)}
                className={`
                  relative p-4 rounded-[6px] border transition-all duration-200
                  hover:border-primary hover:bg-primary/5
                  ${selectedLanguage === language.code 
                    ? 'border-primary bg-primary/10 text-foreground' 
                    : 'border-border'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{language.flag}</span>
                  <div className="flex flex-col items-start text-left">
                    <span className="font-medium">{language.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {language.locale}
                    </span>
                  </div>
                </div>
                {selectedLanguage === language.code && (
                  <div className="absolute top-3 right-3 p-1 bg-primary rounded-full">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
          <div className="border-t border-border p-6 bg-card">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="text-sm text-muted-foreground">
              <p>{t('language.changeAnytime')}</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleClose}
                className="min-w-[100px]"
              >
                {t('app.cancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                className="min-w-[100px]"
              >
                {t('app.confirm')}
              </Button>
            </div>
          </div>
          
          {/* Auto-detect option */}
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const browserLang = navigator.language.split('-')[0];
                const supportedLang = SUPPORTED_LANGUAGES.find(
                  lang => lang.code === browserLang
                );
                if (supportedLang) {
                  handleLanguageSelect(supportedLang.code);
                }
              }}
              className="w-full text-sm"
            >
              {t('language.autoDetect')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreLoginLanguageModal;
