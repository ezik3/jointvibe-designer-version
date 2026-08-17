import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search, LayoutGrid, Bell, Wallet, Compass, Trophy, MapPin, Radio,
  Heart, MessageCircle, Bookmark, Share2, Play, Plus, Mic, Wand2,
  Video, CheckCircle, Bot, Send, Lock, Users, ChevronRight, Star,
  Flame, TrendingUp, Gift, Zap, MoreHorizontal, Globe,
} from "lucide-react";
import jvLogo from "@/assets/jv-logo.png";
import fistIcon from "@/assets/fist-icon.png";
import { useTranslation } from 'react-i18next';

/* ───────────────────── STATIC DUMMY DATA ───────────────────── */

const NAV_ITEMS = [
  { icon: Radio, label: "Feed", active: true },
  { icon: Compass, label: "Explore" },
  { icon: Trophy, label: "Top 10" },
  { icon: Globe, label: "Venues" },
  { icon: MapPin, label: "Map" },
  { icon: Bell, label: "Alerts" },
  { icon: Wallet, label: "Wallet" },
];

const STORY_USERS = [
  { id: "add", username: "You", isAdd: true },
  { id: "1", username: "kingofjv", avatar: "https://i.pravatar.cc/150?img=1", isLive: true, tag: "K" },
  { id: "2", username: "vibequeen", avatar: "https://i.pravatar.cc/150?img=5", hasUnseen: true, tag: "VI" },
  { id: "3", username: "djmax", avatar: "https://i.pravatar.cc/150?img=8", hasUnseen: true },
  { id: "4", username: "foodie_m", avatar: "https://i.pravatar.cc/150?img=12", hasUnseen: true },
  { id: "5", username: "neonrider", avatar: "https://i.pravatar.cc/150?img=15" },
  { id: "6", username: "artsy.lu", avatar: "https://i.pravatar.cc/150?img=20", hasUnseen: true },
  { id: "7", username: "chef_jay", avatar: "https://i.pravatar.cc/150?img=22" },
];

const FEED_POSTS = [
  {
    id: "p1",
    user: { name: "Marcus Chen", handle: "@marcusvibes", avatar: "https://i.pravatar.cc/150?img=3", isGold: true },
    location: "Skyline Rooftop · Melbourne",
    caption: "Best rooftop vibes in the city 🌆🔥 The sunset was absolutely unreal tonight. Who's coming tomorrow?",
    media: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=400&fit=crop",
    stats: { pounds: 247, comments: 42, saves: 18, shares: 12 },
    deal: "🍸 Happy Hour – 2 for 1 Cocktails",
    timeAgo: "2h",
  },
  {
    id: "p2",
    user: { name: "Sophia Lin", handle: "@sophia.eats", avatar: "https://i.pravatar.cc/150?img=9" },
    location: "Neon Alley · Sydney",
    caption: "Found the most insane ramen spot hidden in a laneway 🍜✨ 10/10 vibes, the broth was life-changing.",
    media: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=400&fit=crop",
    stats: { pounds: 183, comments: 31, saves: 52, shares: 8 },
    timeAgo: "4h",
  },
];

