import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { advanceOnboardingStep, consumePostOnboardingRedirect } from "@/utils/onboarding";
import UserOnboardingShell from "@/components/User/UserOnboardingShell";
import "./user-onboarding-flow.css";

interface VibeTag {
  id: string;
  tag_name: string;
  category: string;
}

function navigateAfterOnboarding(navigate: ReturnType<typeof useNavigate>) {
  navigate(consumePostOnboardingRedirect());
}

export default function UserVibeSelection() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<VibeTag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<VibeTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTags = async () => {
      const { data } = await supabase
        .from("vibe_tags")
        .select("id, tag_name, category")
        .eq("status", "active")
        .order("category");

      if (data) setTags(data);
      setLoading(false);
    };

    void fetchTags();
  }, []);

  const groupedTags = useMemo(() => tags.reduce<Record<string, VibeTag[]>>((groups, tag) => {
    (groups[tag.category] ??= []).push(tag);
    return groups;
  }, {}), [tags]);

  const toggleTag = (tagName: string) => {
    const next = new Set(selected);
    if (next.has(tagName)) {
      next.delete(tagName);
    } else if (next.size < 15) {
      next.add(tagName);
      const tag = tags.find((item) => item.tag_name === tagName);
      if (tag) {
        setSuggestions(tags.filter((item) => (
          item.category === tag.category && item.tag_name !== tagName && !next.has(item.tag_name)
        )).slice(0, 5));
      }
    }
    setSelected(next);
  };

  const handleContinue = async () => {
    if (selected.size < 5) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const rows = Array.from(selected).map((tag_name) => ({
        user_id: user.id,
        tag_name,
        declared_weight: 1.0,
        behavioral_weight: 0,
      }));

      const { error } = await supabase
        .from("user_vibe_preferences")
        .insert(rows);

      if (error) throw error;
      toast.success("Vibe preferences saved!");
      await advanceOnboardingStep(user.id, "complete");
      navigateAfterOnboarding(navigate);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    const count = Number.parseInt(localStorage.getItem("jv_vibe_skip_count") || "0", 10);
    localStorage.setItem("jv_vibe_skip_count", String(count + 1));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await advanceOnboardingStep(user.id, "complete");
    } catch (error) {
      console.error("Error advancing onboarding:", error);
    }

    navigateAfterOnboarding(navigate);
  };

  return (
    <UserOnboardingShell step={6} backTo="/user/profile-setup" wide>
      <section className="venue-onboarding-card user-vibes-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon"><Sparkles aria-hidden="true" /></div>
          <h1>What&apos;s your vibe?</h1>
          <p>Choose at least five interests. We&apos;ll use them to personalize venues and deals.</p>
          <p className="user-vibes-card__count">{selected.size}/5 minimum {selected.size >= 5 && <Check aria-hidden="true" />}</p>
        </div>

        {loading ? (
          <div className="user-vibes-card__loading" role="status"><span className="venue-onboarding-spinner" aria-hidden="true" /></div>
        ) : Object.keys(groupedTags).length === 0 ? (
          <p className="user-vibes-card__empty">No vibe tags are available right now.</p>
        ) : (
          <div className="user-vibes-card__groups">
            {Object.entries(groupedTags).map(([category, categoryTags]) => (
              <section className="user-vibes-card__group" key={category}>
                <h2>{category}</h2>
                <div className="user-vibes-card__tag-list">
                  {categoryTags.map((tag) => {
                    const isSelected = selected.has(tag.tag_name);
                    return (
                      <button
                        className="user-vibes-card__tag"
                        key={tag.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleTag(tag.tag_name)}
                      >
                        {tag.tag_name}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="user-vibes-card__suggestions">
            <p>You might also like</p>
            <div className="user-vibes-card__suggestion-list">
              {suggestions.map((tag) => (
                <button
                  className="user-vibes-card__tag"
                  key={tag.id}
                  type="button"
                  aria-pressed={selected.has(tag.tag_name)}
                  onClick={() => toggleTag(tag.tag_name)}
                >
                  {tag.tag_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="user-onboarding-flow-actions">
          <button
            className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
            type="button"
            onClick={() => void handleContinue()}
            disabled={selected.size < 5 || saving}
          >
            {saving ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
            <span>{saving ? "Saving..." : "Continue"}</span>
          </button>
          <button className="user-onboarding-text-button" type="button" onClick={() => void handleSkip()} disabled={saving}>Skip for now</button>
        </div>
      </section>
    </UserOnboardingShell>
  );
}
