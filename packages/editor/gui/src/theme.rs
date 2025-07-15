use iced::{Background, Border, Color, Theme};
use iced::widget::{button, container, text_input};

// Color palette
pub struct Colors;

impl Colors {
    pub const BACKGROUND: Color = Color::from_rgb(0.11, 0.11, 0.13); // #1c1c21
    pub const BACKGROUND_DIM: Color = Color::from_rgb(0.09, 0.09, 0.11); // #171719
    pub const SURFACE: Color = Color::from_rgb(0.13, 0.13, 0.16); // #212127
    pub const SURFACE_LIGHT: Color = Color::from_rgb(0.16, 0.16, 0.20); // #292933
    pub const PRIMARY: Color = Color::from_rgb(0.38, 0.65, 1.0); // #61a6ff
    pub const SECONDARY: Color = Color::from_rgb(0.50, 0.50, 0.58); // #80809e
    pub const TEXT: Color = Color::from_rgb(0.88, 0.88, 0.90); // #e0e0e6
    pub const TEXT_DIM: Color = Color::from_rgb(0.50, 0.50, 0.58); // #80809e
    pub const BORDER: Color = Color::from_rgb(0.20, 0.20, 0.24); // #33333d
    pub const SUCCESS: Color = Color::from_rgb(0.40, 0.80, 0.40); // #66cc66
    pub const ERROR: Color = Color::from_rgb(0.90, 0.40, 0.40); // #e66666
    pub const SPINNER: Color = Color::from_rgb(1.0, 0.68, 0.38); // #FFAD61 - warm amber/orange
}

// Channel list styles
pub fn channel_button_active(_theme: &Theme) -> button::Style {
    button::Style {
        background: Some(Background::Color(Colors::SURFACE_LIGHT)),
        text_color: Colors::PRIMARY,
        border: Border {
            width: 0.0,
            radius: 4.0.into(),
            color: Color::TRANSPARENT,
        },
        ..Default::default()
    }
}

pub fn channel_button_inactive(_theme: &Theme) -> button::Style {
    button::Style {
        background: Some(Background::Color(Color::TRANSPARENT)),
        text_color: Colors::TEXT_DIM,
        border: Border {
            width: 0.0,
            radius: 4.0.into(),
            color: Color::TRANSPARENT,
        },
        ..Default::default()
    }
}

// Sidebar style
pub fn sidebar_container(_theme: &Theme) -> container::Style {
    container::Style {
        background: Some(Background::Color(Colors::SURFACE)),
        border: Border {
            width: 0.0,
            radius: 0.0.into(),
            color: Color::TRANSPARENT,
        },
        ..Default::default()
    }
}

// Message styles
pub fn user_message_container(_theme: &Theme) -> container::Style {
    container::Style {
        background: Some(Background::Color(Colors::SURFACE_LIGHT)),
        border: Border {
            width: 0.0,
            radius: 8.0.into(),
            color: Color::TRANSPARENT,
        },
        ..Default::default()
    }
}

pub fn assistant_message_container(_theme: &Theme) -> container::Style {
    container::Style {
        background: Some(Background::Color(Color::TRANSPARENT)),
        border: Border {
            width: 1.0,
            radius: 8.0.into(),
            color: Colors::BORDER,
        },
        ..Default::default()
    }
}

// Input style
pub fn input_style(_theme: &Theme, _status: text_input::Status) -> text_input::Style {
    text_input::Style {
        background: Background::Color(Colors::SURFACE),
        border: Border {
            width: 1.0,
            radius: 8.0.into(),
            color: Colors::BORDER,
        },
        icon: Color::TRANSPARENT,
        placeholder: Color {
            a: 0.7,
            ..Colors::TEXT_DIM
        },
        value: Colors::TEXT,
        selection: Color {
            a: 0.3,
            ..Colors::PRIMARY
        },
    }
}

// Code block style
pub fn code_container(_theme: &Theme) -> container::Style {
    container::Style {
        background: Some(Background::Color(Colors::BACKGROUND)),
        border: Border {
            width: 1.0,
            radius: 4.0.into(),
            color: Colors::BORDER,
        },
        ..Default::default()
    }
}

// Button styles
pub fn primary_button(_theme: &Theme, _status: button::Status) -> button::Style {
    button::Style {
        background: Some(Background::Color(Colors::PRIMARY)),
        text_color: Color::WHITE,
        border: Border {
            width: 0.0,
            radius: 6.0.into(),
            color: Color::TRANSPARENT,
        },
        ..Default::default()
    }
}

pub fn add_button(_theme: &Theme, _status: button::Status) -> button::Style {
    button::Style {
        background: Some(Background::Color(Color::TRANSPARENT)),
        text_color: Colors::TEXT_DIM,
        border: Border {
            width: 1.0,
            radius: 4.0.into(),
            color: Colors::BORDER,
        },
        ..Default::default()
    }
}

pub fn primary_button_style(_theme: &Theme, _status: button::Status) -> button::Style {
    button::Style {
        background: Some(Background::Color(Colors::PRIMARY)),
        text_color: Color::WHITE,
        border: Border {
            width: 0.0,
            radius: 6.0.into(),
            color: Color::TRANSPARENT,
        },
        ..Default::default()
    }
}

pub fn secondary_button(_theme: &Theme, _status: button::Status) -> button::Style {
    button::Style {
        background: Some(Background::Color(Colors::SURFACE_LIGHT)),
        text_color: Colors::TEXT,
        border: Border {
            width: 1.0,
            radius: 6.0.into(),
            color: Colors::BORDER,
        },
        ..Default::default()
    }
}