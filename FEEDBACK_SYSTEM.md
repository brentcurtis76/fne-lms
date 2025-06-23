# FNE LMS - User Feedback System

## Overview
The feedback system allows users to report platform errors and submit feature requests with screenshot support. It includes:

- Floating feedback button available on all pages
- Quick submission modal with screenshot upload
- Admin dashboard for managing feedback
- Real-time notifications for admins
- Activity tracking and comments

## Components

### 1. FeedbackButton (`/components/feedback/FeedbackButton.tsx`)
- Floating button in bottom-right corner
- Always visible across the platform
- Opens the feedback modal on click

### 2. FeedbackModal (`/components/feedback/FeedbackModal.tsx`)  
- Simple form with description textarea
- Screenshot upload with drag-and-drop support (5MB limit)
- Type selection: Problem (bug) or Idea
- Success state with reference number
- Automatically captures browser context

### 3. Admin Dashboard (`/pages/admin/feedback.tsx`)
- Stats cards showing new, in-progress, resolved counts
- Filterable list by status, type, and search term
- Quick actions to update status
- Auto-refreshes every 30 seconds

### 4. FeedbackDetail (`/components/feedback/FeedbackDetail.tsx`)
- Detailed view with full description and screenshot
- Activity timeline showing all interactions
- Comment system for admin notes
- Status management (new → seen → in_progress → resolved → closed)
- Technical details (browser info, page URL)

## Database Schema

### Tables
1. `platform_feedback` - Main feedback entries
2. `feedback_activity` - Comments and status changes
3. `feedback_stats` - Aggregated statistics view

### Storage
- Bucket: `feedback-screenshots`
- Public access enabled
- 5MB file size limit

## Notifications

When new feedback is submitted:
1. All admin users receive a notification
2. Badge counter appears in sidebar
3. Email notifications sent based on admin preferences

## Usage

### For Users
1. Click the feedback button (bottom-right)
2. Describe the issue or suggestion
3. Optionally attach a screenshot
4. Select type (Problem/Idea)
5. Submit

### For Admins
1. Navigate to Gestión → Soporte Técnico
2. View all feedback submissions
3. Click to view details
4. Update status and add comments
5. Notifications badge shows new items

## Setup

1. Apply database migration:
```bash
npm run db:apply database/create-feedback-system.sql
```

2. Create storage bucket in Supabase dashboard:
- Name: `feedback-screenshots`
- Public access: Yes

3. Apply notification triggers:
```bash
node scripts/apply-feedback-notifications.js
```

## Security

- RLS policies ensure users can only see their own feedback
- Admins have full access to all feedback
- Screenshot uploads are tied to authenticated users
- Public URLs for screenshots are unguessable UUIDs