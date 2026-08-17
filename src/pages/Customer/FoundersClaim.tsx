import { ClaimCodeForm } from '@/components/FoundersPass/ClaimCodeForm';
import { useTranslation } from 'react-i18next';

export default function FoundersClaim() {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4">
        <ClaimCodeForm passType="user" />
      </div>
    </div>
  );
}
