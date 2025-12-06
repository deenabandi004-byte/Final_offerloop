# Offerloop Timeline Feature Implementation

## Context
You are implementing an AI-powered Interactive Recruiting Timeline feature for Offerloop.ai. The feature lets users generate personalized recruiting timelines from natural language prompts, visualize phases on a draggable timeline, and persist data to Firebase.

## Files Being Added/Modified

### New Files:
- `src/types/timeline.ts` - TypeScript interfaces for TimelinePhase, TimelineData
- `src/components/RecruitingTimelineForm.tsx` - Form for entering recruiting goals
- `src/components/InteractiveTimeline.tsx` - Visual draggable timeline with "You Are Here" indicator
- `src/components/PersonalizedRecruitingTimeline.tsx` - Wrapper that orchestrates form, API, Firebase
- `app/routes/timeline.py` - Flask backend route for OpenAI timeline generation

### Modified Files:
- `src/services/api.ts` - Add `generateTimeline()` method to ApiService
- `src/services/firebaseApi.ts` - Add `saveTimeline()` and `getTimeline()` methods
- `src/components/Dashboard.tsx` - Import and render PersonalizedRecruitingTimeline
- `app/__init__.py` - Register timeline_bp blueprint
- `wsgi.py` - Register timeline_bp blueprint

## Technical Requirements

### Backend (Flask):
- Endpoint: `POST /api/timeline/generate`
- Use `@require_firebase_auth` decorator
- Use OpenAI GPT-4 with `response_format={"type": "json_object"}`
- Extract structured fields (role, industry, dates) from natural language
- Support both new generation and updates via `isUpdate` flag
- Return: `{ success, timeline: { phases }, startDate, targetDeadline }`

### Frontend:
- Use framer-motion for animations
- Timeline gradient: `from-pink-500 to-purple-500`
- Phase cards: draggable with inline editing
- "You Are Here" indicator with pulsing animation at current month
- Persist to Firebase user document under `timeline` field
- Load saved timeline on component mount

### Timeline Phase Structure:
```typescript
interface TimelinePhase {
  name: string;
  startMonth: string;  // "Jan 2024" format
  endMonth: string;
  goals: string[];
  description: string;
}
```

## Design System
- Cards: `bg-card border border-border rounded-xl`
- Active phase: `bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-purple-600/20`
- Timeline line: `linear-gradient(to right, #8B5CF6, #D946EF)`
- Use existing Offerloop components: Button, Input, Textarea, Label from `@/components/ui`

## Key Behaviors
1. No timeline saved → Show RecruitingTimelineForm
2. Timeline exists → Show InteractiveTimeline + update form below
3. On generate → Call API → Update state → Save to Firebase (background)
4. On drag/edit → Update local state → Save to Firebase
5. On mount → Load saved timeline from Firebase

## Error Handling
- Toast notifications for success/failure
- Loading states with Loader2 spinner
- Fallback to gpt-4-turbo if gpt-4 fails
- Strip markdown code blocks from OpenAI response if present
