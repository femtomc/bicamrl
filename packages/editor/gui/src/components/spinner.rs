use iced::{Element, Length};
use iced::widget::{text, container};
use std::time::{Duration, Instant};
use crate::fonts;
use crate::theme;

/// Animated spinner component
#[derive(Debug, Clone)]
pub struct Spinner {
    start_time: Instant,
    frames: Vec<&'static str>,
    frame_duration: Duration,
}

impl Default for Spinner {
    fn default() -> Self {
        Self {
            start_time: Instant::now(),
            frames: vec!["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
            frame_duration: Duration::from_millis(80),
        }
    }
}

impl Spinner {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn dots() -> Self {
        Self::default()
    }
    
    pub fn line() -> Self {
        Self {
            start_time: Instant::now(),
            frames: vec!["-", "\\", "|", "/"],
            frame_duration: Duration::from_millis(120),
        }
    }
    
    pub fn current_frame(&self) -> &str {
        let elapsed = self.start_time.elapsed();
        let total_frames = self.frames.len();
        let frame_index = (elapsed.as_millis() / self.frame_duration.as_millis()) as usize % total_frames;
        self.frames[frame_index]
    }
    
    pub fn view<Message: 'static>(&self) -> Element<'static, Message> {
        let frame = self.current_frame().to_string();
        container(
            text(frame)
                .font(fonts::BERKELEY_MONO)
                .size(14)
                .color(theme::Colors::PRIMARY)
        )
        .width(Length::Shrink)
        .into()
    }
}