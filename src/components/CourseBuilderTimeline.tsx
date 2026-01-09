export default function CourseBuilderTimeline({ blocks, onChange }: any) {
  return (
    <div className="p-4 bg-yellow-100 rounded">
      <p className="text-brand_blue font-semibold">[Timeline editor coming soon]</p>
      <p>{blocks?.length || 0} bloques</p>
    </div>
  );
}
