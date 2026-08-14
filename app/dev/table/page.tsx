import { notFound } from 'next/navigation';
import DevTable from './DevTable';

/** Dev-only theme/layout preview: a static mock game, no auth, no model calls. */
export default function DevTablePage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevTable />;
}
