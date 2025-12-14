# Scout Firm Search Assistant - Implementation Plan

## Overview
Add Scout as a sidebar assistant on the Firm Search page (`/firm-search`) to help users:
- Refine search queries
- Get resume-aware firm recommendations
- Research specific firms
- Navigate next steps (find contacts, prep for outreach)

## Implementation Phases

### Phase 1: Backend Implementation

#### 1.1 Add Firm Assist Endpoint (`backend/app/routes/scout.py`)
**Location:** After the existing `/analyze-job` endpoint (around line 116)

**New Endpoint:** `/api/scout/firm-assist` (POST)

**Responsibilities:**
- Accept firm context (current query, results, parsed filters)
- Accept user resume and optional fit context
- Route to `scout_service.handle_firm_assist()`
- Return structured response with suggestions

**Key Features:**
- Error handling with graceful fallbacks
- Support for conversation history
- Action type classification (refine_query, recommend_firms, research_firm, next_steps, general)

#### 1.2 Add Firm Assistant Handlers (`backend/app/services/scout_service.py`)
**Location:** Add new methods to `ScoutService` class

**New Methods:**
1. `handle_firm_assist()` - Main entry point
2. `_classify_firm_request()` - Classify user intent
3. `_handle_refine_firm_query()` - Refine search queries
4. `_handle_firm_recommendations()` - Resume-aware recommendations
5. `_handle_firm_research()` - Research specific firms
6. `_handle_firm_next_steps()` - Suggest next actions
7. `_handle_general_firm_help()` - General Q&A

**Key Features:**
- LLM-powered query refinement
- Resume analysis for firm matching
- Firm research with culture/recruiting insights
- Actionable next steps
- Conversation context awareness

### Phase 2: Frontend Implementation

#### 2.1 Create ScoutFirmAssistant Component (`connect-grow-hire/src/components/ScoutFirmAssistant.tsx`)
**New File:** Create from scratch (similar structure to ScoutChatbot)

**Key Features:**
- Chat interface with message history
- Quick action buttons (context-aware)
- Action buttons for suggestions (e.g., "Use this search", "Find contacts")
- Markdown-style message formatting
- Loading states
- Auto-scroll to latest message
- Same popup design pattern as existing ScoutChatbot

**Props:**
- `firmContext` - Current search state
- `userResume` - User's resume data
- `fitContext` - Optional job fit context
- `onApplyQuery` - Callback to apply refined query
- `onFindContacts` - Callback to find contacts at firm

**State Management:**
- Messages array (conversation history)
- Input text
- Loading state
- Message refs for scrolling

#### 2.2 Create ScoutFirmAssistantButton Component (`connect-grow-hire/src/components/ScoutFirmAssistantButton.tsx`)
**New File:** Create specialized button for firm search (similar to ScoutHeaderButton)

**Key Features:**
- Draggable/resizable popup window (same pattern as ScoutHeaderButton)
- Fixed position in top-right when opened
- Uses ScoutFirmAssistant component inside
- Same visual design as existing Scout button

**Props:**
- `firmContext` - Current search state
- `userResume` - User's resume data
- `fitContext` - Optional job fit context
- `onApplyQuery` - Callback to apply refined query
- `onFindContacts` - Callback to find contacts at firm

#### 2.3 Integrate into FirmSearchPage (`connect-grow-hire/src/pages/FirmSearchPage.tsx`)
**Modifications:**

1. **Replace PageHeaderActions Scout:**
   - Instead of generic `ScoutHeaderButton`, use `ScoutFirmAssistantButton`
   - Or modify `PageHeaderActions` to accept a `scoutVariant` prop

2. **Add Handlers:**
   - `handleApplyQuery(newQuery)` - Update query field from Scout suggestion
   - `handleFindContactsFromScout(firmName)` - Navigate to contact search

3. **Build Firm Context:**
   - Create `firmContext` object from current state:
     ```typescript
     const firmContext = {
       current_query: query,
       current_results: results,
       parsed_filters: parsedFilters,
     };
     ```

4. **Get User Resume:**
   - Access from Firebase auth context or user profile
   - Pass to ScoutFirmAssistantButton component

**Alternative Approach (Simpler):**
- Modify `ScoutHeaderButton` to accept a `variant` prop
- When `variant="firm-search"`, render `ScoutFirmAssistant` instead of `ScoutChatbot`
- Pass firm-specific props when variant is firm-search

## File Structure

```
backend/
├── app/
│   ├── routes/
│   │   └── scout.py                    [MODIFY] Add /firm-assist endpoint
│   └── services/
│       └── scout_service.py            [MODIFY] Add firm assist handlers

connect-grow-hire/
├── src/
│   ├── components/
│   │   ├── ScoutFirmAssistant.tsx           [NEW] Scout chat component for firm search
│   │   └── ScoutFirmAssistantButton.tsx     [NEW] Popup button wrapper (or modify ScoutHeaderButton)
│   └── pages/
│       └── FirmSearchPage.tsx                [MODIFY] Use firm-specific Scout button
```

## API Contract

