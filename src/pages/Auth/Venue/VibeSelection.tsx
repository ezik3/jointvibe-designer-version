import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import "./venue-onboarding-flow.css";

interface VibeTag {
  id: string;
  tag_name: string;
  category: string;
}

interface VibeQueryResult {
  data: unknown;
  error: { message?: string } | null;
}

interface VibeQuery extends PromiseLike<VibeQueryResult> {
  select(columns: string): VibeQuery;
  eq(column: string, value: string): VibeQuery;
  order(column: string): VibeQuery;
  insert(values: unknown): VibeQuery;
  single(): Promise<VibeQueryResult>;
}

interface VibeTablesClient {
  from(table: "vibe_tags" | "venue_vibe_tags"): VibeQuery;
  rpc(functionName: string, args: Record<string, string>): Promise<VibeQueryResult>;
}

const vibeTables = supabase as unknown as VibeTablesClient;

function getStoredVenueId() {
  try {
    const stored = localStorage.getItem("jv_venue_data");
    return stored ? (JSON.parse(stored).venueId as string | undefined) ?? null : null;
  } catch {
    return null;
  }
}

export default function VenueVibeSelection() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<VibeTag[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTags = async () => {
      const { data } = await vibeTables
        .from("vibe_tags")
        .select("id, tag_name, category")
        .eq("status", "active")
        .order("category");

      setTags((data as VibeTag[] | null) ?? []);
      setLoading(false);
    };

    void fetchTags();
  }, []);

  const groupedTags = useMemo(() => tags.reduce<Record<string, VibeTag[]>>((groups, tag) => {
    (groups[tag.category] ??= []).push(tag);
    return groups;
  }, {}), [tags]);

  const toggleTag = (tagName: string) => {
    setSelected((current) => {
      if (current.includes(tagName)) return current.filter((tag) => tag !== tagName);
      if (current.length >= 10) {
        toast.info("Choose up to 10 vibes.");
        return current;
      }
      return [...current, tagName];
    });
  };

  const handleAddCustom = async () => {
    const trimmed = customVibe.trim();
    if (!trimmed) return;

    if (tags.some((tag) => tag.tag_name.toLowerCase() === trimmed.toLowerCase())) {
      toast.info("This vibe already exists.");
      return;
    }

    const { data, error } = await vibeTables
      .from("vibe_tags")
      .insert({
        tag_name: trimmed,
        category: "Custom",
        status: "pending_review",
        created_by_venue_id: getStoredVenueId(),
      })
      .select("id, tag_name, category")
      .single();

    if (error || !data) {
      toast.error("Failed to add custom vibe.");
      return;
    }

    const created = data as VibeTag;
    setTags((current) => [...current, created]);
    setSelected((current) => current.length < 10 ? [...current, created.tag_name] : current);
    setCustomVibe("");
    toast.success("Custom vibe submitted for review.");
  };

  const handleContinue = async () => {
    if (selected.length < 3) return;

    setSaving(true);
    try {
      let venueId = getStoredVenueId();

      if (!venueId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: venue } = await supabase
            .from("venues")
            .select("id")
            .eq("owner_user_id", user.id)
            .maybeSingle();
          venueId = venue?.id ?? null;
        }
      }

      if (!venueId) {
        toast.error("Venue not found. Please complete venue setup first.");
        return;
      }

      const rows = selected.map((tag_name, index) => ({
        venue_id: venueId,
        tag_name,
        is_primary: index === 0,
      }));

      const { error } = await vibeTables.from("venue_vibe_tags").insert(rows);
      if (error) throw error;

      await Promise.all(selected.map((tagName) => (
        vibeTables.rpc("increment_vibe_tag_usage", { p_tag_name: tagName }).catch(() => undefined)
      )));

      toast.success("Venue vibes saved.");
      navigate("/venue/utility-bill");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save venue vibes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <VenueOnboardingShell step={4} backTo="/venue/essentials" wide>
      <section className="venue-onboarding-card venue-onboarding-flow-card venue-vibes-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            <Sparkles aria-hidden="true" />
          </div>
          <h1>What vibes does your venue offer?</h1>
          <p>Select three to ten tags that describe your venue&apos;s atmosphere.</p>
          <p className="venue-vibes-card__count">{selected.length}/3 minimum {selected.length >= 3 && <Check aria-hidden="true" />}</p>
        </div>

        {loading ? (
          <div className="venue-vibes-card__loading" role="status"><span className="venue-onboarding-spinner" aria-hidden="true" /></div>
        ) : Object.keys(groupedTags).length === 0 ? (
          <p className="venue-vibes-card__empty">No venue vibes are available right now.</p>
        ) : (
          <div className="venue-vibes-card__groups">
            {Object.entries(groupedTags).map(([category, categoryTags]) => (
              <section className="venue-vibes-card__group" key={category}>
                <h2>{category}</h2>
                <div className="venue-vibes-card__tag-list">
                  {categoryTags.map((tag) => {
                    const isSelected = selected.includes(tag.tag_name);
                    return (
                      <button
                        className="venue-vibes-card__tag"
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

        <div className="venue-vibes-card__custom">
          <div className="venue-onboarding-input">
            <input
              aria-label="Add a custom venue vibe"
              maxLength={40}
              placeholder="Add a custom vibe"
              value={customVibe}
              onChange={(event) => setCustomVibe(event.target.value)}
            />
          </div>
          <button className="venue-onboarding-button venue-onboarding-button--secondary" type="button" onClick={() => void handleAddCustom()} disabled={!customVibe.trim()}>
            <Plus aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>

        <div className="venue-onboarding-flow-actions">
          <button className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full" type="button" onClick={() => void handleContinue()} disabled={selected.length < 3 || saving}>
            {saving ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
            <span>{saving ? "Saving..." : "Continue"}</span>
          </button>
          <button className="venue-onboarding-text-button" type="button" onClick={() => navigate("/venue/utility-bill")} disabled={saving}>Skip for now</button>
        </div>
      </section>
    </VenueOnboardingShell>
  );
}
