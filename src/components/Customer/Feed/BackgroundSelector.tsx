import { Check } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface BackgroundOption {
  id: string;
  name: string;
  preview: string;
  className: string;
}

const backgrounds: BackgroundOption[] = [
  {
    id: "dark",
    name: "Midnight",
    preview: "bg-gradient-to-br from-gray-900 via-black to-gray-900",
    className: "bg-gradient-to-br from-gray-900 via-black to-gray-900",
  },
  {
    id: "purple",
    name: "Neon Nights",
    preview: "bg-gradient-to-br from-purple-900 via-pink-800 to-purple-900",
    className: "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZzEiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM1ODEyODciLz48c3RvcCBvZmZzZXQ9IjUwJSIgc3RvcC1jb2xvcj0iI2M1Mzk4YSIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzU4MTI4NyIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZzEpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] bg-cover",
  },
  {
    id: "white",
    name: "Crystal",
    preview: "bg-gradient-to-br from-pink-100 via-blue-100 to-purple-100",
    className: "bg-gradient-to-br from-pink-100 via-blue-100 to-purple-100",
  },
  {
    id: "geometric",
    name: "Prism",
    preview: "bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-700",
    className: "bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-700",
  },
];

const backgroundNameKeys: Record<string, string> = {
  dark: "backgrounds.midnight",
  purple: "backgrounds.neon_nights",
  white: "backgrounds.crystal",
  geometric: "backgrounds.prism",
};

interface BackgroundSelectorProps {
  selected: string;
  onSelect: (id: string) => void;
}

const BackgroundSelector = ({ selected, onSelect }: BackgroundSelectorProps) => {
  const { t } = useTranslation('feed');
  return (
    <div className="flex gap-2 p-2 bg-black/60 backdrop-blur-xl rounded-2xl">
      {backgrounds.map((bg) => (
        <button
          key={bg.id}
          onClick={() => onSelect(bg.id)}
          className={`relative w-12 h-12 rounded-xl ${bg.preview} ring-2 transition-all duration-200 ${
            selected === bg.id 
              ? "ring-neon-cyan scale-110 shadow-[0_0_15px_hsl(var(--neon-cyan))]" 
              : "ring-white/20 hover:ring-white/40"
          }`}
          title={t(backgroundNameKeys[bg.id] || bg.name)}
        >
          {selected === bg.id && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
              <Check className="w-5 h-5 text-neon-cyan" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

export { backgrounds };
export default BackgroundSelector;
