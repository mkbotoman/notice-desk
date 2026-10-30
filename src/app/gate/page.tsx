import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GATE_API_PATH, safeNextPath } from '@/lib/access';

async function GateForm({ searchParams }: Pick<PageProps<'/gate'>, 'searchParams'>) {
  const { error, next } = await searchParams;
  const nextPath = safeNextPath(typeof next === 'string' ? next : undefined);

  return (
    <form method="post" action={GATE_API_PATH} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'password-error' : undefined}
        />
        {error ? (
          <p id="password-error" role="alert" className="text-sm text-destructive">
            That password didn&apos;t work. Try again.
          </p>
        ) : null}
      </div>
      <Button type="submit">Enter</Button>
    </form>
  );
}

export default function GatePage(props: PageProps<'/gate'>) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Notice Desk</h1>
        <p className="text-sm text-muted-foreground">Enter the password to continue.</p>
      </div>
      <Suspense>
        <GateForm searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
