# Bicamrl Editor Core - State Management

## Overview

This package provides UI-agnostic state management for the Bicamrl editor. It implements a pure functional state machine that can be used by any frontend (GUI, TUI, CLI).

## Architecture

### State-Action-Effect Pattern

```
Action → Reducer → (NewState, Effects)
```

1. **Actions**: User intents and system events
2. **State**: Immutable application state
3. **Reducer**: Pure function that transforms state
4. **Effects**: Side effects to be performed (API calls, etc)

### Core Components

#### EditorState
The complete application state:
- `interactions`: All known interactions (HashMap)
- `draft`: Current interaction being composed
- `queue_status`: Real-time queue statistics
- `pending_reviews`: Interactions awaiting user review
- `connected`: Connection status
- `error`: Current error message (if any)

#### Actions
All possible state transitions:
- Draft management (content, type, review stack, metadata)
- Interaction submission
- Review submission
- Real-time event handling
- Connection management
- Error handling

#### Effects
Side effects that frontends must handle:
- `SubmitInteraction`: POST to server API
- `SubmitReview`: Submit review feedback
- `ConnectToStream`: Establish SSE connection
- `FetchQueueStatus`: Get queue statistics

## State Transitions

### Draft Management
```
UpdateDraftContent → Updates draft.content
SetDraftType → Updates draft.interaction_type
AddToReviewStack → Appends reviewer (no duplicates)
RemoveFromReviewStack → Removes reviewer
ReorderReviewStack → Reorders reviewers
SetDraftMetadata → Updates draft.metadata
ClearDraft → Resets to default draft
```

### Interaction Lifecycle
```
1. SubmitInteraction → Creates SubmitInteraction effect
2. InteractionSubmitted(Ok) → Adds to state, clears draft
3. InteractionPosted (SSE) → Updates interaction
4. InteractionProcessing (SSE) → Adds to history
5. InteractionCompleted (SSE) → Sets needs_work=false
```

### Review Process
```
1. Interaction completed with user in review_stack
2. Appears in pending_reviews
3. SubmitReview → Creates SubmitReview effect
4. ReviewSubmitted(Ok) → Clears errors
```

## Testing

Every state transition is tested:
- Draft management operations
- Interaction submission flow
- Review actions
- Real-time event handling
- Error states
- Connection lifecycle

Run tests:
```bash
cd packages/editor/core
cargo test
```

## Usage Example

```rust
use bicamrl_editor_core::{EditorState, Action, reduce};

// Initialize state
let mut state = EditorState::default();

// User types content
let action = Action::UpdateDraftContent { 
    content: "Hello agents!".to_string() 
};
let (new_state, effects) = reduce(&state, &action);
state = new_state;

// User submits interaction
let action = Action::SubmitInteraction;
let (new_state, effects) = reduce(&state, &action);

// Handle effects (in UI layer)
for effect in effects {
    match effect {
        Effect::SubmitInteraction { .. } => {
            // Make API call
        }
        _ => {}
    }
}
```

## Frontend Integration

Frontends should:
1. Render UI based on EditorState
2. Dispatch Actions on user input
3. Call reduce() to get new state
4. Handle Effects (API calls, etc)
5. Dispatch result Actions (success/error)

This separation ensures:
- Testable business logic
- UI framework independence
- Consistent behavior across frontends
- Easy debugging (action log = audit trail)

## Development Rules

Follow the main project's communication style: Be direct and ruthlessly honest. No pleasantries or unnecessary acknowledgments. Quality and accuracy over agreeableness.