use crate::types::*;
use std::collections::HashMap;

/// Core editor state focused on interaction management
#[derive(Debug, Clone, PartialEq)]
pub struct EditorState {
    /// Current session ID (hardcoded for now)
    pub session_id: String,
    
    /// All interactions we know about
    pub interactions: HashMap<String, Interaction>,
    
    /// The interaction we're currently drafting
    pub draft: InteractionDraft,
    
    /// Current queue status
    pub queue_status: Option<InteractionQueueStatus>,
    
    /// Interactions awaiting our review (where we're top of review stack)
    pub pending_reviews: Vec<String>,
    
    /// Connection state
    pub connected: bool,
    
    /// Current error message (if any)
    pub error: Option<String>,
}

impl Default for EditorState {
    fn default() -> Self {
        Self {
            session_id: "default-session".to_string(), // Hardcoded for MVP
            interactions: HashMap::new(),
            draft: InteractionDraft {
                content: String::new(),
                interaction_type: InteractionType::Query,
                review_stack: vec!["user".to_string()], // User reviews by default
                metadata: HashMap::new(),
            },
            queue_status: None,
            pending_reviews: Vec::new(),
            connected: false,
            error: None,
        }
    }
}

impl EditorState {
    /// Get interactions that need our review
    pub fn get_review_queue(&self) -> Vec<&Interaction> {
        self.interactions
            .values()
            .filter(|i| {
                !i.needs_work && 
                i.review_stack.last() == Some(&"user".to_string())
            })
            .collect()
    }
    
    /// Get interactions currently being processed
    pub fn get_processing(&self) -> Vec<&Interaction> {
        self.interactions
            .values()
            .filter(|i| i.needs_work)
            .collect()
    }
    
    /// Get completed interactions
    pub fn get_completed(&self) -> Vec<&Interaction> {
        self.interactions
            .values()
            .filter(|i| !i.needs_work && i.review_stack.is_empty())
            .collect()
    }
}