const TRENDING_VENUES = [
  { name: "Electric Lounge", distance: "0.8km", rating: 4.8, img: "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=200&h=120&fit=crop", live: true },
  { name: "Sunset Terrace", distance: "1.2km", rating: 4.6, img: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&h=120&fit=crop" },
  { name: "The Jazz Cellar", distance: "2.1km", rating: 4.9, img: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=200&h=120&fit=crop" },
];

const AI_MESSAGES = [
  { role: "assistant" as const, text: "Hey! 👋 I found 3 rooftop bars near you with live music tonight. Want me to show you?" },
  { role: "user" as const, text: "Yes! Which one has the best cocktails?" },
  { role: "assistant" as const, text: "Skyline Rooftop has a 4.9 rating for cocktails and a 2-for-1 happy hour right now! 🍸" },
];

/* ───────────────────── COMPONENT ───────────────────── */

const DesktopFeedPreview = () => {
  const { t } = useTranslation('feed');
  const [aiInput, setAiInput] = useState("");

  return (
    <div className="h-screen w-screen bg-zinc-950 text-white flex overflow-hidden">
      {/* ═══════ LEFT NAV RAIL ═══════ */}
      <aside className="w-[72px] flex flex-col items-center py-6 border-r border-white/10 bg-black/40 backdrop-blur-xl shrink-0">
        {/* Logo */}
        <img src={jvLogo} alt="JV" className="w-10 h-10 rounded-xl mb-8" />

        {/* Nav icons */}
        <nav className="flex-1 flex flex-col gap-1 items-center">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                item.active
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "text-zinc-500 hover:text-white hover:bg-white/5"
              }`}
              title={item.label}
            >
              <item.icon size={20} />
            </button>
          ))}
        </nav>

        {/* Bottom: user */}
        <div className="flex flex-col items-center gap-3 mt-auto">
          <button className="text-zinc-500 hover:text-white"><Lock size={16} /></button>
          <button className="text-zinc-500 hover:text-white"><Users size={16} /></button>
          <Avatar className="w-9 h-9 border-2 border-cyan-500/50">
            <AvatarImage src="https://i.pravatar.cc/150?img=32" />
            <AvatarFallback>ME</AvatarFallback>
          </Avatar>
        </div>
      </aside>

      {/* ═══════ MAIN AREA ═══════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ─── TOP BAR ─── */}
        <header className="h-14 border-b border-white/10 bg-black/40 backdrop-blur-xl flex items-center px-5 gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <Input
              placeholder="Search venues, people, vibes…"
              className="pl-9 bg-white/5 border-white/10 text-sm h-9 rounded-full placeholder:text-zinc-500"
            />
          </div>
          <button className="text-zinc-400 hover:text-white"><LayoutGrid size={18} /></button>
          <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 font-mono text-xs cursor-pointer hover:bg-cyan-500/30">
            <Wallet size={12} className="mr-1" /> $50.00
          </Badge>
          <Avatar className="w-8 h-8 cursor-pointer">
            <AvatarImage src="https://i.pravatar.cc/150?img=32" />
            <AvatarFallback>ME</AvatarFallback>
          </Avatar>
          <button className="relative text-zinc-400 hover:text-white">
            <Bell size={18} />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
          </button>
        </header>

        {/* ─── CONTENT: CENTER + RIGHT ─── */}
        <div className="flex-1 flex overflow-hidden">
          {/* ═══════ CENTER COLUMN ═══════ */}
          <ScrollArea className="flex-1 min-w-0">
            <div className="max-w-[620px] mx-auto py-4 px-4">
              {/* Stories Row */}
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
                {STORY_USERS.map((u) => (
                  <button key={u.id} className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className={`relative w-16 h-16 rounded-2xl p-[2.5px] ${
                      u.isAdd ? "border-2 border-dashed border-zinc-600" :
                      u.isLive ? "bg-gradient-to-br from-red-500 via-pink-500 to-orange-500" :
                      u.hasUnseen ? "bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500" :
                      "bg-zinc-700/50"
                    }`}>
                      {u.isAdd ? (
                        <div className="w-full h-full rounded-[13px] bg-zinc-800 flex items-center justify-center">
                          <Plus size={20} className="text-cyan-400" />
                        </div>
                      ) : (
                        <div className="w-full h-full rounded-[13px] overflow-hidden bg-zinc-800">
                          <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                        </div>
                      )}
                      {u.isLive && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-red-500 text-white px-1.5 rounded-full">
                          LIVE
                        </span>
                      )}
                      {u.tag && (
                        <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-amber-500 text-black px-1 rounded">
                          {u.tag}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-400 truncate max-w-[60px]">{u.username}</span>
                  </button>
                ))}
                <button className="flex flex-col items-center justify-center gap-1.5 shrink-0 px-2">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                    <MoreHorizontal size={18} className="text-zinc-500" />
                  </div>
                  <span className="text-[11px] text-zinc-500">More</span>
                </button>
              </div>

              <Separator className="bg-white/5 my-3" />

              {/* Composer Bar */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 backdrop-blur-sm mb-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src="https://i.pravatar.cc/150?img=32" />
                    <AvatarFallback>ME</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-zinc-500">What's the vibe?</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 gap-1.5 h-8">
                    <Plus size={14} /> Post
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1.5 h-8">
                    <Video size={14} /> Go Live
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-green-400 hover:bg-green-500/10 gap-1.5 h-8">
                    <CheckCircle size={14} /> Check In
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10 gap-1.5 h-8">
                    <Bot size={14} /> Ask AI
                  </Button>
                  <div className="ml-auto flex gap-1">
                    <button className="text-zinc-500 hover:text-white p-1.5"><Mic size={14} /></button>
                    <button className="text-zinc-500 hover:text-white p-1.5"><Wand2 size={14} /></button>
                  </div>
                </div>
              </div>

              {/* Feed Cards */}
              {FEED_POSTS.map((post) => (
                <article key={post.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm mb-4">
                  {/* Post header */}
                  <div className="p-4 pb-2 flex items-start gap-3">
                    <Avatar className={`w-10 h-10 ${post.user.isGold ? "ring-2 ring-amber-500/60" : ""}`}>
                      <AvatarImage src={post.user.avatar} />
                      <AvatarFallback>{post.user.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{post.user.name}</span>
                        {post.user.isGold && <Star size={12} className="text-amber-400 fill-amber-400" />}
                        <span className="text-xs text-zinc-500">{post.user.handle}</span>
                        <span className="text-xs text-zinc-600 ml-auto">{post.timeAgo}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin size={10} className="text-cyan-400" />
                        <span className="text-[11px] text-cyan-400">{post.location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Caption */}
                  <p className="px-4 pb-3 text-sm text-zinc-300 leading-relaxed">{post.caption}</p>

                  {/* Media */}
                  <div className="relative group cursor-pointer">
                    <img src={post.media} alt="" className="w-full aspect-video object-cover" />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Play size={24} className="text-white ml-1" fill="white" />
                      </div>
                    </div>
                  </div>

                  {/* Stats bar */}
                  <div className="p-4 flex items-center gap-5">
                    <button className="flex items-center gap-1.5 text-zinc-400 hover:text-amber-400 transition-colors">
                      <img src={fistIcon} alt="pound" className="w-5 h-5 opacity-60" />
                      <span className="text-xs font-medium">{post.stats.pounds}</span>
                    </button>
                    <button className="flex items-center gap-1.5 text-zinc-400 hover:text-cyan-400 transition-colors">
                      <MessageCircle size={16} />
                      <span className="text-xs font-medium">{post.stats.comments}</span>
                    </button>
                    <button className="flex items-center gap-1.5 text-zinc-400 hover:text-purple-400 transition-colors">
                      <Bookmark size={16} />
                      <span className="text-xs font-medium">{post.stats.saves}</span>
                    </button>
                    <button className="flex items-center gap-1.5 text-zinc-400 hover:text-green-400 transition-colors ml-auto">
                      <Share2 size={16} />
                      <span className="text-xs font-medium">{post.stats.shares}</span>
                    </button>
                  </div>

                  {/* Deal pill */}
                  {post.deal && (
                    <div className="px-4 pb-4">
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5 inline-flex items-center gap-1.5">
                        <Zap size={12} className="text-amber-400" />
                        <span className="text-xs text-amber-300 font-medium">{post.deal}</span>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </ScrollArea>

          {/* ═══════ RIGHT SIDEBAR ═══════ */}
          <aside className="w-[320px] border-l border-white/10 bg-black/20 backdrop-blur-xl shrink-0 hidden xl:block">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {/* Wallet Summary */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{t("common:navigation.wallet")}</span>
                    <ChevronRight size={14} className="text-zinc-600" />
                  </div>
                  <div className="text-2xl font-bold text-cyan-400 font-mono mb-2">$50.00</div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
                      <Gift size={10} className="mr-1" /> 250 JVC Rewards
                    </Badge>
                    <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px]">
                      $5 Credit
                    </Badge>
                  </div>
                </div>

                {/* City Teaser */}
                <div className="relative rounded-2xl overflow-hidden h-28">
                  <img
                    src="https://images.unsplash.com/photo-1514395462725-fb4566210144?w=400&h=200&fit=crop"
                    alt="City"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-3">
                    <div className="text-xs text-zinc-400">{t("common:navigation.explore")}</div>
                    <div className="text-sm font-semibold">Melbourne Tonight</div>
                  </div>
                </div>

                <Separator className="bg-white/5" />

                {/* LIVE NOW */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Live Now</span>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=300&h=140&fit=crop"
                      alt="venue"
                      className="w-full h-24 object-cover"
                    />
                    <div className="p-3">
                      <div className="font-medium text-sm">Electric Lounge</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-zinc-500">0.8km</span>
                        <span className="text-[11px] text-amber-400 flex items-center gap-0.5">
                          <Star size={10} fill="currentColor" /> 4.8
                        </span>
                      </div>
                      <Button size="sm" className="w-full mt-2 h-7 text-xs bg-cyan-500 hover:bg-cyan-600 text-black font-semibold">
                        JOIN
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/5" />

                {/* TRENDING */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={14} className="text-cyan-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider">{t("feed:discover.trending")}</span>
                  </div>
                  <div className="space-y-2">
                    {TRENDING_VENUES.map((v) => (
                      <div key={v.name} className="flex items-center gap-3 bg-white/5 rounded-xl p-2.5 hover:bg-white/8 transition-colors cursor-pointer">
                        <img src={v.img} alt={v.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            {v.name}
                            {v.live && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-zinc-500">{v.distance}</span>
                            <span className="text-[11px] text-amber-400 flex items-center gap-0.5">
                              <Star size={9} fill="currentColor" /> {v.rating}
                            </span>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="text-[11px] text-cyan-400 hover:bg-cyan-500/10 h-7 px-2.5">
                          JOIN
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="bg-white/5" />

                {/* AI Chat Widget */}
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
                  <div className="p-3 border-b border-white/5 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                      <Bot size={14} />
                    </div>
                    <span className="text-xs font-semibold">JV Assistant</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 ml-auto" />
                  </div>

                  <div className="p-3 space-y-2.5 max-h-[180px] overflow-y-auto">
                    {AI_MESSAGES.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-cyan-500/20 text-cyan-100"
                            : "bg-white/5 text-zinc-300"
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 border-t border-white/5">
                    <div className="flex gap-2">
                      <Input
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="Ask anything…"
                        className="bg-white/5 border-white/10 text-xs h-8 rounded-full placeholder:text-zinc-600"
                      />
                      <Button size="icon" className="h-8 w-8 rounded-full bg-cyan-500 hover:bg-cyan-600 shrink-0">
                        <Send size={12} />
                      </Button>
                    </div>
                    <Button variant="ghost" className="w-full mt-2 h-7 text-[11px] text-cyan-400 hover:bg-cyan-500/10">
                      Open Chat <ChevronRight size={12} className="ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default DesktopFeedPreview;
