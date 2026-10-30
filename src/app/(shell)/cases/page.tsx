import { Suspense } from 'react';
import { CaseList } from '@/components/case-list/case-list';
import { LoadingState } from '@/components/shell/states';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading cases" />}>
      <CaseList />
    </Suspense>
  );
}
