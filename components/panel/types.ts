// Types
export interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  content_html: string;
  featured_image?: string;
  display_date?: string;
  created_at: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
}

export interface DashboardStats {
  totalUsers: number;
  statsLabel?: string;
  mostCompletedCourse: {
    id: string;
    title: string;
    completionCount: number;
    thumbnail_url?: string;
    instructor_name?: string;
    description?: string;
  } | null;
  topLearner: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    completedCourses: number;
    school_name?: string;
    role?: string;
  } | null;
}
