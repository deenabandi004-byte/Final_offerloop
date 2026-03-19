import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-[3px] border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] ring-offset-background placeholder:text-[#94A3B8] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3B82F6] focus-visible:border-[#3B82F6] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
