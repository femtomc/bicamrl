use crate::{state::EditorState, actions::Action, effects::Effect, types::*};

/// Pure state transition function
/// Returns new state and any effects that need to be performed
pub fn reduce(state: &EditorState, action: &Action) -> (EditorState, Vec<Effect>) {
    let mut new_state = state.clone();
    let mut effects = Vec::new();
    
    match action {
        // Draft Management
        Action::UpdateDraftContent { content } => {
            new_state.draft.content = content.clone();
        }
        
        Action::SetDraftType { interaction_type } => {
            new_state.draft.interaction_type = interaction_type.clone();
        }
        
        Action::AddToReviewStack { reviewer_id } => {
            if !new_state.draft.review_stack.contains(reviewer_id) {
                new_state.draft.review_stack.push(reviewer_id.clone());
            }
        }
        
        Action::RemoveFromReviewStack { reviewer_id } => {
            new_state.draft.review_stack.retain(|id| id != reviewer_id);
        }
        
        Action::ReorderReviewStack { from_index, to_index } => {
            if *from_index < new_state.draft.review_stack.len() 
                && *to_index < new_state.draft.review_stack.len() {
                let item = new_state.draft.review_stack.remove(*from_index);
                new_state.draft.review_stack.insert(*to_index, item);
            }
        }
        
        Action::SetDraftMetadata { key, value } => {
            new_state.draft.metadata.insert(key.clone(), value.clone());
        }
        
        Action::ClearDraft => {
            new_state.draft = InteractionDraft {
                content: String::new(),
                interaction_type: InteractionType::Query,
                review_stack: vec!["user".to_string()],
                metadata: std::collections::HashMap::new(),
            };
        }
        
        // Interaction Submission
        Action::SubmitInteraction => {
            if !new_state.draft.content.is_empty() && new_state.connected {
                effects.push(Effect::SubmitInteraction {
                    session_id: new_state.session_id.clone(),
                    content: new_state.draft.content.clone(),
                    interaction_type: new_state.draft.interaction_type.clone(),
                    metadata: new_state.draft.metadata.clone(),
                });
            } else if !new_state.connected {
                new_state.error = Some("Not connected to server".to_string());
            }
        }
        
        Action::InteractionSubmitted(Ok(interaction)) => {
            new_state.interactions.insert(interaction.id.clone(), interaction.clone());
            new_state.draft.content.clear(); // Clear draft on success
            new_state.error = None;
        }
        
        Action::InteractionSubmitted(Err(error)) => {
            new_state.error = Some(error.clone());
        }
        
        // Review Actions
        Action::SubmitReview { interaction_id, approved, feedback } => {
            if new_state.interactions.contains_key(interaction_id) {
                effects.push(Effect::SubmitReview {
                    interaction_id: interaction_id.clone(),
                    approved: *approved,
                    feedback: feedback.clone(),
                });
            }
        }
        
        Action::ReviewSubmitted(Ok(())) => {
            new_state.error = None;
        }
        
        Action::ReviewSubmitted(Err(error)) => {
            new_state.error = Some(error.clone());
        }
        
        // Queue Status
        Action::UpdateQueueStatus(status) => {
            new_state.queue_status = Some(status.clone());
        }
        
        // Real-time Events
        Action::InteractionPosted { interaction } => {
            new_state.interactions.insert(interaction.id.clone(), interaction.clone());
        }
        
        Action::InteractionProcessing { interaction_id, agent_id } => {
            if let Some(interaction) = new_state.interactions.get_mut(interaction_id) {
                // Add processing event to history
                interaction.history.push(Event {
                    agent_id: agent_id.clone(),
                    action: "processing".to_string(),
                    content: serde_json::Value::Null,
                    metadata: None,
                    timestamp: chrono::Utc::now(),
                });
            }
        }
        
        Action::InteractionCompleted { interaction_id, result } => {
            if let Some(interaction) = new_state.interactions.get_mut(interaction_id) {
                interaction.needs_work = false;
                // Add completion to history
                interaction.history.push(Event {
                    agent_id: "system".to_string(),
                    action: "completed".to_string(),
                    content: result.clone(),
                    metadata: None,
                    timestamp: chrono::Utc::now(),
                });
            }
        }
        
        // Error Handling
        Action::SetError { message } => {
            new_state.error = Some(message.clone());
        }
        
        Action::ClearError => {
            new_state.error = None;
        }
        
        // Connection Management
        Action::Connect { server_url } => {
            effects.push(Effect::ConnectToStream {
                server_url: server_url.clone(),
                session_id: new_state.session_id.clone(),
            });
        }
        
        Action::Connected => {
            new_state.connected = true;
            new_state.error = None;
            effects.push(Effect::FetchQueueStatus);
        }
        
        Action::Disconnected { reason } => {
            new_state.connected = false;
            if let Some(reason) = reason {
                new_state.error = Some(format!("Disconnected: {}", reason));
            }
        }
    }
    
    // Update pending reviews whenever interactions change
    new_state.pending_reviews = new_state.get_review_queue()
        .into_iter()
        .map(|i| i.id.clone())
        .collect();
    
    (new_state, effects)
}