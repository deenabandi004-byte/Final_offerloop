import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-st-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper border-none hover:bg-ink/85",
        primary: "bg-ink text-paper border-none hover:bg-ink/85",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-line bg-elev text-ink hover:bg-paper-2",
        secondary:
          "bg-elev text-ink border border-line hover:bg-paper-2",
        ghost: "text-ink-2 hover:bg-paper-2",
        link: "text-st-accent underline-offset-4 hover:underline",
        gradient: "bg-ink text-paper shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all hover:opacity-90",
        brand: "bg-brand text-white border-none hover:bg-brand-2",
        accent: "text-st-accent border border-st-accent bg-transparent hover:bg-st-accent hover:text-white",
      },
      size: {
        default: "h-9 px-4 py-2 text-[14px]",
        xs: "h-7 px-3 text-[12px]",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
