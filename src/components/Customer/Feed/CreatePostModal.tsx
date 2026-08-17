import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Image, Video, UserPlus, MapPin, Sparkles, Globe, Lock, Radio, Building2, PartyPopper, Type } from "lucide-react";
import { toast } from "sonner";
import TagFriendsModal from "./TagFriendsModal";
import LocationVenueModal, { type LocationData } from "./LocationVenueModal";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from 'react-i18next';
import {
  getUserCheckInPresenceAtVenue,
  upsertUserVenueIntentSignal,
  type VenuePostIntentType,
} from "@/utils/venueInterestSignals";
import {
  useMentionSuggestions,
  getActiveMentionQuery,
  replaceActiveMention,
  type MentionSuggestion,
} from "@/hooks/useMentionSuggestions";
import MentionSuggestionList from "./MentionSuggestionList";
import "./create-post-modal.css";

interface TaggedFriend {
  id: string;
  display_name: string;
  avatar_url?: string;
}

interface SharedPost {
  id: string;
  content: string;
  authorName: string;
  imageUrl?: string;
  videoUrl?: string;
}

interface VenueSuggestion {
  id: string;
  name: string;
  city?: string | null;
}

interface VenueMentionIntentData {
  venueId: string;
  venueName: string;
  mentionText: string;
  intent: VenuePostIntentType;
}

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAvatar?: string;
  userName?: string;
  initialContent?: string;
  canUseGold?: boolean;
  onGoLive?: () => void;
  sharedPost?: SharedPost;
  onSubmit: (data: {
    content: string;
    visibility: "private" | "public";
    isGold: boolean;
    isLive: boolean;
    imageUrl?: string;
    videoUrl?: string;
    venue?: string;
    taggedFriends?: TaggedFriend[];
    location?: LocationData;
    sharedPostId?: string;
    venueMentionIntent?: VenueMentionIntentData;
  }) => void;
}

