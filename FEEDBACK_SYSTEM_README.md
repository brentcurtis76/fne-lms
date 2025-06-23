# 📝 Feedback System - User Guide

## Overview

The FNE LMS feedback system allows users to report bugs, suggest ideas, and provide feedback about the platform. Users can submit feedback with screenshots, and administrators can manage and respond to all feedback submissions.

## 🎯 For Platform Users

### How to Submit Feedback

1. **Find the Feedback Button**
   - Look for the floating yellow button in the bottom-right corner of any page
   - It has a message icon and pulses to get your attention
   - Tooltip says "¿Encontraste un problema? ¡Cuéntanos!"

2. **Submit Your Feedback**
   - Click the floating button to open the feedback modal
   - Write a description of the problem or suggestion
   - Select the type: **Problema** (bug) or **Idea** (suggestion)
   - Optionally attach a screenshot by clicking or dragging an image
   - Click **"Enviar →"** to submit

3. **What Happens Next**
   - You'll see a success message with a reference number (e.g., #FB-A1B2C3D4)
   - Administrators will be automatically notified
   - The modal closes after 3 seconds

### Tips for Good Feedback

- **Be specific**: Instead of "it doesn't work", describe exactly what happened
- **Include steps**: "When I click the save button after editing my profile..."
- **Add screenshots**: A picture is worth a thousand words
- **Choose the right type**: Use "Problema" for bugs, "Idea" for suggestions

## 🛠️ For Administrators

### Accessing the Feedback Dashboard

1. Navigate to **Configuración → Feedback** in the sidebar
2. You'll see the feedback dashboard with:
   - Summary statistics cards
   - Filter options by status and type
   - List of all feedback submissions

### Managing Feedback

#### Dashboard Features
- **Stats Cards**: Quick overview of new, in progress, and resolved feedback
- **Status Filters**: Filter by New, Seen, In Progress, Resolved
- **Type Filters**: Filter by Bug reports, Ideas, or General feedback
- **Search**: Find specific feedback by description or user

#### Feedback Actions
For each feedback item, you can:

1. **View Details**: Click any feedback to see:
   - Full description and user information
   - Screenshots (if attached)
   - Browser and technical information
   - Activity timeline with comments

2. **Update Status**:
   - **New** → **In Progress** (when you start working on it)
   - **In Progress** → **Resolved** (when fixed/implemented)
   - **Resolved** → **Closed** (final state)

3. **Add Comments**:
   - Use the comment system to communicate with your team
   - Document solutions or ask for clarification
   - Comments appear in the activity timeline

### Notification System

Administrators automatically receive notifications when:
- New feedback is submitted
- Status changes occur
- Comments are added

Check the notifications bell icon in the header for updates.

## 📧 Technical Details

### Feedback Categories

| Type | Description | Icon | Color |
|------|-------------|------|-------|
| **bug** | Platform issues, errors, broken features | ⚠️ AlertCircle | Red |
| **idea** | Feature requests, improvements, suggestions | 💡 Lightbulb | Blue |
| **feedback** | General comments, questions | 💬 MessageSquare | Gray |

### Status Workflow

```
New → Seen → In Progress → Resolved → Closed
```

- **New**: Just submitted, needs initial review
- **Seen**: Administrator has viewed the feedback  
- **In Progress**: Work has started on the issue
- **Resolved**: Issue fixed or suggestion implemented
- **Closed**: Final state, feedback fully processed

### Storage and Data

- **Screenshots**: Stored securely in Supabase storage with automatic URLs
- **Browser Info**: Automatically captured for technical debugging
- **User Data**: Linked to user profiles for context
- **Activity Log**: Complete audit trail of all actions

## 🔧 Troubleshooting

### Common Issues

**"Can't see the feedback button"**
- Check if you're logged in
- Refresh the page
- Clear browser cache

**"Image upload fails"**
- Maximum file size: 5MB
- Supported formats: JPG, PNG, WebP, GIF
- Check your internet connection

**"Error submitting feedback"**
- Check your internet connection
- Make sure you wrote a description
- Try refreshing and submitting again

### For Developers

**Test Commands**
```bash
# Run feedback system tests
npm test -- __tests__/components/feedback/ --run

# Watch mode for development  
npm test -- __tests__/components/feedback/ --watch
```

**Database Tables**
- `platform_feedback` - Main feedback entries
- `feedback_activity` - Comments and status changes
- `notifications` - Admin notifications

## 📞 Support

If you encounter issues with the feedback system:

**Technical Support**: Brent Curtis  
📱 **Phone**: +56941623577  
📧 **Email**: bcurtis@nuevaeducacion.org

---

*Generated with ❤️ for the FNE LMS platform*