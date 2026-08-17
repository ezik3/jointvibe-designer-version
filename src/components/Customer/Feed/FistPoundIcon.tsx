import { useTranslation } from 'react-i18next';
interface FistPoundIconProps {
  className?: string;
  filled?: boolean;
}

const FistPoundIcon = ({ className = "w-6 h-6", filled = false }: FistPoundIconProps) => {
  const { t } = useTranslation('feed');
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill={filled ? "currentColor" : "none"} 
      className={className}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Realistic side-view fist punching forward */}
      {/* Wrist/arm */}
      <path d="M2 14h3c0.5 0 1-0.5 1-1v-2c0-0.5-0.5-1-1-1H2" />
      
      {/* Palm/hand body */}
      <path d="M6 10c0-1.5 1-3 2.5-3.5" />
      <path d="M6 14c0 1.5 1 3 2.5 3.5" />
      
      {/* Folded fingers - curved knuckle shape */}
      <path d="M8.5 6.5c1-0.5 2.5-0.5 4 0c1.5 0.5 3 1 4 2.5c0.8 1.2 1 2 0.8 3" />
      <path d="M8.5 17.5c1 0.5 2.5 0.5 4 0c1.5-0.5 3-1 4-2.5c0.8-1.2 1-2 0.8-3" />
      
      {/* Knuckle bumps */}
      <path d="M17 9c0.5-0.3 1.2-0.3 1.8 0.2c0.6 0.5 0.7 1.3 0.5 2" />
      <path d="M18.5 12c0.8 0 1.5 0.3 1.8 0.8c0.3 0.5 0.2 1.2-0.3 1.7" />
      
      {/* Thumb tucked in */}
      <path d="M6 11.5c0.5-0.8 1.5-1.5 2.5-1.5c1 0 1.5 0.5 1.5 1.5s-0.5 1.5-1.5 1.5c-1 0-2-0.5-2.5-1.5" />
      
      {/* Finger fold lines */}
      <path d="M10 8.5c1 0.3 2 0.8 2.5 1.5" />
      <path d="M10 15.5c1-0.3 2-0.8 2.5-1.5" />
      <path d="M13 9c0.8 0.4 1.5 1 2 1.5" />
      <path d="M13 15c0.8-0.4 1.5-1 2-1.5" />
      
      {/* Impact lines when filled/active */}
      {filled && (
        <>
          <line x1="21" y1="9" x2="23" y2="8" strokeWidth="2" />
          <line x1="22" y1="12" x2="24" y2="12" strokeWidth="2" />
          <line x1="21" y1="15" x2="23" y2="16" strokeWidth="2" />
        </>
      )}
    </svg>
  );
};

export default FistPoundIcon;
