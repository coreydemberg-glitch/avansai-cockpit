'use client';

// Job Description library — a full-screen browser over every uploaded JD PDF.
// Thin wrapper around the shared DocLibrary; uploads are auto-titled server-side.
import DocLibrary from './DocLibrary';

export default function JobLibrary({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <DocLibrary
      title="Job Descriptions"
      sub="Your uploaded JD library — click any to view or edit"
      endpoints={{
        list: '/api/job-descriptions',
        upload: '/api/upload-job-description',
        mutate: '/api/job-descriptions',
      }}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
