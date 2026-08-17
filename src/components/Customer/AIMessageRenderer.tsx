import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, UtensilsCrossed, Navigation, ShoppingCart, Check } from "lucide-react";
import MenuItemPreviewModal, { MenuItemPreview } from "./MenuItemPreviewModal";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';

interface VenueData {
  id: string;
  name: string;
  venue_type?: string;
  address?: string;
  distance_km?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface MenuItemData {
  id: string;
  name: string;
  description?: string;
  category?: string;
  base_price: number;
  image_url?: string;
  venue_id: string;
  venue_name?: string;
}

interface OrderData {
  items: { menu_item_id: string; name: string; quantity: number; modifiers: string[]; price: number }[];
  type: string;
  notes: string;
}

interface AIMessageRendererProps {
  content: string;
  role: 'user' | 'assistant';
  onVenueClick?: (venueId: string) => void;
  venueId?: string;
}

// Parse venue data from AI response
function parseVenueData(content: string): { cleanContent: string; venues: VenueData[] } {
  const venueDataMatch = content.match(/\[VENUE_DATA\]([\s\S]*?)\[\/VENUE_DATA\]/);
  let venues: VenueData[] = [];
  let cleanContent = content;
  
  if (venueDataMatch) {
    try {
      venues = JSON.parse(venueDataMatch[1]);
      cleanContent = content.replace(/\[VENUE_DATA\][\s\S]*?\[\/VENUE_DATA\]/g, '').trim();
    } catch (e) {
      console.error('Failed to parse venue data:', e);
    }
  }
  
  // Also clean up [VENUE_ID:xxx] markers and make venue names clickable
  cleanContent = cleanContent.replace(/\[VENUE_ID:[^\]]+\]/g, '');
  
  // Clean up emotion tags
  cleanContent = cleanContent.replace(/\[EMO=\w+\]/g, '').trim();
  
  return { cleanContent, venues };
}

// Parse menu item data from AI response
function parseMenuItemData(content: string): { cleanContent: string; menuItems: MenuItemData[] } {
  const menuDataMatch = content.match(/\[MENU_DATA\]([\s\S]*?)\[\/MENU_DATA\]/);
  let menuItems: MenuItemData[] = [];
  let cleanContent = content;
  
  if (menuDataMatch) {
    try {
      menuItems = JSON.parse(menuDataMatch[1]);
      cleanContent = content.replace(/\[MENU_DATA\][\s\S]*?\[\/MENU_DATA\]/g, '').trim();
    } catch (e) {
      console.error('Failed to parse menu data:', e);
    }
  }
  
  return { cleanContent, menuItems };
}

// Parse order data from AI response (```order ... ``` blocks)
function parseOrderData(content: string): { cleanContent: string; order: OrderData | null } {
  const orderMatch = content.match(/```order\n([\s\S]*?)\n```/);
  let order: OrderData | null = null;
  let cleanContent = content;
  
  if (orderMatch) {
    try {
      order = JSON.parse(orderMatch[1]);
      cleanContent = content.replace(/```order\n[\s\S]*?\n```/g, '').trim();
    } catch (e) {
      console.error('Failed to parse order data:', e);
    }
  }
  
  return { cleanContent, order };
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normalize text for matching (lowercase, trim)
function normalizeForMatching(text: string): string {
  return text.toLowerCase().trim();
}

function venuesMentionedInText(text: string, venues: VenueData[]): VenueData[] {
  const t = (text || "").trim();
  if (!t) return [];
  return venues.filter((v) => {
    const name = (v.name || "").trim();
    if (!name) return false;
    // Prefer exact-ish word boundary matching to avoid partial matches.
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "i");
    return re.test(t);
  });
}

