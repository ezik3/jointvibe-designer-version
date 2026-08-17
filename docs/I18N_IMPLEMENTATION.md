# Internationalization (i18n) System Implementation

## Overview
Complete multi-language support system for Joint Vibe app. Supports 12+ languages with user preference persistence, AI integration, and runtime switching.

## Architecture

### 1. Database Layer
- **Table:** `profiles`
- **Column:** `language` (TEXT, NOT NULL, DEFAULT 'en')
- **Index:** `idx_profiles_language` for faster queries
- **Migration:** `20260415043900_add_language_to_profiles.sql`

### 2. i18n Library Layer
- **i18next** - Core translation library
- **react-i18next** - React integration
- **i18next-browser-languagedetector** - Auto-detect browser language
- **i18next-http-backend** - Lazy loading of translation files

### 3. Translation Files Structure
```
public/locales/
├── en/
│   ├── common.json     # App-wide strings (buttons, labels, etc.)
│   ├── auth.json       # Authentication flows
│   ├── wallet.json     # Wallet & payments
│   ├── feed.json       # Feed & discovery
│   ├── venue.json      # Venue management
│   └── ai.json         # AI assistant
├── es/
│   └── ... (same structure)
└── ... (other languages)
```

### 4. Supported Languages (12)
- 🇺🇸 English (`en`) - Default
- 🇪🇸 Spanish (`es`)
- 🇫🇷 French (`fr`)
- 🇩🇪 German (`de`)
- 🇯🇵 Japanese (`ja`)
- 🇰🇷 Korean (`ko`)
- 🇨🇳 Chinese (`zh`)
- 🇧🇷 Portuguese (`pt`)
- 🇮🇹 Italian (`it`)
- 🇷🇺 Russian (`ru`)
- 🇸🇦 Arabic (`ar`)
- 🇮🇳 Hindi (`hi`)

## Implementation Status

### ✅ COMPLETED
1. **Database Migration**
   - Added `language` column to `profiles` table
   - Created index for performance
   - Updated TypeScript types

2. **i18n Configuration**
   - Installed and configured i18next libraries
   - Setup lazy loading with HTTP backend
   - Configured language detection (localStorage → browser → 'en')

3. **Core Components**
   - `LanguageSelector` - Dropdown/modal for language selection
   - `PreLoginLanguageModal` - Language selection before signup
   - `useUserLanguage` hook - Database integration

4. **Integration Points**
   - App.tsx wrapped with `I18nextProvider`
   - AuthPage includes language selector
   - Auto-detection on first visit

5. **Base Translations**
   - English translations for `common`, `auth`, and `wallet` namespaces
   - Structured JSON files with proper namespacing

### 🚧 IN PROGRESS
1. **UI Refactoring**
   - Replace hardcoded strings with `t()` calls
   - Start with auth flow, then core user flows

2. **AI Integration**
   - Pass `user.language` to AI API calls
   - Ensure AI responses match UI language

3. **Testing**
   - Language switching during runtime
   - Fallback behavior
   - Performance with lazy loading

### 📋 PENDING
1. **Additional Translation Files**
   - Complete English translations for all namespaces
   - Spanish translations (priority for Latin America)
   - Japanese translations (priority for Tier A market)

2. **Advanced Features**
   - RTL support for Arabic
   - Date/number formatting per locale
   - Currency formatting updates

3. **Venue Content Translation**
   - AI-powered menu translation
   - User-generated content localization

## Usage Guide

### For Developers

#### 1. Using Translations in Components
```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common'); // Specify namespace
  
  return (
    <div>
      <h1>{t('app.name')}</h1>
      <button>{t('actions.submit')}</button>
    </div>
  );
}
```

#### 2. Changing Language Programmatically
```typescript
import { useUserLanguage } from '@/hooks/useUserLanguage';

function LanguageSwitcher() {
  const { updateUserLanguage } = useUserLanguage();
  
  const handleChange = async (languageCode: string) => {
    await updateUserLanguage(languageCode);
  };
  
  return <button onClick={() => handleChange('es')}>Switch to Spanish</button>;
}
```

