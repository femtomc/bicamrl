use crate::{Action, EditorState, Effect, reduce};
use crate::types::*;
use std::collections::HashMap;

#[cfg(test)]
mod reducer_tests {
    use super::*;

    // Helper to create a test interaction
    fn create_test_interaction(id: &str) -> Interaction {
        Interaction {
            id: id.to_string(),
            session_id: "default-session".to_string(),
            interaction_type: InteractionType::Query,
            content: InteractionContent::Text {
                text: format!("Test interaction {}", id),
            },
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            review_stack: vec!["user".to_string()],
            needs_work: false,
            processing_history: vec![],
            metadata: HashMap::new(),
        }
    }

    mod draft_actions {
        use super::*;

        #[test]
        fn test_update_draft_content() {
            let state = EditorState::default();
            let action = Action::UpdateDraftContent {
                content: "Hello, world!".to_string(),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.draft.content, "Hello, world!");
            assert!(effects.is_empty());
        }

        #[test]
        fn test_set_draft_type() {
            let state = EditorState::default();
            let action = Action::SetDraftType {
                interaction_type: InteractionType::Action,
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.draft.interaction_type, InteractionType::Action);
            assert!(effects.is_empty());
        }

        #[test]
        fn test_add_to_review_stack() {
            let state = EditorState::default();
            let action = Action::AddToReviewStack {
                reviewer: "agent1".to_string(),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.draft.review_stack, vec!["user".to_string(), "agent1".to_string()]);
            assert!(effects.is_empty());
        }

        #[test]
        fn test_add_duplicate_to_review_stack() {
            let mut state = EditorState::default();
            state.draft.review_stack = vec!["user".to_string(), "agent1".to_string()];
            
            let action = Action::AddToReviewStack {
                reviewer: "agent1".to_string(),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            // Should not add duplicate
            assert_eq!(new_state.draft.review_stack, vec!["user".to_string(), "agent1".to_string()]);
            assert!(effects.is_empty());
        }

        #[test]
        fn test_remove_from_review_stack() {
            let mut state = EditorState::default();
            state.draft.review_stack = vec!["user".to_string(), "agent1".to_string(), "agent2".to_string()];
            
            let action = Action::RemoveFromReviewStack {
                reviewer: "agent1".to_string(),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.draft.review_stack, vec!["user".to_string(), "agent2".to_string()]);
            assert!(effects.is_empty());
        }

        #[test]
        fn test_reorder_review_stack() {
            let mut state = EditorState::default();
            state.draft.review_stack = vec!["user".to_string(), "agent1".to_string(), "agent2".to_string()];
            
            let action = Action::ReorderReviewStack {
                reviewers: vec!["agent2".to_string(), "user".to_string(), "agent1".to_string()],
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.draft.review_stack, vec!["agent2".to_string(), "user".to_string(), "agent1".to_string()]);
            assert!(effects.is_empty());
        }

        #[test]
        fn test_set_draft_metadata() {
            let state = EditorState::default();
            let mut metadata = HashMap::new();
            metadata.insert("key1".to_string(), "value1".to_string());
            metadata.insert("key2".to_string(), "value2".to_string());
            
            let action = Action::SetDraftMetadata { metadata: metadata.clone() };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.draft.metadata, metadata);
            assert!(effects.is_empty());
        }

