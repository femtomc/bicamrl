mod api;
mod state;
mod types;
mod theme;
mod markdown;
mod fonts;
mod components;
mod sse;

use iced::widget::{button, column, container, row, scrollable, text, text_input, Column, Space, Stack};
use iced::{Element, Length, Subscription, Task as Command, Theme, Color, Border, Shadow, Vector};
use iced::time::{self, Duration};
use state::{Action, AppState, update};
use types::*;
use std::sync::mpsc;
use std::collections::HashMap;

pub fn main() -> iced::Result {
    let app = iced::application("Bicky", BickyApp::update, BickyApp::view)
        .subscription(BickyApp::subscription)
        .theme(|_| iced::Theme::custom(
            "Bicky".to_string(),
            iced::theme::Palette {
                background: theme::Colors::BACKGROUND,
                text: theme::Colors::TEXT,
                primary: theme::Colors::PRIMARY,
                success: theme::Colors::SUCCESS,
                danger: theme::Colors::ERROR,
            }
        ))
        .font(fonts::BERKELEY_MONO_BYTES)
        .font(fonts::BERKELEY_MONO_SEMIBOLD_BYTES)
        .default_font(fonts::DEFAULT_FONT);
    
    // Run with initial command
    app.run_with(BickyApp::new)
}

struct BickyApp {
    state: AppState,
    api_client: api::ApiClient,
    runtime: Option<tokio::runtime::Runtime>,
    sse_receiver: Option<mpsc::Receiver<sse::SSEMessage>>,
    interaction_cache: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone)]
enum Message {
    InputChanged(String),
    SendMessage,
    MessageSent(Result<SendMessageResponse, String>),
    NewConversation,
    SelectConversation(usize),
    Tick,
    ApproveToolUse,
    DenyToolUse,
    PermissionResponseSent(Result<(), String>),
    SSEEvent(SSEEventData),
    WorktreesLoaded(Result<Vec<Worktree>, String>),
    OpenWorktreeDialog,
    CloseWorktreeDialog,
    WorktreeBranchNameChanged(String),
    WorktreeBaseBranchChanged(String),
    WorktreeCustomPathChanged(String),
    CreateWorktree,
    WorktreeCreated(Result<Worktree, String>),
    SelectWorktree(String),
}

#[derive(Debug, Clone)]
enum SSEEventData {
    Connected,
    InteractionUpdate { id: String },
    Error(String),
}

impl BickyApp {
    fn start_sse(&mut self) {
        if let Some(rt) = &self.runtime {
            let (tx, rx) = mpsc::channel();
            self.sse_receiver = Some(rx);
            
            let base_url = self.api_client.base_url.clone();
            rt.spawn(async move {
                sse::connect_sse(base_url, None, tx).await;
            });
        }
    }
    
    fn new() -> (Self, Command<Message>) {
        let app = Self::default();
        let api = app.api_client.clone();
        
        // Load worktrees on startup
        let cmd = Command::perform(
            async move { api.get_worktrees().await },
            Message::WorktreesLoaded
        );
        
        (app, cmd)
    }

    fn find_conversation_by_message_id(&self, message_id: &str) -> Option<usize> {
        for (idx, conv) in self.state.conversations.iter().enumerate() {
            if conv.messages.iter().any(|m| m.id == message_id) {
                return Some(idx);
            }
        }
        None
    }
    
    fn find_conversation_by_interaction_id(&self, interaction_id: &str) -> Option<usize> {
        for (idx, conv) in self.state.conversations.iter().enumerate() {
            if conv.id == interaction_id {
                return Some(idx);
            }
        }
        None
    }
    
    // Convert server's conversation format to GUI's format
    fn convert_server_conversation(&self, conversation_data: &serde_json::Value) -> Option<(String, Vec<types::LegacyMessage>)> {
        let interaction = conversation_data.get("interaction")?;
        let messages = conversation_data.get("messages")?.as_array()?;
        let interaction_id = interaction.get("id")?.as_str()?.to_string();
        
        let mut gui_messages = Vec::new();
        let mut i = 0;
        
        while i < messages.len() {
            let msg = &messages[i];
            let role = msg.get("role")?.as_str()?;
            
            if role == "user" {
                let user_content = msg.get("content")?.as_str()?.to_string();
                let msg_id = msg.get("id")?.as_str()?.to_string();
                let status_str = msg.get("status")?.as_str()?;
                
                // Look for the next assistant message as the response
                let mut response = None;
                let mut metadata = None;
                let mut status = match status_str {
                    "pending" => types::MessageStatus::Pending,
                    "processing" => types::MessageStatus::Processing,
                    "completed" => types::MessageStatus::Completed,
                    "error" => types::MessageStatus::Error,
                    _ => types::MessageStatus::Pending,
                };
                
                // Check if there's an assistant message after this user message
                if i + 1 < messages.len() {
                    let next_msg = &messages[i + 1];
                    if next_msg.get("role")?.as_str()? == "assistant" {
                        response = next_msg.get("content").and_then(|c| c.as_str()).map(|s| s.to_string());
                        
                        // Extract metadata from assistant message
                        if let Some(meta) = next_msg.get("metadata") {
                            metadata = self.extract_metadata(meta);
                        }
                        
                        // Update status based on assistant message
                        if let Some(assistant_status) = next_msg.get("status").and_then(|s| s.as_str()) {
                            if assistant_status == "completed" {
                                status = types::MessageStatus::Completed;
                            }
                        }
                        
                        i += 1; // Skip the assistant message since we've processed it
                    }
                }
                
                // Check for current processing metadata in interaction
                if status == types::MessageStatus::Processing {
                    if let Some(interaction_meta) = interaction.get("metadata") {
                        println!("[GUI] Interaction metadata: {:?}", interaction_meta);
                        if let Some(current_action) = interaction_meta.get("currentAction").and_then(|a| a.as_str()) {
                            println!("[GUI] Found currentAction: {}", current_action);
                            if metadata.is_none() {
                                metadata = Some(types::InteractionMetadata {
                                    tokens: None,
                                    model: None,
                                    processing_time_ms: None,
                                    tools_used: None,
                                    current_action: Some(current_action.to_string()),
                                    process_id: None,
                                    status: None,
                                    worktree_context: None,
                                    tags: None,
                                });
                            } else if let Some(meta) = &mut metadata {
                                meta.current_action = Some(current_action.to_string());
                            }
                        }
                    }
                }
                
                // Check for pending tool permission in interaction metadata
                let mut pending_tool_permission = None;
                if let Some(interaction_meta) = interaction.get("metadata") {
                    if let Some(permission_data) = interaction_meta.get("pendingToolPermission") {
                        if let Ok(permission) = serde_json::from_value::<types::ToolPermissionRequest>(permission_data.clone()) {
                            pending_tool_permission = Some(permission);
                            status = types::MessageStatus::WaitingForPermission;
                        }
                    }
                }
                
                gui_messages.push(types::LegacyMessage {
                    id: msg_id,
                    content: user_content,
                    response,
                    status,
                    metadata,
                    pending_tool_permission,
                });
            }
            
            i += 1;
        }
        
        Some((interaction_id, gui_messages))
    }
    
