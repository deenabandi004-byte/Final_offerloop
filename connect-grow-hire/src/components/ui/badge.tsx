import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-st-lg border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-paper-2 text-ink-2 border-line",
        secondary:
          "bg-paper-2 text-ink-2 border-line",
        brand:
          "bg-brand/[0.08] text-brand border-brand/[0.15]",
        pos:
          "bg-signal-pos/[0.08] text-signal-pos border-signal-pos/[0.15]",
        neg:
          "bg-signal-neg/[0.08] text-signal-neg border-signal-neg/[0.15]",
        wait:
          "bg-signal-wait/[0.08] text-signal-wait border-signal-wait/[0.15]",
        destructive:
          "bg-destructive/[0.08] text-destructive border-destructive/[0.15]",
        outline: "text-foreground border-line",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
