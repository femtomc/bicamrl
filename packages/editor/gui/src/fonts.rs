use iced::Font;

// Font bytes embedded at compile time
pub const BERKELEY_MONO_BYTES: &[u8] = include_bytes!("../assets/fonts/BerkeleyMonoVariable.otf");
pub const BERKELEY_MONO_SEMIBOLD_BYTES: &[u8] = include_bytes!("../assets/fonts/BerkeleyMono-SemiBold.otf");

// Font references - using the actual font family names from the font files
pub const BERKELEY_MONO: Font = Font::with_name("Berkeley Mono Variable");
pub const BERKELEY_MONO_BOLD: Font = Font {
    family: iced::font::Family::Name("Berkeley Mono Variable"),
    weight: iced::font::Weight::Bold,
    stretch: iced::font::Stretch::Normal,
    style: iced::font::Style::Normal,
};

// Berkeley Mono SemiBold uses "Berkeley Mono" as the family name
pub const BERKELEY_MONO_SEMIBOLD: Font = Font::with_name("Berkeley Mono");

// Fallback font for Unicode symbols (using system font)
// This will use the system's default monospace font which typically has better Unicode coverage
pub const UNICODE_FONT: Font = Font {
    family: iced::font::Family::Monospace,
    weight: iced::font::Weight::Normal,
    stretch: iced::font::Stretch::Normal,
    style: iced::font::Style::Normal,
};

// Main font to use everywhere
pub const DEFAULT_FONT: Font = BERKELEY_MONO;