const CreatePostModal = ({
  isOpen,
  onClose,
  initialContent = "",
  onGoLive,
  onSubmit,
  sharedPost,
}: CreatePostModalProps) => {
  const { t } = useTranslation('feed');
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [isGold, setIsGold] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [showTagFriends, setShowTagFriends] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [taggedFriends, setTaggedFriends] = useState<TaggedFriend[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [venues, setVenues] = useState<VenueSuggestion[]>([]);
  const [selectedVenueMention, setSelectedVenueMention] = useState<VenueMentionIntentData | null>(null);
  const [showVenueMentionSuggestions, setShowVenueMentionSuggestions] = useState(false);
  const [isSavingVenueIntent, setIsSavingVenueIntent] = useState(false);
  const [lastIntentWriteAt, setLastIntentWriteAt] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchVenues = async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("id, name, city")
        .eq("approval_status", "approved")
        .eq("venue_status", "live")
        .not("verified_at", "is", null)
        .limit(100);

      if (error) {
        console.error("Failed to fetch venues for mention selection:", error);
        return;
      }

      setVenues((data || []) as VenueSuggestion[]);
    };

    fetchVenues();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setContent(initialContent);
  }, [initialContent, isOpen]);

  useEffect(() => {
    if (!selectedVenueMention?.mentionText) return;
    if (!content.includes(selectedVenueMention.mentionText)) {
      setSelectedVenueMention(null);
      setShowVenueMentionSuggestions(false);
    }
  }, [content, selectedVenueMention]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t("composer.image_size_error"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setSelectedVideo(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(t("composer.video_size_error"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedVideo(reader.result as string);
        setSelectedImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearMedia = () => {
    setSelectedImage(null);
    setSelectedVideo(null);
  };

  const activeMentionQuery = getActiveMentionQuery(content);
  const { suggestions: mentionSuggestions } = useMentionSuggestions(activeMentionQuery, {
    enabled: isOpen,
  });

  const handleVenueMentionSelect = async (venue: VenueSuggestion) => {
    const mentionText = `@${venue.name}`;
    const nextContent = content.replace(/(?:^|\s)@[a-zA-Z0-9][a-zA-Z0-9 _-]{0,39}$/, ` ${mentionText} `);
    const trimmedNextContent = nextContent.replace(/\s{2,}/g, " ").trimStart();
    setContent(trimmedNextContent);
    setSelectedLocation({ type: "venue", name: venue.name, venueId: venue.id });
    setShowVenueMentionSuggestions(false);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData.user?.id;

      if (!authUserId) {
        setSelectedVenueMention({
          venueId: venue.id,
          venueName: venue.name,
          mentionText,
          intent: "mention_only",
        });
        return;
      }

      const checkInPresence = await getUserCheckInPresenceAtVenue(authUserId, venue.id);
      if (checkInPresence.isCheckedIn && checkInPresence.visibility === "public") {
        setSelectedVenueMention({
          venueId: venue.id,
          venueName: venue.name,
          mentionText,
          intent: "currently_at",
        });
        toast.success(t("composer.checked_in_mention"));
        return;
      }

      if (checkInPresence.isCheckedIn && checkInPresence.visibility === "private") {
        toast.info(t("composer.checked_in_private"));
      }

      setSelectedVenueMention({
        venueId: venue.id,
        venueName: venue.name,
        mentionText,
        intent: "mention_only",
      });
    } catch (error) {
      console.error("Failed to evaluate check-in status for venue mention:", error);
      setSelectedVenueMention({
        venueId: venue.id,
        venueName: venue.name,
        mentionText,
        intent: "mention_only",
      });
    }
  };

  const setVenueMentionIntent = (intent: VenuePostIntentType) => {
    if (!selectedVenueMention) return;
    if (selectedVenueMention.intent === "currently_at") return;
    setSelectedVenueMention({ ...selectedVenueMention, intent });
  };

  const hasMedia = !!(selectedImage || selectedVideo || sharedPost?.imageUrl || sharedPost?.videoUrl);
  const [mediaRequired, setMediaRequired] = useState(false);

  const handleSubmit = async () => {
    if (!hasMedia) {
      setMediaRequired(true);
      toast.error(t("composer.media_required"), {
        description: t("composer.media_required_hint", {
          defaultValue: "Tap the photo or video icon below to attach one before posting.",
        }),
      });
      return;
    }

    setIsSubmitting(true);

    if (
      selectedVenueMention &&
      (selectedVenueMention.intent === "heading_there" || selectedVenueMention.intent === "maybe_going")
    ) {
      const now = Date.now();
      if (now - lastIntentWriteAt < 2000 || isSavingVenueIntent) {
        toast.info(t("composer.cooldown_posting"));
        setIsSubmitting(false);
        return;
      }

      setIsSavingVenueIntent(true);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData.user?.id;

        if (authUserId) {
          const result = await upsertUserVenueIntentSignal({
            userId: authUserId,
            venueId: selectedVenueMention.venueId,
            signalType: selectedVenueMention.intent,
            source: "post",
          });
          if (result.status === "skipped_cooldown") {
            toast.info(t("composer.cooldown_intent"));
          }
        }
        setLastIntentWriteAt(Date.now());
      } catch (error) {
        console.error("Failed to save venue intent from post composer:", error);
        toast.error(t("composer.venue_intent_error"));
        setIsSavingVenueIntent(false);
        setIsSubmitting(false);
        return;
      } finally {
        setIsSavingVenueIntent(false);
      }
    }

    const finalLocation =
      selectedLocation ||
      (selectedVenueMention
        ? ({ type: "venue", name: selectedVenueMention.venueName, venueId: selectedVenueMention.venueId } as LocationData)
        : undefined);

    await onSubmit({
      content,
      visibility,
      isGold,
      isLive: false,
      imageUrl: selectedImage || sharedPost?.imageUrl || undefined,
      videoUrl: selectedVideo || sharedPost?.videoUrl || undefined,
      venue: selectedVenueMention?.venueId || selectedLocation?.venueId,
      taggedFriends,
      location: finalLocation,
      sharedPostId: sharedPost?.id,
      venueMentionIntent: selectedVenueMention || undefined,
    });
    setIsSubmitting(false);
    setContent("");
    setIsGold(false);
    clearMedia();
    setTaggedFriends([]);
    setSelectedLocation(null);
    setSelectedVenueMention(null);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="create-post-dialog !max-w-[514px] !gap-0 !p-0">
          {/* Header */}
          <div className="create-post-modal__header">
            <DialogTitle className="create-post-modal__title">
              {t("composer.create_post")}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="create-post-modal__close"
              aria-label="Close post composer"
              title="Close post composer"
            >
              <X />
            </button>
          </div>

          <div className="create-post-modal__body">
            {/* Privacy Toggle - Side by Side */}
            <div className="create-post-modal__visibility">
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`create-post-modal__visibility-option ${visibility === "private" ? "is-active" : ""}`}
              >
                <Lock />
                <span>{t("composer.private")}</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`create-post-modal__visibility-option ${visibility === "public" ? "is-active" : ""}`}
              >
                <Globe />
                <span>{t("composer.public")}</span>
              </button>
            </div>

            {/* Go Live Button - Close modal first, then trigger Go Live */}
            <button
              type="button"
              onClick={() => {
                onClose();
                // Small delay to ensure modal closes before Go Live opens
                setTimeout(() => {
                  onGoLive?.();
                }, 100);
              }}
              className="create-post-modal__option create-post-modal__live-option"
            >
              <span className="create-post-modal__option-icon">
                <Radio />
              </span>
              <span className="create-post-modal__option-copy">
                <strong>{t("composer.go_live")}</strong>
                <small>{t("composer.start_live_broadcast")}</small>
              </span>
              <span className="create-post-modal__option-action">
                {t("composer.start")}
              </span>
            </button>

            {/* Gold Post Option */}
            <label className={`create-post-modal__option create-post-modal__gold-option ${isGold ? "is-active" : ""}`}>
              <span className="create-post-modal__option-icon">
                <Sparkles />
              </span>
              <span className="create-post-modal__option-copy">
                <strong>{t("composer.make_gold_post")}</strong>
                <small>{t("composer.gold_post_description")}</small>
              </span>
              <input type="checkbox" checked={isGold} onChange={(event) => setIsGold(event.target.checked)} />
              <span className="create-post-modal__gold-toggle" aria-hidden="true" />
            </label>

            {/* Content Input Area */}
            <div className="create-post-modal__editor">
              <span className="create-post-modal__editor-icon" aria-hidden="true">
                <Type />
              </span>
              <Textarea
                value={content}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setContent(nextValue);
                  setShowVenueMentionSuggestions(/(?:^|\s)@[a-zA-Z0-9 _-]*$/.test(nextValue));
                }}
                placeholder={t("composer.share_vibes_placeholder")}
                className="create-post-modal__textarea"
                maxLength={500}
              />
              {showVenueMentionSuggestions && mentionSuggestions.length > 0 && (
                <MentionSuggestionList
                  className="create-post-modal__mentions"
                  suggestions={mentionSuggestions}
                  onSelect={(s: MentionSuggestion) => {
                    if (s.kind === "venue") {
                      handleVenueMentionSelect({ id: s.id, name: s.name, city: s.city });
                    } else {
                      setContent(replaceActiveMention(content, s.name));
                      setShowVenueMentionSuggestions(false);
                    }
                  }}
                />
              )}
              {selectedVenueMention && (
                <div className="create-post-modal__venue-intent">
                  <div className="create-post-modal__venue-intent-heading">
                    <Building2 />
                    <p>
                      {t("composer.venue_mention_selected")} <span>{selectedVenueMention.mentionText}</span>
                    </p>
                  </div>
                  {selectedVenueMention.intent === "currently_at" ? (
                    <div className="create-post-modal__intent-status">
                      {t("composer.currently_at_checkin")}
                    </div>
                  ) : (
                    <div className="create-post-modal__intent-actions">
                      <button
                        type="button"
                        onClick={() => setVenueMentionIntent("heading_there")}
                        className={`create-post-modal__intent-button ${selectedVenueMention.intent === "heading_there" ? "is-active" : ""}`}
                      >
                        {t("composer.heading_there")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVenueMentionIntent("maybe_going")}
                        className={`create-post-modal__intent-button ${selectedVenueMention.intent === "maybe_going" ? "is-active" : ""}`}
                      >
                        {t("composer.maybe_going")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVenueMentionIntent("mention_only")}
                        className={`create-post-modal__intent-button ${selectedVenueMention.intent === "mention_only" ? "is-active" : ""}`}
                      >
                        {t("composer.just_mentioning")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tagged Friends Display */}
            {taggedFriends.length > 0 && (
              <div className="create-post-modal__tags">
                {taggedFriends.map(friend => (
                  <div
                    key={friend.id}
                    className="create-post-modal__tag"
                  >
                    @{friend.display_name}
                    <button
                      type="button"
                      onClick={() => setTaggedFriends(taggedFriends.filter(f => f.id !== friend.id))}
                      className="create-post-modal__tag-remove"
                      aria-label={`Remove ${friend.display_name}`}
                      title={`Remove ${friend.display_name}`}
                    >
                      <X />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Location Display */}
            {selectedLocation && (
              <div className="create-post-modal__location">
                <MapPin />
                <span>{selectedLocation.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedLocation(null)}
                  className="create-post-modal__location-remove"
                  aria-label="Remove location"
                  title="Remove location"
                >
                  <X />
                </button>
              </div>
            )}

            {/* Shared Post Preview */}
            {sharedPost && (
              <div className="create-post-modal__shared-post">
                <p>{t("composer.sharing_post", { name: sharedPost.authorName })}</p>
                <div className="create-post-modal__shared-post-body">
                  {(sharedPost.imageUrl || sharedPost.videoUrl) && (
                    <div className="create-post-modal__shared-post-media">
                      {sharedPost.imageUrl ? (
                        <img src={sharedPost.imageUrl} alt="" />
                      ) : (
                        <video src={sharedPost.videoUrl} muted playsInline />
                      )}
                    </div>
                  )}
                  <p className="create-post-modal__shared-post-copy">{sharedPost.content}</p>
                </div>
              </div>
            )}

            {/* Media Preview */}
            {(selectedImage || selectedVideo) && (
              <div className="create-post-modal__media-preview">
                {selectedImage && (
                  <img 
                    src={selectedImage} 
                    alt="Selected" 
                    className="create-post-modal__media" 
                  />
                )}
                {selectedVideo && (
                  <video 
                    src={selectedVideo} 
                    className="create-post-modal__media" 
                    controls 
                  />
                )}
                <button
                  type="button"
                  onClick={clearMedia}
                  className="create-post-modal__media-remove"
                  aria-label="Remove media"
                  title="Remove media"
                >
                  <X />
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className={`create-post-modal__tools ${mediaRequired && !hasMedia ? 'is-required' : ''}`}>
              <input
                type="file"
                ref={imageInputRef}
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <input
                type="file"
                ref={videoInputRef}
                accept="video/*"
                onChange={handleVideoSelect}
                className="hidden"
              />
              
              {/* Photo */}
              <button
                type="button"
                onClick={() => { imageInputRef.current?.click(); setMediaRequired(false); }}
                className={`create-post-modal__tool ${mediaRequired && !hasMedia ? 'is-required' : ''}`}
                aria-label="Add photo"
                title="Add photo"
              >
                <Image />
              </button>
              
              {/* Video */}
              <button
                type="button"
                onClick={() => { videoInputRef.current?.click(); setMediaRequired(false); }}
                className={`create-post-modal__tool ${mediaRequired && !hasMedia ? 'is-required' : ''}`}
                aria-label="Add video"
                title="Add video"
              >
                <Video />
              </button>
              
              {/* Tag Friends */}
              <button
                type="button"
                onClick={() => setShowTagFriends(true)}
                className={`create-post-modal__tool ${taggedFriends.length > 0 ? 'is-active' : ''}`}
                aria-label="Tag people"
                title="Tag people"
              >
                <UserPlus />
              </button>
              
              {/* Location */}
              <button
                type="button"
                onClick={() => setShowLocation(true)}
                className={`create-post-modal__tool ${selectedLocation ? 'is-active' : ''}`}
                aria-label="Add location"
                title="Add location"
              >
                <MapPin />
              </button>
              
              <span className="create-post-modal__count">{content.length} / 500</span>
            </div>

            {/* Media required warning */}
            {mediaRequired && !hasMedia && (
              <div className="create-post-modal__media-warning">
                <Image />
                {t("composer.media_required")}
              </div>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              aria-disabled={!hasMedia}
              className={`create-post-modal__submit ${hasMedia ? "is-ready" : ""}`}
            >
              {isSubmitting ? (
                <div className="create-post-modal__submit-spinner" />
              ) : (
                <><PartyPopper /> {t("common:actions.post")}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tag Friends Modal */}
      <TagFriendsModal
        isOpen={showTagFriends}
        onClose={() => setShowTagFriends(false)}
        selectedFriends={taggedFriends}
        onSelectFriends={setTaggedFriends}
      />

      {/* Location/Venue Modal */}
      <LocationVenueModal
        isOpen={showLocation}
        onClose={() => setShowLocation(false)}
        selectedLocation={selectedLocation}
        onSelectLocation={setSelectedLocation}
      />
    </>
  );
};

export default CreatePostModal;
