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
        id: "realtime-123".to_string(),
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
fn test_interaction_posted_event() {
    let state = EditorState::default();
    let interaction = create_test_interaction();
    
    let action = Action::InteractionPosted { 
        interaction: interaction.clone() 
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should add interaction to state
    assert!(new_state.interactions.contains_key("realtime-123"));
    assert_eq!(new_state.interactions.get("realtime-123"), Some(&interaction));
    assert!(effects.is_empty());
}

#[test]
fn test_interaction_processing_event() {
    let state = EditorState::default();
    let interaction = create_test_interaction();
    state.interactions.insert(interaction.id.clone(), interaction);
    
    let action = Action::InteractionProcessing {
        interaction_id: "realtime-123".to_string(),
        agent_id: "wake".to_string(),
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should add processing event to history
    let interaction = new_state.interactions.get("realtime-123").unwrap();
    assert_eq!(interaction.history.len(), 1);
    assert_eq!(interaction.history[0].agent_id, "wake");
    assert_eq!(interaction.history[0].action, "processing");
    assert!(effects.is_empty());
}

#[test]
fn test_interaction_processing_nonexistent() {
    let state = EditorState::default();
    
    let action = Action::InteractionProcessing {
        interaction_id: "nonexistent".to_string(),
        agent_id: "wake".to_string(),
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should not crash, just ignore
    assert_eq!(new_state, state);
    assert!(effects.is_empty());
}

#[test]
fn test_interaction_completed_event() {
    let state = EditorState::default();
    let interaction = create_test_interaction();
    state.interactions.insert(interaction.id.clone(), interaction);
    
    let result = serde_json::json!({
        "response": "Task completed successfully"
    });
    
    let action = Action::InteractionCompleted {
        interaction_id: "realtime-123".to_string(),
        result: result.clone(),
    };
    
    let (new_state, effects) = reduce(&state, &action);
    
    // Should mark as no longer needs work
    let interaction = new_state.interactions.get("realtime-123").unwrap();
    assert_eq!(interaction.needs_work, false);
    
    // Should add completion event to history
    assert_eq!(interaction.history.len(), 1);
    assert_eq!(interaction.history[0].agent_id, "system");
    assert_eq!(interaction.history[0].action, "completed");
    assert_eq!(interaction.history[0].content, result);
    
    assert!(effects.is_empty());
}

#[test]
fn test_queue_status_update() {
    let state = EditorState::default();
    
    let queue_status = crate::types::InteractionQueueStatus {
        queue_size: 10,
        needs_work: 5,
        needs_review: 3,
        processing: 2,
        completed: 20,
        analyzing: 1,
    };
    
    let action = Action::UpdateQueueStatus(queue_status.clone());
    
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.queue_status, Some(queue_status));
    assert!(effects.is_empty());
}

#[test]
fn test_connection_lifecycle() {
    let state = EditorState::default();
    
    // Test connect
    let action = Action::Connect { 
        server_url: "http://localhost:3456".to_string() 
    };
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(effects.len(), 1);
    match &effects[0] {
        Effect::ConnectToStream { server_url, session_id } => {
            assert_eq!(server_url, "http://localhost:3456");
            assert_eq!(session_id, "default-session");
        }
        _ => panic!("Expected ConnectToStream effect"),
    }
    
    // Test connected
    let action = Action::Connected;
    let (new_state, effects) = reduce(&new_state, &action);
    
    assert_eq!(new_state.connected, true);
    assert_eq!(new_state.error, None);
    assert_eq!(effects.len(), 1);
    assert!(matches!(effects[0], Effect::FetchQueueStatus));
    
    // Test disconnected
    let action = Action::Disconnected { 
        reason: Some("Network error".to_string()) 
    };
    let (new_state, effects) = reduce(&new_state, &action);
    
    assert_eq!(new_state.connected, false);
    assert_eq!(new_state.error, Some("Disconnected: Network error".to_string()));
    assert!(effects.is_empty());
}

#[test]
fn test_error_handling() {
    let state = EditorState::default();
    
    // Set error
    let action = Action::SetError { 
        message: "Something went wrong".to_string() 
    };
    let (new_state, effects) = reduce(&state, &action);
    
    assert_eq!(new_state.error, Some("Something went wrong".to_string()));
    assert!(effects.is_empty());
    
    // Clear error
    let action = Action::ClearError;
    let (new_state, effects) = reduce(&new_state, &action);
    
    assert_eq!(new_state.error, None);
    assert!(effects.is_empty());
}