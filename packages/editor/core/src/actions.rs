use crate::types::*;

/// All possible user actions that can modify the editor state
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    // Interaction Draft Management
    UpdateDraftContent { content: String },
    SetDraftType { interaction_type: InteractionType },
    AddToReviewStack { reviewer_id: String },
    RemoveFromReviewStack { reviewer_id: String },
    ReorderReviewStack { from_index: usize, to_index: usize },
    SetDraftMetadata { key: String, value: serde_json::Value },
    ClearDraft,
    
    // Interaction Submission
    SubmitInteraction,
    InteractionSubmitted(Result<Interaction, String>),
    
    // Review Actions
    SubmitReview { 
        interaction_id: String, 
        approved: bool, 
        feedback: Option<String> 
    },
    ReviewSubmitted(Result<(), String>),
    
    // Queue Status
    UpdateQueueStatus(InteractionQueueStatus),
    
    // Real-time Events from Server
    InteractionPosted { interaction: Interaction },
    InteractionProcessing { 
        interaction_id: String, 
        agent_id: String 
    },
    InteractionCompleted { 
        interaction_id: String, 
        result: serde_json::Value 
    },
    
    // Error Handling
    SetError { message: String },
    ClearError,
    
    // Connection Management
    Connect { server_url: String },
    Connected,
    Disconnected { reason: Option<String> },
}