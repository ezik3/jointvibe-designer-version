import { Eye } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface ViewerCountBadgeProps {
  count: number;
  className?: string;
}

const ViewerCountBadge = ({ count, className = "" }: ViewerCountBadgeProps) => (
  <div className={`flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full ${className}`}>
    <Eye className="w-3.5 h-3.5 text-white" />
    <span className="text-white text-xs font-medium">{count}</span>
  </div>
);

export default ViewerCountBadge;
