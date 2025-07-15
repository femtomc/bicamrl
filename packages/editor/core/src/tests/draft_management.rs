use crate::{state::EditorState, actions::Action, reducer::reduce, types::InteractionType};
use pretty_assertions::assert_eq;

#[test]
fn test_update_draft_content() {
    let state = EditorState::default();
    let action = Action::UpdateDraftContent { 
        content: "Hello, agents!".to_string() 
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.draft.content, "Hello, agents!");
    assert!(effects.is_empty());
}

#[test]
fn test_set_draft_type() {
    let state = EditorState::default();
    let action = Action::SetDraftType { 
        interaction_type: InteractionType::Action 
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.draft.interaction_type, InteractionType::Action);
    assert!(effects.is_empty());
}

#[test]
fn test_add_to_review_stack() {
    let state = EditorState::default();
    let action = Action::AddToReviewStack { 
        reviewer_id: "wake".to_string() 
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.draft.review_stack, vec!["user", "wake"]);
    assert!(effects.is_empty());
}

#[test]
fn test_add_duplicate_to_review_stack() {
    let state = EditorState::default();
    let action = Action::AddToReviewStack { 
        reviewer_id: "user".to_string() 
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should not add duplicate
    assert_eq!(new_state.draft.review_stack, vec!["user"]);
    assert!(effects.is_empty());
}

#[test]
fn test_remove_from_review_stack() {
    let mut state = EditorState::default();
    state.draft.review_stack = vec!["user".to_string(), "wake".to_string(), "sleep".to_string()];
    
    let action = Action::RemoveFromReviewStack { 
        reviewer_id: "wake".to_string() 
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.draft.review_stack, vec!["user", "sleep"]);
    assert!(effects.is_empty());
}

#[test]
fn test_reorder_review_stack() {
    let mut state = EditorState::default();
    state.draft.review_stack = vec!["user".to_string(), "wake".to_string(), "sleep".to_string()];
    
    let action = Action::ReorderReviewStack { 
        from_index: 0,
        to_index: 2 
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.draft.review_stack, vec!["wake", "sleep", "user"]);
    assert!(effects.is_empty());
}

#[test]
fn test_reorder_review_stack_out_of_bounds() {
    let mut state = EditorState::default();
    state.draft.review_stack = vec!["user".to_string(), "wake".to_string()];
    
    let action = Action::ReorderReviewStack { 
        from_index: 0,
        to_index: 5 
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should not change when indices are out of bounds
    assert_eq!(new_state.draft.review_stack, vec!["user", "wake"]);
    assert!(effects.is_empty());
}

#[test]
fn test_set_draft_metadata() {
    let state = EditorState::default();
    let action = Action::SetDraftMetadata { 
        key: "priority".to_string(),
        value: serde_json::json!("high")
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.draft.metadata.get("priority"), Some(&serde_json::json!("high")));
    assert!(effects.is_empty());
}

#[test]
fn test_clear_draft() {
    let mut state = EditorState::default();
    state.draft.content = "Some content".to_string();
    state.draft.interaction_type = InteractionType::Feedback;
    state.draft.review_stack = vec!["user".to_string(), "wake".to_string()];
    state.draft.metadata.insert("key".to_string(), serde_json::json!("value"));
    
    let action = Action::ClearDraft;
    
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.draft.content, "");
    assert_eq!(new_state.draft.interaction_type, InteractionType::Query);
    assert_eq!(new_state.draft.review_stack, vec!["user"]);
    assert!(new_state.draft.metadata.is_empty());
    assert!(effects.is_empty());
}