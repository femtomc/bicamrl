use crate::{Action, EditorState, Effect, reduce};
use crate::types::*;
use std::collections::HashMap;

#[cfg(test)]
mod integration_tests {
    use super::*;

    // Helper to apply a sequence of actions
    fn apply_actions(initial_state: &EditorState, actions: Vec<Action>) -> (EditorState, Vec<Effect>) {
        let mut state = initial_state.clone();
        let mut all_effects = Vec::new();
        
        for action in actions {
            let (new_state, effects) = reduce(&state, &action);
            state = new_state;
            all_effects.extend(effects);
        }
        
        (state, all_effects)
    }

    #[test]
    fn test_complete_interaction_flow() {
        let initial_state = EditorState::default();
        
        // User drafts an interaction
        let actions = vec![
            Action::UpdateDraftContent {
                content: "Help me understand Rust lifetimes".to_string(),
            },
            Action::SetDraftType {
                interaction_type: InteractionType::Query,
            },
            Action::AddToReviewStack {
                reviewer: "wake".to_string(),
            },
            Action::AddToReviewStack {
                reviewer: "sleep".to_string(),
            },
        ];
        
        let (state, effects) = apply_actions(&initial_state, actions);
        
        // Verify draft state
        assert_eq!(state.draft.content, "Help me understand Rust lifetimes");
        assert_eq!(state.draft.interaction_type, InteractionType::Query);
        assert_eq!(state.draft.review_stack, vec!["user".to_string(), "wake".to_string(), "sleep".to_string()]);
        assert!(effects.is_empty());
        
        // Submit the interaction
        let (state, effects) = reduce(&state, &Action::SubmitInteraction);
        
        // Should produce submit effect
        assert_eq!(effects.len(), 1);
        match &effects[0] {
            Effect::SubmitInteraction { draft, .. } => {
                assert_eq!(draft.content, "Help me understand Rust lifetimes");
            }
            _ => panic!("Expected SubmitInteraction effect"),
        }
        
        // Simulate server response
        let interaction = Interaction {
            id: "int-001".to_string(),
            session_id: "default-session".to_string(),
            interaction_type: InteractionType::Query,
            content: InteractionContent::Text {
                text: "Help me understand Rust lifetimes".to_string(),
            },
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            review_stack: vec!["user".to_string(), "wake".to_string(), "sleep".to_string()],
            needs_work: true,
            processing_history: vec![],
            metadata: HashMap::new(),
        };
        
        let (state, _) = reduce(&state, &Action::InteractionSubmitted { result: Ok(interaction) });
        
        // Draft should be cleared, interaction added
        assert_eq!(state.draft.content, "");
        assert!(state.interactions.contains_key("int-001"));
        
        // Simulate processing updates
        let processing = ProcessingHistoryEntry {
            agent_id: "wake".to_string(),
            timestamp: "2024-01-01T00:00:30Z".to_string(),
            action: "Analyzing query about Rust lifetimes".to_string(),
        };
        
        let (state, _) = reduce(&state, &Action::InteractionProcessing {
            interaction_id: "int-001".to_string(),
            processing,
        });
        
        let interaction = state.interactions.get("int-001").unwrap();
        assert_eq!(interaction.processing_history.len(), 1);
        
        // Complete the interaction
        let (state, _) = reduce(&state, &Action::InteractionCompleted {
            interaction_id: "int-001".to_string(),
        });
        
        let interaction = state.interactions.get("int-001").unwrap();
        assert!(!interaction.needs_work);
    }

    #[test]
    fn test_review_workflow() {
        let mut initial_state = EditorState::default();
        
        // Add an interaction that needs review
        let interaction = Interaction {
            id: "review-001".to_string(),
            session_id: "default-session".to_string(),
            interaction_type: InteractionType::Action,
            content: InteractionContent::Text {
                text: "Create a new Rust project".to_string(),
            },
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            review_stack: vec!["user".to_string()],
            needs_work: false,
            processing_history: vec![],
            metadata: HashMap::new(),
        };
        
        initial_state.interactions.insert("review-001".to_string(), interaction);
        
        // User submits a review
        let feedback = ReviewFeedback {
            approved: true,
            suggestions: Some("Looks good, but add error handling".to_string()),
        };
        
        let (state, effects) = reduce(&initial_state, &Action::SubmitReview {
            interaction_id: "review-001".to_string(),
            feedback: feedback.clone(),
        });
        
        // Should produce review effect
        assert_eq!(effects.len(), 1);
        match &effects[0] {
            Effect::SubmitReview { interaction_id, feedback: f } => {
                assert_eq!(interaction_id, "review-001");
                assert_eq!(f, &feedback);
            }
            _ => panic!("Expected SubmitReview effect"),
        }
        
        // Simulate successful review submission
        let (state, _) = reduce(&state, &Action::ReviewSubmitted { result: Ok(()) });
        
        // Error should be cleared (if any)
        assert!(state.error.is_none());
    }

    #[test]
    fn test_connection_lifecycle() {
        let initial_state = EditorState::default();
        
        // Initialize and connect
        let (state, effects) = reduce(&initial_state, &Action::Initialize);
        
        // Should produce connect effect
        assert_eq!(effects.len(), 1);
        match &effects[0] {
            Effect::ConnectToStream { session_id } => {
                assert_eq!(session_id, "default-session");
            }
            _ => panic!("Expected ConnectToStream effect"),
        }
        
        // Simulate connection established
        let (state, _) = reduce(&state, &Action::Connected);
        assert!(state.connected);
        assert!(state.error.is_none());
        
        // Simulate receiving queue status
        let status = InteractionQueueStatus {
            total_pending: 3,
            processing: 1,
            waiting_review: 2,
            estimated_wait_seconds: Some(15),
        };
        
        let (state, _) = reduce(&state, &Action::QueueStatusUpdated { status: status.clone() });
        assert_eq!(state.queue_status, Some(status));
        
        // Simulate disconnection
        let (state, _) = reduce(&state, &Action::Disconnected {
            reason: Some("Network error".to_string()),
        });
        
        assert!(!state.connected);
        assert_eq!(state.error, Some("Network error".to_string()));
    }

