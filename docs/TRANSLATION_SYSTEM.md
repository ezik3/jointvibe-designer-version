# Universal Content Translation System

## Overview

The Universal Content Translation System allows users to see ALL user-generated content (posts, messages, venues) in their preferred language automatically. The system detects language on creation, stores translations, and serves content in the user's language with intelligent fallbacks.

## Architecture

### Components

1. **Database Layer** - Extended schemas for language detection and translation storage
2. **Translation Service** - Core service handling translation requests with caching
3. **Content Hooks** - React hooks for integrating translation into components
4. **AI Integration** - Special handling for AI-assisted conversations
5. **Cache System** - Multi-layer caching for performance

### Database Schema Changes

#### Posts Table (`posts`)
- `content_language` (TEXT) - Detected language of original content
- `translations` (JSONB) - Stored translations: `{"en": "...", "es": "..."}`
- `translation_updated_at` (TIMESTAMP) - Last translation update

#### Messages Tables (`live_chat_messages`, `order_messages`)
- `content_language` (TEXT) - Detected language
- `translation_cache` (JSONB) - Cached translations for recent messages
- `translation_cached_at` (TIMESTAMP) - Cache timestamp

#### Translation Service Tables
- `translation_service_config` - Service configurations and API keys
- `translation_cache` - Global translation cache with deduplication
- `translation_request_log` - Monitoring and analytics

## Implementation

### 1. Language Detection

**On Content Creation:**
```typescript
// Auto-detected on insert via database trigger
content_language = detectLanguage(content);
```

**Detection Logic:**
- Simple keyword matching for major languages
- Falls back to English
- Can be enhanced with proper language detection library

### 2. Translation System

**On Content Creation:**
```typescript
// Translate to priority languages
const translations = await translationService.getTranslationsForContent(
  content,
  sourceLanguage,
  ['en', 'es'], // Priority languages
  contentType
);

// Store in database
await updateContentTranslations(contentId, contentType, translations, sourceLanguage);
```

**Priority Languages:**
1. English (global fallback)
2. Spanish (major global language)
3. User's preferred language (if different)

### 3. Feed Rendering

**When Displaying Content:**
```typescript
// Check user.language preference
const userLanguage = await getUserLanguage(userId);

// Get appropriate translation
const displayText = translations[userLanguage] 
  || translations['en'] 
  || originalText;
```

**Component Usage:**
```jsx
<TranslatedContent
  contentId={post.id}
  originalText={post.content}
  contentType="post"
  autoTranslate={true}
/>
```

### 4. Message/Chat System

**Real-time Translation:**
- Messages translated on-demand
- Recent translations cached (1-hour TTL)
- No permanent storage of all translations

```typescript
// Translate message in real-time
const translated = await translationService.translate({
  text: message,
  targetLanguage: userLanguage,
  contentType: 'message'
});
```

### 5. AI Integration

**AI Assistant:**
- Always aware of user's language preference
- Understands input in any language
- Responds in user's preferred language

```typescript
// Process user message for AI
const { forAI } = await processUserMessage(userMessage);

// Get AI response
const aiResponse = await getAIResponse(forAI);

// Translate response for user
const { forUser } = await processAIResponse(aiResponse);
```

### 6. Optimization

**Caching Strategy:**
1. **Memory Cache** - LRU cache for rapid access (1,000 entries)
2. **Database Cache** - Persistent cache with deduplication
3. **Content Cache** - Translations stored with content

**Deduplication:**
- Same text + language pair = same translation
- Hash-based lookup for efficiency

**Rate Limiting:**
- Configurable per service
- Batch processing for efficiency

## Usage

### For Developers

#### Basic Translation
```typescript
import { translationService } from '../../shared/translationService';

const response = await translationService.translate({
  text: "Hello world",
  targetLanguage: "es",
  contentType: "post"
});
```

#### React Component
```jsx
import { TranslatedContent } from '../../components/Content/TranslatedContent';

<TranslatedContent
  contentId={post.id}
  originalText={post.content}
  contentType="post"
  showLanguageBadge={true}
  autoTranslate={true}
/>
```