#### 3. Adding New Translation Keys
1. Add key to English JSON file:
   ```json
   // public/locales/en/common.json
   {
     "new_feature": {
       "title": "New Feature",
       "description": "This is a new feature description"
     }
   }
   ```

2. Use in component:
   ```typescript
   const { t } = useTranslation('common');
   t('new_feature.title');
   ```

### For Translators

#### 1. Adding a New Language
1. Create language directory:
   ```bash
   mkdir -p public/locales/es
   ```

2. Copy English files as template:
   ```bash
   cp public/locales/en/*.json public/locales/es/
   ```

3. Translate all values in JSON files
4. Add to `SUPPORTED_LANGUAGES` in `src/lib/i18n.ts`

#### 2. Translation Guidelines
- Keep placeholders: `{{variable}}` format
- Maintain HTML tags if present
- Respect line breaks and formatting
- Test with actual UI components

## Performance Considerations

### 1. Bundle Size
- **Lazy loading:** Only load language bundles when needed
- **Namespace splitting:** Load only required namespaces
- **Tree shaking:** Unused translations removed in production

### 2. Runtime Performance
- **Caching:** Translations cached in localStorage
- **Memoization:** React components memoized where possible
- **Efficient updates:** Only re-render components affected by language change

### 3. Database Performance
- **Indexed column:** `language` field has index
- **Efficient queries:** Single column updates
- **Batch operations:** Update language during profile updates

## Testing Checklist

### ✅ Basic Functionality
- [ ] Language selector shows correct current language
- [ ] Language change updates UI instantly
- [ ] Preference persists across page reloads
- [ ] Browser language auto-detection works
- [ ] Fallback to English when translation missing

### 🔄 User Flows
- [ ] Pre-login language selection
- [ ] Language saved during signup
- [ ] Language change in settings
- [ ] Language persists after logout/login

### 🌐 Integration Tests
- [ ] AI assistant uses correct language
- [ ] Currency formatting matches locale
- [ ] Date/time formatting matches locale
- [ ] RTL layout for Arabic (pending)

### 🚀 Performance Tests
- [ ] Initial bundle size acceptable
- [ ] Language switch < 100ms
- [ ] Memory usage stable
- [ ] No memory leaks

## Deployment Checklist

### Pre-Deployment
1. [ ] Run database migration
2. [ ] Test with existing user data
3. [ ] Verify all English translations exist
4. [ ] Test fallback behavior
5. [ ] Monitor bundle size increase

### Post-Deployment
1. [ ] Monitor error logs for missing translations
2. [ ] Track language adoption metrics
3. [ ] Collect user feedback on translations
4. [ ] Plan additional language rollouts

## Future Enhancements

### Phase 2 (Next 30 days)
1. Complete UI refactoring for all components
2. Add Spanish translations
3. AI integration for dynamic content
4. User preference analytics

### Phase 3 (Next 60 days)
1. Add 5 more languages (priority markets)
2. RTL support complete
3. Venue content translation system
4. Advanced locale formatting

### Phase 4 (Next 90 days)
1. Machine translation API integration
2. Community translation system
3. Real-time translation updates
4. Advanced personalization

## Troubleshooting

### Common Issues

#### 1. Translation not showing
- Check namespace matches `useTranslation('namespace')`
- Verify key exists in JSON file
- Check language bundle loaded (network tab)

#### 2. Language not persisting
- Check localStorage for `jv_language`
- Verify database update succeeded
- Check user authentication state

#### 3. Performance issues
- Verify lazy loading enabled
- Check for duplicate translation keys
- Monitor bundle size

#### 4. Missing translations
- Development: Shows warning in console
- Production: Falls back to English
- Add missing keys to translation files

## Support Contacts
- **Technical Issues:** Development Team
- **Translation Updates:** Content Team  
- **User Feedback:** Product Team
- **Database Issues:** DevOps Team

---

**Last Updated:** 2026-04-15  
**Version:** 1.0.0  
**Status:** Phase 1 Complete - Ready for UI Refactoring