### Request (`POST /api/scout/firm-assist`)
```json
{
  "message": "Which firms fit my background?",
  "firm_context": {
    "current_query": "Investment banks in New York...",
    "current_results": [
      {
        "name": "Goldman Sachs",
        "industry": "Investment Banking",
        "location": {"display": "New York, NY"},
        "size": "large"
      }
    ],
    "parsed_filters": {
      "industry": "investment banking",
      "location": "New York",
      "size": "large"
    }
  },
  "user_resume": { ... },
  "fit_context": { ... },  // Optional
  "conversation_history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

### Response
```json
{
  "status": "ok",
  "message": "Based on your background...",
  "suggestions": {
    "refined_query": "...",           // Optional
    "recommended_firms": ["..."],     // Optional
    "firm_insights": { ... },         // Optional
    "next_steps": ["..."]             // Optional
  },
  "action_type": "recommend_firms"
}
```

## Implementation Details

### Backend: Request Classification
Use keyword-based classification first, then LLM fallback:
- **refine_query**: "refine", "narrow", "filter", "smaller", "larger", "change"
- **recommend_firms**: "fit my background", "recommend", "which firm", "best for me"
- **research_firm**: "tell me about", "what is", "research", "culture", "interview"
- **next_steps**: "next step", "what now", "find contacts", "how do i"
- **general**: Everything else

### Frontend: Quick Actions
Context-aware quick action buttons:
- **No query/results**: "Help me build a search", "Investment banking firms", "Consulting firms"
- **Has results**: "Which fit my background?", "Show smaller firms", "What's next?", "Tell me about [firm]"
- **Has query, no results**: "Refine my search", "Different location", "Different industry"

### Frontend: Action Buttons
Show action buttons based on suggestions:
- **refined_query**: "Use this search" button → calls `onApplyQuery()`
- **recommended_firms**: "Find contacts at [firm]" buttons → calls `onFindContacts()`
- **firm_insights**: No action button (informational)
- **next_steps**: No action button (informational)

## Testing Checklist

### Backend
- [ ] `/firm-assist` endpoint returns 200 for valid requests
- [ ] Empty message returns helpful default response
- [ ] Query refinement generates valid search queries
- [ ] Firm recommendations work with resume data
- [ ] Firm recommendations gracefully handle missing resume
- [ ] Firm research returns useful information
- [ ] Next steps suggestions are actionable
- [ ] Error handling works correctly
- [ ] Conversation history is maintained

### Frontend
- [ ] Scout button appears in top-right (via PageHeaderActions)
- [ ] Popup opens/closes smoothly when button clicked
- [ ] Popup is draggable and resizable (same as existing Scout)
- [ ] Quick actions change based on state
- [ ] "Use this search" updates query field
- [ ] "Find contacts at [firm]" navigates correctly
- [ ] Recommendations work when resume is available
- [ ] Graceful fallback when no resume
- [ ] Firm research returns useful information
- [ ] Conversation history maintained in session
- [ ] Loading states show correctly
- [ ] Works without any search results
- [ ] Works with search results
- [ ] Message formatting (markdown) works
- [ ] Auto-scroll to latest message works

## User Experience Flow

1. **User lands on `/firm-search`**
   - Scout button visible in top-right (via PageHeaderActions)
   - No popup open initially

2. **User clicks Scout button**
   - Popup window appears (draggable/resizable, same as existing Scout)
   - Welcome message shows based on current state
   - Quick actions displayed

3. **User asks for help**
   - Types message or clicks quick action
   - Loading indicator shows
   - Scout responds with suggestions
   - Action buttons appear if applicable

4. **User clicks action button**
   - "Use this search" → Query field updated
   - "Find contacts at [firm]" → Navigates to contact search

5. **User continues conversation**
   - History maintained
   - Context-aware responses
   - Can ask follow-up questions

6. **User can drag/resize popup**
   - Same interaction as existing Scout popup
   - Position and size persist during session

## Edge Cases & Error Handling

### Backend
- Missing firm context → Return helpful error
- Missing user resume for recommendations → Suggest uploading resume
- No search results → Suggest running a search first
- LLM timeout → Return fallback response
- Invalid firm name in research → Ask for clarification

### Frontend
- Network error → Show error message
- Empty response → Show fallback message
- Invalid firm name → Show "firm not found" toast
- Sidebar close during request → Cancel request gracefully

## Performance Considerations

- **Backend**: Use async/await for all LLM calls
- **Backend**: Set reasonable timeouts (10-12s for LLM calls)
- **Backend**: Cache firm research results if possible
- **Frontend**: Debounce input if needed
- **Frontend**: Lazy load Scout component (already lazy loaded via React.lazy)
- **Frontend**: Limit conversation history to last 6-10 messages

## Future Enhancements

1. **Search builder wizard**: Step-by-step Q&A to build perfect query
2. **Firm comparison**: "Compare Goldman vs Morgan Stanley for my profile"
3. **Industry deep-dives**: "Tell me about healthcare investment banking as a career"
4. **Alumni finder**: "Find USC alumni at my top firms"
5. **Application tracker**: "Track which firms I've reached out to"
6. **Auto-refresh insights**: When new results come in, Scout proactively highlights best fits

## Dependencies

### Backend
- Existing `scout_service.py` infrastructure
- OpenAI client (already configured)
- No new dependencies required

### Frontend
- Existing UI components (Button, Input, Card, etc.)
- Lucide React icons (already in use)
- ScoutHeaderButton pattern (draggable/resizable popup)
- No new dependencies required

## Estimated Implementation Time

- **Backend**: 2-3 hours
  - Endpoint: 30 minutes
  - Handlers: 1.5-2 hours
  - Testing: 30 minutes

- **Frontend**: 3-4 hours
  - Component creation: 2 hours
  - Integration: 1 hour
  - Testing & polish: 1 hour

**Total**: ~5-7 hours

## Next Steps

1. ✅ Review this plan
2. ⏳ Implement backend endpoint
3. ⏳ Implement backend handlers
4. ⏳ Create ScoutFirmAssistant component
5. ⏳ Integrate into FirmSearchPage
6. ⏳ Test all flows
7. ⏳ Deploy and monitor
