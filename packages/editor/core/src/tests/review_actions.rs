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

fn create_test_interaction_for_review() -> Interaction {
    Interaction {
        id: "review-123".to_string(),
        source: "user".to_string(),
        interaction_type: InteractionType::Query,
        content: vec![],
        needs_work: false,
        review_stack: vec!["user".to_string()],
        history: vec![],
        metadata: HashMap::new(),
        timestamp: Utc::now(),
    }
}

#[test]
fn test_submit_review_for_existing_interaction() {
    let mut state = EditorState::default();
    let interaction = create_test_interaction_for_review();
    state.interactions.insert(interaction.id.clone(), interaction);
    
    let action = Action::SubmitReview {
        interaction_id: "review-123".to_string(),
        approved: true,
        feedback: Some("Looks good!".to_string()),
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    // State unchanged until response
    assert_eq!(new_state.interactions.len(), 1);
    
    // Should create review effect
    assert_eq!(effects.len(), 1);
    match &effects[0] {
        Effect::SubmitReview { interaction_id, approved, feedback } => {
            assert_eq!(interaction_id, "review-123");
            assert_eq!(*approved, true);
            assert_eq!(feedback, &Some("Looks good!".to_string()));
        }
        _ => panic!("Expected SubmitReview effect"),
    }
}

#[test]
fn test_submit_review_for_nonexistent_interaction() {
    let state = EditorState::default();
    
    let action = Action::SubmitReview {
        interaction_id: "nonexistent".to_string(),
        approved: true,
        feedback: None,
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should not create effect for nonexistent interaction
    assert!(effects.is_empty());
    assert_eq!(new_state, state);
}

#[test]
fn test_review_submitted_success() {
    let mut state = EditorState::default();
    state.error = Some("Previous error".to_string());
    
    let action = Action::ReviewSubmitted(Ok(()));
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should clear errors
    assert_eq!(new_state.error, None);
    assert!(effects.is_empty());
}

#[test]
fn test_review_submitted_error() {
    let state = EditorState::default();
    
    let action = Action::ReviewSubmitted(Err("Review failed".to_string()));
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should set error
    assert_eq!(new_state.error, Some("Review failed".to_string()));
    assert!(effects.is_empty());
}

#[test]
fn test_pending_reviews_tracking() {
    let mut state = EditorState::default();
    
    // Add multiple interactions
    let mut interaction1 = create_test_interaction_for_review();
    interaction1.id = "review-1".to_string();
    
    let mut interaction2 = create_test_interaction_for_review();
    interaction2.id = "review-2".to_string();
    
    let mut interaction3 = create_test_interaction_for_review();
    interaction3.id = "review-3".to_string();
    interaction3.needs_work = true; // Still processing
    
    let mut interaction4 = create_test_interaction_for_review();
    interaction4.id = "review-4".to_string();
    interaction4.review_stack = vec!["wake".to_string()]; // Not for user
    
    state.interactions.insert(interaction1.id.clone(), interaction1);
    state.interactions.insert(interaction2.id.clone(), interaction2);
    state.interactions.insert(interaction3.id.clone(), interaction3);
    state.interactions.insert(interaction4.id.clone(), interaction4);
    
    // Trigger any action to update pending reviews
    let action = Action::ClearError;
    let (new_state, _) = reduce(&state, &action);
    
    // Should only include interactions ready for user review
    assert_eq!(new_state.pending_reviews.len(), 2);
    assert!(new_state.pending_reviews.contains(&"review-1".to_string()));
    assert!(new_state.pending_reviews.contains(&"review-2".to_string()));
}