'use client';

// Prep Documents library (slider build §5) — a full-screen browser over uploaded
// prep-material PDFs (round-by-round interview prep). Thin wrapper around the
// shared DocLibrary, pointed at the prep-materials endpoints (0006 migration).
import DocLibrary from './DocLibrary';

export default function PrepLibrary({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <DocLibrary
      title="Prep Documents"
      sub="Interview-prep materials — click any to view or edit"
      endpoints={{
        list: '/api/prep-materials',
        upload: '/api/upload-prep-material',
        mutate: '/api/prep-materials',
      }}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
