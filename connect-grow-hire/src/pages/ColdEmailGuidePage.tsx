import { useParams, Navigate } from 'react-router-dom';
import { industries } from '@/data/industries';
import ColdEmailGuide from './templates/ColdEmailGuide';

const ColdEmailGuidePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const industry = industries.find((i) => i.slug === slug);

  if (!industry) {
    return <Navigate to="/" replace />;
  }

  return <ColdEmailGuide industry={industry} />;
};

export default ColdEmailGuidePage;
