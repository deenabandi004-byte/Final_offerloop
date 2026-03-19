import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[3px] text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#0F172A] text-[#DBEAFE] hover:bg-[#1E293B]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#DBEAFE] hover:border-[#3B82F6]",
        secondary:
          "bg-[#DBEAFE] text-[#0F172A] hover:bg-[#DBEAFE]",
        ghost: "hover:bg-[#DBEAFE] hover:text-[#0F172A]",
        link: "text-[#3B82F6] underline-offset-4 hover:underline",
        gradient: "text-[#DBEAFE] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
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
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const gradientStyle = variant === "gradient"
      ? { ...style, background: '#0F172A' }
      : style
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        style={gradientStyle}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
