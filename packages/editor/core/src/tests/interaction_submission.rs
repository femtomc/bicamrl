use crate::{
    state::EditorState, 
    actions::Action, 
    effects::Effect,
    reducer::reduce, 
    types::{Interaction, InteractionType}
};
use pretty_assertions::assert_eq;
use chrono::Utc;
use std::collections::HashMap;

fn create_test_interaction() -> Interaction {
    Interaction {
        id: "test-123".to_string(),
        source: "user".to_string(),
        interaction_type: InteractionType::Query,
        content: vec![],
        needs_work: true,
        review_stack: vec!["user".to_string()],
        history: vec![],
        metadata: HashMap::new(),
        timestamp: Utc::now(),
    }
}

#[test]
fn test_submit_interaction_when_connected() {
    let mut state = EditorState::default();
    state.connected = true;
    state.draft.content = "Test interaction".to_string();
    state.draft.interaction_type = InteractionType::Query;
    
    let action = Action::SubmitInteraction;
    
    let (new_state, effects) = reduce(&state, &action);
    
    // State should not change yet (waiting for response)
    assert_eq!(new_state.draft.content, "Test interaction");
    
    // Should create submit effect
    assert_eq!(effects.len(), 1);
    match &effects[0] {
        Effect::SubmitInteraction { session_id, content, interaction_type, .. } => {
            assert_eq!(session_id, "default-session");
            assert_eq!(content, "Test interaction");
            assert_eq!(interaction_type, &InteractionType::Query);
        }
        _ => panic!("Expected SubmitInteraction effect"),
    }
}

#[test]
fn test_submit_interaction_when_disconnected() {
    let mut state = EditorState::default();
    state.connected = false;
    state.draft.content = "Test interaction".to_string();
    
    let action = Action::SubmitInteraction;
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should set error
    assert_eq!(new_state.error, Some("Not connected to server".to_string()));
    
    // No effects
    assert!(effects.is_empty());
}

#[test]
fn test_submit_empty_interaction() {
    let mut state = EditorState::default();
    state.connected = true;
    state.draft.content = "".to_string();
    
    let action = Action::SubmitInteraction;
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should not submit empty content
    assert!(effects.is_empty());
    assert_eq!(new_state.error, None);
}

#[test]
fn test_interaction_submitted_success() {
    let mut state = EditorState::default();
    state.draft.content = "Test content".to_string();
    
    let interaction = create_test_interaction();
    let action = Action::InteractionSubmitted(Ok(interaction.clone()));
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should add interaction to state
    assert!(new_state.interactions.contains_key("test-123"));
    assert_eq!(new_state.interactions.get("test-123"), Some(&interaction));
    
    // Should clear draft content
    assert_eq!(new_state.draft.content, "");
    
    // Should clear any errors
    assert_eq!(new_state.error, None);
    
    assert!(effects.is_empty());
}

#[test]
fn test_interaction_submitted_error() {
    let state = EditorState::default();
    let action = Action::InteractionSubmitted(Err("Network error".to_string()));
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should set error
    assert_eq!(new_state.error, Some("Network error".to_string()));
    
    // Should not clear draft content on error
    assert_eq!(new_state.draft.content, state.draft.content);
    
    assert!(effects.is_empty());
}

#[test]
fn test_pending_reviews_updated_after_interaction_added() {
    let state = EditorState::default();
    
    let mut interaction = create_test_interaction();
    interaction.needs_work = false;
    interaction.review_stack = vec!["user".to_string()];
    
    let action = Action::InteractionSubmitted(Ok(interaction));
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should update pending reviews
    assert_eq!(new_state.pending_reviews, vec!["test-123"]);
    assert!(effects.is_empty());
}