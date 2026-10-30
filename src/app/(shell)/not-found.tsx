import Link from 'next/link';
import { EmptyState } from '@/components/shell/states';

export default function NotFound() {
  return (
    <EmptyState
      title="We couldn't find that page"
      action={
        <Link href="/" className="text-sm font-semibold text-navy">
          Back to the overview
        </Link>
      }
    />
  );
}
