'use client';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shell/states';

export default function ShellError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="That page hit a problem"
      action={
        <Button type="button" variant="outline" onClick={reset}>
          Try again
        </Button>
      }
    >
      Your changes are saved in this browser. If it keeps happening, use &ldquo;Reset demo
      data&rdquo;.
    </ErrorState>
  );
}
