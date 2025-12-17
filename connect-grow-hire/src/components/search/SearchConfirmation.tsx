import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { X, Edit2, Check, X as XIcon } from 'lucide-react';

export interface ParsedFilters {
  company: string[];
  roles: string[];
  location: string[];
  schools: string[];
  industries: string[];
  max_results: number;
  confidence: number;
}

interface SearchConfirmationProps {
  filters: ParsedFilters;
  onConfirm: (filters: ParsedFilters) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

type FilterType = 'company' | 'roles' | 'location' | 'schools' | 'industries';

interface EditableChip {
  type: FilterType;
  value: string;
  isEditing: boolean;
  editValue: string;
}

export const SearchConfirmation: React.FC<SearchConfirmationProps> = ({
  filters,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const [editableChips, setEditableChips] = useState<EditableChip[]>([]);
  const [localFilters, setLocalFilters] = useState<ParsedFilters>(filters);

  // Convert filters to chips
  const getChips = (): EditableChip[] => {
    const chips: EditableChip[] = [];
    
    localFilters.company.forEach((value) => {
      chips.push({ type: 'company', value, isEditing: false, editValue: value });
    });
    localFilters.roles.forEach((value) => {
      chips.push({ type: 'roles', value, isEditing: false, editValue: value });
    });
    localFilters.location.forEach((value) => {
      chips.push({ type: 'location', value, isEditing: false, editValue: value });
    });
    localFilters.schools.forEach((value) => {
      chips.push({ type: 'schools', value, isEditing: false, editValue: value });
    });
    localFilters.industries.forEach((value) => {
      chips.push({ type: 'industries', value, isEditing: false, editValue: value });
    });
    
    return chips;
  };

  const chips = getChips();

  const handleRemove = (type: FilterType, value: string) => {
    const newFilters = { ...localFilters };
    newFilters[type] = newFilters[type].filter((v) => v !== value);
    setLocalFilters(newFilters);
  };

  const handleStartEdit = (type: FilterType, value: string) => {
    setEditableChips([...editableChips, { type, value, isEditing: true, editValue: value }]);
  };

  const handleSaveEdit = (type: FilterType, oldValue: string, newValue: string) => {
    if (!newValue.trim()) {
      handleRemove(type, oldValue);
    } else {
      const newFilters = { ...localFilters };
      const index = newFilters[type].indexOf(oldValue);
      if (index !== -1) {
        newFilters[type][index] = newValue.trim();
      }
      setLocalFilters(newFilters);
    }
    setEditableChips(editableChips.filter((c) => !(c.type === type && c.value === oldValue)));
  };

  const handleCancelEdit = (type: FilterType, value: string) => {
    setEditableChips(editableChips.filter((c) => !(c.type === type && c.value === value)));
  };

  const handleAddNew = (type: FilterType) => {
    const newValue = prompt(`Add new ${type}:`);
    if (newValue && newValue.trim()) {
      const newFilters = { ...localFilters };
      if (!newFilters[type].includes(newValue.trim())) {
        newFilters[type].push(newValue.trim());
      }
      setLocalFilters(newFilters);
    }
  };

  const getFilterLabel = (type: FilterType): string => {
    const labels: Record<FilterType, string> = {
      company: 'Company',
      roles: 'Role',
      location: 'Location',
      schools: 'School',
      industries: 'Industry',
    };
    return labels[type];
  };

  const getFilterColor = (type: FilterType): string => {
    const colors: Record<FilterType, string> = {
      company: 'bg-blue-100 text-blue-800 border-blue-200',
      roles: 'bg-green-100 text-green-800 border-green-200',
      location: 'bg-purple-100 text-purple-800 border-purple-200',
      schools: 'bg-orange-100 text-orange-800 border-orange-200',
      industries: 'bg-pink-100 text-pink-800 border-pink-200',
    };
    return colors[type];
  };

  const renderChip = (chip: EditableChip, index: number) => {
    const isEditing = editableChips.some((ec) => ec.type === chip.type && ec.value === chip.value && ec.isEditing);
    const editingChip = editableChips.find((ec) => ec.type === chip.type && ec.value === chip.value && ec.isEditing);

    if (isEditing && editingChip) {
      return (
        <div key={`${chip.type}-${index}`} className="flex items-center gap-1">
          <Input
            value={editingChip.editValue}
            onChange={(e) => {
              setEditableChips(
                editableChips.map((ec) =>
                  ec.type === chip.type && ec.value === chip.value
                    ? { ...ec, editValue: e.target.value }
                    : ec
                )
              );
            }}
            className="h-7 text-xs w-32"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveEdit(chip.type, chip.value, editingChip.editValue);
              } else if (e.key === 'Escape') {
                handleCancelEdit(chip.type, chip.value);
              }
            }}
            autoFocus
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => handleSaveEdit(chip.type, chip.value, editingChip.editValue)}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => handleCancelEdit(chip.type, chip.value)}
          >
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    return (
      <Badge
        key={`${chip.type}-${index}`}
        variant="outline"
        className={`${getFilterColor(chip.type)} flex items-center gap-1 cursor-default`}
      >
        <span className="text-xs font-medium">{getFilterLabel(chip.type)}:</span>
        <span>{chip.value}</span>
        <button
          onClick={() => handleStartEdit(chip.type, chip.value)}
          className="ml-1 hover:bg-black/10 rounded p-0.5"
          type="button"
        >
          <Edit2 className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleRemove(chip.type, chip.value)}
          className="ml-1 hover:bg-black/10 rounded p-0.5"
          type="button"
        >
          <X className="h-3 w-3" />
        </button>
      </Badge>
    );
  };

  const groupedChips = {
    company: chips.filter((c) => c.type === 'company'),
    roles: chips.filter((c) => c.type === 'roles'),
    location: chips.filter((c) => c.type === 'location'),
    schools: chips.filter((c) => c.type === 'schools'),
    industries: chips.filter((c) => c.type === 'industries'),
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Review Search Filters</CardTitle>
        <p className="text-sm text-muted-foreground">
          We'll search for up to {localFilters.max_results} contacts matching these criteria.
        </p>
        {localFilters.confidence < 0.7 && (
          <p className="text-xs text-amber-600 mt-1">
            ⚠️ Low confidence extraction - please review and adjust filters as needed
          </p>
        )}
        {/* Warn if too many filters are set - might be too restrictive */}
        {(() => {
          const totalFilters = 
            localFilters.company.length + 
            localFilters.roles.length + 
            localFilters.location.length + 
            localFilters.schools.length + 
            localFilters.industries.length;
          
          if (totalFilters >= 4) {
            return (
              <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded border border-amber-200">
                ⚠️ <strong>Many filters selected:</strong> This search may be too restrictive and return few or no results. Consider removing some filters (especially company or school) to broaden your search.
              </p>
            );
          }
          return null;
        })()}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Display chips grouped by type */}
        {Object.entries(groupedChips).map(([type, typeChips]) => {
          if (typeChips.length === 0) return null;
          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{getFilterLabel(type as FilterType)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => handleAddNew(type as FilterType)}
                >
                  + Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {typeChips.map((chip, idx) => renderChip(chip, idx))}
              </div>
            </div>
          );
        })}

        {chips.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No filters extracted. Please try a more specific prompt.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(localFilters)}
            disabled={isLoading || chips.length === 0}
            className="flex-1"
          >
            {isLoading ? 'Running Search...' : 'Confirm & Search'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

