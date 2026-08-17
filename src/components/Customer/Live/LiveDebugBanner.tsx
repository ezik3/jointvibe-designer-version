import { useLivePresence } from "@/hooks/useLivePresence";
import { useTranslation } from 'react-i18next';

/** TEMP debug banner — remove after verifying live presence works */
const LiveDebugBanner = () => {
  const { t } = useTranslation('common');
  const { streams, realtimeStatus, lastEvent } = useLivePresence();

  const statusColor =
    realtimeStatus === "SUBSCRIBED"
      ? "bg-green-500"
      : realtimeStatus === "ERROR"
      ? "bg-red-500"
      : "bg-yellow-500";

  return (
    <div className="hidden fixed top-2 right-2 z-[9999] text-[10px] font-mono bg-black/80 backdrop-blur text-white px-3 py-2 rounded-lg border border-white/20 space-y-0.5 pointer-events-none max-w-[220px]">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span>RT: {realtimeStatus}</span>
      </div>
      <div>Streams: {streams.length}</div>
      <div className="truncate">Last evt: {lastEvent ? new Date(lastEvent).toLocaleTimeString() : "none"}</div>
    </div>
  );
};

export default LiveDebugBanner;
