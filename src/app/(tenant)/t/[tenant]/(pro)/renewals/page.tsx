import { CalendarClock } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';

export default function RenewalsPage() {
  return (
    <ComingSoon
      title="Renewals"
      subtitle="License, visa, and Emirates ID renewal pipeline with multi-channel alerts."
      icon={<CalendarClock className="size-6" />}
    />
  );
}
