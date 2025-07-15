use crate::{Action, EditorState, Effect, reduce};
use crate::types::*;
use std::collections::HashMap;

#[cfg(test)]
mod editor_state_tests {
    use super::*;

    // Helper function to create a test interaction
    fn create_test_interaction(id: &str, needs_work: bool) -> Interaction {
        Interaction {
            id: id.to_string(),
            session_id: "default-session".to_string(),
            interaction_type: InteractionType::Query,
            content: InteractionContent::Text {
                text: format!("Test interaction {}", id),
            },
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            review_stack: if needs_work {
                vec!["agent1".to_string()]
            } else {
                vec!["user".to_string()]
            },
            needs_work,
            processing_history: vec![],
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn test_default_state() {
        let state = EditorState::default();
        
        assert_eq!(state.session_id, "default-session");
        assert!(state.interactions.is_empty());
        assert_eq!(state.draft.content, "");
        assert_eq!(state.draft.interaction_type, InteractionType::Query);
        assert_eq!(state.draft.review_stack, vec!["user".to_string()]);
        assert!(state.draft.metadata.is_empty());
        assert!(state.queue_status.is_none());
        assert!(state.pending_reviews.is_empty());
        assert!(!state.connected);
        assert!(state.error.is_none());
    }

    #[test]
    fn test_get_review_queue() {
        let mut state = EditorState::default();
        
        // Add interactions with different states
        let mut interactions = HashMap::new();
        
        // Needs review by user
        interactions.insert(
            "review1".to_string(),
            create_test_interaction("review1", false),
        );
        
        // Being processed
        interactions.insert(
            "processing1".to_string(),
            create_test_interaction("processing1", true),
        );
        
        // Completed (empty review stack)
        let mut completed = create_test_interaction("completed1", false);
        completed.review_stack.clear();
        interactions.insert("completed1".to_string(), completed);
        
        // Needs review by agent (not user)
        let mut agent_review = create_test_interaction("agent_review1", false);
        agent_review.review_stack = vec!["agent2".to_string()];
        interactions.insert("agent_review1".to_string(), agent_review);
        
        state.interactions = interactions;
        
        let review_queue = state.get_review_queue();
        assert_eq!(review_queue.len(), 1);
        assert_eq!(review_queue[0].id, "review1");
    }

    #[test]
    fn test_get_processing() {
        let mut state = EditorState::default();
        
        let mut interactions = HashMap::new();
        interactions.insert(
            "proc1".to_string(),
            create_test_interaction("proc1", true),
        );
        interactions.insert(
            "proc2".to_string(),
            create_test_interaction("proc2", true),
        );
        interactions.insert(
            "done1".to_string(),
            create_test_interaction("done1", false),
        );
        
        state.interactions = interactions;
        
        let processing = state.get_processing();
        assert_eq!(processing.len(), 2);
        
        let ids: Vec<&str> = processing.iter().map(|i| i.id.as_str()).collect();
        assert!(ids.contains(&"proc1"));
        assert!(ids.contains(&"proc2"));
    }

    #[test]
    fn test_get_completed() {
        let mut state = EditorState::default();
        
        let mut interactions = HashMap::new();
        
        // Completed interaction
        let mut completed = create_test_interaction("comp1", false);
        completed.review_stack.clear();
        interactions.insert("comp1".to_string(), completed);
        
        // Still needs review
        interactions.insert(
            "review1".to_string(),
            create_test_interaction("review1", false),
        );
        
        // Still processing
        interactions.insert(
            "proc1".to_string(),
            create_test_interaction("proc1", true),
        );
        
        state.interactions = interactions;
        
        let completed = state.get_completed();
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].id, "comp1");
    }

    #[test]
    fn test_multiple_states() {
        let mut state = EditorState::default();
        
        // Create a complex state with various interactions
        let mut interactions = HashMap::new();
        
        // Add 3 processing
        for i in 1..=3 {
            interactions.insert(
                format!("proc{}", i),
                create_test_interaction(&format!("proc{}", i), true),
            );
        }
        
        // Add 2 needing review
        for i in 1..=2 {
            let mut review = create_test_interaction(&format!("review{}", i), false);
            review.review_stack = vec!["user".to_string()];
            interactions.insert(format!("review{}", i), review);
        }
        
        // Add 4 completed
        for i in 1..=4 {
            let mut completed = create_test_interaction(&format!("comp{}", i), false);
            completed.review_stack.clear();
            interactions.insert(format!("comp{}", i), completed);
        }
        
        state.interactions = interactions;
        
        assert_eq!(state.get_processing().len(), 3);
        assert_eq!(state.get_review_queue().len(), 2);
        assert_eq!(state.get_completed().len(), 4);
    }

    #[test]
    fn test_state_with_errors() {
        let mut state = EditorState::default();
        state.error = Some("Connection failed".to_string());
        
        assert!(state.error.is_some());
        assert_eq!(state.error.as_ref().unwrap(), "Connection failed");
    }

    #[test]
    fn test_state_with_queue_status() {
        let mut state = EditorState::default();
        state.queue_status = Some(InteractionQueueStatus {
            total_pending: 5,
            processing: 2,
            waiting_review: 3,
            estimated_wait_seconds: Some(10),
        });
        
        assert!(state.queue_status.is_some());
        let status = state.queue_status.as_ref().unwrap();
        assert_eq!(status.total_pending, 5);
        assert_eq!(status.processing, 2);
        assert_eq!(status.waiting_review, 3);
        assert_eq!(status.estimated_wait_seconds, Some(10));
    }

    #[test]
    fn test_draft_state() {
        let mut state = EditorState::default();
        
        // Modify draft
        state.draft.content = "Test content".to_string();
        state.draft.interaction_type = InteractionType::Action;
        state.draft.review_stack = vec!["user".to_string(), "agent1".to_string()];
        state.draft.metadata.insert("key".to_string(), "value".to_string());
        
        assert_eq!(state.draft.content, "Test content");
        assert_eq!(state.draft.interaction_type, InteractionType::Action);
        assert_eq!(state.draft.review_stack, vec!["user".to_string(), "agent1".to_string()]);
        assert_eq!(state.draft.metadata.get("key"), Some(&"value".to_string()));
    }

    #[test]
    fn test_connection_state() {
        let mut state = EditorState::default();
        assert!(!state.connected);
        
        state.connected = true;
        assert!(state.connected);
    }

    #[test]
    fn test_pending_reviews() {
        let mut state = EditorState::default();
        
        state.pending_reviews.push("interaction1".to_string());
        state.pending_reviews.push("interaction2".to_string());
        
        assert_eq!(state.pending_reviews.len(), 2);
        assert!(state.pending_reviews.contains(&"interaction1".to_string()));
        assert!(state.pending_reviews.contains(&"interaction2".to_string()));
    }
}