        #[test]
        fn test_clear_draft() {
            let mut state = EditorState::default();
            state.draft.content = "Some content".to_string();
            state.draft.interaction_type = InteractionType::Action;
            state.draft.review_stack = vec!["user".to_string(), "agent1".to_string()];
            state.draft.metadata.insert("key".to_string(), "value".to_string());
            
            let action = Action::ClearDraft;
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.draft.content, "");
            assert_eq!(new_state.draft.interaction_type, InteractionType::Query);
            assert_eq!(new_state.draft.review_stack, vec!["user".to_string()]);
            assert!(new_state.draft.metadata.is_empty());
            assert!(effects.is_empty());
        }
    }

    mod interaction_actions {
        use super::*;

        #[test]
        fn test_submit_interaction() {
            let mut state = EditorState::default();
            state.draft.content = "Test query".to_string();
            state.draft.interaction_type = InteractionType::Query;
            
            let action = Action::SubmitInteraction;
            
            let (new_state, effects) = reduce(&state, &action);
            
            // State shouldn't change yet
            assert_eq!(new_state, state);
            
            // Should produce submit effect
            assert_eq!(effects.len(), 1);
            match &effects[0] {
                Effect::SubmitInteraction { session_id, draft } => {
                    assert_eq!(session_id, "default-session");
                    assert_eq!(draft.content, "Test query");
                    assert_eq!(draft.interaction_type, InteractionType::Query);
                }
                _ => panic!("Expected SubmitInteraction effect"),
            }
        }

        #[test]
        fn test_interaction_submitted_success() {
            let mut state = EditorState::default();
            state.draft.content = "Will be cleared".to_string();
            
            let interaction = create_test_interaction("test1");
            let action = Action::InteractionSubmitted {
                result: Ok(interaction.clone()),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            // Should add interaction and clear draft
            assert!(new_state.interactions.contains_key("test1"));
            assert_eq!(new_state.draft.content, "");
            assert!(effects.is_empty());
        }

        #[test]
        fn test_interaction_submitted_error() {
            let state = EditorState::default();
            let action = Action::InteractionSubmitted {
                result: Err("Failed to submit".to_string()),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.error, Some("Failed to submit".to_string()));
            assert!(effects.is_empty());
        }

        #[test]
        fn test_interaction_posted() {
            let state = EditorState::default();
            let interaction = create_test_interaction("test1");
            
            let action = Action::InteractionPosted { interaction: interaction.clone() };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert!(new_state.interactions.contains_key("test1"));
            assert_eq!(new_state.interactions.get("test1").unwrap(), &interaction);
            assert!(effects.is_empty());
        }

        #[test]
        fn test_interaction_processing() {
            let mut state = EditorState::default();
            let mut interaction = create_test_interaction("test1");
            state.interactions.insert("test1".to_string(), interaction.clone());
            
            let processing = ProcessingHistoryEntry {
                agent_id: "agent1".to_string(),
                timestamp: "2024-01-01T00:01:00Z".to_string(),
                action: "Processing query".to_string(),
            };
            
            let action = Action::InteractionProcessing {
                interaction_id: "test1".to_string(),
                processing: processing.clone(),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            let updated = new_state.interactions.get("test1").unwrap();
            assert_eq!(updated.processing_history.len(), 1);
            assert_eq!(updated.processing_history[0], processing);
            assert!(effects.is_empty());
        }

        #[test]
        fn test_interaction_completed() {
            let mut state = EditorState::default();
            let mut interaction = create_test_interaction("test1");
            interaction.needs_work = true;
            state.interactions.insert("test1".to_string(), interaction);
            
            let action = Action::InteractionCompleted {
                interaction_id: "test1".to_string(),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            let updated = new_state.interactions.get("test1").unwrap();
            assert!(!updated.needs_work);
            assert!(effects.is_empty());
        }
    }

    mod review_actions {
        use super::*;

        #[test]
        fn test_submit_review() {
            let state = EditorState::default();
            let feedback = ReviewFeedback {
                approved: true,
                suggestions: Some("Great work!".to_string()),
            };
            
            let action = Action::SubmitReview {
                interaction_id: "test1".to_string(),
                feedback: feedback.clone(),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            // State shouldn't change yet
            assert_eq!(new_state, state);
            
            // Should produce submit effect
            assert_eq!(effects.len(), 1);
            match &effects[0] {
                Effect::SubmitReview { interaction_id, feedback: f } => {
                    assert_eq!(interaction_id, "test1");
                    assert_eq!(f, &feedback);
                }
                _ => panic!("Expected SubmitReview effect"),
            }
        }

        #[test]
        fn test_review_submitted_success() {
            let mut state = EditorState::default();
            state.error = Some("Previous error".to_string());
            
            let action = Action::ReviewSubmitted { result: Ok(()) };
            
            let (new_state, effects) = reduce(&state, &action);
            
            // Should clear error
            assert!(new_state.error.is_none());
            assert!(effects.is_empty());
        }

        #[test]
        fn test_review_submitted_error() {
            let state = EditorState::default();
            let action = Action::ReviewSubmitted {
                result: Err("Failed to submit review".to_string()),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.error, Some("Failed to submit review".to_string()));
            assert!(effects.is_empty());
        }
    }

    mod system_actions {
        use super::*;

        #[test]
        fn test_queue_status_updated() {
            let state = EditorState::default();
            let status = InteractionQueueStatus {
                total_pending: 5,
                processing: 2,
                waiting_review: 3,
                estimated_wait_seconds: Some(30),
            };
            
            let action = Action::QueueStatusUpdated { status: status.clone() };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.queue_status, Some(status));
            assert!(effects.is_empty());
        }

        #[test]
        fn test_connected() {
            let mut state = EditorState::default();
            state.error = Some("Connection error".to_string());
            
            let action = Action::Connected;
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert!(new_state.connected);
            assert!(new_state.error.is_none());
            assert!(effects.is_empty());
        }

        #[test]
        fn test_disconnected() {
            let mut state = EditorState::default();
            state.connected = true;
            
            let action = Action::Disconnected {
                reason: Some("Network error".to_string()),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert!(!new_state.connected);
            assert_eq!(new_state.error, Some("Network error".to_string()));
            assert!(effects.is_empty());
        }

        #[test]
        fn test_disconnected_no_reason() {
            let mut state = EditorState::default();
            state.connected = true;
            
            let action = Action::Disconnected { reason: None };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert!(!new_state.connected);
            assert!(new_state.error.is_none());
            assert!(effects.is_empty());
        }

        #[test]
        fn test_error_occurred() {
            let state = EditorState::default();
            let action = Action::ErrorOccurred {
                error: "Something went wrong".to_string(),
            };
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert_eq!(new_state.error, Some("Something went wrong".to_string()));
            assert!(effects.is_empty());
        }

        #[test]
        fn test_clear_error() {
            let mut state = EditorState::default();
            state.error = Some("Previous error".to_string());
            
            let action = Action::ClearError;
            
            let (new_state, effects) = reduce(&state, &action);
            
            assert!(new_state.error.is_none());
            assert!(effects.is_empty());
        }
    }

    mod initial_actions {
        use super::*;

        #[test]
        fn test_initialize() {
            let state = EditorState::default();
            let action = Action::Initialize;
            
            let (new_state, effects) = reduce(&state, &action);
            
            // State shouldn't change
            assert_eq!(new_state, state);
            
            // Should produce connect effect
            assert_eq!(effects.len(), 1);
            match &effects[0] {
                Effect::ConnectToStream { session_id } => {
                    assert_eq!(session_id, "default-session");
                }
                _ => panic!("Expected ConnectToStream effect"),
            }
        }

        #[test]
        fn test_fetch_queue_status() {
            let state = EditorState::default();
            let action = Action::FetchQueueStatus;
            
            let (new_state, effects) = reduce(&state, &action);
            
            // State shouldn't change
            assert_eq!(new_state, state);
            
            // Should produce fetch effect
            assert_eq!(effects.len(), 1);
            match &effects[0] {
                Effect::FetchQueueStatus => {}
                _ => panic!("Expected FetchQueueStatus effect"),
            }
        }
    }
}