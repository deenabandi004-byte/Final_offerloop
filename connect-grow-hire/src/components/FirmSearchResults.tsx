/**
 * FirmSearchResults.tsx - Spreadsheet-style table for displaying firm search results
 * 
 * Dark theme styling to match the rest of the application
 * 
 * Columns:
 * A. Company Name
 * B. Website (icon/link)
 * C. LinkedIn (icon/link)
 * D. Location (City, State, Country)
 * E. Industry
 * F. Actions (View Contacts button)
 */

import { useState, useEffect } from 'react';
import { 
  Globe, 
  Linkedin, 
  MapPin, 
  Building2, 
  ChevronUp,
  ChevronDown,
  UserSearch,
  Search,
  Trash2,
  Loader2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Firm } from '../services/api';

interface FirmSearchResultsProps {
  firms: Firm[];
  onViewContacts: (firm: Firm) => void;
  onDelete?: (firm: Firm) => void;
  deletingId?: string | null;
}

type SortField = 'name' | 'location' | 'industry';
type SortDirection = 'asc' | 'desc';

export default function FirmSearchResults({ firms, onViewContacts, onDelete, deletingId }: FirmSearchResultsProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFirms, setFilteredFirms] = useState<Firm[]>(firms);
  
  // Filter firms based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFirms(firms);
      return;
    }
    
    const filtered = firms.filter((firm) => {
      const searchLower = searchQuery.toLowerCase();
      
      // Search through all relevant fields
      return (
        firm.name?.toLowerCase().includes(searchLower) ||
        firm.industry?.toLowerCase().includes(searchLower) ||
        firm.location?.display?.toLowerCase().includes(searchLower) ||
        firm.location?.city?.toLowerCase().includes(searchLower) ||
        firm.location?.state?.toLowerCase().includes(searchLower) ||
        firm.location?.country?.toLowerCase().includes(searchLower) ||
        firm.website?.toLowerCase().includes(searchLower)
      );
    });
    
    setFilteredFirms(filtered);
  }, [searchQuery, firms]);
  
  // Sort filtered firms
  const sortedFirms = [...filteredFirms].sort((a, b) => {
    let aVal: any;
    let bVal: any;
    
    switch (sortField) {
      case 'name':
        aVal = a.name?.toLowerCase() || '';
        bVal = b.name?.toLowerCase() || '';
        break;
      case 'location':
        aVal = a.location?.display?.toLowerCase() || '';
        bVal = b.location?.display?.toLowerCase() || '';
        break;
      case 'industry':
        aVal = a.industry?.toLowerCase() || '';
        bVal = b.industry?.toLowerCase() || '';
        break;
      default:
        return 0;
    }
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  
  // Handle column header click for sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  // Sort indicator component
  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4 inline-block ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 inline-block ml-1" />
    );
  };
  
  // Get unique firm key
  const getFirmKey = (firm: Firm): string => {
    return firm.id || `${firm.name}-${firm.location?.display}`;
  };

  return (
    <div className="bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border overflow-hidden">
      {/* Results Header */}
      <div className="px-6 py-4 border-b border-border bg-muted">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Building2 className="h-5 w-5 text-blue-400" />
            <span className="font-medium text-foreground">
              {filteredFirms.length} {filteredFirms.length === 1 ? 'firm' : 'firms'} 
              {searchQuery && ` (filtered from ${firms.length})`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Click "View Contacts" to find professionals at any firm
          </p>
        </div>
      </div>
      
      {/* Search Bar */}
      <div className="px-6 py-4 border-b border-border bg-background">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search firms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-muted border-border text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary"
          />
        </div>
      </div>
      
      {/* Empty State for No Search Results */}
      {filteredFirms.length === 0 && firms.length > 0 && searchQuery && (
        <div className="px-6 py-12 text-center">
          <p className="text-muted-foreground mb-2">No firms match your search.</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            Clear search
          </button>
        </div>
      )}
      
      {/* Table */}
      {filteredFirms.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              {/* Company Name */}
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors"
                onClick={() => handleSort('name')}
              >
                Company Name
                <SortIndicator field="name" />
              </th>
              
              {/* Website */}
              <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Website
              </th>
              
              {/* LinkedIn */}
              <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                LinkedIn
              </th>
              
              {/* Location */}
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors"
                onClick={() => handleSort('location')}
              >
                Location
                <SortIndicator field="location" />
              </th>
              
              {/* Industry */}
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors"
                onClick={() => handleSort('industry')}
              >
                Industry
                <SortIndicator field="industry" />
              </th>
              
              {/* Actions */}
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          
          <tbody className="bg-background divide-y divide-border">
            {sortedFirms.map((firm, index) => (
              <tr 
                key={firm.id || index} 
                className="hover:bg-secondary transition-colors"
              >
                {/* Company Name */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                      <Building2 className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-foreground">
                        {firm.name}
                      </div>
                    </div>
                  </div>
                </td>
                
                {/* Website */}
                <td className="px-4 py-4 whitespace-nowrap text-center">
                  {firm.website ? (
                    <a
                      href={firm.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                      title={firm.website}
                    >
                      <Globe className="h-5 w-5" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                
                {/* LinkedIn */}
                <td className="px-4 py-4 whitespace-nowrap text-center">
                  {firm.linkedinUrl ? (
                    <a
                      href={firm.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                      title="View on LinkedIn"
                    >
                      <Linkedin className="h-5 w-5" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                
                {/* Location */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-foreground">
                    <MapPin className="h-4 w-4 text-muted-foreground mr-1.5 flex-shrink-0" />
                    <span>{firm.location?.display || '—'}</span>
                  </div>
                </td>
                
                {/* Industry */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 capitalize">
                    {firm.industry || '—'}
                  </span>
                </td>
                
                {/* Actions */}
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onViewContacts(firm)}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-300 bg-blue-500/20 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 hover:text-blue-200 transition-colors"
                    >
                      <UserSearch className="h-4 w-4 mr-1.5" />
                      View Contacts
                    </button>
                    {onDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-300 hover:text-red-200 hover:bg-red-500/10"
                        disabled={deletingId === getFirmKey(firm)}
                        onClick={() => onDelete(firm)}
                      >
                        {deletingId === getFirmKey(firm) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      
      {/* Footer */}
      {filteredFirms.length > 0 && (
        <div className="px-6 py-4 border-t border-border bg-muted">
          <p className="text-sm text-muted-foreground text-center">
            Click on column headers to sort • Click "View Contacts" to find professionals at any firm
          </p>
        </div>
      )}
    </div>
  );
}

