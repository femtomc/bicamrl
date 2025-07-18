use crate::types::*;
use rand::seq::SliceRandom;

/// A single conversation with a Wake instance
#[derive(Debug, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub messages: Vec<LegacyMessage>,
}

/// Dialog state for creating worktrees
#[derive(Debug, Clone, Default)]
pub struct WorktreeDialogState {
    pub branch_name: String,
    pub base_branch: String,
    pub custom_path: String,
    pub error: Option<String>,
}

/// Notification types
#[derive(Debug, Clone)]
pub enum Notification {
    Success(String),
    Error(String),
    Info(String),
}

/// Pure application state - just data, no logic
#[derive(Debug, Clone)]
pub struct AppState {
    pub conversations: Vec<Conversation>,
    pub active_conversation: Option<usize>,
    pub input: String,
    pub current_worktree: Option<Worktree>,
    pub available_worktrees: Vec<Worktree>,
    pub worktree_dialog: Option<WorktreeDialogState>,
    pub notification: Option<(Notification, std::time::Instant)>,
}

impl Default for AppState {
    fn default() -> Self {
        // Start with one default conversation
        let default_conversation = Conversation {
            id: uuid::Uuid::new_v4().to_string(),
            title: generate_ubuntu_style_name(),
            messages: Vec::new(),
        };
        
        Self {
            conversations: vec![default_conversation],
            active_conversation: Some(0),
            input: String::new(),
            current_worktree: None,
            available_worktrees: vec![],
            worktree_dialog: None,
            notification: None,
        }
    }
}

/// All possible state transitions
#[derive(Debug, Clone)]
pub enum Action {
    // User actions
    InputChanged(String),
    SendMessage,
    NewConversation,
    SelectConversation(usize),
    RespondToPermission { approved: bool },
    
    // Worktree dialog actions
    OpenWorktreeDialog,
    CloseWorktreeDialog,
    UpdateWorktreeBranchName(String),
    UpdateWorktreeBaseBranch(String),
    UpdateWorktreeCustomPath(String),
    CreateWorktree,
    
    // API responses
    WorktreesLoaded(Vec<Worktree>),
    WorktreeCreated(Worktree),
    WorktreeCreationFailed(String),
    SelectWorktree(String),
    WorktreeChanged(Option<Worktree>),
    MessageSent { conversation_idx: usize, id: String },
    MessageProcessing { conversation_idx: usize, id: String },
    MessageCompleted { conversation_idx: usize, id: String, response: Option<String>, error: Option<String>, metadata: Option<InteractionMetadata> },
    MessageWaitingForPermission { conversation_idx: usize, id: String, permission_request: crate::types::ToolPermissionRequest },
    
    // Notifications
    ShowNotification(Notification),
    ClearNotification,
    
    // Errors
    Error(String),
}

