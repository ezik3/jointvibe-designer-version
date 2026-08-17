import { Car, Bike, Footprints, Lock, ShieldCheck } from 'lucide-react';
import type { DriverMode } from '@/hooks/useDriverVerification';

interface Props {
  selected: DriverMode[];
  onToggle: (mode: DriverMode) => void;
  onLockedClick: (mode: DriverMode, requiredDoc: 'license' | 'id') => void;
  hasLicense: boolean;
  hasId18Plus: boolean;
  /** When true, locked tiles point users to the central /user/id-verification flow
   *  instead of the legacy LicenseUploadSheet / IdUploadSheet. */
  preferCentralVerification?: boolean;
}

const MODES: Array<{
  mode: DriverMode;
  label: string;
  icon: typeof Car;
  requires: 'license' | 'id';
}> = [
  { mode: 'car', label: 'Car', icon: Car, requires: 'license' },
  { mode: 'motorcycle', label: 'Motorcycle', icon: Bike, requires: 'license' },
  { mode: 'bicycle', label: 'Bicycle', icon: Bike, requires: 'id' },
  { mode: 'runner', label: 'JV Runner', icon: Footprints, requires: 'id' },
];

export default function VehicleModePicker({
  selected,
  onToggle,
  onLockedClick,
  hasLicense,
  hasId18Plus,
  preferCentralVerification = false,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MODES.map(({ mode, label, icon: Icon, requires }) => {
        const unlocked = requires === 'license' ? hasLicense : hasId18Plus;
        const isSelected = selected.includes(mode);

        return (
          <button
            key={mode}
            type="button"
            onClick={() => (unlocked ? onToggle(mode) : onLockedClick(mode, requires))}
            className={`relative p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${
              isSelected
                ? 'bg-cyan/20 border-cyan text-cyan'
                : unlocked
                ? 'bg-white/5 border-white/10 text-white/80 hover:text-white'
                : 'bg-white/5 border-white/10 text-white/40'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{label}</span>
            {!unlocked && (
              <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1">
                {preferCentralVerification ? (
                  <ShieldCheck className="w-3 h-3 text-yellow-400" />
                ) : (
                  <Lock className="w-3 h-3 text-yellow-400" />
                )}
              </div>
            )}
            {!unlocked && (
              <span className="text-[10px] text-yellow-400/80 mt-0.5">
                {preferCentralVerification
                  ? 'Verify ID'
                  : requires === 'license'
                  ? 'Upload license'
                  : 'Upload 18+ ID'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
