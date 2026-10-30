import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const chip = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs leading-[18px] font-semibold',
  {
    variants: {
      tone: {
        danger: 'border-danger-line bg-danger-soft text-danger',
        warning: 'border-warning-line bg-warning-soft text-warning',
        success: 'border-success-line bg-success-soft text-success',
        navy: 'border-navy-line bg-navy-soft text-navy',
        solid: 'border-navy bg-navy text-white',
        gray: 'border-border bg-muted text-gray-700',
        outline: 'border-input bg-card text-gray-700',
      },
    },
    defaultVariants: { tone: 'gray' },
  },
);

export type ChipTone = NonNullable<VariantProps<typeof chip>['tone']>;

export function Chip({
  tone,
  className,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof chip>) {
  return <span className={cn(chip({ tone }), className)} {...props} />;
}
