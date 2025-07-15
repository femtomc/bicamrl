use crate::types::*;

/// Side effects that need to be performed (API calls, etc)
#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    /// Submit an interaction to the server
    SubmitInteraction {
        session_id: String,
        content: String,
        interaction_type: InteractionType,
        metadata: std::collections::HashMap<String, serde_json::Value>,
    },
    
    /// Submit review feedback for an interaction
    SubmitReview {
        interaction_id: String,
        approved: bool,
        feedback: Option<String>,
    },
    
    /// Connect to SSE stream for real-time updates
    ConnectToStream {
        server_url: String,
        session_id: String,
    },
    
    /// Fetch current queue status
    FetchQueueStatus,
}