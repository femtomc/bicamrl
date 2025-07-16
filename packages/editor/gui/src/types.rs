use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input: u32,
    pub output: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractionMetadata {
    // Result metadata
    pub tokens: Option<TokenUsage>,
    pub model: Option<String>,
    pub processing_time_ms: Option<u64>,
    pub tools_used: Option<Vec<String>>,
    
    // Processing state
    pub current_action: Option<String>,
    pub process_id: Option<String>,
    pub status: Option<String>,
    
    // Context
    pub worktree_context: Option<WorktreeContext>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeContext {
    pub id: String,
    pub path: String,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermissionRequest {
    #[serde(rename = "toolName")]
    pub tool_name: String,
    pub description: String,
    #[serde(rename = "requestId")]
    pub request_id: Option<String>,
}

// Old Message type for backward compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyMessage {
    pub id: String,
    pub content: String,
    pub response: Option<String>,
    pub status: MessageStatus,
    pub metadata: Option<InteractionMetadata>,
    pub pending_tool_permission: Option<ToolPermissionRequest>,
}

// New message type matching server format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    #[serde(rename = "interactionId")]
    pub interaction_id: String,
    pub role: MessageRole,
    pub content: String,
    pub timestamp: String,
    pub status: MessageStatus,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

// Conversation structure from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub interaction: Interaction,
    pub messages: Vec<Message>,
}

// Interaction structure from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Interaction {
    pub id: String,
    pub source: String,
    #[serde(rename = "type")]
    pub interaction_type: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Pending,
    Processing,
    Completed,
    Error,
    Failed,
    WaitingForPermission,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Worktree {
    pub id: String,
    pub path: String,
    pub branch: Option<String>,
    #[serde(rename = "baseCommit")]
    pub base_commit: Option<String>,
    pub status: WorktreeStatus,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorktreeStatus {
    Active,
    Inactive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    pub metadata: Option<serde_json::Value>,
    #[serde(rename = "worktreeId")]
    pub worktree_id: Option<String>,
    #[serde(rename = "interactionId")]
    pub interaction_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorktreeRequest {
    pub branch: String,
    #[serde(rename = "baseBranch")]
    pub base_branch: Option<String>,
    pub path: Option<String>,
}