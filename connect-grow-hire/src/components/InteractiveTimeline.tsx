import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TimelinePhase } from '@/types/timeline';
import { Edit2, X, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface InteractiveTimelineProps {
  phases: TimelinePhase[];
  startDate: string;
  targetDeadline: string;
  onUpdate?: (phases: TimelinePhase[]) => void;
}

export function InteractiveTimeline({ phases, startDate, targetDeadline, onUpdate }: InteractiveTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingPhase, setEditingPhase] = useState<number | null>(null);
  const [editedPhases, setEditedPhases] = useState<TimelinePhase[]>(phases);
  const [draggedPhase, setDraggedPhase] = useState<number | null>(null);
  const [dragTargetMonth, setDragTargetMonth] = useState<number | null>(null);

  // Update edited phases when phases prop changes
  useEffect(() => {
    setEditedPhases(phases);
  }, [phases]);

  // Helper functions for date manipulation
  const parseDate = (dateStr: string): Date => {
    // Use UTC to avoid DST timezone offset issues
    // If dateStr is already a full ISO string, use it directly
    if (dateStr.includes('T')) {
      return new Date(dateStr);
    }
    // Otherwise, parse as UTC date
    return new Date(dateStr + 'T00:00:00Z');
  };

  const startOfMonth = (date: Date): Date => {
    // Use UTC to avoid DST timezone offset issues
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
  };

  const addMonths = (date: Date, months: number): Date => {
    // Use UTC to avoid DST timezone offset issues
    const result = new Date(date);
    const year = result.getUTCFullYear();
    const month = result.getUTCMonth();
    return new Date(Date.UTC(year, month + months, 1));
  };

  const differenceInMonths = (dateLeft: Date, dateRight: Date): number => {
    // Use UTC to avoid DST timezone offset issues
    const yearDiff = dateLeft.getUTCFullYear() - dateRight.getUTCFullYear();
    const monthDiff = dateLeft.getUTCMonth() - dateRight.getUTCMonth();
    return yearDiff * 12 + monthDiff;
  };

  const isSameMonth = (dateLeft: Date, dateRight: Date): boolean => {
    // Use UTC to avoid DST timezone offset issues
    return dateLeft.getUTCFullYear() === dateRight.getUTCFullYear() &&
           dateLeft.getUTCMonth() === dateRight.getUTCMonth();
  };

  const formatMonth = (date: Date): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[date.getUTCMonth()];
  };

  const formatMonthFull = (date: Date): string => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  };

  // Helper to parse phase months - defined early so we can use it in timeline calculation
  // Uses UTC to avoid DST timezone offset issues
  const parsePhaseMonth = (monthStr: string, baseDate: Date): Date => {
    if (!monthStr || typeof monthStr !== 'string') {
      if (import.meta.env.DEV) {
        console.warn(`⚠️ Invalid month string: ${monthStr}, using baseDate`);
      }
      return baseDate;
    }
    
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const fullMonthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    
    const lowerStr = monthStr.toLowerCase().trim();
    
    // Try abbreviated month names first (e.g., "Jan 2024", "Sep 2025")
    let monthIndex = monthNames.findIndex(m => lowerStr.startsWith(m));
    
    // If not found, try full month names (e.g., "September 2025", "January 2024")
    if (monthIndex === -1) {
      monthIndex = fullMonthNames.findIndex(m => lowerStr.startsWith(m));
    }
    
    if (monthIndex !== -1) {
      // Extract year (look for 4-digit year)
      const yearMatch = monthStr.match(/\b(\d{4})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : baseDate.getFullYear();
      // Use UTC to avoid DST timezone offset changes
      const result = new Date(Date.UTC(year, monthIndex, 1));
      if (import.meta.env.DEV) {
        console.log(`📅 Parsed "${monthStr}" -> ${result.toISOString()}`);
      }
      return result;
    }
    
    if (import.meta.env.DEV) {
      console.warn(`⚠️ Could not parse month string: "${monthStr}", using baseDate: ${baseDate.toISOString()}`);
    }
    return baseDate;
  };

  // Calculate all months between start and end, extending to include all phases
  let start = startOfMonth(parseDate(startDate));
  let end = startOfMonth(parseDate(targetDeadline));
  
  // First, parse all phase dates to find the actual range needed
  const phaseDates: Date[] = [];
  editedPhases.forEach(phase => {
    const phaseStart = parsePhaseMonth(phase.startMonth, start);
    const phaseEnd = parsePhaseMonth(phase.endMonth, start);
    phaseDates.push(phaseStart, phaseEnd);
  });
  
  // Extend timeline to include all phases if they fall outside the range
  if (phaseDates.length > 0) {
    const minPhaseDate = new Date(Math.min(...phaseDates.map(d => d.getTime())));
    const maxPhaseDate = new Date(Math.max(...phaseDates.map(d => d.getTime())));
    
    // Adjust start to include earliest phase if needed
    if (minPhaseDate < start) {
      if (import.meta.env.DEV) {
        console.log(`📅 Extending timeline start from ${start.toISOString()} to ${minPhaseDate.toISOString()} to include phases`);
      }
      start = startOfMonth(minPhaseDate);
    }
    
    // Adjust end to include latest phase if needed
    if (maxPhaseDate > end) {
      if (import.meta.env.DEV) {
        console.log(`📅 Extending timeline end from ${end.toISOString()} to ${maxPhaseDate.toISOString()} to include phases`);
      }
      end = startOfMonth(maxPhaseDate);
    }
  }
  
  const totalMonths = differenceInMonths(end, start) + 1;
  
  const months: Date[] = [];
  for (let i = 0; i < totalMonths; i++) {
    months.push(addMonths(start, i));
  }
  
  if (import.meta.env.DEV) {
    console.log(`📅 Timeline range: ${start.toISOString()} to ${end.toISOString()}, ${totalMonths} months`);
  }

  // Find current month position
  const currentMonthIndex = months.findIndex(month => 
    isSameMonth(month, currentMonth)
  );

  // Calculate phase positions
  const phasePositions = editedPhases.map(phase => {
    const phaseStart = parsePhaseMonth(phase.startMonth, start);
    const phaseEnd = parsePhaseMonth(phase.endMonth, start);
    
    const startIndex = months.findIndex(m => isSameMonth(m, phaseStart));
    const endIndex = months.findIndex(m => isSameMonth(m, phaseEnd));
    
    const result = {
      phase,
      startIndex: startIndex >= 0 ? startIndex : 0,
      endIndex: endIndex >= 0 ? endIndex : totalMonths - 1,
      phaseStart,
      phaseEnd,
    };
    
    // Debug logging (only in development)
    if (import.meta.env.DEV) {
      console.log(`📅 Phase "${phase.name}": startMonth="${phase.startMonth}" -> ${phaseStart.toISOString()}, endMonth="${phase.endMonth}" -> ${phaseEnd.toISOString()}, startIndex=${result.startIndex}, endIndex=${result.endIndex}`);
    }
    
    return result;
  });
  
  if (import.meta.env.DEV) {
    console.log(`🔍 Total phases: ${editedPhases.length}, phasePositions:`, phasePositions);
  }

  // Handle phase drag to move
  const handlePhaseDragStart = (phaseIndex: number) => {
    setDraggedPhase(phaseIndex);
  };

  const handleMonthHover = (monthIndex: number) => {
    if (draggedPhase !== null) {
      setDragTargetMonth(monthIndex);
    }
  };

  const handlePhaseDrop = (targetMonthIndex: number) => {
    if (draggedPhase === null) return;
    
    const targetMonth = months[targetMonthIndex];
    const newPhases = [...editedPhases];
    const phase = newPhases[draggedPhase];
    
    // Update phase start month
    const newStartMonth = formatMonthFull(targetMonth);
    const duration = differenceInMonths(parsePhaseMonth(phase.endMonth, start), parsePhaseMonth(phase.startMonth, start));
    const newEndDate = addMonths(targetMonth, duration);
    const newEndMonth = formatMonthFull(newEndDate);
    
    newPhases[draggedPhase] = {
      ...phase,
      startMonth: newStartMonth,
      endMonth: newEndMonth,
    };
    
    setEditedPhases(newPhases);
    setDraggedPhase(null);
    setDragTargetMonth(null);
    if (onUpdate) onUpdate(newPhases);
  };

  // Handle phase edit
  const handlePhaseEdit = (phaseIndex: number) => {
    setEditingPhase(phaseIndex);
  };

  const handlePhaseSave = (phaseIndex: number, updatedPhase: TimelinePhase) => {
    const newPhases = [...editedPhases];
    newPhases[phaseIndex] = updatedPhase;
    setEditedPhases(newPhases);
    setEditingPhase(null);
    if (onUpdate) onUpdate(newPhases);
  };

  const handlePhaseCancel = () => {
    setEditingPhase(null);
  };

  // Scroll to current month on mount
  useEffect(() => {
    if (timelineRef.current && currentMonthIndex >= 0) {
      const monthWidth = 200;
      const scrollPosition = (currentMonthIndex * monthWidth) - (timelineRef.current.clientWidth / 2);
      timelineRef.current.scrollTo({ left: Math.max(0, scrollPosition), behavior: 'smooth' });
    }
  }, [currentMonthIndex]);

  // Calculate "You Are Here" position
  const youAreHerePosition = currentMonthIndex >= 0 
    ? ((currentMonthIndex / (totalMonths - 1 || 1)) * 100) 
    : 0;

  return (
    <div className="w-full max-w-full bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div 
          ref={timelineRef}
          className="overflow-x-auto pb-4 w-full"
          style={{ 
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(139, 92, 246, 0.3) transparent'
          }}
        >
          <div className="relative" style={{ minWidth: `${Math.max(totalMonths * 180, 600)}px`, height: '220px', paddingLeft: '75px', paddingRight: '75px' }}>
            {/* Timeline Line - More vibrant and visible */}
            <div className="absolute top-[70px] left-[75px] right-[75px] h-[3px] z-0">
              <div 
                className="w-full h-full rounded-full" 
                style={{ background: 'linear-gradient(to right, #8B5CF6, #D946EF)' }}
              />
            </div>

            {/* Month Labels and Phase Cards */}
            <div className="relative flex justify-between items-start h-full">
              {months.map((month, index) => {
                const isCurrent = index === currentMonthIndex;
                const isPast = index < currentMonthIndex;
                const position = (index / (totalMonths - 1 || 1)) * 100;
                
                // Find ALL phases that START at this month (not phases that just span it)
                // This ensures each phase appears exactly once at its start position
                const phasesAtMonth = phasePositions.filter(p => p.startIndex === index);
                
                return (
                  <div
                    key={index}
                    className="flex flex-col items-center absolute"
                    style={{ 
                      left: `${position}%`, 
                      transform: 'translateX(-50%)',
                      width: '150px'
                    }}
                    onMouseEnter={() => handleMonthHover(index)}
                    onMouseUp={() => {
                      if (draggedPhase !== null) {
                        handlePhaseDrop(index);
                      }
                    }}
                  >
                    {/* Month Label - Black, not faded */}
                    <div className={`font-medium mb-3 ${
                      isCurrent ? 'text-black font-semibold' :
                      isPast ? 'text-black' :
                      'text-black'
                    }`}>
                      {formatMonth(month)}
                    </div>

                    {/* Phase Indicator Dot - Show if any phase starts here or is active here */}
                    <div className="relative z-10 mb-3">
                      {(() => {
                        // Check if any phase starts at this month
                        const phaseStartsHere = phasesAtMonth.length > 0;
                        // Check if any phase is currently active (spans this month)
                        const activePhase = phasePositions.find(p => 
                          p.startIndex <= currentMonthIndex && p.endIndex >= currentMonthIndex
                        );
                        const isCurrentMonthActive = index === currentMonthIndex && activePhase;
                        
                        if (phaseStartsHere || isCurrentMonthActive) {
                          return (
                            <motion.div
                              className="w-[10px] h-[10px] rounded-full gradient-bg"
                              style={{ boxShadow: '0 0 12px rgba(139, 92, 246, 0.6), 0 0 24px rgba(217, 70, 239, 0.4)' }}
                              animate={{ scale: [0.8, 1.1, 0.8] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            />
                          );
                        } else {
                          return (
                            <div className="w-[10px] h-[10px] rounded-full bg-black border-2 border-black" />
                          );
                        }
                      })()}
                    </div>

                    {/* Connection Line */}
                    <div className="w-[1px] h-10 bg-border/50 mb-2" />

                    {/* Phase Cards - Show all phases that start at this month, stacked */}
                    {phasesAtMonth.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2" style={{ minWidth: '150px' }}>
                        {phasesAtMonth.map((phasePos, phaseIdx) => {
                          const isActive = phasePos.startIndex <= currentMonthIndex && phasePos.endIndex >= currentMonthIndex;
                          return (
                            <motion.div
                              key={`${phasePos.phase.name}-${index}-${phaseIdx}`}
                              className={`px-4 py-3 rounded-xl border-2 text-center text-sm transition-all relative group ${
                                isActive
                                  ? 'bg-gradient-to-br from-blue-500/20 via-blue-400/20 to-blue-600/20 border-blue-400 shadow-lg shadow-blue-500/20'
                                  : 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-300 hover:border-blue-300 hover:shadow-md'
                              }`}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: phaseIdx * 0.1 }}
                              whileHover={{ y: -4, scale: 1.02, transition: { duration: 0.2 } }}
                              draggable
                              onDragStart={() => handlePhaseDragStart(phasePositions.indexOf(phasePos))}
                              style={{ cursor: 'grab' }}
                              onDragEnd={() => {
                                setDraggedPhase(null);
                                setDragTargetMonth(null);
                              }}
                            >
                              {/* Edit button */}
                              <button
                                onClick={() => handlePhaseEdit(phasePositions.indexOf(phasePos))}
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/20"
                              >
                                <Edit2 className="h-3 w-3 text-gray-600" />
                              </button>

                              {editingPhase === phasePositions.indexOf(phasePos) ? (
                                <PhaseEditForm
                                  phase={phasePos.phase}
                                  onSave={(updated) => handlePhaseSave(phasePositions.indexOf(phasePos), updated)}
                                  onCancel={handlePhaseCancel}
                                />
                              ) : (
                                <>
                                  <div className={`font-semibold mb-1 ${
                                    isActive 
                                      ? 'text-blue-700' 
                                      : 'text-slate-700'
                                  }`}>
                                    {phasePos.phase.name}
                                  </div>
                                  <div className={`text-xs leading-relaxed ${
                                    isActive 
                                      ? 'text-blue-600' 
                                      : 'text-slate-600'
                                  }`}>
                                    {phasePos.phase.description}
                                  </div>
                                  {phasePos.phase.goals && phasePos.phase.goals.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-purple-200/50">
                                      <div className="text-xs space-y-1 text-left">
                                        {phasePos.phase.goals.slice(0, 2).map((goal, idx) => (
                                          <div key={idx} className="flex items-start gap-1.5">
                                            <span className="text-blue-500 mt-0.5">•</span>
                                            <span className={isActive 
                                              ? 'text-blue-600' 
                                              : 'text-slate-500'
                                            }>
                                              {goal}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* "You Are Here" indicator */}
            {currentMonthIndex >= 0 && (
              <motion.div
                className="absolute top-0 z-20"
                style={{ 
                  left: `calc(${youAreHerePosition}% + 75px)`,
                  transform: 'translateX(-50%)'
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                <div className="flex flex-col items-center">
                  <motion.div 
                    className="mb-2 px-3 py-1.5 rounded-full gradient-bg text-white text-xs font-medium shadow-lg"
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    You Are Here
                  </motion.div>

                  <div 
                    className="w-[3px] h-[66px] rounded-full"
                    style={{ background: 'linear-gradient(to bottom, #8B5CF6, #D946EF)' }}
                  />

                  <motion.div
                    className="relative"
                    animate={{ 
                      boxShadow: [
                        '0 0 0 0 rgba(139, 92, 246, 0.6)',
                        '0 0 0 10px rgba(139, 92, 246, 0)',
                        '0 0 0 0 rgba(139, 92, 246, 0)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <div 
                      className="w-4 h-4 rounded-full gradient-bg"
                      style={{ boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)' }}
                    />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Phase Edit Form Component
function PhaseEditForm({ phase, onSave, onCancel }: { phase: TimelinePhase; onSave: (phase: TimelinePhase) => void; onCancel: () => void }) {
  const [name, setName] = useState(phase.name);
  const [description, setDescription] = useState(phase.description);
  const [goals, setGoals] = useState(phase.goals.join('\n'));

  const handleSave = () => {
    onSave({
      ...phase,
      name,
      description,
      goals: goals.split('\n').filter(g => g.trim()),
    });
  };

  return (
    <div className="space-y-2 text-left">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Phase name"
        className="text-sm"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        className="text-xs resize-none"
      />
      <Textarea
        value={goals}
        onChange={(e) => setGoals(e.target.value)}
        placeholder="Goals (one per line)"
        rows={2}
        className="text-xs resize-none"
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3 w-3" />
        </Button>
        <Button size="sm" onClick={handleSave}>
          <Check className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