    #[test]
    fn test_error_handling_flow() {
        let mut initial_state = EditorState::default();
        initial_state.draft.content = "Test content".to_string();
        
        // Submit interaction
        let (state, _) = reduce(&initial_state, &Action::SubmitInteraction);
        
        // Simulate submission error
        let (state, _) = reduce(&state, &Action::InteractionSubmitted {
            result: Err("Server error: 500".to_string()),
        });
        
        // Error should be set
        assert_eq!(state.error, Some("Server error: 500".to_string()));
        // Draft should NOT be cleared on error
        assert_eq!(state.draft.content, "Test content");
        
        // Clear error
        let (state, _) = reduce(&state, &Action::ClearError);
        assert!(state.error.is_none());
        
        // Try again - this time successfully
        let interaction = Interaction {
            id: "retry-001".to_string(),
            session_id: "default-session".to_string(),
            interaction_type: InteractionType::Query,
            content: InteractionContent::Text {
                text: "Test content".to_string(),
            },
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            review_stack: vec!["user".to_string()],
            needs_work: true,
            processing_history: vec![],
            metadata: HashMap::new(),
        };
        
        let (state, _) = reduce(&state, &Action::InteractionSubmitted { result: Ok(interaction) });
        
        // Now draft should be cleared
        assert_eq!(state.draft.content, "");
        assert!(state.interactions.contains_key("retry-001"));
        assert!(state.error.is_none());
    }

    #[test]
    fn test_concurrent_interactions() {
        let initial_state = EditorState::default();
        
        // Simulate multiple interactions being posted via SSE
        let interactions = vec![
            Interaction {
                id: "int-001".to_string(),
                session_id: "default-session".to_string(),
                interaction_type: InteractionType::Query,
                content: InteractionContent::Text { text: "Query 1".to_string() },
                timestamp: "2024-01-01T00:00:00Z".to_string(),
                review_stack: vec!["agent1".to_string()],
                needs_work: true,
                processing_history: vec![],
                metadata: HashMap::new(),
            },
            Interaction {
                id: "int-002".to_string(),
                session_id: "default-session".to_string(),
                interaction_type: InteractionType::Action,
                content: InteractionContent::Text { text: "Action 1".to_string() },
                timestamp: "2024-01-01T00:00:05Z".to_string(),
                review_stack: vec!["agent2".to_string()],
                needs_work: true,
                processing_history: vec![],
                metadata: HashMap::new(),
            },
            Interaction {
                id: "int-003".to_string(),
                session_id: "default-session".to_string(),
                interaction_type: InteractionType::Observation,
                content: InteractionContent::Text { text: "Observation 1".to_string() },
                timestamp: "2024-01-01T00:00:10Z".to_string(),
                review_stack: vec!["user".to_string()],
                needs_work: false,
                processing_history: vec![],
                metadata: HashMap::new(),
            },
        ];
        
        // Post all interactions
        let mut state = initial_state;
        for interaction in interactions {
            let (new_state, _) = reduce(&state, &Action::InteractionPosted { interaction });
            state = new_state;
        }
        
        // Verify all interactions are stored
        assert_eq!(state.interactions.len(), 3);
        assert!(state.interactions.contains_key("int-001"));
        assert!(state.interactions.contains_key("int-002"));
        assert!(state.interactions.contains_key("int-003"));
        
        // Verify categorization
        assert_eq!(state.get_processing().len(), 2); // int-001 and int-002
        assert_eq!(state.get_review_queue().len(), 1); // int-003
        assert_eq!(state.get_completed().len(), 0);
        
        // Complete some interactions
        let (state, _) = reduce(&state, &Action::InteractionCompleted {
            interaction_id: "int-001".to_string(),
        });
        let (state, _) = reduce(&state, &Action::InteractionCompleted {
            interaction_id: "int-002".to_string(),
        });
        
        // Clear review stack to mark as fully completed
        if let Some(int3) = state.interactions.get_mut("int-003") {
            int3.review_stack.clear();
        }
        
        // Re-verify categorization
        assert_eq!(state.get_processing().len(), 0);
        assert_eq!(state.get_review_queue().len(), 0); // int-001 and int-002 have non-user reviewers
        assert_eq!(state.get_completed().len(), 1); // int-003
    }

    #[test]
    fn test_metadata_handling() {
        let initial_state = EditorState::default();
        
        // Set up draft with metadata
        let mut metadata = HashMap::new();
        metadata.insert("priority".to_string(), "high".to_string());
        metadata.insert("tags".to_string(), "rust,async".to_string());
        
        let actions = vec![
            Action::UpdateDraftContent {
                content: "Implement async runtime".to_string(),
            },
            Action::SetDraftMetadata { metadata: metadata.clone() },
        ];
        
        let (state, _) = apply_actions(&initial_state, actions);
        
        // Verify metadata is set
        assert_eq!(state.draft.metadata.get("priority"), Some(&"high".to_string()));
        assert_eq!(state.draft.metadata.get("tags"), Some(&"rust,async".to_string()));
        
        // Submit and verify metadata is preserved
        let (state, effects) = reduce(&state, &Action::SubmitInteraction);
        
        match &effects[0] {
            Effect::SubmitInteraction { draft, .. } => {
                assert_eq!(draft.metadata, metadata);
            }
            _ => panic!("Expected SubmitInteraction effect"),
        }
    }
}