export default function FeedSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden animate-pulse">
      {/* Header skeleton */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
          <div>
            <div className="h-4 w-32 bg-gray-200 rounded mb-1"></div>
            <div className="h-3 w-24 bg-gray-200 rounded"></div>
          </div>
        </div>
        <div className="h-5 w-5 bg-gray-200 rounded"></div>
      </div>

      {/* Content skeleton */}
      <div className="px-4 pb-3">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          <div className="h-4 bg-gray-200 rounded w-4/6"></div>
        </div>
        
        {/* Image placeholder */}
        <div className="mt-3 h-64 bg-gray-200 rounded-lg"></div>
      </div>

      {/* Stats skeleton */}
      <div className="px-4 pb-2">
        <div className="flex items-center space-x-4">
          <div className="h-3 w-20 bg-gray-200 rounded"></div>
          <div className="h-3 w-24 bg-gray-200 rounded"></div>
        </div>
      </div>

      {/* Actions skeleton */}
      <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="h-8 w-20 bg-gray-200 rounded-lg"></div>
          <div className="h-8 w-24 bg-gray-200 rounded-lg"></div>
          <div className="h-8 w-24 bg-gray-200 rounded-lg"></div>
        </div>
        <div className="h-8 w-8 bg-gray-200 rounded-lg"></div>
      </div>
    </div>
  );
}