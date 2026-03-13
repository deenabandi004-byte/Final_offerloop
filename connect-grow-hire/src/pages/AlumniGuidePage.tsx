import { useParams, Navigate } from 'react-router-dom';
import { seoUniversities } from '@/data/seo-universities';
import AlumniGuide from './templates/AlumniGuide';

const AlumniGuidePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const university = seoUniversities.find((u) => u.slug === slug);

  if (!university) {
    return <Navigate to="/" replace />;
  }

  return <AlumniGuide university={university} />;
};

export default AlumniGuidePage;
