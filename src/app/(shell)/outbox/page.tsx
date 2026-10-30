import { Suspense } from 'react';
import { Outbox } from '@/components/notifications/outbox';
import { LoadingState } from '@/components/shell/states';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading outbox" />}>
      <Outbox />
    </Suspense>
  );
}
