'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/react';

/** Two steps, because it throws away every update made in this browser. */
export function ResetDemoButton() {
  const store = useStore();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
        Reset demo data
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Confirm reset">
      <p className="text-xs text-muted-foreground">
        This removes every update and notification you made here.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            store.reset();
            setConfirming(false);
          }}
        >
          Reset
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
