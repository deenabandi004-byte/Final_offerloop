import { useParams, Navigate } from 'react-router-dom';
import { roles } from '@/data/roles';
import RoleNetworkingGuide from './templates/RoleNetworkingGuide';

const RoleNetworkingGuidePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const role = roles.find((r) => r.slug === slug);

  if (!role) {
    return <Navigate to="/" replace />;
  }

  return <RoleNetworkingGuide role={role} />;
};

export default RoleNetworkingGuidePage;