// Replace venue and menu item names in content with interactive spans
function renderContentWithLinks(
  content: string, 
  venues: VenueData[],
  menuItems: MenuItemData[],
  onVenueClick: (venueId: string) => void,
  onMenuItemClick: (item: MenuItemData) => void,
  onDistanceClick: (venue: VenueData) => void
): React.ReactNode[] {
  if (venues.length === 0 && menuItems.length === 0) {
    // Still process markdown bold and distance patterns
    return processMarkdownAndDistances(content, [], onDistanceClick);
  }
  
  let processedContent = content;
  
  // Build lookup maps for case-insensitive matching
  const venueNameMap: Map<string, VenueData> = new Map();
  const menuNameMap: Map<string, MenuItemData> = new Map();
  
  // Sort by name length (longest first) to avoid partial matches
  const sortedVenues = [...venues].sort((a, b) => b.name.length - a.name.length);
  const sortedMenuItems = [...menuItems].sort((a, b) => b.name.length - a.name.length);
  
  for (const venue of sortedVenues) {
    venueNameMap.set(normalizeForMatching(venue.name), venue);
  }
  
  for (const item of sortedMenuItems) {
    menuNameMap.set(normalizeForMatching(item.name), item);
  }
  
  // Replace menu item names with markers first (case-insensitive)
  for (const item of sortedMenuItems) {
    const escapedName = escapeRegex(item.name);
    // Match with or without ** around it, case-insensitive
    const regex = new RegExp(`\\*\\*${escapedName}\\*\\*|${escapedName}`, 'gi');
    processedContent = processedContent.replace(regex, `[[MENU:${item.id}:${item.name}]]`);
  }
  
  // Replace venue names with markers (case-insensitive)
  for (const venue of sortedVenues) {
    const escapedName = escapeRegex(venue.name);
    const regex = new RegExp(`\\*\\*${escapedName}\\*\\*|${escapedName}`, 'gi');
    processedContent = processedContent.replace(regex, `[[VENUE:${venue.id}:${venue.name}]]`);
  }
  
  // Now replace distance patterns like (0.3km away) or (0.3km) with markers
  // We need to associate them with the most recently mentioned venue
  processedContent = processedContent.replace(
    /\((\d+\.?\d*)km(?:\s+away)?\)/gi,
    (match, distance) => `[[DISTANCE:${distance}:${match}]]`
  );
  
  const parts: React.ReactNode[] = [];
  let key = 0;
  
  // Split by markers and render
  const markerRegex = /\[\[(VENUE|MENU|DISTANCE):([^:]+):([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;
  let lastMentionedVenue: VenueData | null = null;
  
  while ((match = markerRegex.exec(processedContent)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const textBefore = processedContent.slice(lastIndex, match.index);
      parts.push(...processMarkdown(textBefore, key));
      key += 10;
    }
    
    const [, type, id, display] = match;
    
    if (type === 'VENUE') {
      const venueInfo = venues.find(v => v.id === id);
      if (venueInfo) {
        lastMentionedVenue = venueInfo;
      }
      parts.push(
        <button
          key={key++}
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onVenueClick(id)}
          className="inline-flex items-center gap-1 text-cyan hover:text-cyan/80 font-semibold underline underline-offset-2 transition-colors"
        >
          {display}
        </button>
      );
    } else if (type === 'MENU') {
      const menuItem = menuItems.find(m => m.id === id);
      if (menuItem) {
        parts.push(
          <button
            key={key++}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onMenuItemClick(menuItem)}
            className="inline-flex items-center gap-1 text-cyan hover:text-cyan/80 font-semibold underline underline-offset-2 transition-colors"
          >
            {display}
            {menuItem.base_price !== undefined && (
              <span className="text-xs opacity-80">(${menuItem.base_price})</span>
            )}
          </button>
        );
      } else {
        parts.push(<span key={key++}>{display}</span>);
      }
    } else if (type === 'DISTANCE') {
      // Distance marker - make it clickable if we have a venue with coordinates
      const venueWithCoords = lastMentionedVenue && lastMentionedVenue.latitude && lastMentionedVenue.longitude
        ? lastMentionedVenue
        : venues.find(v => v.latitude && v.longitude);
      
      if (venueWithCoords && venueWithCoords.latitude && venueWithCoords.longitude) {
        parts.push(
          <button
            key={key++}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDistanceClick(venueWithCoords)}
            className="inline-flex items-center gap-0.5 text-cyan hover:text-cyan/80 font-semibold underline underline-offset-2 transition-colors"
          >
            {display}
          </button>
        );
      } else {
        // No coordinates available, just render as text
        parts.push(<span key={key++} className="text-cyan/70">{display}</span>);
      }
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < processedContent.length) {
    parts.push(...processMarkdown(processedContent.slice(lastIndex), key));
  }
  
  return parts;
}

// Process markdown and distance patterns when no venue/menu data
function processMarkdownAndDistances(
  text: string, 
  venues: VenueData[],
  onDistanceClick: (venue: VenueData) => void,
  startKey: number = 0
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let key = startKey;
  
  // First handle distance patterns
  const distanceRegex = /\((\d+\.?\d*)km(?:\s+away)?\)/gi;
  let lastIndex = 0;
  let match;
  
  while ((match = distanceRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      parts.push(...processMarkdown(textBefore, key));
      key += 10;
    }
    
    const venueWithCoords = venues.find(v => v.latitude && v.longitude);
    if (venueWithCoords) {
      parts.push(
        <button
          key={key++}
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDistanceClick(venueWithCoords)}
          className="inline-flex items-center gap-0.5 text-cyan hover:text-cyan/80 font-semibold underline underline-offset-2 transition-colors"
        >
          {match[0]}
        </button>
      );
    } else {
      parts.push(<span key={key++} className="text-cyan/70">{match[0]}</span>);
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(...processMarkdown(text.slice(lastIndex), key));
  } else if (lastIndex === 0) {
    // No distance patterns found, just process markdown
    return processMarkdown(text, startKey);
  }
  
  return parts;
}

function processMarkdown(text: string, startKey: number = 0): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let key = startKey;
  
  // Convert markdown bold to spans
  const boldParts = text.split(/\*\*([^*]+)\*\*/);
  boldParts.forEach((part, j) => {
    if (j % 2 === 1) {
      parts.push(<strong key={key++}>{part}</strong>);
    } else if (part) {
      parts.push(<span key={key++}>{part}</span>);
    }
  });
  
  return parts;
}

export default function AIMessageRenderer({ content, role, onVenueClick, venueId }: AIMessageRendererProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItemPreview | null>(null);
  const [orderValidating, setOrderValidating] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  
  const handleVenueClick = useCallback((vid: string) => {
    if (onVenueClick) {
      onVenueClick(vid);
    } else {
      navigate(`/app/venue/${vid}`);
    }
  }, [navigate, onVenueClick]);

  const handleMenuItemClick = useCallback((item: MenuItemData) => {
    setSelectedMenuItem({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      base_price: item.base_price,
      image_url: item.image_url,
      venue_id: item.venue_id,
      venue_name: item.venue_name,
    });
  }, []);

  const handleDistanceClick = useCallback((venue: VenueData) => {
    if (venue.latitude && venue.longitude) {
      navigate(`/app/maps?destLat=${venue.latitude}&destLng=${venue.longitude}&destName=${encodeURIComponent(venue.name)}`);
    }
  }, [navigate]);

  const handleConfirmOrder = async (order: OrderData) => {
    if (!venueId || orderValidating || orderConfirmed) return;
    setOrderValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-ai-order', {
        body: { venue_id: venueId, items: order.items, type: order.type, notes: order.notes }
      });
      if (error) throw error;
      if (data?.valid) {
        setOrderConfirmed(true);
        toast({ title: "Order Confirmed!", description: `Total: $${data.verified_total.toFixed(2)}` });
      } else {
        toast({ title: "Order Issue", description: data?.errors?.join(', ') || "Validation failed", variant: "destructive" });
      }
    } catch (e) {
      console.error("Order validation error:", e);
      toast({ title: "Error", description: "Failed to validate order", variant: "destructive" });
    } finally {
      setOrderValidating(false);
    }
  };

  const parsed = useMemo(() => {
    if (role === 'user') {
      return { cleanContent: content, venues: [] as VenueData[], menuItems: [] as MenuItemData[], order: null as OrderData | null };
    }
    const { cleanContent: afterVenueParse, venues } = parseVenueData(content);
    const { cleanContent: afterMenuParse, menuItems } = parseMenuItemData(afterVenueParse);
    const { cleanContent, order } = parseOrderData(afterMenuParse);
    return { cleanContent, venues, menuItems, order };
  }, [content, role]);

  const venuesForChips = useMemo(
    () => (role === 'assistant' ? venuesMentionedInText(parsed.cleanContent, parsed.venues) : []),
    [parsed.cleanContent, parsed.venues, role]
  );

  const renderedContent = useMemo(() =>
    role === 'assistant'
      ? renderContentWithLinks(
          parsed.cleanContent,
          parsed.venues,
          parsed.menuItems,
          handleVenueClick,
          handleMenuItemClick,
          handleDistanceClick
        )
      : null,
  [role, parsed.cleanContent, parsed.venues, parsed.menuItems, handleVenueClick, handleMenuItemClick, handleDistanceClick]);

  if (role === 'user') {
    return <p className="text-sm leading-relaxed">{content}</p>;
  }
  
  return (
    <>
      <div className="text-sm leading-relaxed">
        {renderedContent}

        {/* Order confirmation card */}
        {parsed.order && parsed.order.items.length > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Order Summary</span>
            </div>
            <div className="space-y-1 mb-3">
              {parsed.order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{item.quantity}x {item.name}</span>
                  <span className="text-muted-foreground">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-semibold pt-1 border-t border-border/50">
                <span>Total</span>
                <span>${parsed.order.items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}</span>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={orderValidating || orderConfirmed}
              onClick={() => handleConfirmOrder(parsed.order!)}
              className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                orderConfirmed
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {orderConfirmed ? (
                <span className="flex items-center justify-center gap-1"><Check className="h-3 w-3" /> Order Sent</span>
              ) : orderValidating ? 'Validating...' : 'Confirm Order'}
            </motion.button>
          </div>
        )}
        
        {/* Menu item chips */}
        {parsed.menuItems.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
            {parsed.menuItems.map((item) => (
              <motion.button
                key={item.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => handleMenuItemClick(item)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan/20 hover:bg-cyan/30 text-cyan rounded-full text-xs font-medium transition-colors"
              >
                <UtensilsCrossed className="h-3 w-3" />
                <span>{item.name}</span>
                <span className="opacity-70">• ${item.base_price}</span>
              </motion.button>
            ))}
          </div>
        )}
        
        {/* Venue chips */}
        {venuesForChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
            {venuesForChips.map((venue) => (
              <motion.button
                key={venue.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => handleVenueClick(venue.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan/20 hover:bg-cyan/30 text-cyan rounded-full text-xs font-medium transition-colors"
              >
                <MapPin className="h-3 w-3" />
                <span>{venue.name}</span>
                {venue.distance_km !== null && venue.distance_km !== undefined && (
                  <>
                    <span className="opacity-70">• {venue.distance_km}km</span>
                    {venue.latitude && venue.longitude && (
                      <Navigation 
                        className="h-3 w-3 ml-1 opacity-70 hover:opacity-100" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDistanceClick(venue);
                        }}
                      />
                    )}
                  </>
                )}
              </motion.button>
            ))}
          </div>
        )}
      </div>
      
      <MenuItemPreviewModal
        item={selectedMenuItem}
        isOpen={!!selectedMenuItem}
        onClose={() => setSelectedMenuItem(null)}
      />
    </>
  );
}
