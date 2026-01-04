// Use this component for all dropdowns to maintain consistent styling
// This ensures all dropdowns use the primary blue color instead of purple

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface DropdownOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface DropdownProps {
  options: DropdownOption[]
  value: string | number | undefined
  onChange: (value: string | number) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  contentClassName?: string
}

/**
 * Reusable Dropdown component with consistent blue styling.
 * 
 * All dropdowns in the app should use this component to maintain
 * consistent styling with the primary blue color (#3B82F6 / blue-600).
 * 
 * @example
 * ```tsx
 * <Dropdown
 *   options={[
 *     { value: 1, label: "1" },
 *     { value: 2, label: "2" },
 *     { value: 3, label: "3" },
 *   ]}
 *   value={recruiterCount}
 *   onChange={setRecruiterCount}
 *   placeholder="Select number"
 * />
 * ```
 */
export const Dropdown = React.forwardRef<
  HTMLButtonElement,
  DropdownProps
>(({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select...", 
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
}, ref) => {
  const handleValueChange = (newValue: string) => {
    // Find the option to get the original type
    const option = options.find(opt => String(opt.value) === newValue)
    if (option) {
      onChange(option.value)
    }
  }

  return (
    <Select
      value={value !== undefined ? String(value) : undefined}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger 
        ref={ref}
        className={cn("focus:ring-blue-500 focus:ring-2", triggerClassName, className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem
            key={String(option.value)}
            value={String(option.value)}
            disabled={option.disabled}
            className="focus:bg-blue-600 focus:text-white data-[highlighted]:bg-blue-600 data-[highlighted]:text-white hover:bg-blue-100 hover:text-blue-900"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
})

Dropdown.displayName = "Dropdown"

export default Dropdown