#### React Hook
```typescript
import { useContentTranslation } from '../../hooks/useContentTranslation';

const { translation, isLoading } = useContentTranslation(
  post.id,
  post.content,
  'post',
  { autoTranslate: true }
);
```

### For Content Creators

#### Automatic Translation
- Content automatically translated on creation
- No action required from users
- Translations improve over time with caching

#### Manual Override
Users can:
1. View original text
2. Request specific language translation
3. Disable auto-translation per content

## Configuration

### Environment Variables
See `.env.translation.example` for complete configuration.

**Essential Settings:**
```bash
NEXT_PUBLIC_ENABLE_TRANSLATION=true
NEXT_PUBLIC_AUTO_TRANSLATE_POSTS=true
NEXT_PUBLIC_TRANSLATION_CACHE_ENABLED=true
NEXT_PUBLIC_SUPPORTED_LANGUAGES=en,es,fr,de,ja,ko,zh
```

### Service Configuration
Configure translation services in `translation_service_config` table:

```sql
INSERT INTO translation_service_config (service_name, priority, enabled) VALUES
  ('google_translate', 1, true),
  ('deepl', 2, true),
  ('fallback_basic', 3, true);
```

## Monitoring

### Database Views
```sql
-- Translation cache hit rate
SELECT 
  COUNT(*) as total_requests,
  SUM(CASE WHEN from_cache THEN 1 ELSE 0 END) as cache_hits,
  ROUND(SUM(CASE WHEN from_cache THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as hit_rate
FROM translation_request_log;

-- Language distribution
SELECT 
  target_language,
  COUNT(*) as request_count,
  AVG(response_time_ms) as avg_response_time
FROM translation_request_log
GROUP BY target_language
ORDER BY request_count DESC;
```

### Performance Metrics
- Response time per service
- Cache hit rate
- Error rate by language pair
- Cost per translation

## Safety & Compliance

### Data Privacy
- User content not sent to third parties without consent
- Translation logs anonymized
- Configurable data retention

### Fallback Behavior
1. Try cached translation
2. Try translation service
3. Fallback to English
4. Fallback to original text

### Error Handling
- Graceful degradation
- User notified of translation issues
- Automatic retry for transient failures

## Migration

### Step 1: Run Database Migrations
```bash
# Apply translation schema changes
supabase db reset
```

### Step 2: Configure Services
1. Add API keys to environment
2. Configure service priorities
3. Set up monitoring

### Step 3: Enable Feature Flags
```typescript
// Start with limited rollout
NEXT_PUBLIC_ENABLE_TRANSLATION=true
NEXT_PUBLIC_AUTO_TRANSLATE_POSTS=false  // Manual opt-in first
```

### Step 4: Monitor & Scale
1. Monitor cache performance
2. Adjust rate limits
3. Expand language support

## Troubleshooting

### Common Issues

**1. Translations not appearing**
- Check `NEXT_PUBLIC_ENABLE_TRANSLATION`
- Verify database migrations applied
- Check translation service configuration

**2. Slow translation performance**
- Enable caching
- Reduce batch size
- Check service rate limits

**3. Incorrect translations**
- Verify language detection
- Check translation service quality
- Review cached translations

### Debug Mode
```bash
NEXT_PUBLIC_DEBUG_TRANSLATION=true
NEXT_PUBLIC_SHOW_TRANSLATION_INFO=true
```

## Future Enhancements

### Planned Features
1. **User feedback** - Report translation issues
2. **Quality scoring** - AI-based translation quality assessment
3. **Offline translation** - Client-side translation for privacy
4. **Custom dictionaries** - Venue-specific terminology
5. **Voice translation** - Real-time speech translation

### Scalability
- Sharded translation cache
- CDN for static translations
- Edge computing for real-time translation

## Support

### Getting Help
1. Check debug logs
2. Review translation request logs
3. Monitor service status
4. Contact development team

### Reporting Issues
Include:
- Content ID
- Source and target languages
- Expected vs actual translation
- Timestamp

---

**Status:** Production Ready  
**Last Updated:** 2026-04-15  
**Version:** 1.0.0