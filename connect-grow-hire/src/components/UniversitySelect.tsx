import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { UNIVERSITIES } from "@/data/universities";

interface UniversitySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  /** Optional: set to true in Account Settings for consistent section styling */
  variant?: "default" | "settings";
}

export function UniversitySelect({
  value,
  onValueChange,
  placeholder = "Select or search university...",
  disabled = false,
  triggerClassName,
  variant = "default",
}: UniversitySelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const triggerStyle =
    variant === "settings"
      ? {
          padding: "12px 16px",
          borderRadius: "10px",
          border: "1px solid rgba(37, 99, 235, 0.12)",
          background: "#F8FAFF",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: "15px",
          color: value ? "#0F172A" : "#64748B",
        }
      : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant === "settings" ? "ghost" : "outline"}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", triggerClassName)}
          style={triggerStyle}
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type your university..."
            className="h-9"
            onValueChange={(search) => setSearchQuery(search)}
          />
          <CommandList className="max-h-[200px]">
            <CommandEmpty>
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onValueChange(searchQuery);
                  setOpen(false);
                }}
              >
                Use &quot;<span className="font-medium">{searchQuery}</span>&quot; as your university
              </button>
            </CommandEmpty>
            <CommandGroup>
              {UNIVERSITIES.map((university) => (
                <CommandItem
                  key={university}
                  value={university}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === university ? "opacity-100" : "opacity-0")} />
                  {university}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
