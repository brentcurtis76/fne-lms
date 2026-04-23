import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';

export interface MeetingEditorExtensionsOptions {
  placeholder?: string;
}

export const buildMeetingEditorExtensions = (
  options: MeetingEditorExtensionsOptions = {}
) => [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
  }),
  Heading.configure({ levels: [2, 3] }),
  BulletList,
  OrderedList,
  ListItem,
  Underline,
  Placeholder.configure({
    placeholder: options.placeholder ?? '',
  }),
];

export const meetingEditorExtensions = buildMeetingEditorExtensions();
