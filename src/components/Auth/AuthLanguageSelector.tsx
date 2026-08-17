import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2 } from 'lucide-react';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/lib/i18n';
import { useUserLanguage } from '@/hooks/useUserLanguage';

const languageCountryCodes: Record<LanguageCode, string> = {
  en: 'US',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  nl: 'NL',
  pt: 'BR',
  ru: 'RU',
  ja: 'JP',
  ko: 'KR',
  zh: 'CN',
  'zh-TW': 'TW',
  th: 'TH',
  vi: 'VN',
  id: 'ID',
  tl: 'PH',
  hi: 'IN',
  ar: 'SA',
  tr: 'TR',
  sv: 'SE',
};

export function AuthLanguageSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { language, updateUserLanguage } = useUserLanguage();
  const currentLanguage = SUPPORTED_LANGUAGES.find((option) => option.code === language) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (pickerRef.current && event.target instanceof Node && !pickerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('click', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const selectLanguage = async (languageCode: LanguageCode) => {
    await updateUserLanguage(languageCode);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="jv-auth-language-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
        className="jv-auth-language-trigger"
        type="button"
        aria-expanded={isOpen}
        aria-controls="jv-auth-language-menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <Globe2 aria-hidden="true" />
        <span>{currentLanguage.name}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      <div className="jv-auth-language-menu" id="jv-auth-language-menu" role="listbox" aria-label="Select language" hidden={!isOpen}>
        <p className="jv-auth-language-menu__label">Select language</p>
        {SUPPORTED_LANGUAGES.map((option) => {
          const selected = option.code === currentLanguage.code;
          return (
            <button
              key={option.code}
              className={`jv-auth-language-option${selected ? ' jv-auth-language-option--selected' : ''}`}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => void selectLanguage(option.code)}
            >
              <span>{languageCountryCodes[option.code]}</span>
              <strong>{option.name}</strong>
              <Check aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
