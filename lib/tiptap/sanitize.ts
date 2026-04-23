// TODO: when @tiptap/extension-link is added to meetingEditorExtensions,
// include 'a' in MEETING_ALLOWED_TAGS and 'href'/'target'/'rel' in
// MEETING_ALLOWED_ATTR, and add a DOMPurify hook that forces
// rel="noopener noreferrer" on anchors.
export const MEETING_ALLOWED_TAGS = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'u', 'br'];
export const MEETING_ALLOWED_ATTR: string[] = [];