    fn extract_metadata(&self, meta: &serde_json::Value) -> Option<types::InteractionMetadata> {
        let meta_obj = meta.as_object()?;
        
        let mut metadata = types::InteractionMetadata {
            tokens: None,
            model: None,
            processing_time_ms: None,
            tools_used: None,
            current_action: None,
            process_id: None,
            status: None,
            worktree_context: None,
            tags: None,
        };
        
        // Extract token usage
        if let Some(usage) = meta_obj.get("usage").and_then(|u| u.as_object()) {
            if let (Some(input), Some(output), Some(total)) = (
                usage.get("inputTokens").and_then(|v| v.as_u64()),
                usage.get("outputTokens").and_then(|v| v.as_u64()),
                usage.get("totalTokens").and_then(|v| v.as_u64())
            ) {
                metadata.tokens = Some(types::TokenUsage {
                    input: input as u32,
                    output: output as u32,
                    total: total as u32,
                });
            }
        }
        
        // Extract model
        if let Some(model) = meta_obj.get("model").and_then(|v| v.as_str()) {
            metadata.model = Some(model.to_string());
        }
        
        // Extract processing time
        if let Some(time) = meta_obj.get("processingTimeMs").and_then(|v| v.as_u64()) {
            metadata.processing_time_ms = Some(time);
        }
        
        // Extract tools used
        if let Some(tools) = meta_obj.get("toolsUsed").and_then(|v| v.as_array()) {
            let tool_names: Vec<String> = tools.iter()
                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                .collect();
            if !tool_names.is_empty() {
                metadata.tools_used = Some(tool_names);
            }
        }
        
        // Extract current action
        if let Some(action) = meta_obj.get("currentAction").and_then(|v| v.as_str()) {
            metadata.current_action = Some(action.to_string());
        }
        
        // Extract process ID
        if let Some(pid) = meta_obj.get("processId").and_then(|v| v.as_str()) {
            metadata.process_id = Some(pid.to_string());
        }
        
        // Extract status
        if let Some(status) = meta_obj.get("status").and_then(|v| v.as_str()) {
            metadata.status = Some(status.to_string());
        }
        
        // Extract worktree context
        if let Some(context) = meta_obj.get("worktreeContext").and_then(|v| v.as_object()) {
            if let (Some(id), Some(path)) = (
                context.get("id").and_then(|v| v.as_str()),
                context.get("path").and_then(|v| v.as_str())
            ) {
                metadata.worktree_context = Some(types::WorktreeContext {
                    id: id.to_string(),
                    path: path.to_string(),
                    branch: context.get("branch").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
        }
        
        // Extract tags
        if let Some(tags) = meta_obj.get("tags").and_then(|v| v.as_array()) {
            let tag_names: Vec<String> = tags.iter()
                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                .collect();
            if !tag_names.is_empty() {
                metadata.tags = Some(tag_names);
            }
        }
        
        Some(metadata)
    }

    fn handle_sse_event(&mut self, event: SSEEventData) {
        match event {
            SSEEventData::Connected => {
                println!("[GUI] SSE connected");
            }
            SSEEventData::InteractionUpdate { id } => {
                let rt = self.runtime.get_or_insert_with(|| {
                    tokio::runtime::Runtime::new().unwrap()
                });
                
                let api = self.api_client.clone();
                let id_clone = id.clone();
                
                // Small delay to let server finish updating metadata
                std::thread::sleep(std::time::Duration::from_millis(50));
                
                // Fetch the conversation
                match rt.block_on(async move { api.get_interaction(&id_clone).await }) {
                    Ok(conversation_data) => {
                        // Update cache
                        self.interaction_cache.insert(id.clone(), conversation_data.clone());
                        
                        // Convert to GUI format
                        if let Some((interaction_id, new_messages)) = self.convert_server_conversation(&conversation_data) {
                            // Find or create conversation
                            if let Some(idx) = self.find_conversation_by_interaction_id(&interaction_id) {
                                // Update existing conversation
                                if let Some(conv) = self.state.conversations.get_mut(idx) {
                                    // Update messages
                                    conv.messages = new_messages;
                                }
                            } else {
                                // Create new conversation
                                let title = state::generate_ubuntu_style_name();
                                let conversation = state::Conversation {
                                    id: interaction_id.clone(),
                                    title,
                                    messages: new_messages,
                                };
                                self.state.conversations.push(conversation);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[GUI] Failed to fetch interaction {}: {}", id, e);
                    }
                }
            }
            SSEEventData::Error(msg) => {
                eprintln!("[GUI] SSE error: {}", msg);
            }
        }
    }

    fn update(&mut self, message: Message) -> Command<Message> {
        match message {
            Message::InputChanged(text) => {
                update(&mut self.state, Action::InputChanged(text));
                Command::none()
            }
            
            Message::SendMessage => {
                if !self.state.input.is_empty() {
                    if let Some(conv_idx) = self.state.active_conversation {
                        let content = self.state.input.clone();
                        update(&mut self.state, Action::SendMessage);
                        
                        // Get the interaction ID from the active conversation if it exists
                        let interaction_id = self.state.conversations.get(conv_idx)
                            .and_then(|conv| {
                                // Check if any message has been successfully sent (not pending)
                                let has_sent_message = conv.messages.iter().any(|m| 
                                    m.status != types::MessageStatus::Pending
                                );
                                
                                if has_sent_message {
                                    // We have a server-synced conversation
                                    println!("[GUI] Sending message to existing interaction: {}", conv.id);
                                    Some(conv.id.clone())
                                } else {
                                    // First message or all messages still pending
                                    println!("[GUI] First message or pending, creating new interaction");
                                    None
                                }
                            });
                        
                        // Build request with optional worktree and interaction ID
                        let request = SendMessageRequest {
                            content,
                            metadata: None,
                            worktree_id: self.state.current_worktree.as_ref().map(|w| w.id.clone()),
                            interaction_id,
                        };
                        
                        // Send message asynchronously
                        let api = self.api_client.clone();
                        Command::perform(
                            async move { api.send_message(request).await },
                            Message::MessageSent
                        )
                    } else {
                        Command::none()
                    }
                } else {
                    Command::none()
                }
            }
            
            Message::MessageSent(result) => {
                match result {
                    Ok(resp) => {
                        println!("[GUI] Message sent successfully, interaction ID: {}", resp.id);
                        // The resp.id is now the interaction ID, not a message ID
                        // Update the conversation's ID to match the server's interaction ID
                        if let Some(conv_idx) = self.state.active_conversation {
                            if let Some(conv) = self.state.conversations.get_mut(conv_idx) {
                                let old_id = conv.id.clone();
                                conv.id = resp.id.clone();
                                println!("[GUI] Updated conversation ID from {} to {}", old_id, resp.id);
                                // Update the last message's status to processing
                                if let Some(last_msg) = conv.messages.last_mut() {
                                    last_msg.status = types::MessageStatus::Processing;
                                }
                            }
                        }
                    }
                    Err(err) => {
                        eprintln!("[GUI] Failed to send message: {}", err);
                        update(&mut self.state, Action::Error(err));
                    }
                }
                Command::none()
            }
            
            Message::NewConversation => {
                // Just add a new conversation locally
                update(&mut self.state, Action::NewConversation);
                Command::none()
            }
            
            Message::SelectConversation(idx) => {
                update(&mut self.state, Action::SelectConversation(idx));
                Command::none()
            }
            
            Message::Tick => {
                // Check for SSE messages
                let mut events = Vec::new();
                if let Some(rx) = &self.sse_receiver {
                    // Collect all pending SSE messages
                    while let Ok(msg) = rx.try_recv() {
                        let event = match msg {
                            sse::SSEMessage::Connected => SSEEventData::Connected,
                            sse::SSEMessage::InteractionUpdate { id, .. } => SSEEventData::InteractionUpdate { id },
                            sse::SSEMessage::Error(e) => SSEEventData::Error(e),
                        };
                        events.push(event);
                    }
                }
                
                // Process collected events
                for event in events {
                    self.handle_sse_event(event);
                }
                
                // Auto-clear notifications after 5 seconds
                if let Some((_, timestamp)) = &self.state.notification {
                    if timestamp.elapsed().as_secs() >= 5 {
                        update(&mut self.state, Action::ClearNotification);
                    }
                }
                
                // Still need to redraw for spinner animation
                if let Some(conv_idx) = self.state.active_conversation {
                    if let Some(conv) = self.state.conversations.get(conv_idx) {
                        let has_processing = conv.messages.iter().any(|m| m.status == MessageStatus::Processing);
                        if has_processing {
                            // The subscription will handle the next tick
                        }
                    }
                }
                Command::none()
            }
            
            Message::ApproveToolUse => {
                // Find the conversation with a message waiting for permission
                if let Some(conv_idx) = self.state.active_conversation {
                    if let Some(conv) = self.state.conversations.get(conv_idx) {
                        if let Some(_msg) = conv.messages.iter().find(|m| m.status == MessageStatus::WaitingForPermission) {
                            // Use the conversation ID which is the interaction ID
                            let interaction_id = conv.id.clone();
                            let api = self.api_client.clone();
                            return Command::perform(
                                async move { api.respond_to_permission(&interaction_id, true).await },
                                Message::PermissionResponseSent
                            );
                        }
                    }
                }
                Command::none()
            }
            
            Message::DenyToolUse => {
                // Find the conversation with a message waiting for permission
                if let Some(conv_idx) = self.state.active_conversation {
                    if let Some(conv) = self.state.conversations.get(conv_idx) {
                        if let Some(_msg) = conv.messages.iter().find(|m| m.status == MessageStatus::WaitingForPermission) {
                            // Use the conversation ID which is the interaction ID
                            let interaction_id = conv.id.clone();
                            let api = self.api_client.clone();
                            return Command::perform(
                                async move { api.respond_to_permission(&interaction_id, false).await },
                                Message::PermissionResponseSent
                            );
                        }
                    }
                }
                Command::none()
            }
            
            Message::PermissionResponseSent(result) => {
                if let Err(e) = result {
                    eprintln!("Failed to send permission response: {}", e);
                }
                Command::none()
            }
            
            Message::SSEEvent(event) => {
                self.handle_sse_event(event);
                Command::none()
            }
            
            Message::WorktreesLoaded(result) => {
                match result {
                    Ok(worktrees) => {
                        update(&mut self.state, Action::WorktreesLoaded(worktrees));
                    }
                    Err(err) => update(&mut self.state, Action::Error(err)),
                }
                Command::none()
            }
            
            Message::SelectWorktree(id) => {
                update(&mut self.state, Action::SelectWorktree(id));
                Command::none()
            }
            
            Message::OpenWorktreeDialog => {
                update(&mut self.state, Action::OpenWorktreeDialog);
                Command::none()
            }
            
            Message::CloseWorktreeDialog => {
                update(&mut self.state, Action::CloseWorktreeDialog);
                Command::none()
            }
            
            Message::WorktreeBranchNameChanged(name) => {
                update(&mut self.state, Action::UpdateWorktreeBranchName(name));
                Command::none()
            }
            
            Message::WorktreeBaseBranchChanged(branch) => {
                update(&mut self.state, Action::UpdateWorktreeBaseBranch(branch));
                Command::none()
            }
            
            Message::WorktreeCustomPathChanged(path) => {
                update(&mut self.state, Action::UpdateWorktreeCustomPath(path));
                Command::none()
            }
            
            Message::CreateWorktree => {
                if let Some(dialog) = &self.state.worktree_dialog {
                    if dialog.branch_name.is_empty() {
                        update(&mut self.state, Action::WorktreeCreationFailed("Branch name is required".to_string()));
                        return Command::none();
                    }
                    
                    let api = self.api_client.clone();
                    let request = CreateWorktreeRequest {
                        branch: dialog.branch_name.clone(),
                        base_branch: Some(dialog.base_branch.clone()),
                        path: if dialog.custom_path.is_empty() { None } else { Some(dialog.custom_path.clone()) },
                    };
                    
                    Command::perform(
                        async move { api.create_worktree(request).await },
                        Message::WorktreeCreated
                    )
                } else {
                    Command::none()
                }
            }
            
            Message::WorktreeCreated(result) => {
                match result {
                    Ok(worktree) => {
                        update(&mut self.state, Action::WorktreeCreated(worktree));
                    }
                    Err(err) => {
                        update(&mut self.state, Action::WorktreeCreationFailed(err));
                    }
                }
                Command::none()
            }
        }
    }

    fn subscription(&self) -> Subscription<Message> {
        // Poll every 16ms for 60fps updates
        time::every(Duration::from_millis(16)).map(|_| Message::Tick)
    }
    
    fn build_channel_list(&self) -> Element<Message> {
        let mut channel_list = column![
            // Header
            container(
                row![
                    text("Interactions").size(14).font(fonts::BERKELEY_MONO_BOLD),
                    button(text("+").size(14).font(fonts::BERKELEY_MONO))
                        .on_press(Message::NewConversation)
                        .padding(6)
                        .style(theme::add_button)
                ]
                .spacing(10)
                .align_y(iced::Alignment::Center)
            )
            .padding(16)
            .width(Length::Fill),
        ]
        .spacing(4);
        
        // Channel entries
        for (idx, conv) in self.state.conversations.iter().enumerate() {
            let is_active = self.state.active_conversation == Some(idx);
            
            let mut entry_content = column![
                row![
                    text("#").size(13).font(fonts::BERKELEY_MONO).color(theme::Colors::TEXT_DIM),
                    text(&conv.title).size(14).font(fonts::BERKELEY_MONO),
                ]
                .spacing(6)
                .align_y(iced::Alignment::Center)
            ]
            .spacing(2);
            
            // Add current worktree info if conversation is active
            if is_active {
                if let Some(worktree) = &self.state.current_worktree {
                    // Extract just the branch name from the path
                    let branch_name = worktree.path
                        .split('/')
                        .last()
                        .unwrap_or("main");
                    
                    entry_content = entry_content.push(
                        row![
                            Space::with_width(19), // Indent to align with title
                            text(format!("🌿 {}", branch_name))
                                .size(11)
                                .font(fonts::BERKELEY_MONO)
                                .color(theme::Colors::SUCCESS),
                        ]
                    );
                }
            }
            
            let channel_entry = button(
                container(entry_content)
                    .padding(12)
                    .width(Length::Fill)
            )
            .on_press(Message::SelectConversation(idx))
            .style(move |theme, _| {
                if is_active {
                    theme::channel_button_active(theme)
                } else {
                    theme::channel_button_inactive(theme)
                }
            })
            .width(Length::Fill);
            
            channel_list = channel_list.push(channel_entry);
        }
        
        // Sidebar container
        container(
            scrollable(channel_list)
                .width(Length::Fill)
                .height(Length::Fill)
        )
        .width(Length::Fixed(240.0))
        .height(Length::Fill)
        .style(theme::sidebar_container)
        .into()
    }

    fn view(&self) -> Element<Message> {
        // Build channel list (sidebar)
        let channel_list = self.build_channel_list();
        
        // Get active conversation
        let active_conversation = self.state.active_conversation
            .and_then(|idx| self.state.conversations.get(idx));
        
        // Build worktree info header with selector
        let worktree_header = {
            let mut header_content = row![
                text("🌿").size(14).font(fonts::UNICODE_FONT),
            ]
            .spacing(10)
            .align_y(iced::Alignment::Center);
            
            // Add worktree display and quick switcher
            if !self.state.available_worktrees.is_empty() {
                // Current worktree display
                if let Some(worktree) = &self.state.current_worktree {
                    let branch_name = worktree.branch
                        .as_ref()
                        .and_then(|b| b.strip_prefix("refs/heads/"))
                        .unwrap_or("unknown");
                    
                    header_content = header_content.push(
                        text(format!("Working in: {}", branch_name))
                            .size(13)
                            .font(fonts::BERKELEY_MONO)
                            .color(theme::Colors::TEXT)
                    );
                    
                    // Show other available worktrees as quick switch buttons
                    let other_worktrees: Vec<_> = self.state.available_worktrees
                        .iter()
                        .filter(|w| w.id != worktree.id)
                        .collect();
                    
                    if !other_worktrees.is_empty() {
                        header_content = header_content.push(
                            text("Switch to:")
                                .size(12)
                                .font(fonts::BERKELEY_MONO)
                                .color(theme::Colors::TEXT_DIM)
                        );
                        
                        for other in other_worktrees.iter().take(3) {
                            let branch_name = other.branch
                                .as_ref()
                                .and_then(|b| b.strip_prefix("refs/heads/"))
                                .unwrap_or("unknown");
                            
                            header_content = header_content.push(
                                button(text(branch_name).size(12).font(fonts::BERKELEY_MONO))
                                    .on_press(Message::SelectWorktree(other.id.clone()))
                                    .padding(6)
                                    .style(theme::secondary_button)
                            );
                        }
                        
                        if other_worktrees.len() > 3 {
                            header_content = header_content.push(
                                text(format!("(+{} more)", other_worktrees.len() - 3))
                                    .size(11)
                                    .font(fonts::BERKELEY_MONO)
                                    .color(theme::Colors::TEXT_DIM)
                            );
                        }
                    }
                } else {
                    // No worktree selected, show first few as options
                    header_content = header_content.push(
                        text("Select worktree:")
                            .size(13)
                            .font(fonts::BERKELEY_MONO)
                            .color(theme::Colors::TEXT_DIM)
                    );
                    
                    for worktree in self.state.available_worktrees.iter().take(3) {
                        let branch_name = worktree.branch
                            .as_ref()
                            .and_then(|b| b.strip_prefix("refs/heads/"))
                            .unwrap_or("unknown");
                        
                        header_content = header_content.push(
                            button(text(branch_name).size(12).font(fonts::BERKELEY_MONO))
                                .on_press(Message::SelectWorktree(worktree.id.clone()))
                                .padding(6)
                                .style(theme::primary_button)
                        );
                    }
                }
            } else {
                header_content = header_content.push(
                    text("No worktrees available")
                        .size(13)
                        .font(fonts::BERKELEY_MONO)
                        .color(theme::Colors::TEXT_DIM)
                );
            }
            
            // Add create button
            header_content = header_content.push(Space::with_width(Length::Fill));
            header_content = header_content.push(
                button(text("Create Worktree").size(12).font(fonts::BERKELEY_MONO))
                    .on_press(Message::OpenWorktreeDialog)
                    .padding(6)
                    .style(theme::secondary_button)
            );
            
            Some(
                container(header_content)
                    .padding(12)
                    .width(Length::Fill)
                    .style(|_theme| {
                        container::Style {
                            background: Some(theme::Colors::BACKGROUND_DIM.into()),
                            border: iced::Border {
                                color: theme::Colors::BORDER,
                                width: 1.0,
                                radius: 4.0.into(),
                            },
                            ..Default::default()
                        }
                    })
            )
        };
        
        // Message list - clean and minimal with rich text
        let messages = if let Some(conv) = active_conversation {
            scrollable(
                Column::with_children(
                    conv.messages.iter().map(|msg| {
                    let mut message_group = column![].spacing(8);
                    
                    // User message
                    let user_label = container(
                        text("You").size(12).font(fonts::BERKELEY_MONO).color(theme::Colors::TEXT_DIM)
                    )
                    .padding(4);
                    
                    let user_msg = container(
                        container(
                            text(&msg.content)
                                .size(14)
                                .font(fonts::BERKELEY_MONO)
                                .color(theme::Colors::TEXT)
                        )
                        .padding(12)
                        .width(Length::Fill)
                        .style(|theme| theme::user_message_container(theme))
                    )
                    .width(Length::Fill);
                    
                    message_group = message_group.push(user_label).push(user_msg);
                    
                    // Assistant response (if available)
                    if let Some(response) = &msg.response {
                        // Build assistant label with metadata
                        let mut label_text = String::from("Wake");
                        if let Some(metadata) = &msg.metadata {
                            if let Some(model) = &metadata.model {
                                label_text = format!("Wake ({})", model);
                            }
                        }
                        
                        let assistant_label = container(
                            text(label_text).size(12).font(fonts::BERKELEY_MONO).color(theme::Colors::TEXT_DIM)
                        )
                        .padding(4);
                        
                        // Parse and render markdown
                        let rendered_content = container(
                            text(response)
                                .size(14)
                                .font(fonts::BERKELEY_MONO)
                                .color(theme::Colors::TEXT)
                        );
                        
                        let assistant_msg = container(
                            container(rendered_content)
                                .padding(12)
                                .width(Length::Fill)
                                .style(|theme| theme::assistant_message_container(theme))
                        )
                        .width(Length::Fill);
                        
                        message_group = message_group.push(assistant_label).push(assistant_msg);
                        
                        // Add metadata info if available
                        if let Some(metadata) = &msg.metadata {
                            let mut info_parts = Vec::new();
                            
                            if let Some(tokens) = &metadata.tokens {
                                let formatted_tokens = format_token_count(tokens.total);
                                info_parts.push(formatted_tokens);
                            }
                            
                            
                            if let Some(time_ms) = metadata.processing_time_ms {
                                let seconds = time_ms as f64 / 1000.0;
                                info_parts.push(format!("{:.1}s", seconds));
                            }
                            
                            // Add tools used
                            if let Some(tools) = &metadata.tools_used {
                                if !tools.is_empty() {
                                    let tool_names = tools.join(", ");
                                    info_parts.push(format!("🔧 {}", tool_names));
                                }
                            }
                            
                            // Add worktree context
                            if let Some(context) = &metadata.worktree_context {
                                if let Some(branch) = &context.branch {
                                    let branch_name = branch.strip_prefix("refs/heads/").unwrap_or(branch);
                                    info_parts.push(format!("🌿 {}", branch_name));
                                }
                            }
                            
                            // Add tags
                            if let Some(tags) = &metadata.tags {
                                if !tags.is_empty() {
                                    let tag_list = tags.join(", ");
                                    info_parts.push(format!("🏷️ {}", tag_list));
                                }
                            }
                            
                            if !info_parts.is_empty() {
                                let info_text = info_parts.join(" • ");
                                let info_label = container(
                                    text(info_text).size(11).font(fonts::BERKELEY_MONO).color(theme::Colors::TEXT_DIM)
                                )
                                .padding(4);
                                message_group = message_group.push(info_label);
                            }
                        }
                    } else if msg.status == MessageStatus::Processing {
                        // Show processing indicator
                        let processing_label = container(
                            text("Wake").size(12).font(fonts::BERKELEY_MONO).color(theme::Colors::TEXT_DIM)
                        )
                        .padding(4);
                        
                        // Check if there's a current action in metadata
                        let processing_text = if let Some(metadata) = &msg.metadata {
                            if let Some(action) = &metadata.current_action {
                                // println!("[GUI Display] Showing action: {}", action);
                                action.clone()
                            } else {
                                println!("[GUI Display] No action in metadata");
                                "[o] 0s • 0 tokens".to_string()
                            }
                        } else {
                            println!("[GUI Display] No metadata for processing message");
                            "[o] 0s • 0 tokens".to_string()
                        };
                        
                        // The server already provides animated symbols, so just display the text
                        // Split the processing text to color only the spinner
                        let processing_content = if let Some(first_space) = processing_text.find(' ') {
                            let spinner = processing_text[..first_space].to_string();
                            let rest = processing_text[first_space..].to_string();
                            row![
                                text(spinner)
                                    .size(14)
                                    .font(fonts::UNICODE_FONT)
                                    .color(theme::Colors::SPINNER),
                                text(rest)
                                    .size(14)
                                    .font(fonts::BERKELEY_MONO)
                                    .color(theme::Colors::TEXT)
                            ]
                            .spacing(0)
                        } else {
                            row![
                                text(processing_text.clone())
                                    .size(14)
                                    .font(fonts::BERKELEY_MONO)
                                    .color(theme::Colors::TEXT)
                            ]
                        };
                        
                        let processing_msg = container(
                            container(processing_content)
                                .padding(12)
                                .width(Length::Fill)
                                .style(|theme| theme::assistant_message_container(theme))
                        )
                        .width(Length::Fill);
                        
                        message_group = message_group.push(processing_label).push(processing_msg);
                    } else if msg.status == MessageStatus::WaitingForPermission {
                        // Show tool permission request
                        let permission_label = container(
                            text("Wake").size(12).font(fonts::BERKELEY_MONO).color(theme::Colors::TEXT_DIM)
                        )
                        .padding(4);
                        
                        if let Some(permission) = &msg.pending_tool_permission {
                            let permission_text = format!(
                                "I'd like to use the {} tool to help with your request. This tool {}.\n\nMay I proceed?",
                                permission.tool_name,
                                permission.description
                            );
                            
                            let permission_content = column![
                                text(permission_text)
                                    .size(14)
                                    .font(fonts::BERKELEY_MONO)
                                    .color(theme::Colors::TEXT),
                                Space::with_height(12),
                                row![
                                    button(text("Approve").size(13).font(fonts::BERKELEY_MONO))
                                        .on_press(Message::ApproveToolUse)
                                        .padding(8)
                                        .style(theme::primary_button_style),
                                    Space::with_width(8),
                                    button(text("Deny").size(13).font(fonts::BERKELEY_MONO))
                                        .on_press(Message::DenyToolUse)
                                        .padding(8)
                                        .style(theme::secondary_button),
                                ]
                                .spacing(8)
                            ];
                            
                            let permission_msg = container(
                                container(permission_content)
                                    .padding(12)
                                    .style(|theme| theme::assistant_message_container(theme))
                            );
                            
                            message_group = message_group.push(permission_label).push(permission_msg);
                        }
                    }
                    
                        container(message_group)
                            .padding(8)
                            .into()
                    }).collect::<Vec<_>>()
                ).spacing(16)
            )
            .height(Length::Fill)
        } else {
            // No conversation selected
            scrollable(
                container(
                    column![
                        text("No interaction selected").size(16).font(fonts::BERKELEY_MONO).color(theme::Colors::TEXT_DIM),
                        Space::with_height(8),
                        text("Select an interaction from the sidebar or create a new one")
                            .size(14)
                            .font(fonts::BERKELEY_MONO)
                            .color(theme::Colors::TEXT_DIM)
                    ]
                    .align_x(iced::Alignment::Center)
                )
                .width(Length::Fill)
                .height(Length::Fill)
                .center_x(Length::Fill).center_y(Length::Fill)
            )
            .height(Length::Fill)
        };
        
        // Input area - clean and focused
        let input_area = container(
            text_input("Message Wake...", &self.state.input)
                .on_input(Message::InputChanged)
                .on_submit(Message::SendMessage)
                .padding(12)
                .size(14)
                .font(fonts::BERKELEY_MONO)
                .style(theme::input_style)
        )
        .padding(20);
        
        // Calculate session stats
        let session_stats = if let Some(conv) = active_conversation {
            let mut total_tokens = 0u32;
            let mut message_count = 0u32;
            
            for msg in &conv.messages {
                if let Some(metadata) = &msg.metadata {
                    if let Some(tokens) = &metadata.tokens {
                        total_tokens += tokens.total;
                    }
                }
                if msg.response.is_some() {
                    message_count += 1;
                }
            }
            
            if total_tokens > 0 || message_count > 0 {
                let stats_text = format!(
                    "{} messages • {}",
                    message_count,
                    format_token_count(total_tokens)
                );
                Some(
                    container(
                        text(stats_text)
                            .size(12)
                            .font(fonts::BERKELEY_MONO)
                            .color(theme::Colors::TEXT_DIM)
                    )
                    .padding(10)
                    .width(Length::Fill)
                    .center_x(Length::Fill)
                )
            } else {
                None
            }
        } else {
            None
        };
        
        // Main content area
        let mut main_content_items = vec![];
        
        // Add worktree header if available
        if let Some(header) = worktree_header {
            main_content_items.push(header.into());
        }
        
        main_content_items.push(messages.into());
        if let Some(stats) = session_stats {
            main_content_items.push(stats.into());
        }
        main_content_items.push(input_area.into());
        
        let main_content = Column::with_children(main_content_items);
        
        // IRC-style layout with sidebar
        let layout = row![
            channel_list,
            container(main_content)
                .width(Length::Fill)
                .height(Length::Fill)
                .padding(20)
        ]
        .width(Length::Fill)
        .height(Length::Fill);
        
        let main_view = container(layout)
            .width(Length::Fill)
            .height(Length::Fill);
            
        // Add notification if present
        let view_with_notification = if let Some((notification, _)) = &self.state.notification {
            let notification_widget = self.build_notification(notification);
            container(
                Stack::new()
                    .push(main_view)
                    .push(
                        container(notification_widget)
                            .width(Length::Fill)
                            .padding(20)
                            .align_x(iced::alignment::Horizontal::Center)
                    )
            )
            .width(Length::Fill)
            .height(Length::Fill)
        } else {
            main_view
        };
            
        // Add dialog overlay if open
        if let Some(dialog) = &self.state.worktree_dialog {
            self.build_worktree_dialog(dialog, view_with_notification)
        } else {
            view_with_notification.into()
        }
    }
    
    fn build_worktree_dialog<'a>(&self, dialog: &'a state::WorktreeDialogState, main_view: container::Container<'a, Message>) -> Element<'a, Message> {
        use iced::widget::{text_input, Stack};
        
        let dialog_content = container(
            column![
                // Title
                text("Create New Worktree").size(18).font(fonts::BERKELEY_MONO_BOLD),
                Space::with_height(20),
                
                // Branch name input
                column![
                    text("Branch Name").size(14).font(fonts::BERKELEY_MONO),
                    text_input("feature/my-new-feature", &dialog.branch_name)
                        .on_input(Message::WorktreeBranchNameChanged)
                        .padding(10)
                        .font(fonts::BERKELEY_MONO)
                        .size(14),
                ]
                .spacing(8),
                
                Space::with_height(16),
                
                // Base branch input
                column![
                    text("Base Branch").size(14).font(fonts::BERKELEY_MONO),
                    text_input("main", &dialog.base_branch)
                        .on_input(Message::WorktreeBaseBranchChanged)
                        .padding(10)
                        .font(fonts::BERKELEY_MONO)
                        .size(14),
                ]
                .spacing(8),
                
                Space::with_height(16),
                
                // Custom path input (optional)
                column![
                    text("Custom Path (optional)").size(14).font(fonts::BERKELEY_MONO),
                    text_input("Leave empty for default", &dialog.custom_path)
                        .on_input(Message::WorktreeCustomPathChanged)
                        .padding(10)
                        .font(fonts::BERKELEY_MONO)
                        .size(14),
                ]
                .spacing(8),
                
                Space::with_height(16),
                
                // Error message if any
                if let Some(error) = &dialog.error {
                    let error_widget: Element<Message> = container(
                        text(error)
                            .size(14)
                            .font(fonts::BERKELEY_MONO)
                            .color(theme::Colors::ERROR)
                    )
                    .padding(10)
                    .style(|_theme: &Theme| {
                        container::Style {
                            background: Some(iced::Background::Color(Color::from_rgb(
                                0.8, 0.2, 0.2
                            ).scale_alpha(0.1))),
                            border: Border {
                                color: theme::Colors::ERROR,
                                width: 1.0,
                                radius: 4.0.into(),
                            },
                            ..Default::default()
                        }
                    })
                    .into();
                    error_widget
                } else {
                    Space::with_height(0).into()
                },
                
                Space::with_height(20),
                
                // Buttons
                row![
                    button(text("Cancel").size(14).font(fonts::BERKELEY_MONO))
                        .on_press(Message::CloseWorktreeDialog)
                        .padding(10)
                        .style(theme::secondary_button),
                    Space::with_width(10),
                    button(text("Create").size(14).font(fonts::BERKELEY_MONO))
                        .on_press(Message::CreateWorktree)
                        .padding(10)
                        .style(theme::primary_button),
                ]
                .align_y(iced::Alignment::Center),
            ]
            .spacing(8)
            .padding(30)
            .width(400)
        )
        .style(|_theme: &Theme| {
            container::Style {
                background: Some(iced::Background::Color(theme::Colors::BACKGROUND)),
                border: Border {
                    color: theme::Colors::BORDER,
                    width: 1.0,
                    radius: 8.0.into(),
                },
                ..Default::default()
            }
        })
        .center_x(Length::Fill)
        .center_y(Length::Fill);
        
        // Overlay with semi-transparent background
        container(
            Stack::new()
                .push(main_view)
                .push(
                    container(dialog_content)
                        .width(Length::Fill)
                        .height(Length::Fill)
                        .style(|_: &Theme| {
                            container::Style {
                                background: Some(iced::Background::Color(
                                    Color::from_rgba(0.0, 0.0, 0.0, 0.7)
                                )),
                                ..Default::default()
                            }
                        })
                )
        )
        .width(Length::Fill)
        .height(Length::Fill)
        .into()
    }
    
    fn build_notification(&self, notification: &state::Notification) -> Element<Message> {
        use state::Notification;
        
        let (text_content, bg_color, text_color) = match notification {
            Notification::Success(msg) => (msg.clone(), Color::from_rgb(0.2, 0.7, 0.2), Color::WHITE),
            Notification::Error(msg) => (msg.clone(), Color::from_rgb(0.8, 0.2, 0.2), Color::WHITE),
            Notification::Info(msg) => (msg.clone(), Color::from_rgb(0.2, 0.5, 0.8), Color::WHITE),
        };
        
        container(
            text(text_content)
                .size(14)
                .font(fonts::BERKELEY_MONO)
                .color(text_color)
        )
        .padding([12, 20])
        .style(move |_: &Theme| {
            container::Style {
                background: Some(iced::Background::Color(bg_color)),
                border: Border {
                    color: bg_color,
                    width: 0.0,
                    radius: 6.0.into(),
                },
                shadow: Shadow {
                    color: Color::from_rgba(0.0, 0.0, 0.0, 0.3),
                    offset: Vector::new(0.0, 2.0),
                    blur_radius: 8.0,
                },
                ..Default::default()
            }
        })
        .into()
    }
}

fn format_token_count(tokens: u32) -> String {
    match tokens {
        t if t >= 1_000_000 => format!("{:.1}M tokens", t as f64 / 1_000_000.0),
        t if t >= 1_000 => format!("{:.1}K tokens", t as f64 / 1_000.0),
        t => format!("{} tokens", t),
    }
}

impl Default for BickyApp {
    fn default() -> Self {
        let api_client = api::ApiClient::default();
        let runtime = tokio::runtime::Runtime::new().ok();
        
        let mut app = Self {
            state: AppState::default(),
            api_client,
            runtime,
            sse_receiver: None,
            interaction_cache: HashMap::new(),
        };
        
        // Start SSE connection immediately
        app.start_sse();
        
        app
    }
}

impl Default for api::ApiClient {
    fn default() -> Self {
        // Try to read port from file
        let port = std::fs::read_to_string("../../../.bicamrl-port")
            .ok()
            .and_then(|s| s.trim().parse::<u16>().ok())
            .unwrap_or(3456);
        
        api::ApiClient::new(format!("http://localhost:{}", port))
    }
}

// Implement Clone for ApiClient
impl Clone for api::ApiClient {
    fn clone(&self) -> Self {
        api::ApiClient::new(self.base_url.clone())
    }
}