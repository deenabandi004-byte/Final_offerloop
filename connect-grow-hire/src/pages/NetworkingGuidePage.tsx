import { useParams, Navigate } from 'react-router-dom';
import { companies } from '@/data/companies';
import NetworkingGuide from './templates/NetworkingGuide';

const NetworkingGuidePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const company = companies.find((c) => c.slug === slug);

  if (!company) {
    return <Navigate to="/" replace />;
  }

  return <NetworkingGuide company={company} />;
};

export default NetworkingGuidePage;
