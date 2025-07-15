use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub status: SessionStatus,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Active,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Interaction {
    pub id: String,
    pub source: String,
    pub interaction_type: InteractionType,
    pub content: Vec<ConversationItem>,
    pub needs_work: bool,
    pub review_stack: Vec<String>,
    pub history: Vec<Event>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum InteractionType {
    Query,
    Action,
    Observation,
    Feedback,
    System,
    Reflection,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConversationItem {
    pub role: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    pub agent_id: String,
    pub action: String,
    pub content: serde_json::Value,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InteractionQueueStatus {
    pub queue_size: u32,
    pub needs_work: u32,
    pub needs_review: u32,
    pub processing: u32,
    pub completed: u32,
    pub analyzing: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InteractionDraft {
    pub content: String,
    pub interaction_type: InteractionType,
    pub review_stack: Vec<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}