/// Pure state transitions - no side effects
pub fn update(state: &mut AppState, action: Action) {
    match action {
        Action::InputChanged(text) => {
            state.input = text;
        }
        
        Action::SendMessage => {
            if !state.input.is_empty() {
                if let Some(conv_idx) = state.active_conversation {
                    if let Some(conv) = state.conversations.get_mut(conv_idx) {
                        let message = LegacyMessage {
                            id: format!("temp-{}", conv.messages.len()),
                            content: state.input.clone(),
                            response: None,
                            status: MessageStatus::Pending,
                            metadata: None,
                            pending_tool_permission: None,
                        };
                        conv.messages.push(message);
                        state.input.clear();
                    }
                }
            }
        }
        
        Action::NewConversation => {
            let new_conversation = Conversation {
                id: uuid::Uuid::new_v4().to_string(),
                title: generate_ubuntu_style_name(),
                messages: Vec::new(),
            };
            state.conversations.push(new_conversation);
            state.active_conversation = Some(state.conversations.len() - 1);
        }
        
        Action::SelectConversation(idx) => {
            if idx < state.conversations.len() {
                state.active_conversation = Some(idx);
            }
        }
        
        Action::MessageSent { conversation_idx, id } => {
            // Update the temp ID with real ID
            if let Some(conv) = state.conversations.get_mut(conversation_idx) {
                if let Some(msg) = conv.messages.last_mut() {
                    if msg.id.starts_with("temp-") {
                        msg.id = id;
                    }
                }
            }
        }
        
        Action::MessageProcessing { conversation_idx, id } => {
            if let Some(conv) = state.conversations.get_mut(conversation_idx) {
                if let Some(msg) = conv.messages.iter_mut().find(|m| m.id == id) {
                    msg.status = MessageStatus::Processing;
                }
            }
        }
        
        Action::MessageCompleted { conversation_idx, id, response, error, metadata } => {
            if let Some(conv) = state.conversations.get_mut(conversation_idx) {
                if let Some(msg) = conv.messages.iter_mut().find(|m| m.id == id) {
                    msg.response = response;
                    msg.status = if error.is_some() {
                        MessageStatus::Error
                    } else {
                        MessageStatus::Completed
                    };
                    msg.metadata = metadata;
                    msg.pending_tool_permission = None; // Clear any pending permission
                }
            }
        }
        
        Action::MessageWaitingForPermission { conversation_idx, id, permission_request } => {
            if let Some(conv) = state.conversations.get_mut(conversation_idx) {
                if let Some(msg) = conv.messages.iter_mut().find(|m| m.id == id) {
                    msg.status = MessageStatus::WaitingForPermission;
                    msg.pending_tool_permission = Some(permission_request);
                }
            }
        }
        
        Action::RespondToPermission { approved } => {
            if let Some(conv_idx) = state.active_conversation {
                if let Some(conv) = state.conversations.get_mut(conv_idx) {
                    // Find the message waiting for permission
                    if let Some(_msg) = conv.messages.iter_mut().find(|m| m.status == MessageStatus::WaitingForPermission) {
                        // Add the response as a new message
                        let response_content = if approved { "Yes, go ahead" } else { "No, don't use that tool" };
                        state.input = response_content.to_string();
                        // The SendMessage action will handle sending this
                    }
                }
            }
        }
        
        Action::WorktreesLoaded(worktrees) => {
            state.available_worktrees = worktrees;
        }
        
        Action::SelectWorktree(id) => {
            if let Some(worktree) = state.available_worktrees.iter().find(|w| w.id == id) {
                state.current_worktree = Some(worktree.clone());
            }
        }
        
        Action::WorktreeChanged(worktree) => {
            state.current_worktree = worktree;
        }
        
        Action::OpenWorktreeDialog => {
            state.worktree_dialog = Some(WorktreeDialogState {
                base_branch: "main".to_string(),
                ..Default::default()
            });
        }
        
        Action::CloseWorktreeDialog => {
            state.worktree_dialog = None;
        }
        
        Action::UpdateWorktreeBranchName(name) => {
            if let Some(dialog) = &mut state.worktree_dialog {
                dialog.branch_name = name;
                dialog.error = None; // Clear error when user types
            }
        }
        
        Action::UpdateWorktreeBaseBranch(branch) => {
            if let Some(dialog) = &mut state.worktree_dialog {
                dialog.base_branch = branch;
            }
        }
        
        Action::UpdateWorktreeCustomPath(path) => {
            if let Some(dialog) = &mut state.worktree_dialog {
                dialog.custom_path = path;
            }
        }
        
        Action::CreateWorktree => {
            // Just clear error, actual creation happens in update function
            if let Some(dialog) = &mut state.worktree_dialog {
                dialog.error = None;
            }
        }
        
        Action::WorktreeCreated(worktree) => {
            state.available_worktrees.push(worktree.clone());
            state.current_worktree = Some(worktree.clone());
            state.worktree_dialog = None;
            state.notification = Some((
                Notification::Success(format!("Created worktree '{}'", worktree.branch.as_deref().unwrap_or("unknown"))),
                std::time::Instant::now()
            ));
        }
        
        Action::WorktreeCreationFailed(error) => {
            if let Some(dialog) = &mut state.worktree_dialog {
                dialog.error = Some(error);
            }
        }
        
        Action::ShowNotification(notification) => {
            state.notification = Some((notification, std::time::Instant::now()));
        }
        
        Action::ClearNotification => {
            state.notification = None;
        }
        
        Action::Error(_) => {
            // Errors are ignored for now
        }
    }
}

/// Generate Ubuntu-style release names (Adjective Animal)
pub fn generate_ubuntu_style_name() -> String {
    let adjectives = [
        "Artful", "Bionic", "Cosmic", "Dapper", "Edgy", "Feisty", "Groovy", "Hardy", 
        "Intrepid", "Jaunty", "Karmic", "Lucid", "Maverick", "Natty", "Oneiric", "Precise",
        "Quantal", "Raring", "Saucy", "Trusty", "Utopic", "Vivid", "Wily", "Xenial",
        "Yakkety", "Zesty", "Artful", "Bionic", "Cosmic", "Disco", "Eoan", "Focal",
        "Groovy", "Hirsute", "Impish", "Jammy", "Kinetic", "Lunar", "Mantic", "Noble",
        "Agile", "Bold", "Clever", "Daring", "Eager", "Fearless", "Gallant", "Heroic",
        "Jovial", "Keen", "Lively", "Mighty", "Nimble", "Peppy", "Quick", "Radiant",
        "Spirited", "Thrilling", "Upbeat", "Valiant", "Witty", "Zealous"
    ];
    
    let animals = [
        "Aardvark", "Beaver", "Caribou", "Drake", "Eft", "Fossa", "Gibbon", "Heron",
        "Ibex", "Jackalope", "Koala", "Lynx", "Meerkat", "Narwhal", "Ocelot", "Pangolin",
        "Quokka", "Ringtail", "Salamander", "Tahr", "Unicorn", "Viper", "Werewolf", "Xerus",
        "Yak", "Zebra", "Alpaca", "Badger", "Cheetah", "Dolphin", "Eagle", "Falcon",
        "Gorilla", "Hippo", "Iguana", "Jellyfish", "Kangaroo", "Lemur", "Mantis", "Numbat",
        "Otter", "Pelican", "Quetzal", "Raven", "Shark", "Tiger", "Urchin", "Vulture",
        "Walrus", "Xenops", "Yeti", "Zonkey"
    ];
    
    let mut rng = rand::thread_rng();
    let adjective = adjectives.choose(&mut rng).unwrap_or(&"Mysterious");
    let animal = animals.choose(&mut rng).unwrap_or(&"Creature");
    
    format!("{} {}", adjective, animal)
}