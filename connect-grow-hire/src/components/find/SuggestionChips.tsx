import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import posthog from '@/lib/posthog';
import { firebaseApi } from '@/services/firebaseApi';
import {
  type SuggestionChip, type UserContext, type RecommendedCompany,
  generatePeopleChips, generateFirmChips, rotateChips,
  DEFAULT_PEOPLE_CHIPS, DEFAULT_FIRM_CHIPS, isContextEmpty, EMPTY_CONTEXT,
  getRecommendedCompanies, getIndustryColor, shortUniversity,
} from '@/utils/suggestionChips';

interface SuggestionChipsProps {
  type: 'people' | 'companies';
  uid: string | undefined;
  onSelect: (prompt: string) => void;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  hasSearched: boolean;
  disabled?: boolean;
}

// Fallback chip rendering for users with no profile data
function FallbackChips({
  chips, type, onSelect, disabled,
}: {
  chips: SuggestionChip[];
  type: string;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {chips.map(chip => {
        const isSelected = selectedId === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              setSelectedId(chip.id);
              posthog.capture('suggestion_chip_clicked', { chip_id: chip.id, category: chip.category, label: chip.label, tab: type });
              onSelect(chip.prompt);
              setTimeout(() => setSelectedId(null), 300);
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', fontSize: 11.5, borderRadius: 100,
              cursor: 'pointer', transition: 'all .12s', fontFamily: 'inherit',
              maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              border: `1px solid ${isSelected ? '#3B82F6' : '#E2E8F0'}`,
              background: isSelected ? '#3B82F6' : '#fff',
              color: isSelected ? '#fff' : '#6B7280',
            }}
            onMouseEnter={e => {
              if (!isSelected) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3B82F6';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.05)';
                (e.currentTarget as HTMLButtonElement).style.color = '#3B82F6';
              }
            }}
            onMouseLeave={e => {
              if (!isSelected) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0';
                (e.currentTarget as HTMLButtonElement).style.background = '#fff';
                (e.currentTarget as HTMLButtonElement).style.color = '#6B7280';
              }
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  type, uid, onSelect, collapsed, onCollapse, hasSearched, disabled,
}) => {
  const [userCtx, setUserCtx] = useState<UserContext>(EMPTY_CONTEXT);
  const [recommendations, setRecommendations] = useState<RecommendedCompany[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const prevHasSearched = useRef(hasSearched);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user onboarding data
  useEffect(() => {
    if (!uid) { setLoaded(true); return; }
    firebaseApi.getUserOnboardingData(uid).then(data => {
      setUserCtx(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [uid]);

  // Generate recommendations when context loads
  useEffect(() => {
    if (!loaded) return;
    if (!isContextEmpty(userCtx)) {
      setRecommendations(getRecommendedCompanies(userCtx));
    }
  }, [loaded, userCtx]);

  // Auto-collapse after first search
  useEffect(() => {
    if (!prevHasSearched.current && hasSearched) {
      onCollapse(true);
      posthog.capture('suggestions_collapsed', { tab: type, trigger: 'auto' });
    }
    prevHasSearched.current = hasSearched;
  }, [hasSearched, onCollapse, type]);

  const toggleCollapse = useCallback(() => {
    const next = !collapsed;
    onCollapse(next);
    posthog.capture(next ? 'suggestions_collapsed' : 'suggestions_expanded', { tab: type, ...(next ? { trigger: 'manual' } : {}) });
  }, [collapsed, onCollapse, type]);

  const handleCardClick = useCallback((company: RecommendedCompany) => {
    posthog.capture('recommendation_card_clicked', {
      company: company.company, industry: company.industry, score: company.score, tab: type,
    });
    if (type === 'people') {
      // Build prompt: "[Company] [careerTrack] [university] alumni"
      const parts = [company.company];
      if (userCtx.careerTrack) parts.push(userCtx.careerTrack);
      if (userCtx.university) parts.push(shortUniversity(userCtx.university));
      parts.push('alumni');
      onSelect(parts.join(' '));
    } else {
      // Companies tab: just the company name
      onSelect(company.company);
    }
  }, [onSelect, type, userCtx]);

  // If no profile data, fall back to default chips
  const useCards = !isContextEmpty(userCtx) && recommendations.length > 0;

  if (!loaded) return null;

  // Collapsed state
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapse}
        aria-expanded={false}
        aria-controls="suggestion-chips"
        aria-label="Toggle personalized suggestions"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', fontSize: 11, color: '#94A3B8',
          background: 'none', border: '1px solid #E2E8F0', borderRadius: 100,
          cursor: 'pointer', transition: 'all .12s', fontFamily: 'inherit',
          marginBottom: 16,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#3B82F6'; e.currentTarget.style.borderColor = '#3B82F6'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
      >
        Suggestions
        <ChevronDown className="h-3 w-3" />
      </button>
    );
  }

  // No profile → fallback chips
  if (!useCards) {
    const defaults = type === 'people' ? DEFAULT_PEOPLE_CHIPS : DEFAULT_FIRM_CHIPS;
    return (
      <div id="suggestion-chips" style={{ marginBottom: 20 }}>
        <FallbackChips chips={defaults} type={type} onSelect={onSelect} disabled={disabled} />
      </div>
    );
  }

  // Build subtitle from profile
  const uni = shortUniversity(userCtx.university);
  const subtitleParts = [uni, userCtx.targetIndustries[0], userCtx.preferredLocations[0]].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');

  const visibleCards = showMore ? recommendations : recommendations.slice(0, 5);
  const ctaLabel = type === 'people' ? 'Find contacts →' : 'Search company';

  return (
    <div id="suggestion-chips" style={{ marginBottom: 20 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
          Based on your interests
        </span>
        <button
          onClick={toggleCollapse}
          style={{
            fontSize: 11, color: '#94A3B8', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex',
            alignItems: 'center', gap: 3, padding: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#3B82F6'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; }}
        >
          Collapse
          <ChevronUp className="h-3 w-3" />
        </button>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', flexShrink: 0,
          }} />
          <span style={{ fontSize: 11.5, color: '#64748B' }}>{subtitle}</span>
        </div>
      )}

      {/* Horizontal scroll card row */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {visibleCards.map(rec => {
          const accentColor = getIndustryColor(rec.industry);
          const initial = rec.company.charAt(0).toUpperCase();
          return (
            <button
              key={rec.company}
              type="button"
              disabled={disabled}
              onClick={() => handleCardClick(rec)}
              style={{
                flex: '0 0 148px', width: 148,
                borderRadius: 12, overflow: 'hidden',
                background: '#F8FAFC', border: '0.5px solid #E2E8F0',
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color .15s, box-shadow .15s',
                fontFamily: 'inherit', padding: 0,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3B82F6';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(59,130,246,.12)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              {/* Accent bar */}
              <div style={{ height: 3, background: accentColor }} />

              {/* Card body */}
              <div style={{ padding: '10px 12px 12px' }}>
                {/* Avatar */}
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: `${accentColor}18`,
                  color: accentColor, fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 8,
                }}>
                  {initial}
                </div>

                {/* Company name */}
                <div style={{
                  fontSize: 13, fontWeight: 500, color: '#0F172A',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 3,
                }}>
                  {rec.company}
                </div>

                {/* Reason */}
                <div style={{
                  fontSize: 11, color: '#64748B',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 8,
                }}>
                  {rec.reason}
                </div>

                {/* CTA */}
                <div style={{ fontSize: 11, color: '#3B82F6', fontWeight: 500 }}>
                  {ctaLabel}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Show more button */}
      {recommendations.length > 5 && !showMore && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          style={{
            fontSize: 11.5, color: '#64748B', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0 0',
            transition: 'color .12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#3B82F6'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#64748B'; }}
        >
          Show more companies
        </button>
      )}

      {/* Divider: "or search manually" */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginTop: 16,
      }}>
        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
        <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>or search manually</span>
        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      </div>
    </div>
  );
};

export default SuggestionChips;
