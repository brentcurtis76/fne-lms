import React, { useState } from 'react';
import { Users, Plus } from 'lucide-react';
import CommunityAssignModal from './CommunityAssignModal';

interface CourseResult {
  id: string;
  title: string;
  description?: string;
}

interface LPResult {
  id: string;
  title: string;
  description?: string;
  courseCount: number;
}

interface CommunityAssignSectionProps {
  communityId: string;
  communityName: string;
  userCount: number;
  courseResults: CourseResult[];
  lpResults: LPResult[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isSearching: boolean;
  onAssignCourse: (courseId: string) => Promise<{ assigned: number; skipped: number }>;
  onAssignLP: (pathId: string) => Promise<{ assigned: number; skipped: number }>;
  disabled?: boolean;
}

/**
 * Section for assigning courses/LPs to all users in a community
 * Shows a button that opens a modal for better UX
 */
export function CommunityAssignSection({
  communityId,
  communityName,
  userCount,
  courseResults,
  lpResults,
  searchQuery,
  onSearchChange,
  isSearching,
  onAssignCourse,
  onAssignLP,
  disabled = false
}: CommunityAssignSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="border-t border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            <div>
              <span className="text-sm font-medium text-blue-900">
                {communityName}
              </span>
              <span className="text-xs text-blue-600 ml-2">
                {userCount} usuario{userCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            Asignar a Todos
          </button>
        </div>
      </div>

      <CommunityAssignModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        communityId={communityId}
        communityName={communityName}
        userCount={userCount}
        courseResults={courseResults}
        lpResults={lpResults}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        isSearching={isSearching}
        onAssignCourse={onAssignCourse}
        onAssignLP={onAssignLP}
        disabled={disabled}
      />
    </>
  );
}

export default CommunityAssignSection;
