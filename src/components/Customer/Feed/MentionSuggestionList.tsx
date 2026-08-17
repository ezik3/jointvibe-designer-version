import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Building2, User as UserIcon } from "lucide-react";
import type { MentionSuggestion } from "@/hooks/useMentionSuggestions";

interface MentionSuggestionListProps {
  suggestions: MentionSuggestion[];
  onSelect: (s: MentionSuggestion) => void;
  className?: string;
}

const MentionSuggestionList = ({
  suggestions,
  onSelect,
  className,
}: MentionSuggestionListProps) => {
  if (suggestions.length === 0) return null;

  return (
    <div
      className={
        className ??
        "mt-2 rounded-lg border border-zinc-700 bg-zinc-950/95 backdrop-blur overflow-hidden max-h-64 overflow-y-auto"
      }
    >
      {suggestions.map((s) => (
        <button
          key={`${s.kind}-${s.id}`}
          type="button"
          onMouseDown={(e) => {
            // Prevent textarea blur before click registers
            e.preventDefault();
            onSelect(s);
          }}
          className="w-full px-3 py-2 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-b-0 flex items-center gap-2"
        >
          {s.kind === "user" ? (
            <Avatar className="w-7 h-7">
              <AvatarImage src={s.avatar_url || undefined} alt={s.name} />
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-bold">
                {s.name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-cyan-300" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">@{s.name}</p>
            <p className="text-[11px] text-zinc-500 flex items-center gap-1">
              {s.kind === "user" ? (
                <>
                  <UserIcon className="w-3 h-3" /> Person
                </>
              ) : (
                <>
                  <Building2 className="w-3 h-3" /> {s.city || "Venue"}
                </>
              )}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
};

export default MentionSuggestionList;
